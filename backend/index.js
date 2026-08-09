require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { dynamodb } = require('./config/dynamodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://awsproject-frontend.onrender.com",
      "https://awsproject-t64b.onrender.com",
      "https://jellylemonshake-frontend.onrender.com",
      "https://awsfinalproject-frontend.onrender.com",
      "https://awsfinalproject-backend.onrender.com",
      /^https:\/\/.*\.up\.railway\.app$/, // Railway frontend domains
      /^https:\/\/.*\.railway\.app$/, // Railway domains
      /^http:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting
      /^https:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting HTTPS
      /^http:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access
      /^https:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access HTTPS
      /^http:\/\/.*\.cloudfront\.net$/, // CloudFront HTTP
      /^https:\/\/.*\.cloudfront\.net$/, // CloudFront HTTPS
      /^https:\/\/.*\.amplifyapp\.com$/, // AWS Amplify
      /^http:\/\/.*\.elasticbeanstalk\.com$/, // AWS Elastic Beanstalk HTTP
      /^https:\/\/.*\.elasticbeanstalk\.com$/, // AWS Elastic Beanstalk HTTPS
      /^https:\/\/.*\.amazonaws\.com$/ // AWS domains general
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['polling', 'websocket'], // Try polling first for better compatibility
  upgrade: true,
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  serveClient: false // Don't serve the client files
});

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "https://awsproject-frontend.onrender.com",
      "https://awsproject-t64b.onrender.com",
      "https://jellylemonshake-frontend.onrender.com",
      "https://awsfinalproject-frontend.onrender.com",
      "https://awsfinalproject-backend.onrender.com",
      /^https:\/\/.*\.up\.railway\.app$/, // Railway frontend domains
      /^https:\/\/.*\.railway\.app$/, // Railway domains
      /^http:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting
      /^https:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting HTTPS
      /^http:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access
      /^https:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access HTTPS
      /^http:\/\/.*\.cloudfront\.net$/, // CloudFront HTTP
      /^https:\/\/.*\.cloudfront\.net$/, // CloudFront HTTPS
      /^https:\/\/.*\.netlify\.app$/, // Netlify domains
      /^https:\/\/.*\.vercel\.app$/, // Vercel domains
      /^https:\/\/.*\.github\.io$/, // GitHub Pages
      /^http:\/\/localhost:\d+$/, // Local development
      /^https:\/\/localhost:\d+$/ // Local development HTTPS
    ];
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Manual CORS headers as fallback
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:3000",
    "https://awsproject-frontend.onrender.com",
    "https://awsproject-t64b.onrender.com",
    "https://jellylemonshake-frontend.onrender.com",
    "https://awsfinalproject-frontend.onrender.com",
    "https://awsfinalproject-backend.onrender.com",
    /^http:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting
    /^https:\/\/.*\.s3-website.*\.amazonaws\.com$/, // S3 website hosting HTTPS
    /^http:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access
    /^https:\/\/.*\.s3\.amazonaws\.com$/, // S3 direct access HTTPS
    /^http:\/\/.*\.cloudfront\.net$/, // CloudFront HTTP
    /^https:\/\/.*\.cloudfront\.net$/, // CloudFront HTTPS
    /^https:\/\/.*\.amplifyapp\.com$/, // AWS Amplify
    /^http:\/\/.*\.elasticbeanstalk\.com$/, // AWS Elastic Beanstalk HTTP
    /^https:\/\/.*\.elasticbeanstalk\.com$/, // AWS Elastic Beanstalk HTTPS
    /^https:\/\/.*\.amazonaws\.com$/ // AWS domains general
  ];
  
  // Check if origin is allowed (including regex patterns)
  const isAllowed = allowedOrigins.some(allowedOrigin => {
    if (typeof allowedOrigin === 'string') {
      return allowedOrigin === origin;
    } else if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }
    return false;
  });
  
  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use(express.json());

const { useLocalStore } = require('./config/dynamodb');

