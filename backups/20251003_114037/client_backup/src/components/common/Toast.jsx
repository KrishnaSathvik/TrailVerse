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
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-600'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: AlertCircle,
      iconColor: 'text-red-600'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: Info,
      iconColor: 'text-blue-600'
    }
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <div className={`fixed top-4 right-4 z-50 ${style.bg} ${style.border} border rounded-lg shadow-lg p-4 min-w-80 max-w-md animate-slide-in`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
        <p className={`flex-1 ${style.text} text-sm`}>{message}</p>
        <button onClick={onClose} className={`${style.iconColor} hover:opacity-75`}>
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
