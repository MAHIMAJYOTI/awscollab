#!/usr/bin/env node

const AWS = require('aws-sdk');
require('dotenv').config();

const useLocalStore = process.env.USE_LOCAL_STORE === 'true';

console.log('🚀 AWS DynamoDB Setup Helper\n');

if (useLocalStore) {
  console.log('📦 USE_LOCAL_STORE=true — running with local JSON storage.');
  console.log('   No AWS connection needed for local development.\n');
  console.log('When you are ready for real AWS DynamoDB:');
  console.log('  1. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to backend/.env');
  console.log('  2. Set USE_LOCAL_STORE=false');
  console.log('  3. npm run create-tables');
  console.log('  4. npm run migrate-to-aws   (optional — copies local data)');
  console.log('  5. npm run check-setup');
  console.log('  6. Restart backend\n');
  console.log('Check status anytime: GET http://localhost:5000/api/setup/status');
  process.exit(0);
}

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB();

// Check if AWS credentials are configured
function checkCredentials() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('❌ AWS credentials not found in .env file');
    console.log('Please add the following to your .env file:');
    console.log('AWS_REGION=us-east-1');
    console.log('AWS_ACCESS_KEY_ID=your_access_key_id');
    console.log('AWS_SECRET_ACCESS_KEY=your_secret_access_key\n');
    return false;
  }
  console.log('✅ AWS credentials found');
  return true;
}

// List existing tables
async function listTables() {
  try {
    const result = await dynamodb.listTables().promise();
    console.log('\n📋 Existing DynamoDB tables:');
    if (result.TableNames.length === 0) {
      console.log('   No tables found');
    } else {
      result.TableNames.forEach(table => {
        console.log(`   - ${table}`);
      });
    }
    return result.TableNames;
  } catch (error) {
    console.log('❌ Error listing tables:', error.message);
    return [];
  }
}

// Check if required tables exist
function checkRequiredTables(existingTables) {
  const requiredTables = ['ChatRooms', 'Messages', 'Meetings', 'Users', 'Projects', 'ProjectFiles'];
  const missingTables = requiredTables.filter(table => !existingTables.includes(table));
  
  console.log('\n🔍 Checking required tables:');
  requiredTables.forEach(table => {
    const exists = existingTables.includes(table);
    console.log(`   ${exists ? '✅' : '❌'} ${table}`);
  });
  
  if (missingTables.length > 0) {
    console.log('\n📝 Missing tables that need to be created:');
    missingTables.forEach(table => {
      console.log(`   - ${table}`);
    });
    console.log('\n💡 Run: npm run create-tables');
  } else {
    console.log('\n🎉 All required tables exist!');
  }
  
  return missingTables;
}

// Test connection
async function testConnection() {
  try {
    console.log('\n🔌 Testing DynamoDB connection...');
    await dynamodb.describeTable({ TableName: 'ChatRooms' }).promise();
    console.log('✅ Connection successful!');
    return true;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log('⚠️  Connection works, but ChatRooms table not found');
      return true;
    } else {
      console.log('❌ Connection failed:', error.message);
      return false;
    }
  }
}

// Main function
async function main() {
  console.log('This script will help you verify your DynamoDB setup.\n');
  
  // Step 1: Check credentials
  if (!checkCredentials()) {
    process.exit(1);
  }
  
  // Step 2: Test connection
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.log('\n❌ Please check your AWS credentials and try again');
    process.exit(1);
  }
  
  // Step 3: List tables
  const existingTables = await listTables();
  
  // Step 4: Check required tables
  const missingTables = checkRequiredTables(existingTables);
  
  // Step 5: Provide next steps
  console.log('\n📋 Next Steps:');
  if (missingTables.length > 0) {
    console.log('1. Create missing tables: npm run create-tables');
    console.log('2. Test integration: npm test');
    console.log('3. Start application: npm start');
  } else {
    console.log('1. Test integration: npm test');
    console.log('2. Start application: npm start');
  }
  
  console.log('\n🎯 Your DynamoDB setup is ready!');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Setup check failed:', error.message);
    process.exit(1);
  });
}

module.exports = { checkCredentials, listTables, checkRequiredTables, testConnection };