// DynamoDB connection test
const testDynamoDBConnection = async () => {
  try {
    await dynamodb.scan({ TableName: 'ChatRooms', Limit: 1 }).promise();
    console.log(
      useLocalStore
        ? 'Local storage ready'
        : 'DynamoDB connected successfully'
    );
  } catch (error) {
    console.error('Database connection failed:', error.message);
    if (!useLocalStore) {
      console.log('Set USE_LOCAL_STORE=true in .env to run without AWS');
    }
  }
};

testDynamoDBConnection();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/rooms', require('./routes/chatrooms'));
app.use('/api/jdoodle', require('./routes/jdoodle'));
app.use('/api/meetings', require('./routes/meetings')(io));
app.use(
  '/api/projects',
  useLocalStore
    ? require('./routes/projects-local')
    : require('./routes/projects')
);

// Socket.IO real-time chat functionality
const MessageService = require('./services/MessageService');
const ChatRoomService = require('./services/ChatRoomService');

// Create service instances
const messageService = new MessageService();
const chatRoomService = new ChatRoomService();

// Store connected users and their rooms
const connectedUsers = new Map();
const roomUsers = new Map();
const videoParticipants = new Map(); // roomId -> Map(socketId -> participant)

const upsertVideoParticipant = (roomId, { socketId, userId, username, email }) => {
  if (!socketId) return;
  if (!videoParticipants.has(roomId)) {
    videoParticipants.set(roomId, new Map());
  }
  videoParticipants.get(roomId).set(socketId, {
    socketId,
    userId: userId || username,
    username: username || userId,
    email: email || '',
  });
};

const removeVideoParticipantBySocket = (roomId, socketId) => {
  const bucket = videoParticipants.get(roomId);
  if (!bucket) return;
  bucket.delete(socketId);
  if (bucket.size === 0) {
    videoParticipants.delete(roomId);
  }
};

const getVideoParticipantsList = (roomId, excludeSocketId = null) => {
  const bucket = videoParticipants.get(roomId);
  if (!bucket) return [];
  for (const sid of bucket.keys()) {
    if (!io.sockets.sockets.has(sid)) {
      bucket.delete(sid);
    }
  }
  return Array.from(bucket.values()).filter((p) => p.socketId !== excludeSocketId);
};

const getPeerId = (user) => {
  if (!user) return null;
  // Must match frontend chatUser.username used for WebRTC to/from fields
  return String(user.username || user.email || user.id || '');
};

const normalizePeerId = (id) => String(id || '').trim().toLowerCase();

const getUserKey = (user) => normalizePeerId(getPeerId(user));

const getRoomUsersList = (roomId) => {
  const bucket = roomUsers.get(roomId);
  if (!bucket) return [];
  return Array.from(bucket.values());
};

const upsertRoomUser = (roomId, user) => {
  if (!roomUsers.has(roomId)) {
    roomUsers.set(roomId, new Map());
  }
  roomUsers.get(roomId).set(getUserKey(user), user);
};

const removeRoomUser = (roomId, user) => {
  const bucket = roomUsers.get(roomId);
  if (!bucket) return;
  bucket.delete(getUserKey(user));
  if (bucket.size === 0) {
    roomUsers.delete(roomId);
  }
};

const broadcastRoomUsers = (roomId) => {
  const onlineUsers = [];
  for (const [socketId, info] of connectedUsers.entries()) {
    if (info.roomId === roomId) {
      onlineUsers.push({ ...info.user, socketId });
    }
  }
  io.to(roomId).emit('room-users', onlineUsers);
  io.to(roomId).emit('users-count', onlineUsers.length);
};

const findSocketIdInRoom = (roomId, peerId) => {
  if (!peerId) return null;
  const target = normalizePeerId(peerId);
  for (const [socketId, info] of connectedUsers.entries()) {
    if (info.roomId !== roomId) continue;
    const u = info.user || {};
    if (normalizePeerId(u.username) === target) return socketId;
    if (normalizePeerId(u.email) === target) return socketId;
    if (normalizePeerId(getPeerId(u)) === target) return socketId;
  }
  return null;
};

