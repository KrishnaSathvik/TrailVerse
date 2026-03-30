"use client";

import Link from 'next/link';

const AuthShell = ({
  desktopTitle,
  desktopDescription,
  mobileTitle,
  mobileDescription,
  badge,
  children,
}) => {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <Link href="/" className="flex items-center gap-3 mb-12 group">
          <img
            src="/logo.png"
            alt="TrailVerse Logo"
            className="h-16 w-16 rounded-xl object-contain transition-transform group-hover:scale-105"
          />
          <span className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
            TrailVerse
          </span>
        </Link>

        <div className="text-center max-w-md">
          <h1
            className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            {desktopTitle}
          </h1>
          <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
            {desktopDescription}
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-start lg:items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div
            className="lg:hidden mb-5 rounded-[1.75rem] border p-5"
            style={{
              background:
                'radial-gradient(circle at top left, color-mix(in srgb, var(--accent-green-light) 40%, white 60%) 0%, transparent 55%), var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)'
            }}
          >
            <Link href="/" className="inline-flex items-center gap-3 mb-5 group">
              <img
                src="/logo.png"
                alt="TrailVerse Logo"
                className="h-12 w-12 rounded-xl object-contain"
              />
              <span className="text-2xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                TrailVerse
              </span>
            </Link>

            {badge ? (
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderColor: 'var(--border)',
                  borderWidth: '1px'
                }}
              >
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  {badge}
                </span>
              </div>
            ) : null}

            <h1 className="text-4xl font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
              {mobileTitle}
            </h1>
            <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {mobileDescription}
            </p>
          </div>

          <div
            className="rounded-[1.75rem] border p-5 sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthShell;
