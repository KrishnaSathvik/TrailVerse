import React, { useEffect } from 'react';

const ProfileStats = ({ stats }) => {
  useEffect(() => {
    console.log('[ProfileStats] 🎨 Rendering with stats:', stats);
  }, [stats]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="rounded-2xl p-4 lg:p-5 transition-all"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 inline-flex p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--accent-green)'
                }}
              >
                <Icon className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-2xl lg:text-3xl font-bold leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {stat.loading ? (
                    <div
                      className="animate-spin rounded-full h-5 w-5 border-b-2"
                      style={{ borderColor: 'var(--accent-green)' }}
                    />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="text-xs font-medium mt-1 truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {stat.label}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProfileStats;
