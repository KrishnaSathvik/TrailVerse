import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from '@components/icons';
import { useWebSocket } from '../../hooks/useWebSocket';

const SyncStatus = () => {
  const { getStatus } = useWebSocket();
  const [status, setStatus] = useState({ isConnected: false, reconnectAttempts: 0 });
  const [showTooltip, setShowTooltip] = useState(false);

  // Update status every second
  useEffect(() => {
    const updateStatus = () => {
      const currentStatus = getStatus();
      setStatus(currentStatus);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, [getStatus]);

  const getStatusInfo = () => {
    if (status.isConnected) {
      return {
        color: 'text-green-500',
        bgColor: 'bg-green-500',
        icon: Wifi,
        label: 'Synced',
        description: 'Real-time sync active',
        dotAnimation: 'animate-pulse'
      };
    } else if (status.reconnectAttempts > 0) {
      return {
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500',
        icon: RefreshCw,
        label: 'Syncing...',
        description: `Reconnecting (attempt ${status.reconnectAttempts})`,
        dotAnimation: 'animate-pulse'
      };
    } else {
      return {
        color: 'text-red-500',
        bgColor: 'bg-red-500',
        icon: WifiOff,
        label: 'Offline',
        description: 'Real-time sync unavailable',
        dotAnimation: ''
      };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div 
      className="relative flex items-center gap-2 mt-3"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${statusInfo.bgColor} ${statusInfo.dotAnimation}`} />
        <span className={`text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div 
          className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg z-50 whitespace-nowrap"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div className="flex items-start gap-2">
            <StatusIcon className={`h-4 w-4 ${statusInfo.color} flex-shrink-0 mt-0.5`} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {statusInfo.label}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {statusInfo.description}
              </p>
              {status.socketId && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  ID: {status.socketId.substring(0, 8)}...
                </p>
              )}
            </div>
          </div>
          {/* Tooltip arrow */}
          <div 
            className="absolute top-full left-4 w-0 h-0 border-4 border-transparent"
            style={{
              borderTopColor: 'var(--surface)',
              marginTop: '-1px'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SyncStatus;

