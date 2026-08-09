const AWS = require('aws-sdk');
require('dotenv').config();
const { createLocalDocumentClient } = require('./localDynamodb');

const isPlaceholderKey = (value) =>
  !value ||
  value.includes('your_') ||
  value.includes('YOUR_');

const useLocalStore =
  process.env.USE_LOCAL_STORE === 'true' ||
  (process.env.USE_LOCAL_STORE !== 'false' &&
    isPlaceholderKey(process.env.AWS_ACCESS_KEY_ID) &&
    isPlaceholderKey(process.env.AWS_SECRET_ACCESS_KEY));

let dynamodb;

if (useLocalStore) {
  dynamodb = createLocalDocumentClient();
  console.log('📦 Using local file storage (backend/data/local-db.json) — no AWS required');
} else {
  const { configureAws } = require('../scripts/awsClient');
  configureAws();
  dynamodb = new AWS.DynamoDB.DocumentClient();
  console.log('☁️  Using AWS DynamoDB — region:', process.env.AWS_REGION || 'us-east-1');
}

const TABLES = {
  CHAT_ROOMS: 'ChatRooms',
  MESSAGES: 'Messages',
  MEETINGS: 'Meetings',
  CHAT_MESSAGES: 'ChatMessages',
  LIVE_CODE: 'LiveCode',
  PROJECTS: 'Projects',
  PROJECT_FILES: 'ProjectFiles',
};

const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substr(2, 9);

const formatTimestamp = (date = new Date()) => date.toISOString();

const parseTimestamp = (timestamp) => new Date(timestamp);

module.exports = {
  dynamodb,
  TABLES,
  generateId,
  formatTimestamp,
  parseTimestamp,
  useLocalStore,
};
