const AWS = require('aws-sdk');
const { configureAws } = require('./awsClient');

configureAws();

const dynamodb = new AWS.DynamoDB();

function toOnDemandTable(table) {
  const { ProvisionedThroughput, GlobalSecondaryIndexes, ...rest } = table;
  const out = { ...rest, BillingMode: 'PAY_PER_REQUEST' };
  if (GlobalSecondaryIndexes) {
    out.GlobalSecondaryIndexes = GlobalSecondaryIndexes.map(
      ({ ProvisionedThroughput: _removed, ...gsi }) => gsi
    );
  }
  return out;
}

// Table definitions
const tables = [
  {
    TableName: 'ChatRooms',
    KeySchema: [
      { AttributeName: 'roomId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'roomId', AttributeType: 'S' },
      { AttributeName: 'name', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'NameIndex',
        KeySchema: [
          { AttributeName: 'name', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'Messages',
    KeySchema: [
      { AttributeName: 'messageId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'messageId', AttributeType: 'S' },
      { AttributeName: 'roomId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RoomIdIndex',
        KeySchema: [
          { AttributeName: 'roomId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'Meetings',
    KeySchema: [
      { AttributeName: 'meetingId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'meetingId', AttributeType: 'S' },
      { AttributeName: 'roomId', AttributeType: 'S' },
      { AttributeName: 'organizer', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'scheduledTime', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RoomIdIndex',
        KeySchema: [
          { AttributeName: 'roomId', KeyType: 'HASH' },
          { AttributeName: 'scheduledTime', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'OrganizerIndex',
        KeySchema: [
          { AttributeName: 'organizer', KeyType: 'HASH' },
          { AttributeName: 'scheduledTime', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'StatusScheduledTimeIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'scheduledTime', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'ScheduledTimeIndex',
        KeySchema: [
          { AttributeName: 'scheduledTime', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'Users',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'username', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'UsernameIndex',
        KeySchema: [
          { AttributeName: 'username', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'Projects',
    KeySchema: [
      { AttributeName: 'projectId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'projectId', AttributeType: 'S' },
      { AttributeName: 'roomId', AttributeType: 'S' },
      { AttributeName: 'createdBy', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'RoomIdIndex',
        KeySchema: [
          { AttributeName: 'roomId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'CreatedByIndex',
        KeySchema: [
          { AttributeName: 'createdBy', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'ProjectFiles',
    KeySchema: [
      { AttributeName: 'fileId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'fileId', AttributeType: 'S' },
      { AttributeName: 'projectId', AttributeType: 'S' },
      { AttributeName: 'fileName', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ProjectIdIndex',
        KeySchema: [
          { AttributeName: 'projectId', KeyType: 'HASH' },
          { AttributeName: 'fileName', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  }
];

async function createTables() {
  console.log('Creating DynamoDB tables...');
  
  for (const table of tables) {
    const params = toOnDemandTable(table);
    try {
      console.log(`Creating table: ${params.TableName} (on-demand billing)`);
      await dynamodb.createTable(params).promise();
      console.log(`✅ Table ${params.TableName} created successfully`);

      console.log(`Waiting for table ${params.TableName} to be active...`);
      await dynamodb.waitFor('tableExists', { TableName: params.TableName }).promise();
      console.log(`✅ Table ${params.TableName} is now active`);
    } catch (error) {
      if (error.code === 'ResourceInUseException') {
        console.log(`⚠️  Table ${params.TableName} already exists`);
      } else {
        console.error(`❌ Error creating table ${params.TableName}:`, error.message);
      }
    }
  }
  
  console.log('✅ All tables created successfully!');
}

async function listTables() {
  try {
    const result = await dynamodb.listTables().promise();
    console.log('Existing tables:', result.TableNames);
  } catch (error) {
    console.error('Error listing tables:', error.message);
  }
}

// Run the script
if (require.main === module) {
  createTables()
    .then(() => listTables())
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables, listTables };
