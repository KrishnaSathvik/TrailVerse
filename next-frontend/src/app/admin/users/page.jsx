'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Users, Search,
  Eye, Edit, Trash2,
  UserCheck, X, Save, RefreshCw,
  Mail, Calendar, Shield, Clock
} from '@components/icons';
import { useToast } from '@/context/ToastContext';
import api from '@/services/api';
import AdminRoute from '@components/admin/AdminRoute';

const AdminUsersPage = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef(null);
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [modalUser, setModalUser] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'view' | 'edit'
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const usersPerPage = 20;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [currentPage, debouncedSearch, filterRole, filterStatus]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: usersPerPage,
        search: debouncedSearch,
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
    const value = e.target.value;
    setSearchTerm(value); // Update UI immediately
    setCurrentPage(1);
    // Debounce the actual fetch
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
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

  const openUserModal = (user, mode) => {
    setModalUser(user);
    setModalMode(mode);
    if (mode === 'edit') {
      setEditForm({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'user',
        isEmailVerified: user.isEmailVerified || false
      });
    }
  };

  const closeModal = () => {
    setModalUser(null);
    setModalMode(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!modalUser) return;
    try {
      setSaving(true);
      await api.put(`/admin/users/${modalUser._id}`, editForm);
      showToast('User updated successfully', 'success');
      closeModal();
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      showToast('Failed to update user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyUser = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/verify`);
      showToast('User verified successfully', 'success');
      fetchUsers();
      if (modalUser?._id === userId) {
        setModalUser(prev => prev ? { ...prev, isEmailVerified: true } : null);
      }
    } catch (error) {
      showToast('Failed to verify user', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      showToast('User deleted successfully', 'success');
      setDeleteConfirm(null);
      closeModal();
      fetchUsers();
    } catch (error) {
      showToast('Failed to delete user', 'error');
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
      <AdminRoute>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-center">
            <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
            <p style={{ color: 'var(--text-secondary)' }}>Loading users...</p>
          </div>
        </div>
      </AdminRoute>
    );
  }

  return (
    <AdminRoute>
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

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-tighter leading-none mb-4"
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
                  href="/admin"
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
          <div className="rounded-2xl p-4 sm:p-6 backdrop-blur mb-6"
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
                    <th className="text-left py-3 sm:py-4 px-3 sm:px-6">
                      <input
                        type="checkbox"
                        checked={selectedUsers.length === users.length && users.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left py-3 sm:py-4 px-3 sm:px-6 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      User
                    </th>
                    <th className="hidden sm:table-cell text-left py-3 sm:py-4 px-3 sm:px-6 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Role
                    </th>
                    <th className="hidden sm:table-cell text-left py-3 sm:py-4 px-3 sm:px-6 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Status
                    </th>
                    <th className="hidden sm:table-cell text-left py-3 sm:py-4 px-3 sm:px-6 text-sm font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Joined
                    </th>
                    <th className="text-right py-3 sm:py-4 px-3 sm:px-6 text-sm font-semibold"
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
                      <td className="py-3 sm:py-4 px-3 sm:px-6">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user._id)}
                          onChange={() => handleSelectUser(user._id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-3 sm:py-4 px-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-semibold text-xs sm:text-sm">
                              {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {user.name || 'No Name'}
                            </p>
                            <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell py-3 sm:py-4 px-3 sm:px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell py-3 sm:py-4 px-3 sm:px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(user.isEmailVerified)}`}>
                          {user.isEmailVerified ? 'Verified' : 'Unverified'}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell py-3 sm:py-4 px-3 sm:px-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="py-3 sm:py-4 px-3 sm:px-6">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => openUserModal(user, 'view')}
                            className="p-2 rounded-xl hover:bg-white/5 transition"
                            style={{ color: 'var(--text-secondary)' }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openUserModal(user, 'edit')}
                            className="p-2 rounded-xl hover:bg-white/5 transition"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Edit User"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {!user.isEmailVerified && (
                            <button
                              onClick={() => handleVerifyUser(user._id)}
                              className="p-2 rounded-xl hover:bg-green-500/10 transition text-green-400"
                              title="Verify User"
                            >
                              <UserCheck className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirm(user)}
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-6 border-t"
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

      {/* User View/Edit Modal */}
      {modalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">
                    {modalUser.name?.charAt(0) || modalUser.email?.charAt(0) || 'U'}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {modalMode === 'edit' ? 'Edit User' : 'User Details'}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {modalUser.email}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-white/10 transition" style={{ color: 'var(--text-secondary)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode === 'view' ? (
              /* View Mode */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Name</span>
                    </div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{modalUser.name || 'No Name'}</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Email</span>
                    </div>
                    <p className="font-semibold text-sm break-all" style={{ color: 'var(--text-primary)' }}>{modalUser.email}</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Role</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(modalUser.role)}`}>
                      {modalUser.role}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(modalUser.isEmailVerified)}`}>
                      {modalUser.isEmailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Joined</span>
                    </div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDate(modalUser.createdAt)}</p>
                  </div>
                  {modalUser.lastActiveAt && (
                    <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Last Active</span>
                      </div>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDate(modalUser.lastActiveAt)}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => { setModalMode('edit'); setEditForm({ name: modalUser.name || '', email: modalUser.email || '', role: modalUser.role || 'user', isEmailVerified: modalUser.isEmailVerified || false }); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <Edit className="h-4 w-4" /> Edit
                  </button>
                  {!modalUser.isEmailVerified && (
                    <button
                      onClick={() => handleVerifyUser(modalUser._id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition hover:opacity-80"
                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                    >
                      <UserCheck className="h-4 w-4" /> Verify
                    </button>
                  )}
                  <button
                    onClick={() => { closeModal(); setDeleteConfirm(modalUser); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--error-red)', color: 'white' }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            ) : (
              /* Edit Mode */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl outline-none transition"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl outline-none transition"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl outline-none transition"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)' }}
                >
                  <div>
                    <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Email Verified</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Mark email as verified</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isEmailVerified}
                      onChange={(e) => setEditForm(prev => ({ ...prev, isEmailVerified: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setModalMode('view')}
                    className="px-5 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl p-5 sm:p-6 text-center"
            style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Delete User?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name || deleteConfirm.email}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-80"
                style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirm._id)}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-80"
                style={{ backgroundColor: 'var(--error-red)', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminRoute>
  );
};

export default AdminUsersPage;
