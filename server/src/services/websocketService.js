const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor() {
    this.clients = new Map(); // userId -> Set of socket connections
    this.rooms = new Map(); // roomId -> Set of socket connections
    this.io = null;
  }

  initialize(server) {
    const { Server } = require('socket.io');
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://www.nationalparksexplorerusa.com',
      'https://nationalparksexplorerusa.com'
    ];

    if (process.env.CLIENT_URL) {
      allowedOrigins.push(process.env.CLIENT_URL);
    }

    this.io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        socket.userId = user._id.toString();
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected via WebSocket`);
      
      // Add client to user's connection set
      if (!this.clients.has(socket.userId)) {
        this.clients.set(socket.userId, new Set());
      }
      this.clients.get(socket.userId).add(socket);

      // Join user to their personal room
      socket.join(`user:${socket.userId}`);

      // Handle joining specific rooms
      socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (!this.rooms.has(roomId)) {
          this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(socket);
        console.log(`User ${socket.userId} joined room: ${roomId}`);
      });

      // Handle leaving rooms
      socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        if (this.rooms.has(roomId)) {
          this.rooms.get(roomId).delete(socket);
        }
        console.log(`User ${socket.userId} left room: ${roomId}`);
      });

      // Handle real-time chat messages
      socket.on('chat-message', (data) => {
        const { roomId, message, type = 'message' } = data;
        
        // Broadcast to room (excluding sender)
        socket.to(roomId).emit('chat-message', {
          id: Date.now(),
          userId: socket.userId,
          user: {
            id: socket.user._id,
            name: socket.user.name,
            avatar: socket.user.avatar
          },
          message,
          type,
          timestamp: new Date().toISOString()
        });

        console.log(`Chat message from ${socket.userId} in room ${roomId}: ${message}`);
      });

      // Handle typing indicators
      socket.on('typing-start', (data) => {
        const { roomId } = data;
        socket.to(roomId).emit('user-typing', {
          userId: socket.userId,
          user: {
            id: socket.user._id,
            name: socket.user.name
          },
          isTyping: true
        });
      });

      socket.on('typing-stop', (data) => {
        const { roomId } = data;
        socket.to(roomId).emit('user-typing', {
          userId: socket.userId,
          user: {
            id: socket.user._id,
            name: socket.user.name
          },
          isTyping: false
        });
      });

      // Handle online status
      socket.on('set-online', () => {
        this.broadcastUserStatus(socket.userId, 'online');
      });

      socket.on('set-away', () => {
        this.broadcastUserStatus(socket.userId, 'away');
      });

      // Handle park updates
      socket.on('subscribe-park-updates', (parkCode) => {
        socket.join(`park:${parkCode}`);
        console.log(`User ${socket.userId} subscribed to park updates: ${parkCode}`);
      });

      socket.on('unsubscribe-park-updates', (parkCode) => {
        socket.leave(`park:${parkCode}`);
        console.log(`User ${socket.userId} unsubscribed from park updates: ${parkCode}`);
      });

      // Handle event updates
      socket.on('subscribe-event-updates', (eventId) => {
        socket.join(`event:${eventId}`);
        console.log(`User ${socket.userId} subscribed to event updates: ${eventId}`);
      });

      socket.on('unsubscribe-event-updates', (eventId) => {
        socket.leave(`event:${eventId}`);
        console.log(`User ${socket.userId} unsubscribed from event updates: ${eventId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected from WebSocket`);
        
        // Remove from user's connection set
        if (this.clients.has(socket.userId)) {
          this.clients.get(socket.userId).delete(socket);
          if (this.clients.get(socket.userId).size === 0) {
            this.clients.delete(socket.userId);
            // Broadcast offline status
            this.broadcastUserStatus(socket.userId, 'offline');
          }
        }

        // Remove from all rooms
        for (const [roomId, roomClients] of this.rooms.entries()) {
          roomClients.delete(socket);
          if (roomClients.size === 0) {
            this.rooms.delete(roomId);
          }
        }
      });

      // Send connection confirmation
      socket.emit('connected', {
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    return this.io;
  }

  // Broadcast message to specific user
  broadcastToUser(userId, event, data) {
    const userSockets = this.clients.get(userId);
    if (userSockets) {
      userSockets.forEach(socket => {
        socket.emit(event, data);
      });
    }
  }

  // Broadcast message to room
  broadcastToRoom(roomId, event, data) {
    if (this.io) {
      this.io.to(roomId).emit(event, data);
    }
  }

  // Broadcast user status change
  broadcastUserStatus(userId, status) {
    const statusData = {
      userId,
      status,
      timestamp: new Date().toISOString()
    };

    // Broadcast to user's friends/contacts (you can implement this based on your user relationships)
    this.broadcastToUser(userId, 'status-change', statusData);
    
    // Broadcast to any rooms the user is in
    for (const [roomId, roomClients] of this.rooms.entries()) {
      const userInRoom = Array.from(roomClients).some(socket => socket.userId === userId);
      if (userInRoom) {
        this.broadcastToRoom(roomId, 'user-status-change', statusData);
      }
    }
  }

  // Broadcast park update
  broadcastParkUpdate(parkCode, updateType, data) {
    this.broadcastToRoom(`park:${parkCode}`, 'park-update', {
      parkCode,
      updateType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast event update
  broadcastEventUpdate(eventId, updateType, data) {
    this.broadcastToRoom(`event:${eventId}`, 'event-update', {
      eventId,
      updateType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast new review
  broadcastNewReview(parkCode, review) {
    this.broadcastToRoom(`park:${parkCode}`, 'new-review', {
      parkCode,
      review,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast new blog post
  broadcastNewBlogPost(post) {
    if (this.io) {
      this.io.emit('new-blog-post', {
        post,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast system notification
  broadcastNotification(userId, notification) {
    this.broadcastToUser(userId, 'notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.clients.size;
  }

  // Get room members count
  getRoomMembersCount(roomId) {
    return this.rooms.get(roomId)?.size || 0;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.clients.has(userId) && this.clients.get(userId).size > 0;
  }
}

module.exports = new WebSocketService();
