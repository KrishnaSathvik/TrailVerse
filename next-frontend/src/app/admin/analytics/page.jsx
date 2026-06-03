'use client';

import React from 'react';
import { RefreshCw } from '@components/icons';
import AdminShell from '@components/admin/AdminShell';
import AdminAnalyticsPanels from '@components/admin/AdminAnalyticsPanels';
import { AdminLoading } from '@components/admin/AdminUI';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';

export default function AdminAnalyticsPage() {
  const {
    userGrowth,
    aiStats,
    anonymousStats,
    trafficData,
    searchData,
    errorData,
    satisfactionData,
    mcpData,
    performanceData,
    popularParks,
    loading,
    refreshing,
    loadWarnings,
    fetchData,
  } = useAdminDashboard();

  return (
    <AdminShell
      title="Analytics"
      subtitle="Growth, Trailie usage, traffic, and MCP connector performance."
      actions={
        <button
          type="button"
          onClick={fetchData}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {loadWarnings.length > 0 && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            border: '1px solid rgba(249, 115, 22, 0.25)',
            color: 'var(--text-primary)',
          }}
        >
          Some data could not be loaded: {loadWarnings.join(', ')}. Try Refresh — if it persists, check that you are logged in as admin and the API is reachable.
        </div>
      )}

      {loading ? (
        <AdminLoading label="Loading analytics…" />
      ) : (
        <AdminAnalyticsPanels
          userGrowth={userGrowth}
          aiStats={aiStats}
          anonymousStats={anonymousStats}
          trafficData={trafficData}
          searchData={searchData}
          errorData={errorData}
          satisfactionData={satisfactionData}
          mcpData={mcpData}
          performanceData={performanceData}
          popularParks={popularParks}
        />
      )}
    </AdminShell>
  );
}