const emitToPeer = (roomId, target, event, payload) => {
  if (target && io.sockets.sockets.has(target)) {
    io.to(target).emit(event, payload);
    return true;
  }
  const socketId = findSocketIdInRoom(roomId, target);
  if (socketId) {
    io.to(socketId).emit(event, payload);
    return true;
  }
  io.to(normalizePeerId(String(target))).emit(event, payload);
  return false;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', async ({ roomId, user }) => {
    try {
      console.log('=== JOIN ROOM REQUEST ===');
      console.log('Room ID:', roomId);
      console.log('User:', user);
      
      socket.join(roomId);

      const peerId = getPeerId(user);
      if (peerId) {
        socket.join(peerId);
        socket.join(normalizePeerId(peerId));
      }
      
      // Store user info
      connectedUsers.set(socket.id, { user, roomId, peerId });
      
      // One socket per normalized username (replaces stale mahi/MAHIMA duplicates)
      upsertRoomUser(roomId, user);
      
      console.log(`${user.username || user.email} joined room ${roomId}`);
      
      // Notify room about new user
      socket.to(roomId).emit('user-joined', {
        user,
        message: `${user.username || user.email} joined the room`
      });
      
      broadcastRoomUsers(roomId);
      
      console.log('=== JOIN ROOM SUCCESS ===');
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Handle new message
  socket.on('send-message', async (data) => {
    try {
      const { roomId, user, text, code, language, output, isCode } = data;
      console.log('=== SOCKET.IO MESSAGE RECEIVED ===');
      console.log('Room ID:', roomId);
      console.log('User:', user);
      console.log('Text:', text);
      
      // Find the room by name/pin to get the DynamoDB roomId
      const room = await chatRoomService.getRoomByName(roomId);
      
      if (!room) {
        console.log('Room not found, creating it...');
        // Create the room if it doesn't exist
        const newRoom = await chatRoomService.createRoom({
          name: roomId,
          createdBy: user.username || user.email || 'Anonymous',
          isPrivate: false,
          color: '#007bff',
          participants: []
        });
        console.log('Room created:', newRoom.roomId);
        
        // Save message to database using new room's roomId
        const message = await messageService.createMessage({
          roomId: newRoom.roomId,
          user: user.username || user.email,
          text,
          code,
          language,
          output,
          isCode: isCode || false
        });
        
        // Broadcast message to all users in the room
        io.to(roomId).emit('new-message', {
          _id: message.messageId,
          room: message.roomId,
          user: message.user,
          text: message.text,
          code: message.code,
          language: message.language,
          output: message.output,
          isCode: message.isCode,
          createdAt: message.createdAt
        });
        
        console.log(`Message sent in newly created room ${roomId}:`, text || 'Code snippet');
        return;
      }
      
      // Save message to database using room's roomId
      const message = await messageService.createMessage({
        roomId: room.roomId,
        user: user.username || user.email,
        text,
        code,
        language,
        output,
        isCode: isCode || false
      });
      
      // Broadcast message to all users in the room
      io.to(roomId).emit('new-message', {
        _id: message.messageId,
        room: message.roomId,
        user: message.user,
        text: message.text,
        code: message.code,
        language: message.language,
        output: message.output,
        isCode: message.isCode,
        createdAt: message.createdAt
      });
      
      console.log(`Message sent in room ${roomId}:`, text || 'Code snippet');
      
    } catch (error) {
      console.error('Error sending message:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      socket.emit('error', { message: 'Failed to send message', details: error.message });
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ roomId, user, isTyping }) => {
    socket.to(roomId).emit('user-typing', {
      user: user.username || user.email,
      isTyping
    });
  });

  // Handle message deletion
  socket.on('message-deleted', ({ roomId, messageId, deletedBy }) => {
    console.log(`Message ${messageId} deleted in room ${roomId} by ${deletedBy}`);
    // Broadcast to all other users in the room
    socket.to(roomId).emit('message-deleted', {
      roomId,
      messageId,
      deletedBy
    });
  });

  // === LIVE COLLABORATIVE EDITING EVENTS ===
  
  // Handle file content changes for live editing
  socket.on('file-content-change', async ({ roomId, projectId, fileId, content, userId, timestamp }) => {
    try {
      console.log(`File content change in room ${roomId}, project ${projectId}, file ${fileId}`);
      
      // Get room size to see how many users should receive this
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      console.log(`Broadcasting to ${roomSize - 1} other users in room ${roomId}`);
      
      // Broadcast to all other users in the room
      socket.to(roomId).emit('file-content-updated', {
        projectId,
        fileId,
        content,
        userId,
        timestamp,
        roomId
      });
      
      console.log(`File content broadcasted successfully to room ${roomId}`);
      
      // Optionally save to database with debouncing (implement debouncing logic)
      // For now, we'll rely on manual save or auto-save intervals
      
    } catch (error) {
      console.error('Error handling file content change:', error);
      socket.emit('error', { message: 'Failed to sync file content' });
    }
  });

  // Handle cursor position updates
  socket.on('cursor-position', ({ roomId, projectId, fileId, userId, position, selection }) => {
    try {
      console.log(`Cursor position update from ${userId} in room ${roomId}, file ${fileId}`);
      
      // Get room size to see how many users should receive this
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      console.log(`Broadcasting cursor to ${roomSize - 1} other users in room ${roomId}`);
      
      // Broadcast cursor position to other users
      socket.to(roomId).emit('user-cursor-updated', {
        projectId,
        fileId,
        userId,
        position,
        selection,
        roomId,
        timestamp: Date.now()
      });
      
      console.log(`Cursor position broadcasted successfully`);
    } catch (error) {
      console.error('Error handling cursor position:', error);
    }
  });

  // Handle user selection/highlighting
  socket.on('user-selection', ({ roomId, projectId, fileId, userId, selection, color }) => {
    try {
      // Broadcast selection to other users
      socket.to(roomId).emit('user-selection-updated', {
        projectId,
        fileId,
        userId,
        selection,
        color,
        roomId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling user selection:', error);
    }
  });

  // Handle user joining a file for editing
  socket.on('join-file-edit', ({ roomId, projectId, fileId, userId }) => {
    try {
      console.log(`User ${userId} joined file editing: ${fileId} in project ${projectId}`);
      
      // Notify other users that someone is editing this file
      socket.to(roomId).emit('user-editing-file', {
        projectId,
        fileId,
        userId,
        roomId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling join file edit:', error);
    }
  });

  // Handle user leaving file editing
  socket.on('leave-file-edit', ({ roomId, projectId, fileId, userId }) => {
    try {
      console.log(`User ${userId} left file editing: ${fileId} in project ${projectId}`);
      
      // Notify other users that someone stopped editing this file
      socket.to(roomId).emit('user-stopped-editing-file', {
        projectId,
        fileId,
        userId,
        roomId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling leave file edit:', error);
    }
  });

  // Handle typing indicator for code editing
  socket.on('code-typing', ({ roomId, projectId, fileId, userId, isTyping }) => {
    try {
      // Broadcast typing indicator to other users
      socket.to(roomId).emit('user-code-typing', {
        projectId,
        fileId,
        userId,
        isTyping,
        roomId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling code typing:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userInfo = connectedUsers.get(socket.id);
    
    if (userInfo) {
      const { user, roomId } = userInfo;
      
      removeRoomUser(roomId, user);
      if (roomUsers.has(roomId)) {
        broadcastRoomUsers(roomId);
      }

      if (videoParticipants.has(roomId)) {
        removeVideoParticipantBySocket(roomId, socket.id);
        socket.to(roomId).emit('user-left-video', {
          roomId,
          socketId: socket.id,
          userId: userInfo.peerId || getPeerId(user),
        });
      }
      
      // Remove from connected users
      connectedUsers.delete(socket.id);
      
      // Notify room about user leaving
      socket.to(roomId).emit('user-left', {
        user,
        message: `${user.username || user.email} left the room`
      });
      
      console.log(`${user.username || user.email} disconnected from room ${roomId}`);
    }
    
    console.log('User disconnected:', socket.id);
  });

  // Handle leave room
  socket.on('leave-room', ({ roomId, user }) => {
    socket.leave(roomId);
    
    removeRoomUser(roomId, user);
    if (roomUsers.has(roomId)) {
      broadcastRoomUsers(roomId);
    }
    
    // Remove from connected users
    connectedUsers.delete(socket.id);
    
    // Notify room
    socket.to(roomId).emit('user-left', {
      user,
      message: `${user.username || user.email} left the room`
    });
  });

  // ===== WEBRTC SIGNALING HANDLERS =====
  
  // Handle user joining video call
  socket.on('user-joined-video', (data) => {
    console.log('📹 User joined video call:', data);
    const { roomId, userId, username } = data;
    if (!roomId || !(userId || username)) return;

    const socketId = socket.id;
    const alreadyInCall = getVideoParticipantsList(roomId, socketId);

    upsertVideoParticipant(roomId, {
      socketId,
      userId,
      username,
      email: data.email,
    });

    if (alreadyInCall.length > 0) {
      socket.emit('video-participants', { roomId, participants: alreadyInCall });
    }

    socket.to(roomId).emit('user-joined-video', {
      roomId,
      socketId,
      userId,
      username,
      email: data.email,
    });

    console.log(`📹 ${username || userId} joined video call in room ${roomId} (${socketId})`);
  });

  socket.on('user-left-video', (data) => {
    console.log('📹 User left video call:', data);
    const { roomId, userId } = data;
    if (!roomId) return;

    removeVideoParticipantBySocket(roomId, data.socketId || socket.id);

    socket.to(roomId).emit('user-left-video', {
      roomId,
      socketId: data.socketId || socket.id,
      userId,
    });

    console.log(`📹 User ${userId} left video call in room ${roomId}`);
  });

  // Handle WebRTC offer — deliver to target peer
  socket.on('webrtc-offer', (data) => {
    if (!data?.roomId || !data?.to) return;
    const delivered = emitToPeer(data.roomId, data.to, 'webrtc-offer', data);
    console.log(`📡 offer ${data.from} → ${data.to} ${delivered ? 'delivered' : 'FAILED'}`);
    if (!delivered) {
      socket.to(data.roomId).emit('webrtc-offer', data);
    }
  });

  socket.on('webrtc-answer', (data) => {
    if (!data?.roomId || !data?.to) return;
    const delivered = emitToPeer(data.roomId, data.to, 'webrtc-answer', data);
    console.log(`📡 answer ${data.from} → ${data.to} ${delivered ? 'delivered' : 'FAILED'}`);
    if (!delivered) {
      socket.to(data.roomId).emit('webrtc-answer', data);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    if (!data?.roomId || !data?.to) return;
    const delivered = emitToPeer(data.roomId, data.to, 'webrtc-ice-candidate', data);
    if (!delivered) {
      socket.to(data.roomId).emit('webrtc-ice-candidate', data);
    }
  });

  // Handle video call started notification
  socket.on('video-call-started', (data) => {
    console.log('📹 Video call started notification:', data);
    const { roomId, startedBy, timestamp } = data;
    
    // Broadcast to all other users in the room
    socket.to(roomId).emit('video-call-started', {
      roomId,
      startedBy,
      timestamp
    });
    
    console.log(`📹 Video call notification sent to room ${roomId} by ${startedBy}`);
  });

  // Handle video call active status
  socket.on('video-call-active', (data) => {
    console.log('📹 Video call active status:', data);
    const { roomId, active } = data;
    
    // Broadcast to all users in the room
    socket.to(roomId).emit('video-call-active', {
      roomId,
      active
    });
    
    console.log(`📹 Video call active status sent to room ${roomId}: ${active}`);
  });
});

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin,
      allowed: true
    }
  });
});

// Meeting debug endpoint
app.get('/api/meetings/debug/status', (req, res) => {
  res.json({
    success: true,
    message: 'Meeting API is working',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/meetings/create',
      'GET /api/meetings/:meetingId',
      'GET /api/meetings/room/:roomId',
      'PATCH /api/meetings/:meetingId/status',
      'DELETE /api/meetings/:meetingId'
    ]
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready for real-time chat`);
});
