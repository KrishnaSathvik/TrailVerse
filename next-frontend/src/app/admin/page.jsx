'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import blogService from '@/services/blogService';
import testimonialService from '@/services/testimonialService';
import api from '@/services/api';
import TestimonialsManagement from '@components/admin/TestimonialsManagement';
import AdminRoute from '@components/admin/AdminRoute';
import BlogPostsTable from '@components/admin/BlogPostsTable';
import ScheduledPostsTable from '@components/admin/ScheduledPostsTable';
import {
  Users,
  FileText,
  MapPin,
  Calendar,
  MessageSquare,
  Settings,
  Plus,
  Activity,
  Clock,
  LogOut,
  Zap,
  RefreshCw,
  AlertCircle
} from '@components/icons';
import { Sparkle, TrendUp, ThumbsUp } from '@phosphor-icons/react';

const initialStats = {
  totalUsers: 0,
  totalPosts: 0,
  totalParks: 474,
  totalTrips: 0,
  totalTestimonials: 0,
  pendingTestimonials: 0,
  activeUsers: 0,
  apiConnected: false
};

const Sparkline = ({ data, height = 40, color = '#22c55e' }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const width = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (d.count / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <polygon fill={color} fillOpacity="0.1" points={areaPoints} />
    </svg>
  );
};

const StatCard = ({ icon: Icon, label, value, badge, apiConnected }) => (
  <div
    className="rounded-2xl p-4 sm:p-5 backdrop-blur"
    style={{
      backgroundColor: 'var(--surface)',
      borderWidth: '1px',
      borderColor: 'var(--border)',
      boxShadow: 'var(--shadow)'
    }}
  >
    <div className="flex items-start justify-between mb-4">
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--surface-hover)' }}
      >
        <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
      </div>
      <div className="flex flex-col items-end gap-1">
        {badge && <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full">{badge}</span>}
        {!apiConnected && <span className="text-xs text-orange-400">Offline</span>}
      </div>
    </div>
    <div className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</div>
  </div>
);

