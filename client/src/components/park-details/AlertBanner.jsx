import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from '@components/icons';

const AlertBanner = ({ 
  type = 'info', 
  title, 
  message, 
  onDismiss,
  dismissible = false 
}) => {
  const types = {
    info: {
      icon: Info,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      iconColor: 'text-blue-400',
      textColor: 'text-blue-300'
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      iconColor: 'text-yellow-400',
      textColor: 'text-yellow-300'
    },
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      iconColor: 'text-green-400',
      textColor: 'text-green-300'
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      iconColor: 'text-red-400',
      textColor: 'text-red-300'
    }
  };

  const config = types[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl p-4 backdrop-blur border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-semibold mb-1 ${config.textColor}`}>
              {title}
            </h4>
          )}
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
        </div>
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-white/5 transition"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default AlertBanner;
