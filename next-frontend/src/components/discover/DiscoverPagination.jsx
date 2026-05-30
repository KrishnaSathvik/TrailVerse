'use client';

import { ChevronLeft, ChevronRight } from '@components/icons';

export default function DiscoverPagination({
  page,
  totalPages,
  total,
  startIndex,
  endIndex,
  onPageChange,
  disabled = false
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {startIndex}–{endIndex} of {total} parks
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: page <= 1 ? 'transparent' : 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  disabled={disabled}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${p === page ? 'ring-2' : 'hover:bg-white/5'}`}
                  style={{
                    backgroundColor: p === page ? 'var(--surface-active)' : 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: p === page ? 'var(--border-hover)' : 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  {p}
                </button>
              );
            }
            if (p === page - 2 || p === page + 2) {
              return (
                <span key={p} className="px-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  …
                </span>
              );
            }
            return null;
          })}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: page >= totalPages ? 'transparent' : 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