const AdminDashboard = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [stats, setStats] = useState(initialStats);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [userGrowth, setUserGrowth] = useState([]);
  const [aiStats, setAIStats] = useState(null);
  const [anonymousStats, setAnonymousStats] = useState(null);
  const postsPerPage = 5;

  const fetchData = useCallback(async () => {
    const isInitialLoad = loading;
    if (!isInitialLoad) {
      setRefreshing(true);
    }

    let allPosts = [];

    try {
      const [publishedData, draftData, scheduledData, archivedData, testimonialsStats, statsResponse, activityResponse, growthResponse, aiStatsResponse, anonStatsResponse] = await Promise.all([
        blogService.getAllPosts({ status: 'published', limit: 1000 }),
        blogService.getAllPosts({ status: 'draft', limit: 1000 }),
        blogService.getAllPosts({ status: 'scheduled', limit: 1000 }),
        blogService.getAllPosts({ status: 'archived', limit: 1000 }),
        testimonialService.getTestimonialsStats(),
        api.get('/admin/stats').catch(() => ({ data: { data: {} } })),
        api.get('/admin/recent-activity').catch(() => ({ data: { data: [] } })),
        api.get('/admin/user-growth').catch(() => ({ data: { data: [] } })),
        api.get('/admin/ai-stats').catch(() => ({ data: { data: null } })),
        api.get('/admin/anonymous-stats').catch(() => ({ data: { data: null } }))
      ]);

      allPosts = [
        ...(publishedData.data || []),
        ...(draftData.data || []),
        ...(archivedData.data || [])
      ].sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt) : new Date(a.createdAt);
        const dateB = b.publishedAt ? new Date(b.publishedAt) : new Date(b.createdAt);
        return dateB - dateA;
      });

      const scheduled = [...(scheduledData.data || [])].sort((a, b) => {
        const dateA = a.scheduledAt ? new Date(a.scheduledAt) : new Date(0);
        const dateB = b.scheduledAt ? new Date(b.scheduledAt) : new Date(0);
        return dateA - dateB;
      });

      setPosts(allPosts);
      setScheduledPosts(scheduled);
      setStats({
        totalPosts: allPosts.length,
        totalUsers: statsResponse.data?.data?.totalUsers || statsResponse.data?.totalUsers || 0,
        totalTrips: statsResponse.data?.data?.totalTrips || statsResponse.data?.totalTrips || 0,
        totalParks: 474,
        totalTestimonials: testimonialsStats.total,
        pendingTestimonials: testimonialsStats.pending,
        activeUsers: statsResponse.data?.data?.activeUsers || statsResponse.data?.activeUsers || 0,
        apiConnected: true
      });
      setRecentActivity(Array.isArray(activityResponse.data?.data) ? activityResponse.data.data : []);
      setUserGrowth(Array.isArray(growthResponse.data?.data) ? growthResponse.data.data : []);
      setAIStats(aiStatsResponse.data?.data || null);
      setAnonymousStats(anonStatsResponse.data?.data || null);
    } catch (error) {
      setPosts(allPosts);
      setStats((previous) => ({
        ...previous,
        totalPosts: allPosts.length,
        apiConnected: false
      }));
      showToast('Failed to load some dashboard data. Use Refresh to retry.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loading, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const totalPages = Math.ceil(posts.length / postsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, posts.length]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      await blogService.deletePost(id);
      await fetchData();
    } catch {
      showToast('Failed to delete post', 'error');
    }
  };

  const handlePublishScheduled = async () => {
    try {
      const response = await api.post('/blogs/publish-scheduled');
      if (response.data.success) {
        showToast(`Published ${response.data.data.length} scheduled post(s)`, 'success');
        fetchData();
      } else {
        showToast('Failed to publish scheduled posts', 'error');
      }
    } catch {
      showToast('Failed to publish scheduled posts', 'error');
    }
  };

  const handlePublishNow = async (postId) => {
    const post = scheduledPosts.find((item) => item._id === postId);
    if (!post) {
      return;
    }

    try {
      await blogService.updatePost(postId, {
        status: 'published',
        publishedAt: new Date(),
        scheduledAt: null
      });
      showToast('Post published successfully', 'success');
      fetchData();
    } catch {
      showToast('Failed to publish post', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      const authService = (await import('@/services/authService')).default;
      authService.logout();
      showToast('Logged out successfully', 'success');
      router.push('/admin/login');
    } catch {
      showToast('Logout failed', 'error');
    }
  };

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const formatDateTime = (date) => new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const getScheduledStatus = (scheduledAt) => {
    if (!scheduledAt) {
      return { status: 'unknown', label: 'Unknown' };
    }

    const diff = new Date(scheduledAt) - new Date();
    const hoursDiff = diff / (1000 * 60 * 60);

    if (diff < 0) {
      return { status: 'overdue', label: 'Overdue' };
    }
    if (hoursDiff <= 24) {
      return { status: 'dueSoon', label: 'Due Soon' };
    }
    return { status: 'scheduled', label: 'Scheduled' };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminRoute>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <section className="pt-8 pb-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Admin Dashboard
                </h1>
                <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                  Content, users, and publishing status in one place.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={fetchData}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <Link
                  href="/admin/blog/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
                  style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                >
                  <Plus className="h-4 w-4" />
                  New Post
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
                  style={{ backgroundColor: 'var(--error-red)', color: 'white' }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
              <StatCard icon={Users} label="Total Users" value={stats.totalUsers.toLocaleString()} apiConnected={stats.apiConnected} />
              <StatCard icon={FileText} label="Blog Posts" value={stats.totalPosts} apiConnected={stats.apiConnected} />
              <StatCard icon={MapPin} label="National Parks" value={stats.totalParks} apiConnected />
              <StatCard icon={Calendar} label="Trip Plans" value={stats.totalTrips} apiConnected={stats.apiConnected} />
              <StatCard
                icon={MessageSquare}
                label="Testimonials"
                value={stats.totalTestimonials}
                apiConnected={stats.apiConnected}
                badge={stats.pendingTestimonials > 0 ? `${stats.pendingTestimonials} pending` : null}
              />
            </div>

            {/* User Growth & AI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* User Growth Sparkline */}
              <div
                className="rounded-2xl p-5 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-11 w-11 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <TrendUp className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                      <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>User Signups</h3>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Last 30 days</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {userGrowth.reduce((sum, d) => sum + d.count, 0)}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>new users</p>
                  </div>
                </div>
                <Sparkline data={userGrowth} height={48} color="#22c55e" />
                {userGrowth.length > 0 && (
                  <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{new Date(userGrowth[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span>Today</span>
                  </div>
                )}
              </div>

              {/* AI Chat Analytics */}
              <div
                className="rounded-2xl p-5 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                  >
                    <Sparkle className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>AI Chat Analytics</h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Conversation insights</p>
                  </div>
                </div>

                {aiStats ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                        <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{aiStats.totalConversations}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Chats</div>
                      </div>
                      <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                        <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{aiStats.recentConversations}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Last 30 Days</div>
                      </div>
                      <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                        <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{aiStats.avgMessagesPerChat}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avg Msgs/Chat</div>
                      </div>
                      <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                        <div className="text-lg font-bold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                          {aiStats.satisfactionRate !== null ? (
                            <><ThumbsUp className="h-4 w-4 text-green-400" />{aiStats.satisfactionRate}%</>
                          ) : '—'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Satisfaction</div>
                      </div>
                    </div>

                    {aiStats.topParks?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Most Asked Parks</p>
                        <div className="flex flex-wrap gap-2">
                          {aiStats.topParks.filter(p => p.parkCode).map((p) => (
                            <span
                              key={p.parkCode}
                              className="text-xs px-2 py-1 rounded-full font-medium"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                color: 'var(--text-primary)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              {p.parkCode.toUpperCase()} ({p.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No AI analytics data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Anonymous Users Funnel */}
            {anonymousStats && (
              <div
                className="rounded-2xl p-5 backdrop-blur mb-8"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                  >
                    <Users className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Anonymous Users</h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Freemium funnel analytics</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{anonymousStats.totalSessions}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Sessions</div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{anonymousStats.activeSessions}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Active (48h)</div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{anonymousStats.avgMessagesPerSession}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avg Msgs/Session</div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{anonymousStats.hitLimitRate}%</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Hit 3-Msg Limit</div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold text-green-400">{anonymousStats.convertedSessions}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Converted</div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="text-lg font-bold text-green-400">{anonymousStats.conversionRate}%</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Conversion Rate</div>
                  </div>
                </div>

                {anonymousStats.topParks?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Top Parks (Anonymous)</p>
                    <div className="flex flex-wrap gap-2">
                      {anonymousStats.topParks.filter(p => p.parkCode).map((p) => (
                        <span
                          key={p.parkCode}
                          className="text-xs px-2 py-1 rounded-full font-medium"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            color: 'var(--text-primary)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)'
                          }}
                        >
                          {p.parkCode.toUpperCase()} ({p.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] gap-6 mb-8">
              <div className="rounded-2xl p-4 sm:p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Recent Activity
                  </h2>
                  <Activity className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                </div>

                <div className="space-y-4">
                  {recentActivity.length > 0 ? recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        activity.type === 'user' ? 'bg-blue-500/20' :
                        activity.type === 'blog' ? 'bg-green-500/20' :
                        activity.type === 'trip' ? 'bg-purple-500/20' :
                        'bg-orange-500/20'
                      }`}>
                        {activity.type === 'user' && <Users className="h-5 w-5 text-blue-400" />}
                        {activity.type === 'blog' && <FileText className="h-5 w-5 text-green-400" />}
                        {activity.type === 'trip' && <Calendar className="h-5 w-5 text-purple-400" />}
                        {activity.type === 'comment' && <MessageSquare className="h-5 w-5 text-orange-400" />}
                      </div>
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
                  )) : (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" style={{ color: 'var(--text-tertiary)' }} />
                      <p style={{ color: 'var(--text-secondary)' }}>No recent activity</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl p-4 sm:p-6 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <h2 className="text-lg sm:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Quick Actions
                  </h2>
                  <div className="space-y-2">
                    <Link href="/admin/blog/new" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition" style={{ color: 'var(--text-secondary)' }}>
                      <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <Plus className="h-4 w-4 text-green-400" />
                      </div>
                      <span className="font-medium">Create Blog Post</span>
                    </Link>
                    <Link href="/admin/users" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition" style={{ color: 'var(--text-secondary)' }}>
                      <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Users className="h-4 w-4 text-blue-400" />
                      </div>
                      <span className="font-medium">Manage Users</span>
                    </Link>
                    <Link href="/admin/settings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition" style={{ color: 'var(--text-secondary)' }}>
                      <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <Settings className="h-4 w-4 text-orange-400" />
                      </div>
                      <span className="font-medium">Settings</span>
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl p-4 sm:p-6 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <h2 className="text-lg sm:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Active Now
                  </h2>
                  <div className="text-center">
                    <div className="text-2xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                      {stats.activeUsers}
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      users online
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <BlogPostsTable
                posts={posts}
                currentPage={currentPage}
                postsPerPage={postsPerPage}
                onPageChange={setCurrentPage}
                onDelete={handleDelete}
                formatDate={formatDate}
              />

              <ScheduledPostsTable
                posts={scheduledPosts}
                formatDate={formatDate}
                formatDateTime={formatDateTime}
                getScheduledStatus={getScheduledStatus}
                onPublishScheduled={handlePublishScheduled}
                onPublishNow={handlePublishNow}
                onDelete={handleDelete}
              />

              <div id="testimonials-management" className="rounded-2xl p-4 sm:p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <TestimonialsManagement />
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminRoute>
  );
};

export default AdminDashboard;
