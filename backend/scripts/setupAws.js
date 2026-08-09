#!/usr/bin/env node
/**
 * One-command AWS DynamoDB setup:
 *   1. Verify credentials
 *   2. Create tables (on-demand / free-tier friendly)
 *   3. Migrate local JSON data (optional)
 *
 * Prerequisites — add to backend/.env OR run `aws configure`:
 *   USE_LOCAL_STORE=false
 *   AWS_REGION=us-east-1
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...
 *
 * Usage:
 *   npm run setup-aws
 *   npm run setup-aws -- --skip-migrate
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { verifyAwsCredentials, isPlaceholderKey } = require('./awsClient');
const { createTables, listTables } = require('./createTables');

async function main() {
  const skipMigrate = process.argv.includes('--skip-migrate');

  console.log('🚀 AWS DynamoDB setup\n');

  if (process.env.USE_LOCAL_STORE === 'true') {
    console.log('⚠️  USE_LOCAL_STORE=true in backend/.env');
    console.log('   Set USE_LOCAL_STORE=false before using real DynamoDB.\n');
  }

  const hasEnvKeys =
    !isPlaceholderKey(process.env.AWS_ACCESS_KEY_ID) &&
    !isPlaceholderKey(process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasEnvKeys) {
    console.log('ℹ️  No AWS keys in backend/.env — trying AWS CLI profile (~/.aws/credentials)...\n');
  }

  try {
    const identity = await verifyAwsCredentials();
    console.log('✅ AWS credentials valid');
    console.log(`   Account: ${identity.account}`);
    console.log(`   Identity: ${identity.arn}\n`);
  } catch (error) {
    console.error('❌ AWS credentials failed:', error.message);
    console.log('\nHow to fix:');
    console.log('  Option A — backend/.env:');
    console.log('    USE_LOCAL_STORE=false');
    console.log('    AWS_REGION=us-east-1');
    console.log('    AWS_ACCESS_KEY_ID=your_key');
    console.log('    AWS_SECRET_ACCESS_KEY=your_secret');
    console.log('\n  Option B — AWS CLI:');
    console.log('    aws configure');
    console.log('    (enter new Access Key ID + Secret from IAM)\n');
    console.log('Get keys: AWS Console → IAM → Users → Security credentials → Create access key');
    process.exit(1);
  }

  await createTables();
  await listTables();

  if (!skipMigrate) {
    console.log('\n📦 Migrating local data to DynamoDB...\n');
    process.env.USE_LOCAL_STORE = 'false';
    const { main: migrateMain } = require('./migrateLocalToDynamodb');
    await migrateMain();
    return;
  }

  console.log('\n✅ Tables ready. Next:');
  console.log('  1. Set USE_LOCAL_STORE=false in backend/.env');
  console.log('  2. npm run migrate-to-aws   (if you skipped migration)');
  console.log('  3. npm run check-setup');
  console.log('  4. Restart backend: node index.js');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  });
}
