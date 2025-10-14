import React, { useEffect } from 'react';

const ProfileStats = ({ stats }) => {
  // Log when stats prop changes
  useEffect(() => {
    console.log('[ProfileStats] 🎨 Rendering with stats:', stats);
  }, [stats]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6 mb-10">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="group rounded-2xl p-6 lg:p-8 text-center cursor-pointer transition-all hover:-translate-y-1"
            style={{
              backgroundColor: 'var(--surface)',
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
            {/* Icon Circle */}
            <div className="inline-flex p-4 rounded-full mb-4"
              style={{ 
                backgroundColor: 'var(--accent-green-light)',
                color: 'var(--accent-green)'
              }}
            >
              <Icon className="w-6 h-6" />
            </div>
            
            {/* Value */}
            <div className="text-3xl lg:text-4xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {stat.value}
            </div>
            
            {/* Label */}
            <div className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {stat.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProfileStats;

