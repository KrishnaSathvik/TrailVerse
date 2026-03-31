"use client";

import Link from 'next/link';

const AuthShell = ({
  desktopTitle,
  desktopDescription,
  badge,
  children,
}) => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="relative isolate flex min-h-screen overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent-green) 16%, transparent) 0%, transparent 32%),
              radial-gradient(circle at bottom right, color-mix(in srgb, var(--accent-green-light) 22%, transparent) 0%, transparent 28%),
              linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)
            `
          }}
        />

      <div
        className="relative z-10 hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="mb-12 flex flex-col items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="TrailVerse Logo"
              className="h-16 w-16 rounded-xl object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </span>
          </Link>
          <Link
            href="/"
            className="mt-4 text-sm font-medium transition hover:opacity-80"
            style={{ color: 'var(--accent-green)' }}
          >
            ← Back to home
          </Link>
        </div>

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

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:p-8">
        <div className="w-full max-w-lg">
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/logo.png"
                alt="TrailVerse Logo"
                className="h-14 w-14 rounded-xl object-contain transition-transform group-hover:scale-105"
              />
              <span className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                TrailVerse
              </span>
            </Link>

            {badge ? (
              <div
                className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1"
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

            <h1
              className="mt-6 text-4xl font-light tracking-tighter leading-none"
              style={{ color: 'var(--text-primary)' }}
            >
              {desktopTitle}
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {desktopDescription}
            </p>

            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium transition hover:opacity-80"
              style={{ color: 'var(--accent-green)' }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to home</span>
            </Link>
          </div>

          <div
            className="rounded-[1.75rem] border p-5 sm:p-8 lg:rounded-[1.75rem] lg:p-8"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AuthShell;
