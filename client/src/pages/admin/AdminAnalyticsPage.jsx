import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, BarChart3, Users, Eye, 
  Calendar, Search, Download, RefreshCw,
  Activity, Target, Zap, AlertTriangle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const AdminAnalyticsPage = () => {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/analytics/dashboard?period=${period}`);
      setAnalytics(response.data.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      showToast('Failed to load analytics data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAnalytics();
    setIsRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/analytics/export?period=${period}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analytics-${period}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      showToast('Analytics data exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting analytics:', error);
      showToast('Failed to export analytics data', 'error');
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString() || '0';
  };

  const formatPercentage = (num) => {
    return `${num >= 0 ? '+' : ''}${num?.toFixed(1) || 0}%`;
  };


  if (loading && !analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition hover:bg-white/5"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
              <div>
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <BarChart3 className="h-8 w-8 text-purple-500" />
                  Analytics Dashboard
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Comprehensive insights and performance metrics
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-4 py-2 rounded-xl outline-none transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white'
                }}
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {analytics && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <span className={`text-sm font-semibold ${
                    analytics.overview?.growthRate >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(analytics.overview?.growthRate)}
                  </span>
                </div>
                <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {formatNumber(analytics.overview?.totalEvents)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Total Events
                </div>
              </div>

              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {formatNumber(analytics.overview?.uniqueUsers)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Unique Users
                </div>
              </div>

              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {analytics.overview?.averageEventsPerUser || 0}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Avg Events/User
                </div>
              </div>

              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {formatNumber(analytics.eventCounts?.length || 0)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Event Types
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Event Types */}
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Event Types
                </h3>
                <div className="space-y-3">
                  {analytics.eventCounts?.slice(0, 8).map((event, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-forest-500"></div>
                        <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                          {event.eventType?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(event.count)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {formatNumber(event.uniqueUsers)} users
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Users */}
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Most Active Users
                </h3>
                <div className="space-y-3">
                  {analytics.userEngagement?.slice(0, 8).map((user, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                          <span className="text-white font-semibold text-xs">
                            {user.user?.name?.charAt(0) || user.user?.email?.charAt(0) || 'U'}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {user.user?.name || user.user?.email || 'Anonymous'}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {user.uniqueSessions} sessions
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(user.totalEvents)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          events
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Popular Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Popular Parks */}
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Target className="h-5 w-5 text-green-500" />
                  Popular Parks
                </h3>
                <div className="space-y-3">
                  {analytics.popularContent?.parks?.slice(0, 5).map((park, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {park.parkCode}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(park.views)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Popular Blogs */}
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Eye className="h-5 w-5 text-blue-500" />
                  Popular Blogs
                </h3>
                <div className="space-y-3">
                  {analytics.popularContent?.blogs?.slice(0, 5).map((blog, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {blog.details?.title || 'Untitled'}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(blog.views)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Popular Events */}
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Calendar className="h-5 w-5 text-purple-500" />
                  Popular Events
                </h3>
                <div className="space-y-3">
                  {analytics.popularContent?.events?.slice(0, 5).map((event, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Event {index + 1}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatNumber(event.views)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Search Analytics */}
            {analytics.searchAnalytics && analytics.searchAnalytics.length > 0 && (
              <div className="rounded-2xl p-6 backdrop-blur mb-8"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Search className="h-5 w-5 text-orange-500" />
                  Top Search Terms
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analytics.searchAnalytics.slice(0, 12).map((search, index) => (
                    <div key={index} className="p-4 rounded-xl"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        &ldquo;{search.searchTerm}&rdquo;
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {formatNumber(search.count)} searches • {formatNumber(search.uniqueUsers)} users
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Analytics */}
            {analytics.errorAnalytics && analytics.errorAnalytics.length > 0 && (
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Recent Errors
                </h3>
                <div className="space-y-3">
                  {analytics.errorAnalytics.slice(0, 5).map((error, index) => (
                    <div key={index} className="p-4 rounded-xl"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: '1px',
                        borderColor: 'rgba(239, 68, 68, 0.2)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {error.errorCode || 'Unknown Error'}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                          {formatNumber(error.count)} occurrences
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {error.errorMessage}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
