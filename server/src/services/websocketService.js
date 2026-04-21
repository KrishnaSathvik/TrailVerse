const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
    this.userChannels = new Map(); // userId -> Set of channels
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('[WebSocket] Client connected:', socket.id);
      
      // Handle authentication
      socket.on('authenticate', async (data) => {
        console.log('[WebSocket] 🔐 Authentication request received');
        try {
          const { token } = data;
          console.log('[WebSocket] 🔐 Token received, verifying...');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log('[WebSocket] 🔐 Token decoded, user ID:', decoded.id);
          const user = await User.findById(decoded.id);
          
          if (user) {
            socket.userId = user._id.toString();
            this.connectedUsers.set(user._id.toString(), socket.id);
            this.userSockets.set(socket.id, user._id.toString());
            this.userChannels.set(user._id.toString(), new Set());
            
            console.log('[WebSocket] ✅ User authenticated successfully:', user.email);
            console.log('[WebSocket] ✅ socket.userId set to:', socket.userId);
            console.log('[WebSocket] 📤 Sending authenticated event to client');
            socket.emit('authenticated', { userId: user._id });
            console.log('[WebSocket] 📤 authenticated event sent');
          } else {
            console.log('[WebSocket] ❌ User not found in database');
            socket.emit('auth_error', { message: 'User not found' });
          }
        } catch (error) {
          console.error('[WebSocket] ❌ Authentication error:', error.message);
          socket.emit('auth_error', { message: 'Invalid token' });
        }
      });

      // Handle subscription to channels
      socket.on('subscribe', (data) => {
        console.log(`[WebSocket] 📥 Received subscribe request:`, data);
        console.log(`[WebSocket] 📥 socket.userId:`, socket.userId);
        console.log(`[WebSocket] 📥 socket.id:`, socket.id);
        
        if (socket.userId) {
          const { channel } = data;
          const userChannels = this.userChannels.get(socket.userId) || new Set();
          userChannels.add(channel);
          this.userChannels.set(socket.userId, userChannels);
          
          const room = `user_${socket.userId}_${channel}`;
          socket.join(room);
          console.log(`[WebSocket] ✅ ✓ User ${socket.userId} successfully subscribed to ${channel} (room: ${room})`);
          
          // Send confirmation back to client
          console.log(`[WebSocket] 📤 Sending 'subscribed' event to client:`, { channel, room });
          socket.emit('subscribed', { channel, room });
          console.log(`[WebSocket] 📤 'subscribed' event sent!`);
        } else {
          console.log(`[WebSocket] ❌ ✗ Cannot subscribe - user not authenticated (socket.userId is undefined)`);
          socket.emit('subscription_error', { channel: data.channel, error: 'Not authenticated' });
        }
      });

      // Handle unsubscription from channels
      socket.on('unsubscribe', (data) => {
        if (socket.userId) {
          const { channel } = data;
          const userChannels = this.userChannels.get(socket.userId) || new Set();
          userChannels.delete(channel);
          this.userChannels.set(socket.userId, userChannels);
          
          socket.leave(`user_${socket.userId}_${channel}`);
          console.log(`[WebSocket] User ${socket.userId} unsubscribed from ${channel}`);
        }
      });

      // Handle ping/pong for heartbeat
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('[WebSocket] Client disconnected:', socket.id);

        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          this.userChannels.delete(socket.userId);
        }
        // Always clean up by socket.id, even if userId was never set
        this.userSockets.delete(socket.id);
      });
    });

    // Periodic cleanup: sweep stale entries every 5 minutes
    this._cleanupInterval = setInterval(() => {
      this._sweepStaleEntries();
    }, 5 * 60 * 1000);
  }

  _sweepStaleEntries() {
    const activeSockets = this.io.sockets.sockets;
    let swept = 0;

    for (const [socketId, userId] of this.userSockets) {
      if (!activeSockets.has(socketId)) {
        this.userSockets.delete(socketId);
        if (userId && this.connectedUsers.get(userId) === socketId) {
          this.connectedUsers.delete(userId);
          this.userChannels.delete(userId);
        }
        swept++;
      }
    }

    if (swept > 0) {
      console.log(`[WebSocket] Swept ${swept} stale socket entries`);
    }
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  // Send message to user's channel
  sendToUserChannel(userId, channel, event, data) {
    const room = `user_${userId}_${channel}`;
    console.log(`[WebSocket] Sending ${event} to room ${room} for user ${userId}`, data);
    
    // Debug: Check if there are any sockets in this room
    const socketsInRoom = this.io.sockets.adapter.rooms.get(room);
    console.log(`[WebSocket] Sockets in room ${room}:`, socketsInRoom ? socketsInRoom.size : 0);
    
    this.io.to(room).emit(event, data);
    return true;
  }

  // Broadcast to all connected users
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Broadcast to users subscribed to a specific channel
  broadcastToChannel(channel, event, data) {
    this.io.emit(event, { ...data, channel });
  }

  // Notify about favorite changes
  notifyFavoriteAdded(userId, favorite) {
    console.log(`[WebSocket] Notifying favorite added for user ${userId}:`, favorite.parkCode);
    this.sendToUserChannel(userId, 'favorites', 'favorite_added', favorite);
  }

  notifyFavoriteRemoved(userId, parkCode) {
    console.log(`[WebSocket] Notifying favorite removed for user ${userId}:`, parkCode);
    this.sendToUserChannel(userId, 'favorites', 'favorite_removed', { parkCode });
  }

  // Notify about trip changes
  notifyTripCreated(userId, trip) {
    this.sendToUserChannel(userId, 'trips', 'trip_created', trip);
  }

  notifyTripUpdated(userId, trip) {
    this.sendToUserChannel(userId, 'trips', 'trip_updated', trip);
  }

  notifyTripDeleted(userId, tripId) {
    this.sendToUserChannel(userId, 'trips', 'trip_deleted', { tripId });
  }

  // Notify about review changes
  notifyReviewAdded(userId, review) {
    this.sendToUserChannel(userId, 'reviews', 'review_added', review);
  }

  notifyReviewUpdated(userId, review) {
    this.sendToUserChannel(userId, 'reviews', 'review_updated', review);
  }

  notifyReviewDeleted(userId, reviewId) {
    console.log(`[WebSocket] Notifying review deleted for user ${userId}:`, reviewId);
    this.sendToUserChannel(userId, 'reviews', 'review_deleted', { reviewId });
  }

  // Notify about preference changes
  notifyPreferencesUpdated(userId, preferences) {
    this.sendToUserChannel(userId, 'preferences', 'preferences_updated', preferences);
  }

  // Notify about user activity
  notifyUserActivity(userId, activity) {
    this.sendToUser(userId, 'user_activity', activity);
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get user's connection status
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  // Get user's subscribed channels
  getUserChannels(userId) {
    return Array.from(this.userChannels.get(userId) || []);
  }

  // Clean up on shutdown
  shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.connectedUsers.clear();
    this.userSockets.clear();
    this.userChannels.clear();
    console.log('[WebSocket] Service shut down');
  }
}

module.exports = WebSocketService;