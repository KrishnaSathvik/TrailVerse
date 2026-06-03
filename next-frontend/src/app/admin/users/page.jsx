'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Eye, Edit, Trash2,
  UserCheck, X, Save, RefreshCw,
  Mail, Calendar, Shield, Clock
} from '@components/icons';
import { useToast } from '@/context/ToastContext';
import api from '@/services/api';
import AdminShell from '@components/admin/AdminShell';
import {
  AdminLoading,
  AdminKpi,
  AdminSection,
  AdminBadge,
  AdminIconButton,
  AdminEmptyState,
  adminCard,
} from '@components/admin/AdminUI';

const AdminUsersPage = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchUsers();
  }, [currentPage]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: usersPerPage,
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

  const getStatusBadge = (isEmailVerified) => (isEmailVerified ? 'success' : 'warning');

  const pageStats = useMemo(() => ({
    unverified: users.filter((u) => !u.isEmailVerified).length,
  }), [users]);

  const renderUserActions = (user) => (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <AdminIconButton title="View" onClick={() => openUserModal(user, 'view')}>
        <Eye className="h-4 w-4" />
      </AdminIconButton>
      <AdminIconButton title="Edit" onClick={() => openUserModal(user, 'edit')}>
        <Edit className="h-4 w-4" />
      </AdminIconButton>
      {!user.isEmailVerified && (
        <AdminIconButton title="Verify" onClick={() => handleVerifyUser(user._id)}>
          <UserCheck className="h-4 w-4" style={{ color: '#22c55e' }} />
        </AdminIconButton>
      )}
      <AdminIconButton title="Delete" tone="danger" onClick={() => setDeleteConfirm(user)}>
        <Trash2 className="h-4 w-4" />
      </AdminIconButton>
    </div>
  );

  if (loading && users.length === 0) {
    return (
      <AdminShell title="Users" subtitle="Manage accounts, roles, and verification.">
        <AdminLoading label="Loading users…" />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Users"
      subtitle="Manage accounts and email verification."
      actions={
        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <AdminKpi label="Total accounts" value={totalUsers.toLocaleString()} />
        <AdminKpi label="On this page" value={users.length} hint={`Page ${currentPage} of ${totalPages}`} />
        <AdminKpi label="Unverified" value={pageStats.unverified} accent={pageStats.unverified ? '#f97316' : undefined} hint="On this page" />
      </div>

      {selectedUsers.length > 0 && (
        <div
          className="mb-6 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {selectedUsers.length} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleBulkAction('verify')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
            >
              <UserCheck className="h-4 w-4" />
              Verify
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('delete')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--error-red)', color: 'white' }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      <AdminSection
        title="Accounts"
        description={
          totalUsers > 0
            ? `Showing ${((currentPage - 1) * usersPerPage) + 1}–${Math.min(currentPage * usersPerPage, totalUsers)} of ${totalUsers}`
            : 'No accounts yet'
        }
      >
        {users.length === 0 ? (
          <AdminEmptyState
            icon={Users}
            title="No users found"
            description="There are no user accounts to show."
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              <label className="flex items-center gap-2 px-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={selectedUsers.length === users.length && users.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
                Select all on page
              </label>
              {users.map((user) => (
                <article
                  key={user._id}
                  className="p-4 rounded-xl"
                  style={adminCard}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user._id)}
                      onChange={() => handleSelectUser(user._id)}
                      className="rounded border-gray-300 mt-1"
                    />
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-semibold text-sm">
                        {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {user.name || 'No name'}
                          </p>
                          <p className="text-xs break-all mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {user.email}
                          </p>
                        </div>
                        <AdminBadge tone={getStatusBadge(user.isEmailVerified)}>
                          {user.isEmailVerified ? 'Verified' : 'Unverified'}
                        </AdminBadge>
                      </div>
                      <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                        Joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-end" style={{ borderColor: 'var(--border)' }}>
                    {renderUserActions(user)}
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-3 px-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedUsers.length === users.length && users.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>User</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Status</th>
                    <th className="hidden lg:table-cell text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Joined</th>
                    <th className="text-right py-3 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="border-b hover:bg-white/[0.02] transition" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-2 align-top">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user._id)}
                          onChange={() => handleSelectUser(user._id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-semibold text-sm">
                              {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                              {user.name || 'No name'}
                            </p>
                            <p className="text-xs truncate max-w-[220px] lg:max-w-xs" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <AdminBadge tone={getStatusBadge(user.isEmailVerified)}>
                          {user.isEmailVerified ? 'Verified' : 'Unverified'}
                        </AdminBadge>
                      </td>
                      <td className="hidden lg:table-cell py-3 px-3 align-top text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="py-3 px-2 align-top">
                        <div className="flex items-center justify-end">
                          {renderUserActions(user)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </AdminSection>

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
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${modalUser.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {modalUser.role}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${modalUser.isEmailVerified ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
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
    </AdminShell>
  );
};

export default AdminUsersPage;
