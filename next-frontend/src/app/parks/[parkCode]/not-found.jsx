import Link from 'next/link';

export default function ParkNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-light tracking-tighter mb-2" style={{ color: 'var(--text-primary)' }}>
          404
        </h1>
        <h2 className="text-2xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
          Park Not Found
        </h2>
        <p className="text-base mb-8 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          We couldn&apos;t find that park. It may have moved or the URL might be incorrect.
        </p>
        <Link
          href="/explore"
          className="inline-block px-6 py-3 rounded-lg font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          Browse All Parks
        </Link>
      </div>
    </div>
  );
}
