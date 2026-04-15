'use client';

import { useState } from 'react';
import { logEvent } from '@/utils/analytics';

export default function NewsletterWidget({ source = 'blog-listing', category = null }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus('loading');

    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          source,
          category: category || undefined
        })
      });

      const data = await res.json();

      if (data.success) {
        logEvent('Newsletter', 'subscribe_success', source);
        setStatus('success');
        setMessage('Check your inbox to confirm your subscription!');
        setEmail('');
        setFirstName('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div
        className="rounded-[2rem] p-6 sm:p-8"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 15%, transparent)' }}
          >
            ✓
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              You're almost in!
            </h3>
            <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[2rem] p-6 sm:p-8"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Get trail stories in your inbox
        </h2>
        <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--text-secondary)' }}>
          New blog posts, park guides, and trip ideas — no spam, unsubscribe anytime.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-xl px-5 py-3.5 text-base w-full sm:w-48 lg:w-56"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            outline: 'none'
          }}
        />
        <input
          type="email"
          required
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl px-5 py-3.5 text-base flex-1 min-w-0"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-xl px-8 py-3.5 text-base font-semibold whitespace-nowrap"
          style={{
            backgroundColor: 'var(--accent-green)',
            color: '#fff',
            border: 'none',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            opacity: status === 'loading' ? 0.7 : 1
          }}
        >
          {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
        </button>
      </form>

      {status === 'error' && message && (
        <p className="text-sm mt-3" style={{ color: '#ef4444' }}>
          {message}
        </p>
      )}
    </div>
  );
}
