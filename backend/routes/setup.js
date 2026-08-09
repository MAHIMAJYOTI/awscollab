const express = require('express');
const fs = require('fs');
const path = require('path');
const { useLocalStore } = require('../config/dynamodb');

const router = express.Router();

const LOCAL_DB = path.join(__dirname, '..', 'data', 'local-db.json');
const PROJECTS_STORE = path.join(__dirname, '..', 'data', 'projects-store.json');

function countLocalItems() {
  const counts = {
    ChatRooms: 0,
    Messages: 0,
    Meetings: 0,
    Users: 0,
    Projects: 0,
    ProjectFiles: 0,
  };

  try {
    if (fs.existsSync(LOCAL_DB)) {
      const db = JSON.parse(fs.readFileSync(LOCAL_DB, 'utf8'));
      Object.keys(counts).forEach((table) => {
        if (Array.isArray(db[table])) {
          counts[table] += db[table].length;
        }
      });
    }
  } catch {
    /* ignore */
  }

  try {
    if (fs.existsSync(PROJECTS_STORE)) {
      const store = JSON.parse(fs.readFileSync(PROJECTS_STORE, 'utf8'));
      counts.Projects += (store.projects || []).length;
      counts.ProjectFiles += (store.projectFiles || []).length;
    }
  } catch {
    /* ignore */
  }

  return counts;
}

const isAwsConfigured = () => {
  const id = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  return Boolean(
    id &&
    secret &&
    !id.includes('your_') &&
    !secret.includes('your_')
  );
};

router.get('/status', async (_req, res) => {
  const localCounts = countLocalItems();
  const totalLocalItems = Object.values(localCounts).reduce((a, b) => a + b, 0);

  let dynamodbReachable = false;
  let dynamodbError = null;

  if (!useLocalStore && isAwsConfigured()) {
    try {
      const { dynamodb } = require('../config/dynamodb');
      await dynamodb.scan({ TableName: 'ChatRooms', Limit: 1 }).promise();
      dynamodbReachable = true;
    } catch (error) {
      dynamodbError = error.message;
    }
  }

  res.json({
    storageMode: useLocalStore ? 'local' : 'aws-dynamodb',
    useLocalStore,
    awsConfigured: isAwsConfigured(),
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    dynamodbReachable,
    dynamodbError,
    localDataFiles: {
      localDb: fs.existsSync(LOCAL_DB),
      projectsStore: fs.existsSync(PROJECTS_STORE),
      itemCounts: localCounts,
      totalItems: totalLocalItems,
    },
    nextSteps: useLocalStore
      ? [
          'Add AWS credentials to backend/.env',
          'Set USE_LOCAL_STORE=false',
          'Run: npm run create-tables',
          'Run: npm run migrate-to-aws',
          'Restart backend',
        ]
      : dynamodbReachable
        ? ['AWS DynamoDB is active']
        : [
            'Verify AWS credentials in backend/.env',
            'Run: npm run create-tables',
            'Run: npm run check-setup',
          ],
  });
});

module.exports = router;
