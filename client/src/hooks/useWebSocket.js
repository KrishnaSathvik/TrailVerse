import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import websocketService from '../services/websocketService';

export const useWebSocket = () => {
  const { user, getToken } = useAuth();
  const isConnectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (!user || isConnectedRef.current) return;

    try {
      const token = getToken();
      if (token) {
        websocketService.connect(token);
        isConnectedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [user, getToken]);

  const disconnect = useCallback(() => {
    if (isConnectedRef.current) {
      websocketService.disconnect();
      isConnectedRef.current = false;
    }
  }, []);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (user && !isConnectedRef.current) {
      connect();
    } else if (!user && isConnectedRef.current) {
      disconnect();
    }

    // Cleanup on unmount
    return () => {
      if (isConnectedRef.current) {
        disconnect();
      }
    };
  }, [user, connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: websocketService.getConnectionStatus().connected,
    websocketService
  };
};

export const useWebSocketEvent = (event, callback, deps = []) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const wrappedCallback = (data) => {
      callbackRef.current(data);
    };

    websocketService.on(event, wrappedCallback);

    return () => {
      websocketService.off(event, wrappedCallback);
    };
  }, [event, ...deps]);
};

export const useRealTimeChat = (roomId) => {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // Handle incoming messages
  useWebSocketEvent('chat-message', (data) => {
    if (data.roomId === roomId) {
      setMessages(prev => [...prev, data]);
    }
  });

  // Handle typing indicators
  useWebSocketEvent('user-typing', (data) => {
    if (data.roomId === roomId) {
      setTypingUsers(prev => {
        if (data.isTyping) {
          return [...prev.filter(user => user.userId !== data.userId), data.user];
        } else {
          return prev.filter(user => user.userId !== data.userId);
        }
      });
    }
  });

  const sendMessage = useCallback((message, type = 'message') => {
    websocketService.sendChatMessage(roomId, message, type);
  }, [roomId]);

  const startTyping = useCallback(() => {
    websocketService.startTyping(roomId);
  }, [roomId]);

  const stopTyping = useCallback(() => {
    websocketService.stopTyping(roomId);
  }, [roomId]);

  return {
    messages,
    typingUsers,
    sendMessage,
    startTyping,
    stopTyping
  };
};

export const useParkUpdates = (parkCode) => {
  const [updates, setUpdates] = useState([]);

  useWebSocketEvent('park-update', (data) => {
    if (data.parkCode === parkCode) {
      setUpdates(prev => [...prev, data]);
    }
  });

  useEffect(() => {
    if (parkCode) {
      websocketService.subscribeParkUpdates(parkCode);
    }

    return () => {
      if (parkCode) {
        websocketService.unsubscribeParkUpdates(parkCode);
      }
    };
  }, [parkCode]);

  return updates;
};

export const useEventUpdates = (eventId) => {
  const [updates, setUpdates] = useState([]);

  useWebSocketEvent('event-update', (data) => {
    if (data.eventId === eventId) {
      setUpdates(prev => [...prev, data]);
    }
  });

  useEffect(() => {
    if (eventId) {
      websocketService.subscribeEventUpdates(eventId);
    }

    return () => {
      if (eventId) {
        websocketService.unsubscribeEventUpdates(eventId);
      }
    };
  }, [eventId]);

  return updates;
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  useWebSocketEvent('notification', (data) => {
    setNotifications(prev => [...prev, data]);
  });

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  return { notifications, removeNotification };
};

export default useWebSocket;
