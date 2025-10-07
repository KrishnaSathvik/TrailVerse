import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';
import {
  LayoutDashboard, Users, FileText, MapPin, Calendar,
  TrendingUp, MessageSquare, Settings, Plus, Eye,
  Edit, Trash2, BarChart3, Activity, Clock, LogOut
} from 'lucide-react';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 1247,
    totalPosts: 0,
    totalParks: 63,
    totalTrips: 892,
    monthlyGrowth: 12.5,
    activeUsers: 487
  });
  const [recentActivity, setRecentActivity] = useState([
    { id: 1, type: 'user', action: 'New user registration', user: 'John Doe', time: '5 minutes ago' },
    { id: 2, type: 'blog', action: 'New blog post published', user: 'Admin', time: '1 hour ago' },
    { id: 3, type: 'trip', action: 'Trip plan created', user: 'Jane Smith', time: '2 hours ago' },
    { id: 4, type: 'comment', action: 'New comment on blog', user: 'Mike Johnson', time: '3 hours ago' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all posts (including drafts)
      const publishedData = await blogService.getAllPosts({ status: 'published', limit: 100 });
      const draftData = await blogService.getAllPosts({ status: 'draft', limit: 100 });
      
      const allPosts = [...publishedData.data, ...draftData.data];
      setPosts(allPosts);

      // Calculate stats
      const totalViews = allPosts.reduce((sum, post) => sum + (post.views || 0), 0);
      setStats(prev => ({
        ...prev,
        totalPosts: allPosts.length
      }));
    } catch (error) {
      console.error('Error fetching data:', error);
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

  const handleLogout = () => {
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminEmail');
    showToast('Logged out successfully', 'success');
    navigate('/admin/login');
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
      {/* Header */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                Admin Dashboard
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Welcome back! Here's what's happening.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/admin/blog/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
              >
                <Plus className="h-5 w-5" />
                New Post
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition hover:bg-red-500/10 text-red-400"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats.totalUsers.toLocaleString()}
            change="+12.5%"
            positive
          />
          <StatCard
            icon={FileText}
            label="Blog Posts"
            value={stats.totalPosts}
            change="+8"
            positive
          />
          <StatCard
            icon={MapPin}
            label="National Parks"
            value={stats.totalParks}
            change="0"
          />
          <StatCard
            icon={Calendar}
            label="Trip Plans"
            value={stats.totalTrips}
            change="+23"
            positive
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
                {recentActivity.map(activity => (
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
                ))}
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

                <Link
                  to="/admin/analytics"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="font-medium">View Analytics</span>
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
                              className="p-2 rounded-lg hover:bg-white/5 transition"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(post._id)}
                              className="p-2 rounded-lg hover:bg-red-500/10 transition text-red-400"
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
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, change, positive }) => {
  return (
    <div className="rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center">
          <Icon className="h-6 w-6 text-white" />
        </div>
        {change && (
          <span className={`text-sm font-semibold ${
            positive ? 'text-green-400' : 'text-gray-400'
          }`}>
            {change}
          </span>
        )}
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
