/**
 * Deploy CloudCollab to AWS (Elastic Beanstalk + S3).
 * Uses credentials from backend/.env — no AWS CLI configure required.
 *
 * Usage:
 *   node scripts/deployToAws.js           # full deploy
 *   node scripts/deployToAws.js setup     # buckets, EB app, environment
 *   node scripts/deployToAws.js backend   # backend only
 *   node scripts/deployToAws.js frontend  # frontend only (needs EB URL in .env.deploy or env)
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { configureAws, verifyAwsCredentials, isPlaceholderKey } = require('./awsClient');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REGION = process.env.AWS_REGION || 'us-east-1';
const APP_NAME = 'awsproject-backend';
const ENV_NAME = 'awsproject-backend-prod';
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BACKEND_DIR = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'jellylemonshake');
const DEPLOY_STATE_FILE = path.join(BACKEND_DIR, '.deploy-state.json');

const phase = (process.argv[2] || 'all').toLowerCase();

function log(msg) {
  console.log(`[deploy] ${msg}`);
}

function fail(msg) {
  console.error(`[deploy] ERROR: ${msg}`);
  process.exit(1);
}

function loadState() {
  if (fs.existsSync(DEPLOY_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(DEPLOY_STATE_FILE, 'utf8'));
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(DEPLOY_STATE_FILE, JSON.stringify(state, null, 2));
}

function bucketNames(accountId) {
  return {
    deploy: `cloudcollab-deploy-${accountId}`,
    frontend: `cloudcollab-frontend-${accountId}`,
  };
}

function createZipArchive(options) {
  const mod = require('archiver');
  if (typeof mod === 'function') {
    return mod('zip', options);
  }
  if (mod.ZipArchive) {
    return new mod.ZipArchive(options);
  }
  throw new Error('Could not load archiver zip module');
}

async function ensureArchiver() {
  try {
    require.resolve('archiver');
    return createZipArchive;
  } catch {
    log('Installing archiver for zip packaging...');
    execSync('npm install archiver@7 --no-save', { cwd: BACKEND_DIR, stdio: 'inherit' });
    return createZipArchive;
  }
}

function shouldExclude(relativePath) {
  const excluded = [
    'node_modules',
    '.git',
    '.env',
    '.env.backup',
    'data',
    '.elasticbeanstalk',
    '.serverless',
  ];
  const parts = relativePath.split(/[/\\]/);
  return excluded.some((e) => parts.includes(e) || relativePath.endsWith('.log') || relativePath.endsWith('.zip'));
}

async function createBackendZip(outPath) {
  const createArchive = await ensureArchiver();
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = createArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    function addDir(dir, base = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        const full = path.join(dir, entry.name);
        if (shouldExclude(rel)) continue;
        if (entry.isDirectory()) addDir(full, rel);
        else archive.file(full, { name: rel.replace(/\\/g, '/') });
      }
    }

    addDir(BACKEND_DIR);
    archive.finalize();
  });
}

async function bucketExists(s3, name) {
  try {
    await s3.headBucket({ Bucket: name }).promise();
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'NotFound' || err.code === 'NoSuchBucket') {
      return false;
    }
    throw err;
  }
}

async function ensureBucket(s3, name, website = false) {
  if (await bucketExists(s3, name)) {
    log(`S3 bucket exists: ${name}`);
  } else {
    log(`Creating S3 bucket: ${name}`);
    await s3
      .createBucket({
        Bucket: name,
        ...(REGION !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: REGION } } : {}),
      })
      .promise();
  }

  if (website) {
    await s3
      .putBucketWebsite({
        Bucket: name,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: 'index.html' },
          ErrorDocument: { Key: 'index.html' },
        },
      })
      .promise();

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${name}/*`,
        },
      ],
    };

    await s3
      .putPublicAccessBlock({
        Bucket: name,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      })
      .promise();

    await s3.putBucketPolicy({ Bucket: name, Policy: JSON.stringify(policy) }).promise();
    log(`Configured static website hosting for ${name}`);
  }
}

async function ensureEbRoles(iam) {
  const ec2RoleName = 'aws-elasticbeanstalk-ec2-role';
  const serviceRoleName = 'aws-elasticbeanstalk-service-role';

  async function ensureRole(name, trustService, managedPolicies) {
    try {
      await iam.getRole({ RoleName: name }).promise();
      log(`IAM role exists: ${name}`);
    } catch (err) {
      if (err.code !== 'NoSuchEntity') throw err;
      log(`Creating IAM role: ${name}`);
      await iam
        .createRole({
          RoleName: name,
          AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: trustService },
                Action: 'sts:AssumeRole',
              },
            ],
          }),
        })
        .promise();
    }

    for (const policyArn of managedPolicies) {
      try {
        await iam.attachRolePolicy({ RoleName: name, PolicyArn: policyArn }).promise();
      } catch (err) {
        if (err.code !== 'EntityAlreadyExists') {
          log(`Note: could not attach ${policyArn} to ${name}: ${err.message}`);
        }
      }
    }
  }

  await ensureRole(ec2RoleName, 'ec2.amazonaws.com', [
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier',
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier',
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker',
    'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess',
  ]);

  await ensureRole(serviceRoleName, 'elasticbeanstalk.amazonaws.com', [
    'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth',
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy',
  ]);

  await iam
    .createInstanceProfile({ InstanceProfileName: ec2RoleName })
    .promise()
    .catch((err) => {
      if (err.code !== 'EntityAlreadyExists') throw err;
    });

  await iam
    .addRoleToInstanceProfile({ InstanceProfileName: ec2RoleName, RoleName: ec2RoleName })
    .promise()
    .catch(() => {});
}

async function ensureEbApplication(eb) {
  try {
    const apps = await eb.describeApplications({ ApplicationNames: [APP_NAME] }).promise();
    if (apps.Applications.length) {
      log(`Elastic Beanstalk application exists: ${APP_NAME}`);
      return;
    }
  } catch {
    /* create below */
  }

  log(`Creating Elastic Beanstalk application: ${APP_NAME}`);
  await eb
    .createApplication({
      ApplicationName: APP_NAME,
      Description: 'CloudCollab backend API and Socket.IO',
    })
    .promise();
}

