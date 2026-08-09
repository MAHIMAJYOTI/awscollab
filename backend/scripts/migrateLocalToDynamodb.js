#!/usr/bin/env node
/**
 * Copy local JSON data into real AWS DynamoDB tables.
 *
 * Prerequisites:
 *   1. backend/.env with USE_LOCAL_STORE=false and valid AWS credentials
 *   2. Tables created: npm run create-tables
 *
 * Usage:
 *   npm run migrate-to-aws          # write to DynamoDB
 *   npm run migrate-to-aws -- --dry-run
 */

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const { configureAws } = require('./awsClient');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LOCAL_DB = path.join(__dirname, '..', 'data', 'local-db.json');
const PROJECTS_STORE = path.join(__dirname, '..', 'data', 'projects-store.json');

function loadJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    return fallback;
  }
}

function sanitizeItem(item) {
  const cleaned = {};
  Object.entries(item).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  });
  return cleaned;
}

async function batchWriteItems(docClient, tableName, items, dryRun) {
  if (!items.length) {
    console.log(`  (skip) ${tableName}: no items`);
    return 0;
  }

  if (dryRun) {
    console.log(`  [dry-run] ${tableName}: would write ${items.length} item(s)`);
    return items.length;
  }

  const chunkSize = 25;
  let written = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize).map((item) => ({
      PutRequest: { Item: sanitizeItem(item) },
    }));

    let request = {
      RequestItems: { [tableName]: chunk },
    };

    let attempts = 0;
    while (attempts < 5) {
      const result = await docClient.batchWrite(request).promise();
      const unprocessed = result.UnprocessedItems?.[tableName] || [];
      written += chunk.length - unprocessed.length;

      if (!unprocessed.length) {
        break;
      }

      request = { RequestItems: { [tableName]: unprocessed } };
      attempts += 1;
      await new Promise((r) => setTimeout(r, 500 * attempts));
    }
  }

  console.log(`  ✅ ${tableName}: wrote ${written} item(s)`);
  return written;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (process.env.USE_LOCAL_STORE === 'true') {
    console.error('❌ Set USE_LOCAL_STORE=false in backend/.env before migrating to AWS.');
    process.exit(1);
  }

  configureAws();

  try {
    const sts = new AWS.STS();
    await sts.getCallerIdentity().promise();
  } catch (error) {
    console.error('❌ AWS credentials invalid:', error.message);
    console.error('   Add keys to backend/.env or run: aws configure');
    process.exit(1);
  }

  const docClient = new AWS.DynamoDB.DocumentClient();
  const localDb = loadJson(LOCAL_DB, {});
  const projectsStore = loadJson(PROJECTS_STORE, {});

  const tableData = {
    ChatRooms: localDb.ChatRooms || [],
    Messages: localDb.Messages || [],
    Meetings: localDb.Meetings || [],
    Users: localDb.Users || [],
    Projects: [
      ...(localDb.Projects || []),
      ...(projectsStore.projects || []),
    ],
    ProjectFiles: [
      ...(localDb.ProjectFiles || []),
      ...(projectsStore.projectFiles || []),
    ],
  };

  console.log(dryRun ? '🔍 Dry run — no data will be written\n' : '🚀 Migrating local data to DynamoDB\n');

  Object.entries(tableData).forEach(([table, items]) => {
    console.log(`  ${table}: ${items.length} item(s) found locally`);
  });
  console.log('');

  let total = 0;
  for (const [tableName, items] of Object.entries(tableData)) {
    total += await batchWriteItems(docClient, tableName, items, dryRun);
  }

  console.log(`\n${dryRun ? 'Dry run complete' : 'Migration complete'} — ${total} item(s) processed.`);
  if (!dryRun) {
    console.log('Restart the backend with USE_LOCAL_STORE=false to use AWS DynamoDB.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
