'use client';

import Link from 'next/link';
import Header from '@/components/common/Header';
import MyTrips from '@/components/my-trips/MyTrips';
import { useAuth } from '@/context/AuthContext';

export default function MyTripsPage() {
  const { user, loading, isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header />
      <main className="public-shell py-8 sm:py-12">
        {loading ? <p role="status">Loading your trips…</p> : !isAuthenticated || !user ? (
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold">My Trips</h1>
            <p>Sign in to see your trips and conversations with Trailie.</p>
            <Link href="/login?redirect=%2Fchat-history" className="text-[var(--accent-green)] underline">Sign in</Link>
          </div>
        ) : <MyTrips key={user._id || user.id} />}
      </main>
    </div>
  );
}