async function pickNodeStack(eb) {
  const { SolutionStacks } = await eb.listAvailableSolutionStacks().promise();
  const preferred =
    SolutionStacks.find((s) => s.includes('Amazon Linux 2023') && s.includes('Node.js 18')) ||
    SolutionStacks.find((s) => s.includes('Node.js 18')) ||
    SolutionStacks.find((s) => s.includes('Node.js'));
  if (!preferred) fail('No Node.js Elastic Beanstalk solution stack found in this region.');
  return preferred;
}

function ebEnvOptions(frontendUrl) {
  const options = [
    { Namespace: 'aws:elasticbeanstalk:application:environment', OptionName: 'NODE_ENV', Value: 'production' },
    { Namespace: 'aws:elasticbeanstalk:application:environment', OptionName: 'PORT', Value: '8080' },
    { Namespace: 'aws:elasticbeanstalk:application:environment', OptionName: 'AWS_REGION', Value: REGION },
    { Namespace: 'aws:elasticbeanstalk:application:environment', OptionName: 'USE_LOCAL_STORE', Value: 'false' },
    {
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'IamInstanceProfile',
      Value: 'aws-elasticbeanstalk-ec2-role',
    },
    {
      Namespace: 'aws:elasticbeanstalk:environment',
      OptionName: 'ServiceRole',
      Value: 'aws-elasticbeanstalk-service-role',
    },
    {
      Namespace: 'aws:elasticbeanstalk:environment:process:default',
      OptionName: 'HealthCheckPath',
      Value: '/health',
    },
    { Namespace: 'aws:elasticbeanstalk:environment:process:default', OptionName: 'Port', Value: '8080' },
    { Namespace: 'aws:elasticbeanstalk:environment:process:default', OptionName: 'Protocol', Value: 'HTTP' },
  ];

  if (frontendUrl) {
    options.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: 'FRONTEND_URL',
      Value: frontendUrl,
    });
  }

  if (!isPlaceholderKey(process.env.JDOODLE_CLIENT_ID)) {
    options.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: 'JDOODLE_CLIENT_ID',
      Value: process.env.JDOODLE_CLIENT_ID,
    });
  }
  if (!isPlaceholderKey(process.env.JDOODLE_CLIENT_SECRET)) {
    options.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: 'JDOODLE_CLIENT_SECRET',
      Value: process.env.JDOODLE_CLIENT_SECRET,
    });
  }

  return options;
}

