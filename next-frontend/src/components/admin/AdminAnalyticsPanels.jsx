'use client';

import React, { useMemo, useState } from 'react';
import {
  Users,
  Sparkle,
  ThumbsUp,
  Activity,
  Search,
  AlertTriangle,
  TrendUp,
} from '@components/icons';
import { AdminKpi, AdminSection, AdminTabs, AdminEmptyState } from '@components/admin/AdminUI';

export const Sparkline = ({ data, height = 48, color = '#22c55e' }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 100;
  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - (d.count / max) * (height - 4);
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <polygon fill={color} fillOpacity="0.1" points={areaPoints} />
    </svg>
  );
};

const MetricTile = ({ label, value, sub }) => (
  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
    <div className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</div>
    <div className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>
    {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>}
  </div>
);

const RankList = ({ items, labelKey, valueKey, empty = 'No data yet' }) => {
  if (!items?.length) {
    return <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item, idx) => (
        <div
          key={item[labelKey] || item._id || idx}
          className="flex items-center justify-between gap-3 p-3 rounded-xl"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {item[labelKey] || item._id || item.tool || item.contentId}
          </span>
          <span className="text-xs font-semibold tabular-nums px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}>
            {item[valueKey] ?? item.count ?? item.calls ?? item.views}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function AdminAnalyticsPanels({
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
}) {
  const [tab, setTab] = useState('growth');

  const signupTotal = userGrowth.reduce((sum, d) => sum + d.count, 0);
  const pageViews = trafficData?.dailyViews?.reduce((s, d) => s + d.count, 0) || 0;

  const tabs = useMemo(() => ([
    { id: 'growth', label: 'Growth' },
    { id: 'ai', label: 'Trailie & AI' },
    { id: 'platform', label: 'Platform' },
    { id: 'mcp', label: 'MCP / ChatGPT' },
  ]), []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminKpi label="Signups (30d)" value={signupTotal} hint="New registered users" />
        <AdminKpi
          label="AI chats (30d)"
          value={aiStats?.recentConversations ?? '—'}
          hint="Authenticated + trip plans"
          accent="var(--accent-green)"
        />
        <AdminKpi label="Page views (30d)" value={pageViews.toLocaleString()} hint="Tracked page_view events" />
        <AdminKpi
          label="MCP tool calls"
          value={mcpData?.overview?.totalCalls ?? '—'}
          hint="Last 30 days · ChatGPT / Claude"
        />
      </div>

      <AdminTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'growth' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AdminSection title="User signups" description="Daily registrations — last 30 days">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{signupTotal}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>total new users</p>
              </div>
              <TrendUp className="h-8 w-8 opacity-40" style={{ color: 'var(--accent-green)' }} />
            </div>
            <Sparkline data={userGrowth} color="#22c55e" />
          </AdminSection>

          {anonymousStats ? (
            <AdminSection title="Anonymous funnel" description="Pre-signup Trailie sessions (5-msg cap)">
              <div className="grid grid-cols-2 gap-3">
                <MetricTile label="Total sessions" value={anonymousStats.totalSessions} />
                <MetricTile label="Active (48h)" value={anonymousStats.activeSessions} />
                <MetricTile label="Hit 5-msg limit" value={`${anonymousStats.hitLimitRate}%`} />
                <MetricTile label="Conversion rate" value={`${anonymousStats.conversionRate}%`} sub={`${anonymousStats.convertedSessions} converted`} />
              </div>
            </AdminSection>
          ) : (
            <AdminEmptyState title="No anonymous data" description="Anonymous session analytics will appear once users chat without an account." />
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AdminSection title="Conversation metrics" description="Trailie chat + saved trip plans">
            {aiStats ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <MetricTile label="Total conversations" value={aiStats.totalConversations} />
                  <MetricTile label="Last 30 days" value={aiStats.recentConversations} />
                  <MetricTile label="Avg msgs / chat" value={aiStats.avgMessagesPerChat} />
                  <MetricTile label="Satisfaction" value={aiStats.satisfactionRate != null ? `${aiStats.satisfactionRate}%` : '—'} />
                </div>
                {aiStats.topParks?.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Top parks asked</p>
                    <div className="flex flex-wrap gap-2">
                      {aiStats.topParks.filter((p) => p.parkCode).map((p) => (
                        <span key={p.parkCode} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                          {p.parkCode.toUpperCase()} · {p.count}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <AdminEmptyState icon={Sparkle} title="No AI analytics" description="Start collecting data from Trailie conversations." />
            )}
          </AdminSection>

          <AdminSection title="Feedback satisfaction" description="Thumbs up/down on AI responses">
            {satisfactionData ? (
              <div className="grid grid-cols-3 gap-3">
                <MetricTile label="Total feedback" value={satisfactionData.totalFeedback || 0} />
                <MetricTile label="Positive" value={satisfactionData.positiveFeedback || 0} />
                <MetricTile label="Negative" value={satisfactionData.negativeFeedback || 0} />
              </div>
            ) : (
              <AdminEmptyState icon={ThumbsUp} title="No feedback yet" description="User ratings on AI replies will show here." />
            )}
          </AdminSection>
        </div>
      )}

      {tab === 'platform' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AdminSection title="Traffic" description="Page views over the last 30 days">
            {trafficData?.dailyViews?.length > 0 ? (
              <>
                <Sparkline data={trafficData.dailyViews} color="#3b82f6" />
                <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
                  {pageViews > 0
                    ? `${pageViews.toLocaleString()} total page views`
                    : 'No page views recorded yet — browse the site as a visitor, then refresh.'}
                </p>
              </>
            ) : (
              <AdminEmptyState icon={Activity} title="Traffic unavailable" description="Could not load traffic analytics. Check your admin session and refresh." />
            )}
          </AdminSection>

          <AdminSection title="Top searches" description="What visitors search for on TrailVerse">
            <RankList items={searchData} labelKey="searchTerm" valueKey="count" />
          </AdminSection>

          <AdminSection title="Errors" description="Most frequent client/API errors">
            <RankList items={errorData} labelKey="errorCode" valueKey="count" empty="No errors tracked — nice!" />
          </AdminSection>

          <AdminSection title="Popular parks" description="Most viewed park pages">
            <RankList items={popularParks} labelKey="contentId" valueKey="views" />
          </AdminSection>

          <AdminSection title="API performance" description="Slowest endpoints (avg response time, last 24h)" className="xl:col-span-2">
            <RankList
              items={(performanceData?.apiPerformance || []).map((row) => ({
                _id: row._id,
                count: `${Math.round(row.avgResponseTime || 0)}ms`,
              }))}
              labelKey="_id"
              valueKey="count"
              empty="No API timing data yet — server tracks calls automatically as traffic hits the API."
            />
          </AdminSection>
        </div>
      )}

      {tab === 'mcp' && (
        <AdminSection title="MCP connector usage" description="ChatGPT App & Claude tool calls via trailverse-mcp">
          {mcpData?.overview ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="grid grid-cols-2 gap-3">
                <MetricTile label="Total calls" value={mcpData.overview.totalCalls ?? 0} />
                <MetricTile label="Error rate" value={`${mcpData.overview.errorRate ?? 0}%`} />
                <MetricTile label="Avg execution" value={`${mcpData.overview.avgExecutionTimeMs ?? 0}ms`} />
                <MetricTile label="Period" value={mcpData.period || '30d'} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>By tool</p>
                <RankList
                  items={(mcpData.toolBreakdown || []).map((row) => ({
                    tool: row.tool || row._id,
                    calls: row.calls || row.count,
                  }))}
                  labelKey="tool"
                  valueKey="calls"
                />
              </div>
            </div>
          ) : (
            <AdminEmptyState icon={Sparkle} title="No MCP data" description="Tool usage from the ChatGPT app and Claude connector appears here." />
          )}
        </AdminSection>
      )}
    </div>
  );
}

export const StatCard = ({ icon: Icon, label, value, badge, apiConnected = true }) => (
  <div className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
    <div className="flex items-start justify-between mb-4">
      <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
        <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
      </div>
      {badge && <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full">{badge}</span>}
      {!apiConnected && <span className="text-xs text-orange-400">Offline</span>}
    </div>
    <div className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</div>
  </div>
);
