'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from '@components/icons';
import AdminShell from '@components/admin/AdminShell';
import TestimonialsManagement from '@components/admin/TestimonialsManagement';
import { AdminKpi, AdminLoading } from '@components/admin/AdminUI';
import testimonialService from '@/services/testimonialService';

export default function AdminCommunityPage() {
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, featured: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await testimonialService.getTestimonialsStats();
      setStats({
        total: data.total || 0,
        pending: data.pending || 0,
        approved: data.approved || (data.total - data.pending) || 0,
        featured: data.featured || 0,
      });
    } catch {
      setStats({ total: 0, pending: 0, approved: 0, featured: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const kpis = useMemo(() => ([
    { label: 'Total', value: stats.total },
    { label: 'Pending review', value: stats.pending, accent: stats.pending > 0 ? '#f97316' : undefined },
    { label: 'Approved', value: stats.approved, accent: '#22c55e' },
    { label: 'Featured', value: stats.featured, accent: '#eab308' },
  ]), [stats]);

  return (
    <AdminShell
      title="Community"
      subtitle="Review visitor testimonials before they appear on the site."
      actions={
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {kpis.map((kpi) => (
          <AdminKpi key={kpi.label} label={kpi.label} value={kpi.value} accent={kpi.accent} />
        ))}
      </div>

      {stats.pending > 0 && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.25)', color: 'var(--text-primary)' }}
        >
          <span>{stats.pending} testimonial{stats.pending === 1 ? '' : 's'} waiting for approval</span>
          <Link href="/testimonials" className="font-medium text-forest-400 hover:text-forest-300">
            See public page →
          </Link>
        </div>
      )}

      {loading ? (
        <AdminLoading label="Loading testimonials…" />
      ) : (
        <TestimonialsManagement embedded refreshKey={refreshKey} onStatsChange={loadStats} />
      )}
    </AdminShell>
  );
}
