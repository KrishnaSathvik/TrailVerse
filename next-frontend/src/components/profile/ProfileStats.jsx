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
            className="group relative overflow-hidden rounded-2xl p-4 lg:p-5 transition-all hover:-translate-y-0.5"
            style={{
              backgroundImage: 'linear-gradient(150deg, color-mix(in srgb, var(--surface) 88%, white 12%) 0%, var(--surface) 55%, color-mix(in srgb, var(--surface-hover) 84%, var(--accent-green-light) 16%) 100%)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              e.currentTarget.style.borderColor = 'var(--border-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            {/* Subtle glow */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full blur-2xl"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green-light) 50%, transparent 50%)' }}
            />

            {/* Icon + Value on the same row (desktop), stacked (mobile) */}
            <div className="relative flex items-center gap-3">
              <div className="flex-shrink-0 inline-flex p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent-green-light) 78%, white 22%)',
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