async function getEnvironment(eb) {
  const { Environments } = await eb.describeEnvironments({ EnvironmentNames: [ENV_NAME] }).promise();
  return Environments[0] || null;
}

async function waitForEnvironment(eb, envName, targetStatus = 'Ready') {
  log(`Waiting for environment "${envName}" to reach ${targetStatus}...`);
  for (let i = 0; i < 60; i++) {
    const env = (await eb.describeEnvironments({ EnvironmentNames: [envName] }).promise()).Environments[0];
    const status = env?.Status;
    const health = env?.Health;
    log(`  status=${status} health=${health}`);
    if (status === targetStatus && health !== 'Grey') return env;
    if (status === 'Terminated') fail(`Environment ${envName} was terminated.`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  fail(`Timed out waiting for environment ${envName}.`);
}

async function setupResources(identity) {
  configureAws();
  const s3 = new AWS.S3({ region: REGION });
  const eb = new AWS.ElasticBeanstalk({ region: REGION });
  const iam = new AWS.IAM({ region: REGION });

  const buckets = bucketNames(identity.account);
  const state = loadState();
  state.accountId = identity.account;
  state.buckets = buckets;

  await ensureBucket(s3, buckets.deploy, false);
  await ensureBucket(s3, buckets.frontend, true);

  try {
    await ensureEbRoles(iam);
  } catch (err) {
    log(`IAM role setup skipped/failed (${err.message}). Create EB roles in AWS Console if deploy fails.`);
  }

  await ensureEbApplication(eb);

  let env = await getEnvironment(eb);
  if (!env || env.Status === 'Terminated') {
    const stack = await pickNodeStack(eb);
    log(`Creating EB environment "${ENV_NAME}" with stack: ${stack}`);
    log('This takes ~5–10 minutes on first run...');

    const frontendWebsite = `http://${buckets.frontend}.s3-website-${REGION}.amazonaws.com`;
    await eb
      .createEnvironment({
        ApplicationName: APP_NAME,
        EnvironmentName: ENV_NAME,
        SolutionStackName: stack,
        Tier: { Name: 'WebServer', Type: 'Standard' },
        OptionSettings: ebEnvOptions(frontendWebsite),
      })
      .promise();

    env = await waitForEnvironment(eb, ENV_NAME);
  } else {
    log(`EB environment exists: ${ENV_NAME} (${env.CNAME})`);
  }

  state.backendUrl = `http://${env.CNAME}`;
  state.frontendUrl = `http://${buckets.frontend}.s3-website-${REGION}.amazonaws.com`;
  saveState(state);

  log(`Backend URL: ${state.backendUrl}`);
  log(`Frontend URL (after frontend deploy): ${state.frontendUrl}`);
  return state;
}

async function deployBackend(identity, state) {
  configureAws();
  const s3 = new AWS.S3({ region: REGION });
  const eb = new AWS.ElasticBeanstalk({ region: REGION });
  const buckets = state.buckets || bucketNames(identity.account);

  log('Installing production dependencies...');
  execSync('npm install --production', { cwd: BACKEND_DIR, stdio: 'inherit' });

  const versionLabel = `backend-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const zipPath = path.join(PROJECT_ROOT, 'backend-deployment.zip');

  log('Creating deployment zip...');
  await createBackendZip(zipPath);

  const s3Key = `${versionLabel}.zip`;
  log(`Uploading ${s3Key} to s3://${buckets.deploy}/...`);
  await s3
    .upload({
      Bucket: buckets.deploy,
      Key: s3Key,
      Body: fs.createReadStream(zipPath),
      ContentType: 'application/zip',
    })
    .promise();

  log('Creating application version...');
  await eb
    .createApplicationVersion({
      ApplicationName: APP_NAME,
      VersionLabel: versionLabel,
      SourceBundle: { S3Bucket: buckets.deploy, S3Key: s3Key },
      Description: `Deploy ${new Date().toISOString()}`,
    })
    .promise();

  log('Updating environment...');
  await eb
    .updateEnvironment({
      EnvironmentName: ENV_NAME,
      VersionLabel: versionLabel,
    })
    .promise();

  const env = await waitForEnvironment(eb, ENV_NAME);
  state.backendUrl = `http://${env.CNAME}`;
  saveState(state);

  fs.unlinkSync(zipPath);
  log(`Backend deployed: ${state.backendUrl}/health`);
  return state;
}

async function deployFrontend(state) {
  const backendUrl = state.backendUrl || process.env.REACT_APP_API_URL;
  if (!backendUrl || backendUrl.includes('localhost')) {
    fail('Backend URL unknown. Run backend deploy first or set REACT_APP_API_URL.');
  }

  log(`Building frontend (API=${backendUrl})...`);
  execSync('npm install', { cwd: FRONTEND_DIR, stdio: 'inherit' });

  const env = {
    ...process.env,
    REACT_APP_API_URL: backendUrl,
    REACT_APP_SOCKET_URL: backendUrl,
    REACT_APP_ENV: 'production',
  };

  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit', env });

  const buildDir = path.join(FRONTEND_DIR, 'build');
  if (!fs.existsSync(buildDir)) fail('Frontend build directory not found.');

  configureAws();
  const s3 = new AWS.S3({ region: REGION });
  const buckets = state.buckets;
  if (!buckets?.frontend) fail('Frontend bucket not configured. Run setup first.');

  log(`Syncing build/ to s3://${buckets.frontend}/...`);
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else files.push({ rel, full });
    }
  }
  walk(buildDir);

  for (const { rel, full } of files) {
    const ext = path.extname(full).toLowerCase();
    const contentType =
      ext === '.html'
        ? 'text/html'
        : ext === '.js'
          ? 'application/javascript'
          : ext === '.css'
            ? 'text/css'
            : ext === '.json'
              ? 'application/json'
              : undefined;
    const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000';
    await s3
      .upload({
        Bucket: buckets.frontend,
        Key: rel.replace(/\\/g, '/'),
        Body: fs.readFileSync(full),
        ContentType: contentType,
        CacheControl: cacheControl,
      })
      .promise();
  }

  state.frontendUrl = `http://${buckets.frontend}.s3-website-${REGION}.amazonaws.com`;
  saveState(state);

  // Update EB FRONTEND_URL for password reset links
  const eb = new AWS.ElasticBeanstalk({ region: REGION });
  await eb
    .updateEnvironment({
      EnvironmentName: ENV_NAME,
      OptionSettings: [
        {
          Namespace: 'aws:elasticbeanstalk:application:environment',
          OptionName: 'FRONTEND_URL',
          Value: state.frontendUrl,
        },
      ],
    })
    .promise()
    .catch((err) => log(`Could not update FRONTEND_URL on EB: ${err.message}`));

  log(`Frontend deployed: ${state.frontendUrl}`);
  return state;
}

