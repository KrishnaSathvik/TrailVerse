import Link from 'next/link';

export default function ParkNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-center max-w-md px-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          <span className="text-4xl">🏔️</span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
          Park Not Found
        </h1>

        <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
          We couldn&apos;t find the park you&apos;re looking for. It may have been removed or the URL might be incorrect.
        </p>

        <Link
          href="/explore"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition hover:opacity-90"
          style={{
            backgroundColor: 'var(--accent-green)',
            color: 'white'
          }}
        >
          Explore All Parks
        </Link>

        <p className="text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>
          <Link href="/" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
            Return home
          </Link>
        </p>
      </div>
    </div>
  );
}
