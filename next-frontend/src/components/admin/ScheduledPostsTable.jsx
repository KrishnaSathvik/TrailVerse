'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, Calendar, Edit, Trash2 } from '@components/icons';

const ScheduledPostsTable = ({
  posts,
  formatDate,
  formatDateTime,
  getScheduledStatus,
  onPublishScheduled,
  onPublishNow,
  onDelete
}) => {
  if (posts.length === 0) {
    return null;
  }

  const hasOverduePosts = posts.some((post) => {
    const scheduledDate = post.scheduledAt ? new Date(post.scheduledAt) : null;
    return scheduledDate && scheduledDate <= new Date();
  });

  return (
    <div className="rounded-2xl p-4 sm:p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Scheduled Posts
          </h3>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">
            {posts.length}
          </span>
          {hasOverduePosts && (
            <button
              onClick={onPublishScheduled}
              className="px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{
                backgroundColor: 'var(--forest-500)',
                color: 'white'
              }}
            >
              Publish All Overdue
            </button>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Publishing queue and timing health.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left py-3 px-3 sm:px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Title</th>
              <th className="hidden sm:table-cell text-left py-3 px-3 sm:px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Scheduled Date</th>
              <th className="text-left py-3 px-3 sm:px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
              <th className="text-right py-3 px-3 sm:px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const scheduledStatus = getScheduledStatus(post.scheduledAt);
              return (
                <tr key={post._id} className="border-b hover:bg-white/5 transition" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-3 sm:py-4 px-3 sm:px-4">
                    <p className="font-semibold truncate max-w-[200px] sm:max-w-none" style={{ color: 'var(--text-primary)' }}>
                      {post.title}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      Created: {formatDate(post.createdAt)}
                    </p>
                  </td>
                  <td className="hidden sm:table-cell py-3 sm:py-4 px-3 sm:px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {post.scheduledAt ? formatDateTime(post.scheduledAt) : 'Not set'}
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-3 sm:px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      scheduledStatus.status === 'overdue'
                        ? 'bg-red-500/20 text-red-400'
                        : scheduledStatus.status === 'dueSoon'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {scheduledStatus.status === 'overdue' && (
                        <AlertCircle className="inline h-3 w-3 mr-1" />
                      )}
                      {scheduledStatus.label}
                    </span>
                  </td>
                  <td className="py-3 sm:py-4 px-3 sm:px-4">
                    <div className="flex items-center justify-end gap-2">
                      {scheduledStatus.status === 'overdue' && (
                        <button
                          onClick={() => onPublishNow(post._id)}
                          className="px-3 py-1 rounded-xl text-xs font-medium transition"
                          style={{
                            backgroundColor: 'var(--forest-500)',
                            color: 'white'
                          }}
                        >
                          Publish Now
                        </button>
                      )}
                      <Link
                        href={`/admin/blog/edit/${post._id}`}
                        className="p-2 rounded-xl hover:bg-white/5 transition"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Edit scheduled post"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => onDelete(post._id)}
                        className="p-2 rounded-xl hover:bg-red-500/10 transition text-red-400"
                        title="Delete scheduled post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduledPostsTable;
