const { dynamodb, TABLES, generateId, formatTimestamp, parseTimestamp } = require('../config/dynamodb');

class ChatRoomService {
  // Create a new chat room
  async createRoom(roomData) {
    const roomId = generateId();
    const timestamp = formatTimestamp();
    
    const room = {
      roomId,
      name: roomData.name,
      createdBy: roomData.createdBy,
      isPrivate: roomData.isPrivate || false,
      password: roomData.password || null,
      color: roomData.color || '#007bff',
      participants: roomData.participants || [],
      admins: roomData.admins || [],
      settings: {
        allowMemberInvites: true,
        allowMessageDeletion: true,
        allowMemberRemoval: true,
        requireAdminApproval: false,
        ...roomData.settings
      },
      createdAt: timestamp,
      lastActivity: timestamp
    };

    const params = {
      TableName: TABLES.CHAT_ROOMS,
      Item: room,
      ConditionExpression: 'attribute_not_exists(roomId)'
    };

    try {
      await dynamodb.put(params).promise();
      return room;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new Error('Room with this name already exists');
      }
      throw error;
    }
  }

  // Get room by name
  async getRoomByName(name) {
    const params = {
      TableName: TABLES.CHAT_ROOMS,
      IndexName: 'NameIndex',
      KeyConditionExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':name': name
      }
    };

    const result = await dynamodb.query(params).promise();
    return result.Items[0] || null;
  }

  // Get room by ID
  async getRoomById(roomId) {
    const params = {
      TableName: TABLES.CHAT_ROOMS,
      Key: { roomId }
    };

    const result = await dynamodb.get(params).promise();
    return result.Item || null;
  }

  // Update room
  async updateRoom(roomId, updateData) {
    const timestamp = formatTimestamp();
    
    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updateData).forEach(key => {
      if (key !== 'roomId') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updateData[key];
      }
    });

    updateExpressions.push('#lastActivity = :lastActivity');
    expressionAttributeNames['#lastActivity'] = 'lastActivity';
    expressionAttributeValues[':lastActivity'] = timestamp;

    const params = {
      TableName: TABLES.CHAT_ROOMS,
      Key: { roomId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
  }

  // Add participant to room
  async addParticipant(roomId, participant) {
    const room = await this.getRoomById(roomId);
    if (!room) return null;

    const timestamp = formatTimestamp();
    const username =
      typeof participant === 'string' ? participant : participant?.username;
    const participants = room.participants || [];

    const alreadyInRoom = participants.some((p) => {
      const name = typeof p === 'string' ? p : p?.username;
      return name === username;
    });
    if (alreadyInRoom) {
      return room;
    }

    const newParticipant = {
      ...participant,
      username,
      joinedAt: timestamp,
    };

    return await this.updateRoom(roomId, {
      participants: [...participants, newParticipant],
      lastActivity: timestamp,
    });
  }

  // Remove participant from room
  async removeParticipant(roomId, username) {
    const room = await this.getRoomById(roomId);
    if (!room) return null;

    const updatedParticipants = room.participants.filter(p => p.username !== username);
    
    return await this.updateRoom(roomId, {
      participants: updatedParticipants
    });
  }

  // Check if user is admin
  isUserAdmin(room, username) {
    return (room.admins || []).includes(username) || room.createdBy === username;
  }

  // Check if user has specific permission
  hasPermission(room, username, permission) {
    if (room.createdBy === username) return true; // Creator has all permissions
    if (!(room.admins || []).includes(username)) return false;
    
    const participant = (room.participants || []).find((p) => {
      const name = typeof p === 'string' ? p : p?.username;
      return name === username;
    });
    return participant && participant.permissions && participant.permissions[permission];
  }

  // Get unique participant count
  getUniqueParticipantCount(room) {
    const uniqueUsernames = new Set();
    
    // Add creator
    if (room.createdBy) {
      uniqueUsernames.add(room.createdBy);
    }
    
    // Add admins
    room.admins.forEach(admin => {
      if (admin) uniqueUsernames.add(admin);
    });
    
    // Add participants
    room.participants.forEach(participant => {
      if (participant.username) uniqueUsernames.add(participant.username);
    });
    
    return uniqueUsernames.size;
  }

  // Get all unique participants
  getAllUniqueParticipants(room) {
    const uniqueParticipants = new Map();
    const admins = room.admins || [];
    const participants = room.participants || [];
    
    // Add creator
    if (room.createdBy) {
      uniqueParticipants.set(room.createdBy, {
        username: room.createdBy,
        isCreator: true,
        isAdmin: true,
        joinedAt: room.createdAt,
        color: room.color || '#007bff'
      });
    }
    
    // Add admins
    admins.forEach(admin => {
      if (admin && !uniqueParticipants.has(admin)) {
        uniqueParticipants.set(admin, {
          username: admin,
          isCreator: admin === room.createdBy,
          isAdmin: true,
          joinedAt: room.createdAt,
          color: room.color || '#007bff'
        });
      }
    });
    
    // Add participants
    participants.forEach(participant => {
      const username =
        typeof participant === 'string'
          ? participant
          : participant?.username;
      if (username && !uniqueParticipants.has(username)) {
        const p = typeof participant === 'string' ? { username: participant } : participant;
        uniqueParticipants.set(username, {
          username,
          isCreator: username === room.createdBy,
          isAdmin: admins.includes(username),
          joinedAt: p.joinedAt,
          color: p.color || '#007bff',
        });
      }
    });
    
    return Array.from(uniqueParticipants.values());
  }

  // Get all rooms
  async getAllRooms() {
    const params = {
      TableName: TABLES.CHAT_ROOMS
    };

    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  }

  // Get rooms for a specific user (where user is participant, creator, or admin)
  async getRoomsForUser(username) {
    const params = {
      TableName: TABLES.CHAT_ROOMS
    };

    const result = await dynamodb.scan(params).promise();
    const allRooms = result.Items || [];
    
    // Filter rooms where user is a participant, creator, or admin
    const userRooms = allRooms.filter(room => {
      const isParticipant = room.participants && room.participants.some(p => p.username === username);
      const isCreator = room.createdBy === username;
      const isAdmin = room.admins && room.admins.includes(username);
      
      return isParticipant || isCreator || isAdmin;
    });
    
    return userRooms;
  }

  // Delete room
  async deleteRoom(roomId) {
    const params = {
      TableName: TABLES.CHAT_ROOMS,
      Key: { roomId }
    };

    await dynamodb.delete(params).promise();
    return true;
  }
}

module.exports = ChatRoomService;
