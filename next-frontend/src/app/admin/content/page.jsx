'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Plus, Edit, Trash2, Eye, FileText } from '@components/icons';
import { useToast } from '@/context/ToastContext';
import api from '@/services/api';
import blogService from '@/services/blogService';
import AdminShell from '@components/admin/AdminShell';
import {
  AdminLoading,
  AdminKpi,
  AdminSection,
  AdminTabs,
  AdminEmptyState,
  AdminBadge,
  AdminIconButton,
  AdminIconLink,
} from '@components/admin/AdminUI';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'archived', label: 'Archived' },
];

function statusTone(status) {
  if (status === 'published') return 'success';
  if (status === 'scheduled') return 'info';
  if (status === 'archived') return 'neutral';
  return 'warning';
}

export default function AdminContentPage() {
  const { showToast } = useToast();
  const { posts, scheduledPosts, loading, refreshing, fetchData } = useAdminDashboard();
  const [statusTab, setStatusTab] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 12;

  const counts = useMemo(() => ({
    all: posts.length + scheduledPosts.length,
    published: posts.filter((p) => p.status === 'published').length,
    draft: posts.filter((p) => p.status === 'draft').length,
    scheduled: scheduledPosts.length,
    archived: posts.filter((p) => p.status === 'archived').length,
  }), [posts, scheduledPosts]);

  const filteredPosts = useMemo(() => {
    const pool = statusTab === 'scheduled'
      ? scheduledPosts
      : statusTab === 'all'
        ? [...posts, ...scheduledPosts]
        : posts.filter((p) => p.status === statusTab);
    return pool.sort((a, b) => {
      const dateA = a.scheduledAt || a.publishedAt || a.createdAt;
      const dateB = b.scheduledAt || b.publishedAt || b.createdAt;
      return new Date(dateB) - new Date(dateA);
    });
  }, [posts, scheduledPosts, statusTab]);

  const tabs = STATUS_TABS.map((t) => ({ ...t, count: counts[t.id] }));
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / perPage));
  const visible = filteredPosts.slice((page - 1) * perPage, page * perPage);

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this post permanently?')) return;
    try {
      await blogService.deletePost(id);
      await fetchData();
      showToast('Post deleted', 'success');
    } catch {
      showToast('Failed to delete post', 'error');
    }
  };

  const handlePublishNow = async (postId) => {
    try {
      await blogService.updatePost(postId, { status: 'published', publishedAt: new Date(), scheduledAt: null });
      showToast('Published', 'success');
      fetchData();
    } catch {
      showToast('Publish failed', 'error');
    }
  };

  const handlePublishOverdue = async () => {
    try {
      const response = await api.post('/blogs/publish-scheduled');
      if (response.data.success) {
        showToast(`Published ${response.data.data.length} post(s)`, 'success');
        fetchData();
      }
    } catch {
      showToast('Batch publish failed', 'error');
    }
  };

  if (loading) {
    return (
      <AdminShell title="Content" subtitle="Blog posts and publishing queue.">
        <AdminLoading label="Loading content…" />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Content"
      subtitle="Blog CMS — drafts, scheduled posts, and published articles."
      actions={
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <AdminKpi label="Published" value={counts.published} accent="#22c55e" />
        <AdminKpi label="Drafts" value={counts.draft} />
        <AdminKpi label="Scheduled" value={counts.scheduled} accent="#3b82f6" />
        <AdminKpi label="Archived" value={counts.archived} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <AdminTabs
          tabs={tabs}
          active={statusTab}
          onChange={(id) => { setStatusTab(id); setPage(1); }}
        />
        {counts.scheduled > 0 && statusTab === 'scheduled' && (
          <button
            type="button"
            onClick={handlePublishOverdue}
            className="text-sm font-medium px-4 py-2 rounded-xl"
            style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            Publish overdue
          </button>
        )}
      </div>

      <AdminSection
        title={STATUS_TABS.find((t) => t.id === statusTab)?.label || 'Posts'}
        description={`${filteredPosts.length} post${filteredPosts.length === 1 ? '' : 's'} in this view`}
        action={
          <Link href="/blog" className="text-sm font-medium text-forest-400 hover:text-forest-300">
            View public blog →
          </Link>
        }
      >
        {visible.length === 0 ? (
          <AdminEmptyState
            icon={FileText}
            title="No posts in this view"
            description="Create a new article or switch to another status tab."
            action={
              <Link href="/admin/blog/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
                <Plus className="h-4 w-4" />
                Write a post
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-3">
              {visible.map((post) => (
                <article
                  key={post._id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl transition hover:bg-white/[0.02]"
                  style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{post.title}</h3>
                      <AdminBadge tone={statusTone(post.status)}>{post.status}</AdminBadge>
                      {post.featured && <AdminBadge tone="purple">Featured</AdminBadge>}
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {post.scheduledAt
                        ? `Scheduled ${formatDate(post.scheduledAt)}`
                        : post.publishedAt
                          ? `Published ${formatDate(post.publishedAt)}`
                          : `Created ${formatDate(post.createdAt)}`}
                      {post.views != null && ` · ${post.views} views`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 sm:flex-shrink-0">
                    {post.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => handlePublishNow(post._id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold mr-1"
                        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                      >
                        Publish now
                      </button>
                    )}
                    <AdminIconLink href={`/admin/blog/edit/${post._id}`} title="Edit">
                      <Edit className="h-4 w-4" />
                    </AdminIconLink>
                    {post.status === 'published' && post.slug && (
                      <AdminIconLink href={`/blog/${post.slug}`} title="View live" target="_blank">
                        <Eye className="h-4 w-4" />
                      </AdminIconLink>
                    )}
                    <AdminIconButton title="Delete" tone="danger" onClick={() => handleDelete(post._id)}>
                      <Trash2 className="h-4 w-4" />
                    </AdminIconButton>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}>Previous</button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </AdminSection>
    </AdminShell>
  );
}
