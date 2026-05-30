'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'tv_discover_recent';
const MAX = 8;

export function getRecentDiscoverLabel() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list[0]?.label || null;
  } catch {
    return null;
  }
}

export function recordDiscoverVisit({ dimension, slug, label }) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const entry = { dimension, slug, label, at: Date.now() };
    const filtered = list.filter(
      (item) => !(item.dimension === dimension && item.slug === slug)
    );
    const next = [entry, ...filtered].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function hrefFor(item) {
  if (item.dimension === 'state') return `/parks/state/${item.slug}`;
  return `/discover/${item.dimension}/${item.slug}`;
}

export default function RecentChips() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  if (!items.length) return null;

  return (
    <div className="mb-6">
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Recent
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item) => (
          <Link
            key={`${item.dimension}-${item.slug}`}
            href={hrefFor(item)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition hover:opacity-90"
            style={{
              borderColor: 'var(--accent-green)',
              color: 'var(--accent-green)'
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
