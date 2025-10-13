import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, Users, Search, 
  Eye, Edit, Trash2, 
  UserCheck
} from '@components/icons';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const AdminUsersPage = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  const usersPerPage = 20;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchTerm, filterRole, filterStatus]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: usersPerPage,
        search: searchTerm,
        role: filterRole !== 'all' ? filterRole : '',
        status: filterStatus !== 'all' ? filterStatus : ''
      });

      const response = await api.get(`/admin/users?${params}`);
      
      setUsers(response.data.data || []);
      setTotalPages(response.data.pagination?.pages || 1);
      setTotalUsers(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (type, value) => {
    if (type === 'role') setFilterRole(value);
    if (type === 'status') setFilterStatus(value);
    setCurrentPage(1);
  };

  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(user => user._id));
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedUsers.length === 0) {
      showToast('Please select users first', 'error');
      return;
    }

    try {
      await api.post('/admin/users/bulk-action', {
        userIds: selectedUsers,
        action
      });
      
      showToast(`${action} completed successfully`, 'success');
      setSelectedUsers([]);
      fetchUsers();
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
      showToast(`Failed to ${action} users`, 'error');
    }
  };

  const handleUserAction = async (userId, action) => {
    try {
      await api.post(`/admin/users/${userId}/${action}`);
      showToast(`User ${action} successful`, 'success');
      fetchUsers();
    } catch (error) {
      console.error(`Error ${action} user:`, error);
      showToast(`Failed to ${action} user`, 'error');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getRoleBadge = (role) => {
    return role === 'admin' 
      ? 'bg-purple-500/20 text-purple-400'
      : 'bg-blue-500/20 text-blue-400';
  };

  const getStatusBadge = (isEmailVerified) => {
    return isEmailVerified
      ? 'bg-green-500/20 text-green-400'
      : 'bg-yellow-500/20 text-yellow-400';
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading users...</p>
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
            <Users className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              User Management
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                User Management
              </h1>
              <p className="text-lg sm:text-xl max-w-3xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                Manage TrailVerse users, roles, and permissions. Monitor user activity, 
                verify accounts, and maintain platform security.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {totalUsers.toLocaleString()}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Total Users
                </div>
              </div>
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 px-3 sm:px-6 py-3 rounded-full font-semibold transition shadow-lg hover:opacity-80 text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filters and Search */}
        <div className="rounded-2xl p-6 backdrop-blur mb-6"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5" 
                  style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={filterRole}
                onChange={(e) => handleFilterChange('role', e.target.value)}
                className="px-3 sm:px-4 py-2 sm:py-3 rounded-xl outline-none transition text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="all">All Roles</option>
                <option value="user">Users</option>
                <option value="admin">Admins</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="px-3 sm:px-4 py-2 sm:py-3 rounded-xl outline-none transition text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="all">All Status</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </select>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="mt-4 p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBulkAction('verify')}
                    className="px-4 py-2 rounded-full font-semibold text-sm transition shadow-lg hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: 'white'
                    }}
                  >
                    <UserCheck className="h-4 w-4 inline mr-1" />
                    Verify
                  </button>
                  <button
                    onClick={() => handleBulkAction('delete')}
                    className="px-4 py-2 rounded-full font-semibold text-sm transition shadow-lg hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--error-red)',
                      color: 'white'
                    }}
                  >
                    <Trash2 className="h-4 w-4 inline mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="rounded-2xl backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left py-4 px-6">
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === users.length && users.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    User
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Role
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Status
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Joined
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b hover:bg-white/5 transition"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user._id)}
                        onChange={() => handleSelectUser(user._id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">
                            {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {user.name || 'No Name'}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(user.isEmailVerified)}`}>
                        {user.isEmailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleUserAction(user._id, 'view')}
                          className="p-2 rounded-xl hover:bg-white/5 transition"
                          style={{ color: 'var(--text-secondary)' }}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleUserAction(user._id, 'edit')}
                          className="p-2 rounded-xl hover:bg-white/5 transition"
                          style={{ color: 'var(--text-secondary)' }}
                          title="Edit User"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {!user.isEmailVerified && (
                          <button
                            onClick={() => handleUserAction(user._id, 'verify')}
                            className="p-2 rounded-xl hover:bg-green-500/10 transition text-green-400"
                            title="Verify User"
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleUserAction(user._id, 'delete')}
                          className="p-2 rounded-xl hover:bg-red-500/10 transition text-red-400"
                          title="Delete User"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-6 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Showing {((currentPage - 1) * usersPerPage) + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminUsersPage;
