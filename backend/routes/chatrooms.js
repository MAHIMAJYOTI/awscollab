const express = require('express');
const router = express.Router();
const ChatRoomService = require('../services/ChatRoomService');
const MessageService = require('../services/MessageService');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');

// Create service instances
const chatRoomService = new ChatRoomService();
const messageService = new MessageService();

// Debug endpoint to list all rooms
router.get('/debug/all', async (req, res) => {
  try {
    const rooms = await chatRoomService.getAllRooms();
    res.json({
      success: true,
      count: rooms.length,
      rooms: rooms.map(room => ({
        name: room.name,
        createdBy: room.createdBy,
        participantCount: room.participants ? room.participants.length : 0,
        createdAt: room.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching all rooms:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to test database connection
router.get('/debug/test', async (req, res) => {
  try {
    const rooms = await chatRoomService.getAllRooms();
    res.json({
      success: true,
      message: 'Database connection working',
      totalRooms: rooms.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// Create or join a chatroom
router.post('/', async (req, res) => {
  const { name, createdBy, isPrivate, password, color, participants } = req.body;
  
  // Input validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Room name is required and must be a non-empty string' });
  }
  
  if (!createdBy || typeof createdBy !== 'string' || createdBy.trim().length === 0) {
    return res.status(400).json({ error: 'Creator name is required and must be a non-empty string' });
  }
  
  // Sanitize inputs
  const sanitizedName = name.trim();
  const sanitizedCreatedBy = createdBy.trim();
  
  try {
    console.log('=== CREATE/JOIN ROOM REQUEST ===');
    console.log('Room name:', name);
    console.log('Sanitized room name:', sanitizedName);
    console.log('Created by:', createdBy);
    console.log('Sanitized created by:', sanitizedCreatedBy);
    console.log('Participants:', participants);
    
    let room;
    try {
      room = await chatRoomService.getRoomByName(sanitizedName);
      console.log('Existing room found:', room ? 'YES' : 'NO');
    } catch (error) {
      // If index is not ready, try to get all rooms and filter
      if (error.message && error.message.includes('backfilling')) {
        console.log('Index not ready, trying alternative method');
        const allRooms = await chatRoomService.getAllRooms();
        room = allRooms.find(r => r.name === sanitizedName);
        console.log('Existing room found (via scan):', room ? 'YES' : 'NO');
      } else {
        throw error;
      }
    }
    
    if (!room) {
      // Create new room
      console.log('Creating new room:', sanitizedName);
      // Ensure creator is added as both admin and participant
      const creatorParticipant = {
        username: sanitizedCreatedBy,
        joinedAt: new Date().toISOString(),
        isAdmin: true,
        permissions: {
          canSendMessages: true,
          canDeleteMessages: true,
          canRemoveMembers: true,
          canManageAdmins: true,
          canEditRoomSettings: true
        }
      };
      
      const allParticipants = participants || [];
      // Add creator if not already in participants
      if (!allParticipants.some(p => p.username === sanitizedCreatedBy)) {
        allParticipants.push(creatorParticipant);
      }
      
      room = await chatRoomService.createRoom({ 
        name: sanitizedName,
        createdBy: sanitizedCreatedBy,
        isPrivate: isPrivate || false,
        password: isPrivate ? password : null,
        color: color || '#007bff',
        admins: [sanitizedCreatedBy],
        participants: allParticipants
      });
      
      console.log('Room created successfully:', room.roomId);
      console.log('Room name in DB:', room.name);
    } else {
      // Room exists, add participant if provided
      console.log('Room exists, adding participant if needed:', name);
      if (participants && participants.length > 0) {
        const newParticipant = participants[0];
        const existingParticipant = room.participants && room.participants.find(p => p.username === newParticipant.username);
        
        if (!existingParticipant) {
          await chatRoomService.addParticipant(room.roomId, newParticipant);
          // Refresh room data
          room = await chatRoomService.getRoomById(room.roomId);
          console.log('Participant added to existing room:', newParticipant.username);
        } else {
          console.log('Participant already exists in room:', newParticipant.username);
        }
      }
    }
    
    // Get unique participants for response
    const uniqueParticipants = chatRoomService.getAllUniqueParticipants(room);
    const uniqueParticipantCount = uniqueParticipants.length;
    
    res.json({
      success: true,
      room: {
        ...room,
        uniqueParticipants,
        uniqueParticipantCount
      }
    });
  } catch (err) {
    console.error('Error creating/joining room:', err);
    res.status(500).json({ success: false, error: err.message, message: err.message });
  }
});

// Join an existing room
router.post('/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, password } = req.body;
    
    // Input validation
    if (!roomId || typeof roomId !== 'string' || roomId.trim().length === 0) {
      return res.status(400).json({ error: 'Room ID is required and must be a non-empty string' });
    }
    
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(401).json({ error: 'Username is required and must be a non-empty string' });
    }
    
    // Sanitize inputs
    const sanitizedRoomId = roomId.trim();
    const sanitizedUsername = username.trim();
    
    console.log('=== JOIN ROOM REQUEST ===');
    console.log('Room ID:', roomId);
    console.log('Sanitized Room ID:', sanitizedRoomId);
    console.log('Username:', username);
    console.log('Sanitized Username:', sanitizedUsername);
    console.log('Request body:', req.body);
    console.log('Request params:', req.params);
    
    // Get all rooms to debug
    const allRooms = await chatRoomService.getAllRooms();
    console.log('All available rooms:', allRooms.map(r => r.name));
    console.log('Looking for room with name:', sanitizedRoomId);

    // Get room using DynamoDB service
    let room;
    try {
      room = await chatRoomService.getRoomByName(sanitizedRoomId);
    } catch (error) {
      // If index is not ready, try to get all rooms and filter
      if (error.message && error.message.includes('backfilling')) {
        console.log('Index not ready, trying alternative method');
        const allRooms = await chatRoomService.getAllRooms();
        room = allRooms.find(r => r.name === sanitizedRoomId);
      } else {
        throw error;
      }
    }
    
    console.log('Room found:', room ? 'YES' : 'NO');
    if (room) {
      console.log('Room details:', {
        name: room.name,
        createdBy: room.createdBy,
        participants: room.participants ? room.participants.length : 0,
        admins: room.admins ? room.admins.length : 0
      });
    }
    
    if (!room) {
      console.log('Room not found');
      return res.status(404).json({ 
        success: false,
        error: 'Room not found. The room may have been deleted or the PIN is incorrect.',
        message: 'Room not found'
      });
    }
    
    const participantUsername = (p) =>
      typeof p === 'string' ? p : p?.username;
    const roomParticipants = room.participants || [];

    // Check if user is already a member (check all possible ways)
    const isAlreadyMember = (roomParticipants.some(p => participantUsername(p) === sanitizedUsername)) || 
                           room.createdBy === sanitizedUsername || 
                           chatRoomService.isUserAdmin(room, sanitizedUsername);
    
    if (isAlreadyMember) {
      const uniqueParticipants = chatRoomService.getAllUniqueParticipants(room);
      return res.json({
        success: true,
        message: 'Already a member of this room',
        room: {
          ...room,
          uniqueParticipants,
          uniqueParticipantCount: uniqueParticipants.length,
        },
      });
    }
    
    // Check if room is private and requires password
    if (room.isPrivate && room.password && room.password !== password) {
      return res.status(403).json({ success: false, error: 'Invalid password for private room', message: 'Invalid password' });
    }
    
    // Add user to room using the service
    const newParticipant = {
      username: sanitizedUsername,
      isCreator: false,
      isAdmin: false,
      joinedAt: new Date().toISOString(),
      color: '#007bff',
      permissions: {
        canDeleteMessages: false,
        canRemoveMembers: false,
        canManageAdmins: false,
        canEditRoomSettings: false
      }
    };
    
    await chatRoomService.addParticipant(room.roomId, newParticipant);
    
    // Refresh room data
    room = await chatRoomService.getRoomById(room.roomId);
    
    const uniqueParticipants = chatRoomService.getAllUniqueParticipants(room);
    
    res.json({ 
      success: true, 
      message: 'Successfully joined room',
      room: {
        ...room,
        uniqueParticipants,
        uniqueParticipantCount: uniqueParticipants.length
      }
    });
  } catch (err) {
    console.error('Error joining room:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get room by name/pin (requires authentication and membership)
router.get('/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const { username } = req.query; // Current user
    
    if (!username) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const room = await chatRoomService.getRoomByName(roomName);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user is a member of the room
    const participantUsername = (p) =>
      typeof p === 'string' ? p : p?.username;
    const isParticipant = (room.participants || []).some(p => participantUsername(p) === username);
    const isCreator = room.createdBy === username;
    const isAdmin = chatRoomService.isUserAdmin(room, username);
    const isMember = isParticipant || isCreator || isAdmin;
    
    console.log('Room access check:', {
      username,
      roomName,
      isParticipant,
      isCreator,
      isAdmin,
      isMember,
      participants: (room.participants || []).map((p) =>
        typeof p === 'string' ? p : p.username
      ),
      createdBy: room.createdBy,
      admins: room.admins
    });
    
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied. You must be a member of this room.' });
    }
    
    // Get unique participants for response
    const uniqueParticipants = chatRoomService.getAllUniqueParticipants(room);
    
    res.json({
      success: true,
      room: {
        name: room.name,
        createdBy: room.createdBy,
        isPrivate: room.isPrivate,
        password: room.password,
        participants: uniqueParticipants,
        admins: room.admins,
        color: room.color,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        settings: room.settings,
        uniqueParticipants,
        uniqueParticipantCount: uniqueParticipants.length,
        roomId: room.roomId
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all chatrooms (only rooms user is a member of)
router.get('/', async (req, res) => {
  try {
    const { username } = req.query; // Current user
    
    if (!username) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Find rooms where user is a member, creator, or admin using DynamoDB service
    const rooms = await chatRoomService.getRoomsForUser(username);
    
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a room (requires authentication and membership)
router.get('/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.query; // Current user
    
    if (!username) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    console.log('=== GETTING MESSAGES FOR ROOM:', roomId, '===');
    
    // Find the room by name using DynamoDB service
    console.log('Step 1: Looking for room with name:', roomId);
    let room;
    try {
      room = await chatRoomService.getRoomByName(roomId);
    } catch (error) {
      if (error.message && error.message.includes('backfilling')) {
        const allRooms = await chatRoomService.getAllRooms();
        room = allRooms.find(r => r.name === roomId);
      } else {
        throw error;
      }
    }
    
    if (!room) {
      console.log('Step 2: Room not found, returning empty array');
      return res.status(200).json([]);
    }
    
    // Check if user is a member of the room
    const isParticipant = room.participants && room.participants.some(p => p.username === username);
    const isCreator = room.createdBy === username;
    const isAdmin = chatRoomService.isUserAdmin(room, username);
    const isMember = isParticipant || isCreator || isAdmin;
    
    console.log('Messages access check:', {
      username,
      roomId,
      isParticipant,
      isCreator,
      isAdmin,
      isMember,
      participants: room.participants ? room.participants.map(p => p.username) : [],
      createdBy: room.createdBy,
      admins: room.admins || []
    });
    
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied. You must be a member of this room.' });
    }
    
    console.log('Step 2: Found room with roomId:', room.roomId);
    
    // Get messages using DynamoDB service
    console.log('Step 3: Searching for messages with roomId:', room.roomId);
    const result = await messageService.getMessagesByRoom(room.roomId);
    const messages = result.messages || [];
    console.log('Step 4: Found', messages.length, 'messages');

    res.status(200).json(messages);
  } catch (err) {
    console.error('=== ERROR IN GET MESSAGES ===');
    console.error('Error details:', err);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
});

// Post a message (text or code)
router.post('/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { user, text, code, language, output } = req.body;
    
    // Input validation
    if (!roomId || typeof roomId !== 'string' || roomId.trim().length === 0) {
      return res.status(400).json({ error: 'Room ID is required and must be a non-empty string' });
    }
    
    if (!user || typeof user !== 'string' || user.trim().length === 0) {
      return res.status(400).json({ error: 'User is required and must be a non-empty string' });
    }
    
    if (!text && !code) {
      return res.status(400).json({ error: 'Either text or code is required' });
    }
    
    // Sanitize inputs
    const sanitizedRoomId = roomId.trim();
    const sanitizedUser = user.trim();
    const sanitizedText = text ? text.trim() : '';
    const sanitizedCode = code ? code.trim() : '';
    
    console.log('=== CREATING MESSAGE FOR ROOM:', sanitizedRoomId, '===');
    console.log('Message data:', { user: sanitizedUser, text: sanitizedText, code: sanitizedCode, language });
    
    // First find the room by name/pin to get the MongoDB ObjectId
    console.log('Step 1: Looking for room with name:', sanitizedRoomId);
    const room = await chatRoomService.getRoomByName(sanitizedRoomId);
    
    if (!room) {
      console.log('Step 2: Room not found, returning 404');
      return res.status(404).json({ error: 'Room not found' });
    }
    
    console.log('Step 2: Found room with roomId:', room.roomId);

    const message = await messageService.createMessage({
      roomId: room.roomId,
      user: sanitizedUser,
      text: sanitizedText,
      code: sanitizedCode,
      language,
      output,
      isCode: Boolean(sanitizedCode),
    });
    console.log('Step 4: Created message with ID:', message.messageId);

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('=== ERROR IN CREATE MESSAGE ===');
    console.error('Error details:', err);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to create message', details: err.message });
  }
});

// Admin routes
// Get room members (admin only)
router.get('/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.query; // Current user
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user is admin
    if (!chatRoomService.isUserAdmin(room, username)) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    res.json({
      success: true,
      members: room.participants,
      admins: room.admins,
      createdBy: room.createdBy
    });
  } catch (err) {
    console.error('Error fetching room members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Promote user to admin
router.post('/:roomId/admins', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username: targetUsername, adminUsername } = req.body;
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if admin has permission
    if (!chatRoomService.hasPermission(room, adminUsername, 'canManageAdmins')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Add to admins if not already
    if (!chatRoomService.isUserAdmin(room, targetUsername)) {
      room.admins.push(targetUsername);
      
      // Update participant permissions
      const participant = room.participants.find(p => p.username === targetUsername);
      if (participant) {
        participant.isAdmin = true;
        participant.permissions = {
          canDeleteMessages: true,
          canRemoveMembers: true,
          canManageAdmins: true,
          canEditRoomSettings: true
        };
      }
      
      await chatRoomService.updateRoom(room.roomId, {
        admins: room.admins,
        participants: room.participants
      });
    }
    
    res.json({ success: true, message: 'User promoted to admin' });
  } catch (err) {
    console.error('Error promoting user:', err);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

// Demote admin to regular member
router.delete('/:roomId/admins/:username', async (req, res) => {
  try {
    const { roomId, username: targetUsername } = req.params;
    const { username: adminUsername } = req.body;
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if admin has permission
    if (!chatRoomService.hasPermission(room, adminUsername, 'canManageAdmins')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Can't demote the creator
    if (targetUsername === room.createdBy) {
      return res.status(400).json({ error: 'Cannot demote room creator' });
    }
    
    // Remove from admins
    room.admins = room.admins.filter(admin => admin !== targetUsername);
    
    // Reset participant permissions
    const participant = room.participants.find(p => p.username === targetUsername);
    if (participant) {
      participant.isAdmin = false;
      participant.permissions = {
        canDeleteMessages: false,
        canRemoveMembers: false,
        canManageAdmins: false,
        canEditRoomSettings: false
      };
    }
    
    await chatRoomService.updateRoom(room.roomId, {
      admins: room.admins,
      participants: room.participants
    });
    
    res.json({ success: true, message: 'Admin demoted to member' });
  } catch (err) {
    console.error('Error demoting admin:', err);
    res.status(500).json({ error: 'Failed to demote admin' });
  }
});

// Update room settings (admin only)
router.patch('/:roomId/settings', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, settings } = req.body;
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user has permission
    if (!chatRoomService.hasPermission(room, username, 'canEditRoomSettings')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Update settings
    room.settings = { ...room.settings, ...settings };
    await chatRoomService.updateRoom(room.roomId, {
      settings: room.settings
    });
    
    res.json({ success: true, message: 'Room settings updated', settings: room.settings });
  } catch (err) {
    console.error('Error updating room settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Delete a message (admin only)
router.delete('/:roomId/messages/:messageId', async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const { username } = req.body;

    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!chatRoomService.hasPermission(room, username, 'canDeleteMessages')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await messageService.deleteMessage(messageId);
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Update room name (admin only)
router.patch('/:roomId/name', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, newName } = req.body;
    
    if (!newName || newName.trim().length === 0) {
      return res.status(400).json({ error: 'Room name cannot be empty' });
    }
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user has permission
    if (!chatRoomService.hasPermission(room, username, 'canEditRoomSettings')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if new name already exists
    const existingRoom = await chatRoomService.getRoomByName(newName.trim());
    if (existingRoom && existingRoom.roomId !== room.roomId) {
      return res.status(400).json({ error: 'Room name already exists' });
    }
    
    // Update room name
    const oldName = room.name;
    room.name = newName.trim();
    await chatRoomService.updateRoom(room.roomId, {
      name: room.name
    });
    
    res.json({ 
      success: true, 
      message: 'Room name updated successfully',
      oldName,
      newName: room.name
    });
  } catch (err) {
    console.error('Error updating room name:', err);
    res.status(500).json({ error: 'Failed to update room name' });
  }
});

// Update room color (admin only)
router.patch('/:roomId/color', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, color } = req.body;
    
    if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Invalid color format' });
    }
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user has permission
    if (!chatRoomService.hasPermission(room, username, 'canEditRoomSettings')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Update room color
    room.color = color;
    await chatRoomService.updateRoom(room.roomId, {
      color: room.color
    });
    
    res.json({ 
      success: true, 
      message: 'Room color updated successfully',
      color: room.color
    });
  } catch (err) {
    console.error('Error updating room color:', err);
    res.status(500).json({ error: 'Failed to update room color' });
  }
});

// Get room permissions for a user
router.get('/:roomId/permissions/:username', async (req, res) => {
  try {
    const { roomId, username } = req.params;
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user is admin
    const isAdmin = chatRoomService.isUserAdmin(room, username);
    const isCreator = room.createdBy === username;
    
    // Default permissions for admins/creators
    const permissions = {
      isAdmin,
      isCreator,
      canDeleteMessages: isAdmin || isCreator,
      canRemoveMembers: isAdmin || isCreator,
      canManageAdmins: isAdmin || isCreator,
      canEditRoomSettings: isAdmin || isCreator
    };
    
    res.json({ success: true, permissions });
  } catch (err) {
    console.error('Error getting permissions:', err);
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

// Remove member from room (admin only)
router.delete('/:roomId/members/:username', async (req, res) => {
  try {
    const { roomId, username: targetUsername } = req.params;
    const { username: adminUsername } = req.body;
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if admin has permission
    if (!chatRoomService.hasPermission(room, adminUsername, 'canRemoveMembers')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Can't remove the creator
    if (targetUsername === room.createdBy) {
      return res.status(400).json({ error: 'Cannot remove room creator' });
    }
    
    // Can't remove yourself
    if (targetUsername === adminUsername) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }
    
    // Remove from participants
    room.participants = room.participants.filter(p => p.username !== targetUsername);
    
    // Remove from admins if they were an admin
    room.admins = room.admins.filter(admin => admin !== targetUsername);
    
    await chatRoomService.updateRoom(room.roomId, {
      participants: room.participants,
      admins: room.admins
    });
    
    res.json({ 
      success: true, 
      message: `${targetUsername} removed from room successfully`
    });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Invite new member as admin
router.post('/:roomId/invite-admin', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, email, invitedBy } = req.body;
    
    if (!username || !email || !invitedBy) {
      return res.status(400).json({ error: 'Username, email, and invitedBy are required' });
    }
    
    const room = await chatRoomService.getRoomByName(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if inviter has permission to manage admins
    if (!chatRoomService.hasPermission(room, invitedBy, 'canManageAdmins')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if user is already a member
    const isAlreadyMember = room.participants.some(p => p.username === username) || 
                           room.createdBy === username || 
                           chatRoomService.isUserAdmin(room, username);
    
    if (isAlreadyMember) {
      return res.status(400).json({ error: 'User is already a member of this room' });
    }
    
    // Add user as admin directly
    const newAdmin = {
      username: username,
      isCreator: false,
      isAdmin: true,
      joinedAt: new Date(),
      color: '#007bff',
      permissions: {
        canDeleteMessages: true,
        canRemoveMembers: true,
        canManageAdmins: true,
        canEditRoomSettings: true
      }
    };
    
    room.participants.push(newAdmin);
    room.admins.push(username);
    
    await chatRoomService.updateRoom(room.roomId, {
      participants: room.participants,
      admins: room.admins
    });
    
    res.json({ 
      success: true, 
      message: `${username} invited as admin successfully`,
      admin: newAdmin
    });
  } catch (err) {
    console.error('Error inviting admin:', err);
    res.status(500).json({ error: 'Failed to invite admin' });
  }
});

module.exports = router; 