async function main() {
  log(`Phase: ${phase}`);
  configureAws();

  let identity;
  try {
    identity = await verifyAwsCredentials();
    log(`AWS account ${identity.account} (${identity.arn})`);
  } catch (err) {
    fail(`AWS credentials invalid: ${err.message}\nAdd keys to backend/.env or run aws configure.`);
  }

  let state = loadState();

  if (phase === 'setup' || phase === 'all') {
    state = await setupResources(identity);
  }

  if (phase === 'backend' || phase === 'all') {
    if (!state.buckets) state = { ...state, ...(await setupResources(identity)) };
    state = await deployBackend(identity, state);
  }

  if (phase === 'frontend' || phase === 'all') {
    if (!state.backendUrl) {
      configureAws();
      const eb = new AWS.ElasticBeanstalk({ region: REGION });
      const env = await getEnvironment(eb);
      if (env?.CNAME) state.backendUrl = `http://${env.CNAME}`;
    }
    state = await deployFrontend(state);
  }

  console.log('\n========================================');
  console.log('  CloudCollab AWS Deployment Complete');
  console.log('========================================');
  console.log(`  Frontend:  ${state.frontendUrl || '(run frontend phase)'}`);
  console.log(`  Backend:   ${state.backendUrl || '(run backend phase)'}`);
  console.log(`  Health:    ${state.backendUrl ? `${state.backendUrl}/health` : '-'}`);
  console.log('========================================\n');
}

main().catch((err) => {
  if (err.code === 'AccessDenied' || err.statusCode === 403) {
    console.error('\n[deploy] Access denied. Attach these policies to IAM user "mahi":');
    console.error('  - AdministratorAccess-AWSElasticBeanstalk');
    console.error('  - AmazonS3FullAccess');
    console.error('  - IAMFullAccess (or create EB roles manually in console)\n');
  }
  fail(err.message || String(err));
});
