"use client";

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-md w-full text-center">
        <div className="rounded-3xl p-8 sm:p-12 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <h2 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Something went wrong
          </h2>
          <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
            An unexpected error occurred. Please try again or return to the home page.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => reset()}
              className="px-6 py-3 rounded-xl font-semibold transition"
              style={{ backgroundColor: 'var(--primary)', color: 'white' }}
            >
              Try again
            </button>
            <a
              href="/"
              className="px-6 py-3 rounded-xl font-semibold transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
