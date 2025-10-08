import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.eventListeners = new Map();
  }

  connect(token) {
    if (this.socket && this.isConnected) {
      return this.socket;
    }

    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    
    this.socket = io(serverUrl, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay
    });

    this.setupEventListeners();
    return this.socket;
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection-status', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.emit('connection-status', { connected: false, reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
      this.emit('connection-error', error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('WebSocket reconnected after', attemptNumber, 'attempts');
      this.isConnected = true;
      this.emit('reconnected', { attempts: attemptNumber });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      this.emit('reconnection-failed');
    });

    // Handle custom events
    this.socket.on('connected', (data) => {
      console.log('WebSocket server confirmed connection:', data);
      this.emit('server-connected', data);
    });

    this.socket.on('chat-message', (data) => {
      this.emit('chat-message', data);
    });

    this.socket.on('user-typing', (data) => {
      this.emit('user-typing', data);
    });

    this.socket.on('status-change', (data) => {
      this.emit('status-change', data);
    });

    this.socket.on('user-status-change', (data) => {
      this.emit('user-status-change', data);
    });

    this.socket.on('park-update', (data) => {
      this.emit('park-update', data);
    });

    this.socket.on('event-update', (data) => {
      this.emit('event-update', data);
    });

    this.socket.on('new-review', (data) => {
      this.emit('new-review', data);
    });

    this.socket.on('new-blog-post', (data) => {
      this.emit('new-blog-post', data);
    });

    this.socket.on('notification', (data) => {
      this.emit('notification', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // Room management
  joinRoom(roomId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('join-room', roomId);
    }
  }

  leaveRoom(roomId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave-room', roomId);
    }
  }

  // Chat functionality
  sendChatMessage(roomId, message, type = 'message') {
    if (this.socket && this.isConnected) {
      this.socket.emit('chat-message', {
        roomId,
        message,
        type
      });
    }
  }

  startTyping(roomId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing-start', { roomId });
    }
  }

  stopTyping(roomId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing-stop', { roomId });
    }
  }

  // Status management
  setOnline() {
    if (this.socket && this.isConnected) {
      this.socket.emit('set-online');
    }
  }

  setAway() {
    if (this.socket && this.isConnected) {
      this.socket.emit('set-away');
    }
  }

  // Park updates
  subscribeParkUpdates(parkCode) {
    if (this.socket && this.isConnected) {
      this.socket.emit('subscribe-park-updates', parkCode);
    }
  }

  unsubscribeParkUpdates(parkCode) {
    if (this.socket && this.isConnected) {
      this.socket.emit('unsubscribe-park-updates', parkCode);
    }
  }

  // Event updates
  subscribeEventUpdates(eventId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('subscribe-event-updates', eventId);
    }
  }

  unsubscribeEventUpdates(eventId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('unsubscribe-event-updates', eventId);
    }
  }

  // Event listener management
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket event listener:', error);
        }
      });
    }
  }

  // Utility methods
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socket: !!this.socket
    };
  }

  // Auto-reconnect with exponential backoff
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    setTimeout(() => {
      if (this.socket) {
        this.socket.connect();
      }
    }, delay);
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;
