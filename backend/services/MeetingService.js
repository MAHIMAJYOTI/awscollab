const { dynamodb, TABLES, generateId, formatTimestamp, parseTimestamp } = require('../config/dynamodb');

class MeetingService {
  // Create a new meeting
  async createMeeting(meetingData) {
    const meetingId = generateId();
    const timestamp = formatTimestamp();
    
    // Convert scheduledTime to Date object if it's a string
    let scheduledTime;
    if (typeof meetingData.scheduledTime === 'string') {
      scheduledTime = new Date(meetingData.scheduledTime);
    } else if (meetingData.scheduledTime instanceof Date) {
      scheduledTime = meetingData.scheduledTime;
    } else {
      scheduledTime = new Date();
    }
    
    const meeting = {
      meetingId,
      title: meetingData.title,
      description: meetingData.description || '',
      roomId: meetingData.roomId,
      organizer: meetingData.organizer,
      participants: meetingData.participants || [],
      scheduledTime: formatTimestamp(scheduledTime),
      duration: meetingData.duration || 60,
      settings: {
        allowScreenShare: true,
        allowChat: true,
        requirePassword: false,
        password: null,
        maxParticipants: 50,
        ...meetingData.settings
      },
      isRecurring: meetingData.isRecurring || false,
      recurringSettings: meetingData.recurringSettings || {
        frequency: 'weekly',
        interval: 1,
        endDate: null
      },
      status: 'scheduled',
      meetingUrl: meetingData.meetingUrl || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const params = {
      TableName: TABLES.MEETINGS,
      Item: meeting
    };

    await dynamodb.put(params).promise();
    return meeting;
  }

  // Get meeting by ID
  async getMeetingById(meetingId) {
    const params = {
      TableName: TABLES.MEETINGS,
      Key: { meetingId }
    };

    const result = await dynamodb.get(params).promise();
    return result.Item || null;
  }

  // Get meetings by room ID
  async getMeetingsByRoom(roomId) {
    try {
      // Try to use the index first
      const params = {
        TableName: TABLES.MEETINGS,
        IndexName: 'RoomIdIndex',
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        },
        ScanIndexForward: false // Sort by scheduledTime descending
      };

      const result = await dynamodb.query(params).promise();
      return result.Items || [];
    } catch (error) {
      // If index is not available, fall back to scan
      if (error.message && error.message.includes('index')) {
        console.log('RoomIdIndex not available, using scan operation');
        const scanParams = {
          TableName: TABLES.MEETINGS,
          FilterExpression: 'roomId = :roomId',
          ExpressionAttributeValues: {
            ':roomId': roomId
          }
        };

        const result = await dynamodb.scan(scanParams).promise();
        return result.Items || [];
      }
      throw error;
    }
  }

  // Update meeting
  async updateMeeting(meetingId, updateData) {
    const timestamp = formatTimestamp();
    
    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updateData).forEach(key => {
      if (key !== 'meetingId') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updateData[key];
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    const params = {
      TableName: TABLES.MEETINGS,
      Key: { meetingId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
  }

  // Update meeting status
  async updateMeetingStatus(meetingId, status) {
    return await this.updateMeeting(meetingId, { status });
  }

  // Add participant to meeting
  async addParticipant(meetingId, participant) {
    const meeting = await this.getMeetingById(meetingId);
    if (!meeting) return null;

    const updatedParticipants = [...meeting.participants, participant];
    return await this.updateMeeting(meetingId, { participants: updatedParticipants });
  }

  // Remove participant from meeting
  async removeParticipant(meetingId, participantId) {
    const meeting = await this.getMeetingById(meetingId);
    if (!meeting) return null;

    const updatedParticipants = meeting.participants.filter(p => p !== participantId);
    return await this.updateMeeting(meetingId, { participants: updatedParticipants });
  }

  // Get meetings by organizer
  async getMeetingsByOrganizer(organizer) {
    const params = {
      TableName: TABLES.MEETINGS,
      IndexName: 'OrganizerIndex',
      KeyConditionExpression: 'organizer = :organizer',
      ExpressionAttributeValues: {
        ':organizer': organizer
      },
      ScanIndexForward: false
    };

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  }

  // Get upcoming meetings
  async getUpcomingMeetings(limit = 10) {
    const now = formatTimestamp();
    
    const params = {
      TableName: TABLES.MEETINGS,
      IndexName: 'StatusScheduledTimeIndex',
      KeyConditionExpression: '#status = :status AND scheduledTime > :now',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'scheduled',
        ':now': now
      },
      ScanIndexForward: true, // Sort by scheduledTime ascending
      Limit: limit
    };

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  }

  // Get active meetings
  async getActiveMeetings() {
    const params = {
      TableName: TABLES.MEETINGS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    };

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  }

  // Delete meeting
  async deleteMeeting(meetingId) {
    const params = {
      TableName: TABLES.MEETINGS,
      Key: { meetingId }
    };

    await dynamodb.delete(params).promise();
    return true;
  }

  // Get meetings by date range
  async getMeetingsByDateRange(startDate, endDate) {
    const params = {
      TableName: TABLES.MEETINGS,
      IndexName: 'ScheduledTimeIndex',
      KeyConditionExpression: 'scheduledTime BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':startDate': formatTimestamp(startDate),
        ':endDate': formatTimestamp(endDate)
      }
    };

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  }

  async getAllMeetings() {
    const params = { TableName: TABLES.MEETINGS };
    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  }

  // Search meetings by title
  async searchMeetings(searchText, limit = 20) {
    const params = {
      TableName: TABLES.MEETINGS,
      FilterExpression: 'contains(title, :searchText) OR contains(description, :searchText)',
      ExpressionAttributeValues: {
        ':searchText': searchText
      },
      Limit: limit
    };

    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  }
}

module.exports = MeetingService;
