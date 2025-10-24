/**
 * WebSocket Service for Real-Time Updates
 * Handles connection, reconnection, and real-time data synchronization
 * Uses Socket.IO for WebSocket communication
 */

import io from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventListeners = new Map();
    this.pendingChannels = new Set(); // Track channels to subscribe to after auth
    this.subscribedChannels = new Set(); // Track channels we're actually subscribed to
    
    this.setupPageEventListeners();
    this.setupGlobalErrorHandlers();
  }

  // Setup global error handlers
  setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && event.reason.message && event.reason.message.includes('socket')) {
        console.warn('[WebSocket] Unhandled promise rejection:', event.reason);
        event.preventDefault(); // Prevent the error from appearing in console
      }
    });
  }

  // Setup page event listeners
  setupPageEventListeners() {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.isConnected) {
        const token = localStorage.getItem('token');
        if (token) {
          this.connect(token);
        }
      }
    });

    // Handle online/offline status
    window.addEventListener('online', () => {
      if (!this.isConnected) {
        const token = localStorage.getItem('token');
        if (token) {
          this.connect(token);
        }
      }
    });

    window.addEventListener('offline', () => {
      if (this.socket && this.socket.connected) {
        this.socket.disconnect();
      }
    });
  }

  // Connect to WebSocket server
  connect(token) {
    if (this.socket && this.socket.connected) {
      console.log('[WebSocket] Already connected, skipping connection attempt');
      return;
    }

    if (!token) {
      console.log('[WebSocket] No token provided, cannot connect');
      return;
    }

    try {
      // Clean up existing connection if any
      if (this.socket) {
        console.log('[WebSocket] Cleaning up existing socket...');
        this.socket.removeAllListeners(); // Remove all listeners first
        this.socket.disconnect();
        this.socket = null;
      }

      // Determine WebSocket URL
      // In production, VITE_WS_URL should point to the backend server (e.g., Render)
      // because Vercel doesn't support WebSocket connections
      const wsUrl = import.meta.env.VITE_WS_URL || 
                   (import.meta.env.MODE === 'production' 
                     ? 'https://trailverse.onrender.com'
                     : 'http://localhost:5001');
      
      console.log('[WebSocket] Connecting to:', wsUrl);
      console.log('[WebSocket] Mode:', import.meta.env.MODE);
      console.log('[WebSocket] VITE_WS_URL:', import.meta.env.VITE_WS_URL);
      
      this.socket = io(wsUrl, {
        auth: {
          token
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
        transports: ['websocket', 'polling'],
        timeout: 10000,
        // Allow cross-origin connections
        withCredentials: true
      });
      
      // Setup Socket.IO event handlers
      this.setupSocketEventHandlers();
      
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      this.socket = null;
      this.isConnected = false;
      this.emit('error', error);
    }
  }

  // Setup Socket.IO event handlers
  setupSocketEventHandlers() {
    if (!this.socket) {
      console.warn('[WebSocket] Cannot setup handlers - socket is null');
      return;
    }

    console.log('[WebSocket] Setting up event handlers...');

    this.socket.on('connect', () => {
      console.log('[WebSocket] ✅ Connected to server, socket.id:', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Authenticate with token
      const token = localStorage.getItem('token');
      if (token && this.socket) {
        console.log('[WebSocket] 🔐 Sending authentication...');
        this.socket.emit('authenticate', { token });
      } else {
        console.log('[WebSocket] ⚠️ No token available for authentication');
      }
      
      // Notify listeners
      this.emit('connected');
    });

    this.socket.on('authenticated', (data) => {
      console.log('[WebSocket] Authenticated successfully', data);
      this.isAuthenticated = true;
      
      // Notify listeners that authentication is complete
      this.emit('authenticated', data);
      
      // Re-subscribe to any channels that were requested before authentication
      // Small delay to ensure server has fully processed the authentication
      setTimeout(() => {
        console.log('[WebSocket] Re-subscribing to pending channels after authentication...');
        this.resubscribeAllChannels();
      }, 100);
    });

    this.socket.on('auth_error', (data) => {
      console.error('[WebSocket] Authentication error:', data.message);
      this.isAuthenticated = false;
      this.emit('auth_error', data);
    });

    console.log('[WebSocket] 📡 Setting up subscription event listeners...');
    
    this.socket.on('subscribed', (data) => {
      console.log(`[WebSocket] 🎉 ✓ SUBSCRIPTION CONFIRMED for channel: ${data.channel} (room: ${data.room})`);
      console.log(`[WebSocket] 📊 Before: subscribedChannels =`, Array.from(this.subscribedChannels));
      this.subscribedChannels.add(data.channel);
      console.log(`[WebSocket] 📊 After: subscribedChannels =`, Array.from(this.subscribedChannels));
      // Remove from pending since it's now subscribed
      this.pendingChannels.delete(data.channel);
      console.log(`[WebSocket] 📊 pendingChannels =`, Array.from(this.pendingChannels));
    });

    this.socket.on('subscription_error', (data) => {
      console.error(`[WebSocket] ❌ ✗ SUBSCRIPTION FAILED for channel: ${data.channel} - ${data.error}`);
      // Keep in pending channels to retry later
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.isConnected = false;
      this.isAuthenticated = false;
      // Clear subscribed channels so we resubscribe on reconnect
      this.subscribedChannels.clear();
      this.emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      this.reconnectAttempts++;
      this.isConnected = false;
      this.emit('error', error);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {

    });

    this.socket.on('reconnect', (attemptNumber) => {

      this.reconnectAttempts = 0;
    });

    // Listen for data update events
    this.socket.on('favorite_added', (data) => {
      console.log('[WebSocket] Received favorite_added event:', data);
      this.emit('favoriteAdded', data);
    });

    this.socket.on('favorite_removed', (data) => {
      console.log('[WebSocket] Received favorite_removed event:', data);
      this.emit('favoriteRemoved', data);
    });

    this.socket.on('trip_created', (data) => {
      console.log('[WebSocket] 🎉 Received trip_created event:', data);
      this.emit('tripCreated', data);
    });

    this.socket.on('trip_updated', (data) => {
      console.log('[WebSocket] 🔄 Received trip_updated event:', data);
      this.emit('tripUpdated', data);
    });

    this.socket.on('trip_deleted', (data) => {
      console.log('[WebSocket] 🗑️ Received trip_deleted event:', data);
      this.emit('tripDeleted', data);
    });

    this.socket.on('review_added', (data) => {

      this.emit('reviewAdded', data);
    });

    this.socket.on('review_updated', (data) => {
      console.log('[WebSocket] Review updated:', data);
      this.emit('reviewUpdated', data);
    });

    this.socket.on('review_deleted', (data) => {
      console.log('[WebSocket] Review deleted:', data);
      this.emit('reviewDeleted', data);
    });

    this.socket.on('review_vote_updated', (data) => {
      console.log('[WebSocket] Review vote updated:', data);
      this.emit('reviewVoteUpdated', data);
    });

    this.socket.on('preferences_updated', (data) => {

      this.emit('preferencesUpdated', data);
    });

    this.socket.on('user_activity', (data) => {
      console.log('[WebSocket] User activity:', data);
      this.emit('userActivity', data);
    });

    this.socket.on('profile_updated', (data) => {
      console.log('[WebSocket] Profile updated:', data);
      this.emit('profileUpdated', data);
    });

    // Listen for blog favorite events
    this.socket.on('blog_favorited', (data) => {
      console.log('[WebSocket] Blog favorited:', data);
      this.emit('blogFavorited', data);
    });

    this.socket.on('blog_unfavorited', (data) => {
      console.log('[WebSocket] Blog unfavorited:', data);
      this.emit('blogUnfavorited', data);
    });

    // Listen for event registration events
    this.socket.on('event_registered', (data) => {
      console.log('[WebSocket] Event registered:', data);
      this.emit('eventRegistered', data);
    });

    this.socket.on('event_unregistered', (data) => {
      console.log('[WebSocket] Event unregistered:', data);
      this.emit('eventUnregistered', data);
    });

    // Listen for visited parks events
    this.socket.on('park_visited_added', (data) => {
      console.log('[WebSocket] Park visited added:', data);
      this.emit('parkVisitedAdded', data);
    });

    this.socket.on('park_visited_removed', (data) => {
      console.log('[WebSocket] Park visited removed:', data);
      this.emit('parkVisitedRemoved', data);
    });

    this.socket.on('pong', () => {
      // Heartbeat response
    });
  }

  // Disconnect from WebSocket server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isAuthenticated = false;
    // Clear subscribed channels so we resubscribe on reconnect
    this.subscribedChannels.clear();
    // Don't clear pendingChannels - we want to resubscribe on reconnect
    this.emit('disconnected');
  }

  // Subscribe to events
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  // Unsubscribe from events
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // Emit events to listeners
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('[WebSocket] Error in event listener:', error);
        }
      });
    }
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id || null,
      pendingChannels: Array.from(this.pendingChannels),
      subscribedChannels: Array.from(this.subscribedChannels)
    };
  }

  // Subscribe to specific data updates
  subscribeToFavorites() {
    this.subscribeToChannel('favorites');
  }

  subscribeToTrips() {
    this.subscribeToChannel('trips');
  }

  subscribeToReviews() {
    this.subscribeToChannel('reviews');
  }

  subscribeToPreferences() {
    this.subscribeToChannel('preferences');
  }

  subscribeToBlogs() {
    this.subscribeToChannel('blogs');
  }

  subscribeToEvents() {
    this.subscribeToChannel('events');
  }

  subscribeToVisited() {
    this.subscribeToChannel('visited');
  }

  // Generic channel subscription with authentication check
  subscribeToChannel(channel) {
    // Check if already subscribed
    if (this.subscribedChannels.has(channel)) {
      console.log(`[WebSocket] Already subscribed to channel: ${channel}, skipping`);
      return;
    }
    
    console.log(`[WebSocket] Subscribing to channel: ${channel}`);
    this.pendingChannels.add(channel);
    
    if (this.socket && this.socket.connected && this.isAuthenticated) {
      console.log(`[WebSocket] Emitting subscribe for channel: ${channel}`);
      this.socket.emit('subscribe', { channel });
    } else {
      console.log(`[WebSocket] Subscription queued for ${channel} (will subscribe after auth)`);
    }
  }

  // Resubscribe to all pending channels after authentication
  resubscribeAllChannels() {
    console.log('[WebSocket] 🔄 Resubscribing to all channels:', Array.from(this.pendingChannels));
    console.log('[WebSocket] 🔄 Socket connected:', this.socket?.connected);
    console.log('[WebSocket] 🔄 Is authenticated:', this.isAuthenticated);
    
    if (!this.socket || !this.socket.connected) {
      console.error('[WebSocket] ❌ Cannot resubscribe - socket not connected!');
      return;
    }
    
    if (!this.isAuthenticated) {
      console.error('[WebSocket] ❌ Cannot resubscribe - not authenticated!');
      return;
    }
    
    this.pendingChannels.forEach(channel => {
      console.log(`[WebSocket] 📤 Emitting subscribe for channel: ${channel}`);
      this.socket.emit('subscribe', { channel });
    });
    
    console.log('[WebSocket] 🔄 Finished emitting all subscriptions');
  }

  // Unsubscribe from data updates
  unsubscribeFromFavorites() {
    this.unsubscribeFromChannel('favorites');
  }

  unsubscribeFromTrips() {
    this.unsubscribeFromChannel('trips');
  }

  unsubscribeFromReviews() {
    this.unsubscribeFromChannel('reviews');
  }

  unsubscribeFromPreferences() {
    this.unsubscribeFromChannel('preferences');
  }

  unsubscribeFromBlogs() {
    this.unsubscribeFromChannel('blogs');
  }

  unsubscribeFromEvents() {
    this.unsubscribeFromChannel('events');
  }

  unsubscribeFromVisited() {
    this.unsubscribeFromChannel('visited');
  }

  subscribeToProfile() {
    this.subscribeToChannel('profile');
  }

  unsubscribeFromProfile() {
    this.unsubscribeFromChannel('profile');
  }

  // Generic channel unsubscription
  unsubscribeFromChannel(channel) {
    console.log(`[WebSocket] Unsubscribing from channel: ${channel}`);
    this.pendingChannels.delete(channel);
    
    if (this.socket && this.socket.connected) {
      this.socket.emit('unsubscribe', { channel });
    }
  }

  // Send ping to keep connection alive
  ping() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('ping');
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  window.websocketService = websocketService;
}

export default websocketService;