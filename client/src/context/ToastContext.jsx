import React, { createContext, useContext, useState, useEffect } from 'react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info', duration = 3000) => {
    // Check if a toast with the same message and type already exists
    setToasts(prev => {
      const existingToast = prev.find(toast => 
        toast.message === message && toast.type === type
      );
      
      // If duplicate exists, don't add a new one
      if (existingToast) {
        return prev;
      }
      
      // Add new toast
      const id = Date.now() + Math.random();
      const newToast = { id, message, type };
      
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      
      return [...prev, newToast];
    });
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Global rate limiting error handler
  useEffect(() => {
    const handleRateLimitError = (event) => {
      const { message } = event.detail;
      showToast(message, 'warning', 5000);
    };

    window.addEventListener('rateLimitError', handleRateLimitError);
    
    return () => {
      window.removeEventListener('rateLimitError', handleRateLimitError);
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <Toast 
          key={toast.id} 
          toast={toast} 
          onClose={() => removeToast(toast.id)} 
        />
      ))}
    </div>
  );
};

const Toast = ({ toast, onClose }) => {
  const getToastStyles = (type) => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: '#10b981',
          color: 'white'
        };
      case 'error':
        return {
          backgroundColor: '#ef4444',
          color: 'white'
        };
      case 'warning':
        return {
          backgroundColor: '#f59e0b',
          color: 'white'
        };
      default:
        return {
          backgroundColor: '#3b82f6',
          color: 'white'
        };
    }
  };

  return (
    <div 
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg backdrop-blur-xl min-w-[300px] max-w-md animate-slide-in"
      style={getToastStyles(toast.type)}
    >
      <div className="flex-1 text-sm font-medium">
        {toast.message}
      </div>
      <button
        onClick={onClose}
        className="hover:bg-white/10 rounded-lg p-1 transition"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};