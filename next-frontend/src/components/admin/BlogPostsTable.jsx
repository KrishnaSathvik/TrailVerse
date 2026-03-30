'use client';

import React from 'react';
import Link from 'next/link';
import { Edit, Eye, Trash2 } from '@components/icons';

const BlogPostsTable = ({
  posts,
  currentPage,
  postsPerPage,
  onPageChange,
  onDelete,
  formatDate
}) => {
  const totalPages = Math.ceil(posts.length / postsPerPage);
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = posts.slice(indexOfFirstPost, indexOfLastPost);

  return (
    <div className="rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Blog Posts
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Published, draft, and archived content in one queue.
          </p>
        </div>
        <Link href="/blog" className="text-sm font-medium text-forest-400 hover:text-forest-300">
          View Public Blog
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Title</th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Author</th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Views</th>
              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No posts yet. Create your first post.
                </td>
              </tr>
            ) : (
              currentPosts.map((post) => (
                <tr key={post._id} className="border-b hover:bg-white/5 transition" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-4 px-4">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {post.title}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      {post.publishedAt ? formatDate(post.publishedAt) : formatDate(post.createdAt)}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {post.author || 'Admin'}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      post.status === 'published'
                        ? 'bg-green-500/20 text-green-400'
                        : post.status === 'archived'
                        ? 'bg-slate-500/20 text-slate-300'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {post.views || 0}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/blog/edit/${post._id}`}
                        className="p-2 rounded-xl hover:bg-white/5 transition"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Edit post"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => onDelete(post._id)}
                        className="p-2 rounded-xl hover:bg-red-500/10 transition text-red-400"
                        title="Delete post"
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

      {posts.length > postsPerPage && (
        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Showing {indexOfFirstPost + 1} to {Math.min(indexOfLastPost, posts.length)} of {posts.length} posts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              Previous
            </button>
            <span className="text-sm px-3" style={{ color: 'var(--text-secondary)' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--surface)',
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
  );
};

export default BlogPostsTable;
