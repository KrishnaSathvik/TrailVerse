import React from 'react';
import { AlertTriangle, ExternalLink, Info, Shield } from '@components/icons';

function getSeverityConfig(category) {
  switch (category?.toLowerCase()) {
    case 'danger':
      return {
        accent: '#ef4444',
        icon: AlertTriangle,
        label: 'Danger',
        badgeBg: 'rgba(239, 68, 68, 0.12)',
      };
    case 'caution':
      return {
        accent: '#f97316',
        icon: AlertTriangle,
        label: 'Caution',
        badgeBg: 'rgba(251, 146, 60, 0.12)',
      };
    case 'park closure':
      return {
        accent: '#dc2626',
        icon: Shield,
        label: 'Park Closure',
        badgeBg: 'rgba(239, 68, 68, 0.1)',
      };
    case 'information':
      return {
        accent: '#3b82f6',
        icon: Info,
        label: 'Information',
        badgeBg: 'rgba(59, 130, 246, 0.1)',
      };
    default:
      return {
        accent: 'var(--text-secondary)',
        icon: Info,
        label: category || 'Notice',
        badgeBg: 'var(--surface-elevated)',
      };
  }
}

export default function ParkAlertsTab({ alerts = [] }) {
  const count = alerts?.length || 0;

  return (
    <div>
      <h2
        className="text-2xl font-bold mb-6 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <AlertTriangle className="h-6 w-6" />
        Alerts
        {count > 0 && (
          <span className="text-base font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
            ({count})
          </span>
        )}
      </h2>

      {count > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert, index) => {
            const config = getSeverityConfig(alert.category);
            const SeverityIcon = config.icon;

            return (
              <div
                key={alert.id || `${alert.title}-${index}`}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  borderLeftWidth: '4px',
                  borderLeftColor: config.accent,
                }}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {alert.title}
                    </h3>
                    {alert.url && (
                      <a
                        href={alert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                      >
                        NPS details <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 mb-4">
                    {alert.category && (
                      <span
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{
                          backgroundColor: config.badgeBg,
                          color: config.accent,
                        }}
                      >
                        <SeverityIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                    )}
                  </div>

                  {alert.description && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {alert.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>
          No current alerts or closures for this park.
        </p>
      )}
    </div>
  );
}
