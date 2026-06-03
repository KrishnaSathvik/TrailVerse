'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import blogService from '@/services/blogService';
import testimonialService from '@/services/testimonialService';
import api from '@/services/api';

const initialStats = {
  totalUsers: 0,
  totalPosts: 0,
  totalTrips: 0,
  totalTestimonials: 0,
  pendingTestimonials: 0,
  activeUsers30d: 0,
  onlineUsers: 0,
  apiConnected: false,
};

function normalizeSparklineDays(rows, dateKey = 'date') {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    date: row[dateKey] || row.date || row._id,
    count: row.count || 0,
  }));
}

export function useAdminDashboard({ autoFetch = true } = {}) {
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [stats, setStats] = useState(initialStats);
  const [recentActivity, setRecentActivity] = useState([]);
  const [userGrowth, setUserGrowth] = useState([]);
  const [aiStats, setAIStats] = useState(null);
  const [anonymousStats, setAnonymousStats] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [searchData, setSearchData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [satisfactionData, setSatisfactionData] = useState(null);
  const [mcpData, setMcpData] = useState(null);
  const [performanceData, setPerformanceData] = useState(null);
  const [popularParks, setPopularParks] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [refreshing, setRefreshing] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const hasLoadedRef = useRef(false);

  const fetchData = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    if (!isInitialLoad) {
      setRefreshing(true);
    }

    let allPosts = [];
    const failures = [];

    const safeGet = async (url, fallback, label) => {
      try {
        return await api.get(url);
      } catch {
        if (label) failures.push(label);
        return fallback;
      }
    };

    try {
      const [
        publishedData,
        draftData,
        scheduledData,
        archivedData,
        testimonialsStats,
        statsResponse,
        activityResponse,
        growthResponse,
        aiStatsResponse,
        anonStatsResponse,
        trafficResponse,
        searchResponse,
        errorResponse,
        satisfactionResponse,
        mcpResponse,
        performanceResponse,
        popularParksResponse,
      ] = await Promise.all([
        blogService.getAllPosts({ status: 'published', limit: 1000 }),
        blogService.getAllPosts({ status: 'draft', limit: 1000 }),
        blogService.getAllPosts({ status: 'scheduled', limit: 1000 }),
        blogService.getAllPosts({ status: 'archived', limit: 1000 }),
        testimonialService.getTestimonialsStats(),
        safeGet('/admin/stats', { data: { data: {} } }, 'Overview stats'),
        safeGet('/admin/recent-activity', { data: { data: [] } }),
        safeGet('/admin/user-growth', { data: { data: [] } }, 'User growth'),
        safeGet('/admin/ai-stats', { data: { data: null } }, 'AI stats'),
        safeGet('/admin/anonymous-stats', { data: { data: null } }, 'Anonymous funnel'),
        safeGet('/admin/analytics/traffic', { data: { data: null } }, 'Traffic'),
        safeGet('/admin/analytics/search', { data: { data: null } }, 'Search'),
        safeGet('/admin/analytics/errors', { data: { data: null } }, 'Errors'),
        safeGet('/admin/analytics/ai-satisfaction', { data: { data: null } }, 'AI satisfaction'),
        safeGet('/analytics/mcp?period=30d', { data: { data: null } }, 'MCP usage'),
        safeGet('/analytics/performance?period=24h', { data: { data: null } }, 'API performance'),
        safeGet('/admin/analytics/popular-parks', { data: { data: null } }, 'Popular parks'),
      ]);

      allPosts = [
        ...(publishedData.data || []),
        ...(draftData.data || []),
        ...(archivedData.data || []),
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

      const statsPayload = statsResponse.data?.data || statsResponse.data || {};

      setPosts(allPosts);
      setScheduledPosts(scheduled);
      setStats({
        totalPosts: allPosts.length,
        totalUsers: statsPayload.totalUsers || 0,
        totalTrips: statsPayload.totalTrips || 0,
        totalTestimonials: testimonialsStats.total,
        pendingTestimonials: testimonialsStats.pending,
        activeUsers30d: statsPayload.activeUsers30d ?? statsPayload.activeUsers ?? 0,
        onlineUsers: statsPayload.onlineUsers ?? 0,
        apiConnected: true,
      });
      setRecentActivity(Array.isArray(activityResponse.data?.data) ? activityResponse.data.data : []);
      setUserGrowth(normalizeSparklineDays(growthResponse.data?.data));
      setAIStats(aiStatsResponse.data?.data || null);
      setAnonymousStats(anonStatsResponse.data?.data || null);

      const traffic = trafficResponse.data?.data;
      if (traffic) {
        setTrafficData({
          ...traffic,
          dailyViews: normalizeSparklineDays(traffic.dailyViews, '_id'),
        });
      } else {
        setTrafficData(null);
      }

      setSearchData(Array.isArray(searchResponse.data?.data) ? searchResponse.data.data : []);
      setErrorData(Array.isArray(errorResponse.data?.data) ? errorResponse.data.data : []);
      setSatisfactionData(satisfactionResponse.data?.data || null);
      setMcpData(mcpResponse.data?.data || null);
      setPerformanceData(performanceResponse.data?.data || null);
      setPopularParks(Array.isArray(popularParksResponse.data?.data) ? popularParksResponse.data.data : []);
      setLoadWarnings(failures);
      hasLoadedRef.current = true;

      if (failures.length > 0 && !isInitialLoad) {
        showToast(`Some analytics failed to load: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`, 'error');
      }
    } catch {
      setPosts(allPosts);
      setStats((previous) => ({
        ...previous,
        totalPosts: allPosts.length,
        apiConnected: false,
      }));
      setLoadWarnings(failures);
      showToast('Failed to load some dashboard data. Use Refresh to retry.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  return {
    posts,
    scheduledPosts,
    stats,
    recentActivity,
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
    setPosts,
    setScheduledPosts,
  };
}
