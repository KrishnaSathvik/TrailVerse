import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const styles = {
    success: {
      icon: CheckCircle,
      iconColor: 'var(--accent-green)',
      closeColor: 'var(--text-secondary)'
    },
    error: {
      icon: AlertCircle,
      iconColor: '#ef4444', // Red for errors
      closeColor: '#000000' // Pure black for maximum contrast
    },
    info: {
      icon: Info,
      iconColor: 'var(--accent-blue)',
      closeColor: 'var(--text-secondary)'
    }
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <div 
      className="fixed top-4 right-4 z-50 border rounded-lg shadow-lg p-4 min-w-80 max-w-md animate-slide-in"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)'
      }}
    >
      <div className="flex items-start gap-3">
        <Icon 
          className="h-5 w-5 flex-shrink-0 mt-0.5" 
          style={{ color: style.iconColor }}
        />
        <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{message}</p>
        <button 
          onClick={onClose} 
          className="hover:opacity-75"
          style={{ 
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px'
          }}
        >
          <X 
            className="h-5 w-5" 
            style={{ 
              color: style.closeColor,
              strokeWidth: '2.5'
            }} 
          />
        </button>
      </div>
    </div>
  );
};

export default Toast;
