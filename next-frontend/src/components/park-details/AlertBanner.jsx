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
      color: 'var(--icon-discovery)',
    },
    warning: {
      icon: AlertTriangle,
      color: 'var(--icon-warning)',
    },
    success: {
      icon: CheckCircle,
      color: 'var(--icon-success)',
    },
    error: {
      icon: XCircle,
      color: 'var(--error)',
    }
  };

  const config = types[type];
  const Icon = config.icon;

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${config.color} 35%, transparent)`,
      }}
    >
      <div className="flex gap-3">
        <Icon className="h-5 w-5 flex-shrink-0" style={{ color: config.color }} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-semibold mb-1" style={{ color: config.color }}>
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
