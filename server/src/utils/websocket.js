/**
 * WebSocket Utility Functions
 * Provides helper functions for emitting WebSocket events from controllers
 */

let wsService = null;

// Initialize the WebSocket service reference
const initializeWebSocketService = (service) => {
  wsService = service;
};

// Emit event to a specific user
const emitToUser = (userId, event, data) => {
  if (!wsService) {
    console.warn('[WebSocket] Service not initialized, cannot emit event');
    return false;
  }
  
  return wsService.sendToUser(userId, event, data);
};

// Emit event to a user's channel
const emitToUserChannel = (userId, channel, event, data) => {
  if (!wsService) {
    console.warn('[WebSocket] Service not initialized, cannot emit event');
    return false;
  }
  
  return wsService.sendToUserChannel(userId, channel, event, data);
};

// Broadcast to all connected users
const broadcast = (event, data) => {
  if (!wsService) {
    console.warn('[WebSocket] Service not initialized, cannot broadcast');
    return false;
  }
  
  return wsService.broadcast(event, data);
};

// Broadcast to users subscribed to a specific channel
const broadcastToChannel = (channel, event, data) => {
  if (!wsService) {
    console.warn('[WebSocket] Service not initialized, cannot broadcast to channel');
    return false;
  }
  
  return wsService.broadcastToChannel(channel, event, data);
};

module.exports = {
  initializeWebSocketService,
  emitToUser,
  emitToUserChannel,
  broadcast,
  broadcastToChannel
};
