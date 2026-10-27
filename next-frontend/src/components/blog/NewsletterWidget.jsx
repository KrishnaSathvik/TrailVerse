'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { logNewsletterSignup } from '@/utils/analytics';

function signupAttribution({ pagePath, parkCode }) {
  const fromWindow = typeof window === 'undefined'
    ? {}
    : {
      pagePath: window.location.pathname,
      utm_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
      utm_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
      utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
    };

  return {
    pagePath: pagePath || fromWindow.pagePath,
    parkCode: parkCode || undefined,
    utm_source: fromWindow.utm_source,
    utm_medium: fromWindow.utm_medium,
    utm_campaign: fromWindow.utm_campaign,
  };
}

function copyForSource(source) {
  if (source === 'newsletter-page') {
    return {
      title: 'Join the upcoming newsletter',
      body: 'Leave your email and confirm your subscription to hear from us when Where Next? launches.',
      cta: 'Join free →',
      loading: 'Joining…',
    };
  }

  return {
    title: 'Not sure where to go next?',
    body: 'Join our upcoming newsletter for timely destinations, useful travel updates, and trip ideas.',
    cta: 'Join Where Next? →',
    loading: 'Joining…',
  };
}

function analyticsProps({ source, sourceDetail, pagePath, parkCode }) {
  return {
    source,
    sourceDetail: sourceDetail || undefined,
    pagePath: pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    parkCode: parkCode || undefined,
  };
}

export default function NewsletterWidget({
  source = 'blog-listing',
  sourceDetail = null,
  category = null,
  pagePath = null,
  parkCode = null,
  embedded = false,
  hideIntro = false,
  containerClassName = 'rounded-[2rem] p-6 sm:p-8',
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const viewFiredRef = useRef(false);
  const rootRef = useRef(null);
  const emailId = useId();
  const errorId = useId();
  const copy = copyForSource(source);
  const detail = sourceDetail || category || null;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || viewFiredRef.current) return undefined;

    const props = analyticsProps({ source, sourceDetail: detail, pagePath, parkCode });
    const fire = () => {
      if (viewFiredRef.current) return;
      viewFiredRef.current = true;
      logNewsletterSignup('newsletter_signup_view', props);
    };

    if (typeof IntersectionObserver === 'undefined') {
      fire();
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        fire();
        observer.disconnect();
      }
    }, { threshold: 0.4 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [source, detail, pagePath, parkCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;

    const props = analyticsProps({ source, sourceDetail: detail, pagePath, parkCode });
    logNewsletterSignup('newsletter_signup_submit', props);
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch(`${getApiBaseUrl()}/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          sourceDetail: detail || undefined,
          category: category || undefined,
          parkCode: parkCode || undefined,
          ...signupAttribution({ pagePath, parkCode }),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.success) {
        logNewsletterSignup('newsletter_signup_success', props);
        setStatus('success');
        setMessage('We sent you a confirmation link. Click it to finish joining Where Next?.');
        setEmail('');
      } else {
        logNewsletterSignup('newsletter_signup_error', props);
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Try again.');
      }
    } catch {
      logNewsletterSignup('newsletter_signup_error', props);
      setStatus('error');
      setMessage('Something went wrong. Try again.');
    }
  };

  const inputClass = embedded
    ? 'rounded-xl px-4 py-2.5 text-sm sm:text-base flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]'
    : 'rounded-xl px-5 py-3.5 text-base flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]';
  const inputStyle = {
    backgroundColor: embedded ? 'var(--surface)' : 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  };
  const buttonClass = embedded
    ? 'rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap sm:flex-shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-green)]'
    : 'public-action px-6 text-sm font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-green)]';

  if (status === 'success') {
    const successBody = (
      <div role="status" aria-live="polite">
        <h3 className={`font-bold ${embedded ? 'text-base' : 'text-lg'}`} style={{ color: 'var(--text-primary)' }}>
          Check your inbox
        </h3>
        <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
      </div>
    );

    if (embedded) return <div ref={rootRef}>{successBody}</div>;

    return (
      <div ref={rootRef} className={containerClassName} style={{ backgroundColor: 'var(--surface)' }}>
        {successBody}
      </div>
    );
  }

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
      <label htmlFor={emailId} className="sr-only">Your email address</label>
      <input
        id={emailId}
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="Your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'loading'}
        aria-invalid={status === 'error'}
        aria-describedby={status === 'error' ? errorId : undefined}
        className={inputClass}
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        aria-busy={status === 'loading'}
        className={buttonClass}
        style={{
          backgroundColor: 'var(--accent-green)',
          color: '#fff',
          border: 'none',
          cursor: status === 'loading' ? 'wait' : 'pointer',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
      >
        {status === 'loading' ? copy.loading : copy.cta}
      </button>
    </form>
  );

  const formContent = (
    <>
      {!hideIntro && <div className={embedded ? 'mb-4' : 'mb-6'}>
        {embedded ? (
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            {copy.title}
          </p>
        ) : (
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {copy.title}
          </h2>
        )}
        <p className={`leading-relaxed ${embedded ? 'text-sm' : 'text-sm sm:text-base mt-1'}`} style={{ color: 'var(--text-secondary)' }}>
          {copy.body}
        </p>
      </div>}
      {form}
      <p className={`text-xs sm:text-sm ${embedded ? 'mt-3' : 'mt-4'}`} style={{ color: 'var(--text-secondary)' }}>
        Free. Confirm by email. Unsubscribe anytime.
      </p>
      {status === 'error' && message ? (
        <p id={errorId} role="alert" className="text-sm mt-2" style={{ color: 'var(--error, #ef4444)' }}>
          {message}
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return <div ref={rootRef}>{formContent}</div>;
  }

  return (
    <div ref={rootRef} className={containerClassName} style={{ backgroundColor: 'var(--surface)' }}>
      {formContent}
    </div>
  );
}
