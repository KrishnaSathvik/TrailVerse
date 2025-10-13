import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';
import testimonialService from '../../services/testimonialService';
import api from '../../services/api';
import TestimonialsManagement from '../../components/admin/TestimonialsManagement';
import {
  Users, FileText, MapPin, Calendar,
  MessageSquare, Settings, Plus, Eye,
  Edit, Trash2, Activity, Clock, LogOut, Zap,
  Sparkles
} from '@components/icons';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    totalParks: 470, // Total National Parks, Monuments, Historic Sites, and more
    totalTrips: 0,
    totalTestimonials: 0,
    pendingTestimonials: 0,
    monthlyGrowth: 0,
    activeUsers: 0,
    // Previous values for calculating changes
    previousUsers: 0,
    previousPosts: 0,
    previousTrips: 0,
    // API status
    apiConnected: false
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    
    // Set up real-time updates every 30 seconds
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    let allPosts = []; // Declare allPosts at function scope
    try {
      // Fetch all posts (including drafts)
      const publishedData = await blogService.getAllPosts({ status: 'published', limit: 100 });
      const draftData = await blogService.getAllPosts({ status: 'draft', limit: 100 });
      
      allPosts = [...publishedData.data, ...draftData.data];
      setPosts(allPosts);

      // Fetch testimonials statistics
      const testimonialsStats = await testimonialService.getTestimonialsStats();

      // Fetch real statistics from API
      const statsResponse = await api.get('/admin/stats');
      const activityResponse = await api.get('/admin/recent-activity');
      
      console.log('Stats response:', statsResponse);
      console.log('Activity response:', activityResponse);

      setStats(prev => {
        const newStats = {
          ...prev,
          // Store previous values for change calculation
          previousUsers: prev.totalUsers,
          previousPosts: prev.totalPosts,
          previousTrips: prev.totalTrips,
          // Update current values
          totalPosts: allPosts.length,
          totalUsers: statsResponse.data?.data?.totalUsers || statsResponse.data?.totalUsers || 0,
          totalTrips: statsResponse.data?.data?.totalTrips || statsResponse.data?.totalTrips || 0,
          totalTestimonials: testimonialsStats.total,
          pendingTestimonials: testimonialsStats.pending,
          monthlyGrowth: statsResponse.data?.data?.monthlyGrowth || statsResponse.data?.monthlyGrowth || 0,
          activeUsers: statsResponse.data?.data?.activeUsers || statsResponse.data?.activeUsers || 0,
          // Mark API as connected
          apiConnected: true
        };
        console.log('Updated stats:', newStats);
        return newStats;
      });

      // Ensure recentActivity is always an array
      const activityData = activityResponse.data?.data || activityResponse.data || [];
      setRecentActivity(Array.isArray(activityData) ? activityData : []);
    } catch (error) {
      console.error('Error fetching data:', error);
      console.error('Error details:', error.response?.data || error.message);
      
      // Fallback to just blog posts if admin stats API is not available
      setStats(prev => ({
        ...prev,
        totalPosts: allPosts.length,
        // Keep previous values if API fails
        totalUsers: prev.totalUsers || 0,
        totalTrips: prev.totalTrips || 0,
        totalTestimonials: prev.totalTestimonials || 0,
        pendingTestimonials: prev.pendingTestimonials || 0,
        monthlyGrowth: prev.monthlyGrowth || 0,
        activeUsers: prev.activeUsers || 0,
        // Mark API as not connected
        apiConnected: false
      }));
      
      // Show error toast to user
      showToast('Failed to load some dashboard data. Please refresh the page.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await blogService.deletePost(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('Failed to delete post');
      }
    }
  };

  const handleLogout = async () => {
    try {
      // Import and use authService to logout properly
      const authService = (await import('../../services/authService')).default;
      authService.logout();
      showToast('Logged out successfully', 'success');
      navigate('/admin/login');
    } catch (error) {
      console.error('Error during logout:', error);
      showToast('Logout failed', 'error');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Admin Dashboard
            </span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tighter leading-none mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Welcome back.
              </h1>
              <p className="text-base sm:text-lg lg:text-xl max-w-3xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                Here's what's happening with your TrailVerse platform. 
                Monitor performance, manage content, and track user engagement.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                to="/admin/blog/new"
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full font-semibold transition shadow-lg hover:opacity-80 text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white'
                }}
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                New Post
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-full font-semibold transition shadow-lg hover:opacity-80 text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--error-red)',
                  color: 'white'
                }}
              >
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Stats Grid */}
          {/* API Status Indicator */}
          {!stats.apiConnected && (
            <div className="mb-6 p-4 rounded-xl border-l-4 border-orange-400 bg-orange-50 dark:bg-orange-900/20">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Zap className="h-5 w-5 text-orange-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    <strong>API Connection Issue:</strong> Some statistics may not be up to date. Please check your connection and refresh the page.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats.totalUsers.toLocaleString()}
            apiConnected={stats.apiConnected}
          />
          <StatCard
            icon={FileText}
            label="Blog Posts"
            value={stats.totalPosts}
            apiConnected={stats.apiConnected}
          />
          <StatCard
            icon={MapPin}
            label="National Parks"
            value={stats.totalParks}
            apiConnected={true}
          />
          <StatCard
            icon={Calendar}
            label="Trip Plans"
            value={stats.totalTrips}
            apiConnected={stats.apiConnected}
          />
          <StatCard
            icon={MessageSquare}
            label="Testimonials"
            value={stats.totalTestimonials}
            apiConnected={stats.apiConnected}
            badge={stats.pendingTestimonials > 0 ? `${stats.pendingTestimonials} pending` : null}
          />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Recent Activity
                </h3>
                <Activity className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
              </div>

              <div className="space-y-4">
                {Array.isArray(recentActivity) && recentActivity.length > 0 ? recentActivity.map(activity => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-4 rounded-xl hover:bg-white/5 transition"
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
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {activity.action}
                      </p>
                      <div className="flex items-center gap-2 text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span>{activity.user}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {activity.time}
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
          </div>

          {/* Quick Actions */}
          <div>
            <div className="rounded-2xl p-6 backdrop-blur mb-6"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <h3 className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Quick Actions
              </h3>

              <div className="space-y-2">
                <Link
                  to="/admin/blog/new"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-green-400" />
                  </div>
                  <span className="font-medium">Create Blog Post</span>
                </Link>

                <Link
                  to="/admin/users"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="font-medium">Manage Users</span>
                </Link>

                <button
                  onClick={() => {
                    const testimonialsSection = document.getElementById('testimonials-management');
                    testimonialsSection?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition w-full text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="font-medium">Manage Testimonials</span>
                  {stats.pendingTestimonials > 0 && (
                    <span className="ml-auto px-2 py-1 bg-orange-500 text-white text-xs rounded-full">
                      {stats.pendingTestimonials}
                    </span>
                  )}
                </button>

                <Link
                  to="/admin/performance"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="font-medium">Performance Monitor</span>
                </Link>

                <Link
                  to="/admin/settings"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Settings className="h-4 w-4 text-orange-400" />
                  </div>
                  <span className="font-medium">Settings</span>
                </Link>
              </div>
            </div>

            {/* Active Users */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <h3 className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Active Now
              </h3>
              <div className="text-center">
                <div className="text-4xl font-bold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {stats.activeUsers}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  users online
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Posts */}
        <div className="mt-8">
          <div className="rounded-2xl p-6 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Recent Blog Posts
              </h3>
              <Link
                to="/blog"
                className="text-sm font-medium text-forest-400 hover:text-forest-300"
              >
                View All
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <th className="text-left py-3 px-4 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Title
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Author
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Views
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        No posts yet. Create your first post!
                      </td>
                    </tr>
                  ) : (
                    posts.slice(0, 5).map(post => (
                      <tr key={post._id} className="border-b hover:bg-white/5 transition"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td className="py-4 px-4">
                          <p className="font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {post.title}
                          </p>
                          <p className="text-sm"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {post.publishedAt ? formatDate(post.publishedAt) : formatDate(post.createdAt)}
                          </p>
                        </td>
                        <td className="py-4 px-4 text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {post.author || 'Admin'}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            post.status === 'published'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {post.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <div className="flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            {post.views || 0}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/admin/blog/edit/${post._id}`}
                              className="p-2 rounded-xl hover:bg-white/5 transition"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(post._id)}
                              className="p-2 rounded-xl hover:bg-red-500/10 transition text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Testimonials Management Section */}
        <div id="testimonials-management" className="mt-12">
          <div className="rounded-2xl p-6 backdrop-blur"
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
  );
};

const StatCard = ({ icon: Icon, label, value, apiConnected, badge }) => {
  return (
    <div className="rounded-2xl p-6 backdrop-blur group hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)'
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="h-12 w-12 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 transition-transform group-hover:scale-110"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderColor: 'var(--border)'
          }}
        >
          <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {badge && (
            <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full">
              {badge}
            </span>
          )}
          {!apiConnected && (
            <span className="text-xs text-orange-400">
              Offline
            </span>
          )}
        </div>
      </div>
      <div className="text-3xl font-bold mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div className="text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </div>
    </div>
  );
};

export default AdminDashboard;
