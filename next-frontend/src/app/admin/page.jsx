'use client';

import React from 'react';
import {
  Users,
  FileText,
  Calendar,
  Activity,
  Clock,
  RefreshCw,
  Zap,
} from '@components/icons';
import AdminShell from '@components/admin/AdminShell';
import { StatCard } from '@components/admin/AdminAnalyticsPanels';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function AdminOverviewPage() {
  const { stats, recentActivity, loading, refreshing, fetchData } = useAdminDashboard();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <AdminShell
      title="Overview"
      subtitle="Platform health and recent activity."
      actions={
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
          style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {!stats.apiConnected && (
        <div className="mb-6 p-4 rounded-xl border-l-4 border-orange-400 bg-orange-50 dark:bg-orange-900/20">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Some statistics are stale. Use Refresh to retry the admin endpoints.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Users} label="Total Users" value={stats.totalUsers.toLocaleString()} apiConnected={stats.apiConnected} />
        <StatCard icon={FileText} label="Blog Posts" value={stats.totalPosts} apiConnected={stats.apiConnected} />
        <StatCard icon={Calendar} label="Trip Plans" value={stats.totalTrips} apiConnected={stats.apiConnected} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] gap-6">
        <div className="rounded-2xl p-4 sm:p-6 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
            <Activity className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 sm:p-4 rounded-xl"
                  style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="font-semibold mb-1 line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {activity.action || 'Unknown action'}
                    </p>
                    <div className="flex items-center gap-2 text-sm flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                      <span className="truncate max-w-[220px]">{activity.user || 'Unknown user'}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {activity.time || 'Unknown time'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>No recent activity</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl p-4 sm:p-6 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Active Users</h2>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.onlineUsers}</div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Online (15 min)</p>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.activeUsers30d}</div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Active (30 days)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
