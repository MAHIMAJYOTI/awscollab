const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'local-db.json');

const TABLE_KEYS = {
  ChatRooms: 'roomId',
  Messages: 'messageId',
  Meetings: 'meetingId',
  Users: 'userId',
  Projects: 'projectId',
  ProjectFiles: 'fileId',
};

const GSI_KEYS = {
  ChatRooms: {
    NameIndex: ['name'],
  },
  Messages: {
    RoomIdIndex: ['roomId', 'createdAt'],
  },
  Meetings: {
    RoomIdIndex: ['roomId', 'scheduledTime'],
    OrganizerIndex: ['organizer', 'scheduledTime'],
    StatusIndex: ['status'],
    StatusScheduledTimeIndex: ['status', 'scheduledTime'],
  },
  Users: {
    EmailIndex: ['email'],
    UsernameIndex: ['username'],
  },
  Projects: {
    RoomIdIndex: ['roomId', 'createdAt'],
    CreatedByIndex: ['createdBy', 'createdAt'],
    StatusIndex: ['status', 'createdAt'],
  },
  ProjectFiles: {
    ProjectIdIndex: ['projectId', 'fileName'],
  },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

function loadDb() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function resolveAttr(name, names = {}) {
  if (name.startsWith('#')) {
    return names[name] || name.slice(1);
  }
  return name;
}

function getValue(key, values = {}) {
  return values[key];
}

function matchesCondition(item, expression, names, values) {
  if (!expression) return true;

  const parts = expression.split(/\s+AND\s+/i);
  return parts.every((part) => {
    const eq = part.match(/^(\#?\w+)\s*=\s*(:\w+)$/);
    if (eq) {
      const attr = resolveAttr(eq[1], names);
      return item[attr] === getValue(eq[2], values);
    }
    const gt = part.match(/^(\#?\w+)\s*>\s*(:\w+)$/);
    if (gt) {
      const attr = resolveAttr(gt[1], names);
      return String(item[attr]) > String(getValue(gt[2], values));
    }
    const gte = part.match(/^(\#?\w+)\s*>=\s*(:\w+)$/);
    if (gte) {
      const attr = resolveAttr(gte[1], names);
      return String(item[attr]) >= String(getValue(gte[2], values));
    }
    return true;
  });
}

function matchesFilter(item, expression, names, values) {
  return matchesCondition(item, expression, names, values);
}

function applyUpdate(item, params) {
  const updated = { ...item };
  const names = params.ExpressionAttributeNames || {};
  const values = params.ExpressionAttributeValues || {};
  const expr = params.UpdateExpression || '';

  if (expr.startsWith('SET ')) {
    const assignments = expr.slice(4).split(',').map((s) => s.trim());
    assignments.forEach((assignment) => {
      const [left, right] = assignment.split('=').map((s) => s.trim());
      const attr = resolveAttr(left, names);
      updated[attr] = getValue(right, values);
    });
  }

  return updated;
}

function createLocalDocumentClient() {
  const run = (fn) => ({
    promise: () => Promise.resolve(fn()),
  });

  return {
    put(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        const keyName = TABLE_KEYS[table];
        if (!db[table]) db[table] = [];

        const item = params.Item;
        const idx = db[table].findIndex((row) => row[keyName] === item[keyName]);
        if (idx >= 0) {
          db[table][idx] = item;
        } else {
          db[table].push(item);
        }
        saveDb(db);
        return {};
      });
    },

    get(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        const keyName = TABLE_KEYS[table];
        const keyValue = params.Key[keyName];
        const item = (db[table] || []).find((row) => row[keyName] === keyValue);
        return { Item: item || undefined };
      });
    },

    query(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        let items = [...(db[table] || [])];

        if (params.IndexName && GSI_KEYS[table]?.[params.IndexName]) {
          const indexFields = GSI_KEYS[table][params.IndexName];
          const hashField = indexFields[0];
          items = items.filter((item) =>
            matchesCondition(
              item,
              params.KeyConditionExpression,
              params.ExpressionAttributeNames,
              params.ExpressionAttributeValues
            )
          );
        } else {
          items = items.filter((item) =>
            matchesCondition(
              item,
              params.KeyConditionExpression,
              params.ExpressionAttributeNames,
              params.ExpressionAttributeValues
            )
          );
        }

        if (params.FilterExpression) {
          items = items.filter((item) =>
            matchesFilter(
              item,
              params.FilterExpression,
              params.ExpressionAttributeNames,
              params.ExpressionAttributeValues
            )
          );
        }

        if (params.ScanIndexForward === false) {
          const sortKey = GSI_KEYS[table]?.[params.IndexName]?.[1];
          if (sortKey) {
            items.sort((a, b) => String(b[sortKey]).localeCompare(String(a[sortKey])));
          }
        }

        if (params.Limit) {
          items = items.slice(0, params.Limit);
        }

        return { Items: items, Count: items.length };
      });
    },

    scan(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        let items = [...(db[table] || [])];

        if (params.FilterExpression) {
          items = items.filter((item) =>
            matchesFilter(
              item,
              params.FilterExpression,
              params.ExpressionAttributeNames,
              params.ExpressionAttributeValues
            )
          );
        }

        if (params.Limit) {
          items = items.slice(0, params.Limit);
        }

        return { Items: items, Count: items.length };
      });
    },

    update(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        const keyName = TABLE_KEYS[table];
        const keyValue = params.Key[keyName];
        const idx = (db[table] || []).findIndex((row) => row[keyName] === keyValue);

        if (idx < 0) {
          throw new Error(`Item not found in ${table}`);
        }

        const updated = applyUpdate(db[table][idx], params);
        db[table][idx] = updated;
        saveDb(db);
        return { Attributes: updated };
      });
    },

    delete(params) {
      return run(() => {
        const db = loadDb();
        const table = params.TableName;
        const keyName = TABLE_KEYS[table];
        const keyValue = params.Key[keyName];
        db[table] = (db[table] || []).filter((row) => row[keyName] !== keyValue);
        saveDb(db);
        return {};
      });
    },
  };
}

module.exports = { createLocalDocumentClient, DATA_FILE };
