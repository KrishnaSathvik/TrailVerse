'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

function BlogSubscribeToastInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const subscribed = searchParams.get('subscribed');
    const unsubscribed = searchParams.get('unsubscribed');
    const subscribeError = searchParams.get('subscribe_error');

    if (subscribed === 'true') {
      setToast({ type: 'success', message: "You're in. Where Next? will send one destination worth considering each week." });
    } else if (unsubscribed === 'true') {
      setToast({ type: 'success', message: "You've been unsubscribed from Where Next?." });
    } else if (subscribeError) {
      setToast({ type: 'error', message: subscribeError === 'expired'
        ? 'That confirmation link has expired. Submit your email again to get a new one.'
        : 'Subscription link is invalid or expired.' });
    }

    if (subscribed || unsubscribed || subscribeError) {
      const remaining = new URLSearchParams(searchParams.toString());
      ['subscribed', 'unsubscribed', 'subscribe_error'].forEach(key => remaining.delete(key));
      const query = remaining.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg flex items-center gap-3"
      style={{
        backgroundColor: toast.type === 'success' ? '#06B569' : '#ef4444',
        color: '#fff',
        maxWidth: '90vw',
      }}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="opacity-70 hover:opacity-100"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px' }}
      >
        &times;
      </button>
    </div>
  );
}

export default function BlogSubscribeToast() {
  return (
    <Suspense fallback={null}>
      <BlogSubscribeToastInner />
    </Suspense>
  );
}
