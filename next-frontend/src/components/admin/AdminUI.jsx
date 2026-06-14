'use client';

import React from 'react';
import Link from 'next/link';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export const adminCard = {
  backgroundColor: 'var(--surface)',
  borderWidth: '1px',
  borderColor: 'var(--border)',
  boxShadow: 'var(--shadow)',
};

export function AdminLoading({ label = 'Loading…' }) {
  return (
    <div className="py-24">
      <LoadingSpinner size="md" text={label} />
    </div>
  );
}

export function AdminKpi({ label, value, hint, accent }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={adminCard}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: accent || 'var(--text-primary)' }}>
        {value}
      </p>
      {hint && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>
      )}
    </div>
  );
}

export function AdminSection({ title, description, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl overflow-hidden ${className}`} style={adminCard}>
      {(title || action) && (
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            {title && (
              <h2 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

export function AdminTabs({ tabs, active, onChange }) {
  return (
    <div
      className="flex flex-wrap gap-2 p-1 rounded-xl w-full sm:w-auto"
      style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)' }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
            style={{
              backgroundColor: isActive ? 'var(--accent-green)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-secondary)',
            }}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span
                className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'var(--surface)',
                  color: isActive ? 'white' : 'var(--text-tertiary)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AdminSearchInput({ value, onChange, placeholder, icon: Icon }) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
      )}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 rounded-xl outline-none text-sm transition`}
        style={{
          backgroundColor: 'var(--surface-hover)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

export function AdminSelect({ value, onChange, options, className = '' }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`px-3 py-2.5 rounded-xl outline-none text-sm ${className}`}
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function AdminEmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-16 px-4">
      {Icon && <Icon className="h-12 w-12 mx-auto mb-4 opacity-40" style={{ color: 'var(--text-tertiary)' }} />}
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      {action}
    </div>
  );
}

export function AdminToolbar({ children }) {
  return (
    <div
      className="flex flex-col lg:flex-row lg:items-center gap-3 p-4 rounded-2xl mb-6"
      style={adminCard}
    >
      {children}
    </div>
  );
}

export function AdminBadge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--surface-hover)', color: 'var(--text-secondary)' },
    success: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
    warning: { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316' },
    danger: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
    purple: { bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {children}
    </span>
  );
}

export function AdminIconButton({ onClick, title, children, tone = 'neutral' }) {
  const hover = tone === 'danger' ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-white/5';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-xl transition ${hover}`}
      style={{ color: tone === 'danger' ? undefined : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  );
}

export function AdminIconLink({ href, title, children, tone = 'neutral', target }) {
  const hover = tone === 'danger' ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-white/5';
  return (
    <Link
      href={href}
      target={target}
      title={title}
      className={`p-2 rounded-xl transition inline-flex ${hover}`}
      style={{ color: tone === 'danger' ? undefined : 'var(--text-secondary)' }}
    >
      {children}
    </Link>
  );
}
