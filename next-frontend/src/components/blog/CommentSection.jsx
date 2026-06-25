import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import commentService, { getCommentRequestErrorMessage } from '../../services/commentService';
import { getBestAvatar } from '../../utils/avatarGenerator';
import { ThumbsUp, Reply, MoreVertical, Trash2, MessageSquare, Lock } from '@components/icons';

const LOGIN_PROMPT_MESSAGE = 'Sign in to post a comment';

const CommentSection = ({
  postId,
  comments: initialComments = [],
  isPublic = false,
  embedded = false,
  unified = false,
}) => {
  const { user, isAuthenticated, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState('');
  const [, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialComments.length && postId) {
      fetchComments();
    }
  }, [postId, initialComments.length]);

  const fetchComments = async () => {
    try {
      const data = await commentService.getComments(postId);
      setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
      showToast(
        getCommentRequestErrorMessage(error, 'Failed to load comments'),
        'error'
      );
    }
  };

  const promptSignIn = () => {
    showLoginPrompt(LOGIN_PROMPT_MESSAGE);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAuthenticated) {
      promptSignIn();
      return;
    }

    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const comment = await commentService.createComment(postId, newComment);
      setComments([comment, ...comments]);
      setNewComment('');
      showToast('Comment posted successfully!', 'success');
    } catch (error) {
      showToast(
        getCommentRequestErrorMessage(error, 'Failed to post comment'),
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;

    try {
      await commentService.deleteComment(commentId);
      setComments(comments.filter(c => c._id !== commentId));
      showToast('Comment deleted successfully', 'success');
    } catch (error) {
      showToast(
        getCommentRequestErrorMessage(error, 'Failed to delete comment'),
        'error'
      );
    }
  };

  const handleLike = async (commentId) => {
    if (!isAuthenticated) {
      showLoginPrompt('Sign in to like comments');
      return;
    }

    try {
      const updatedComment = await commentService.likeComment(commentId);
      setComments(comments.map(c =>
        c._id === commentId ? updatedComment : c
      ));
    } catch (error) {
      showToast(
        getCommentRequestErrorMessage(error, 'Failed to like comment'),
        'error'
      );
    }
  };

  const header = unified ? null : (
    <h3
      className={`font-bold mb-4 ${embedded ? 'text-xl' : 'text-2xl'}`}
      style={{ color: 'var(--text-primary)' }}
    >
      {embedded ? 'Comments' : 'Discussion'}
      {!embedded && ` (${comments.length})`}
      {embedded && comments.length > 0 ? ` (${comments.length})` : ''}
    </h3>
  );

  const unifiedLabel = unified ? (
    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
      Comment{comments.length > 0 ? ` · ${comments.length}` : ''}
    </p>
  ) : null;

  const form = isAuthenticated ? (
    <form onSubmit={handleSubmit} className={embedded ? 'mb-6' : 'mb-8'}>
      <textarea
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        placeholder="Share your thoughts..."
        rows={embedded ? 3 : 4}
        maxLength={500}
        className="w-full px-4 py-3 rounded-xl outline-none resize-none mb-3 text-sm sm:text-base"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      />
      <div className="flex justify-between items-center gap-3">
        <span className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {newComment.length}/500
        </span>
        <button
          type="submit"
          disabled={submitting || !newComment.trim()}
          className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl text-sm font-semibold transition hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--accent-green)',
            color: 'white',
          }}
        >
          {submitting ? 'Posting...' : 'Post comment'}
        </button>
      </div>
    </form>
  ) : (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl px-4 py-3 ${embedded ? 'mb-6' : 'mb-8'}`}
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Sign in to join the discussion
      </p>
      <button
        type="button"
        onClick={promptSignIn}
        className="inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-90"
        style={{
          backgroundColor: 'var(--surface-hover)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        <Lock className="h-4 w-4" aria-hidden />
        Sign in to comment
      </button>
    </div>
  );

  const emptyState = embedded ? (
    <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
      No comments yet.
    </p>
  ) : (
    <div className="text-center py-12">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{ backgroundColor: 'var(--surface-hover)' }}
      >
        <MessageSquare className="h-8 w-8" style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        No comments yet
      </h4>
      <p style={{ color: 'var(--text-secondary)' }}>
        Be the first to share your thoughts on this post.
      </p>
    </div>
  );

  const list = (
    <div className="space-y-5 sm:space-y-6">
      {comments.map((comment) => (
        <Comment
          key={comment._id}
          comment={comment}
          user={user}
          isAuthenticated={isAuthenticated}
          onReply={(id) => setReplyTo(id)}
          onDelete={handleDelete}
          onLike={handleLike}
        />
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div>
        {header}
        {unifiedLabel}
        {form}
        {comments.length === 0 ? emptyState : list}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-6 sm:p-8 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      {header}
      {form}
      {comments.length === 0 ? emptyState : list}
    </div>
  );
};

const Comment = ({ comment, user, isAuthenticated, onReply, onDelete, onLike, isReply = false }) => {
  return (
    <div className={`flex gap-4 ${isReply ? 'ml-12' : ''}`}>
      <img
        src={comment.user?.avatar || getBestAvatar(comment.user || { userName: comment.userName }, {}, 'travel')}
        alt={comment.userName}
        className="w-10 h-10 rounded-full flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl p-4"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {comment.userName}
            </h4>
            <button className="p-1 rounded-lg hover:bg-white/5">
              <MoreVertical className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
          <p className="text-sm mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            {comment.content}
          </p>
          <div className="flex items-center gap-4 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
            <button 
              onClick={() => onLike(comment._id)}
              className={`flex items-center gap-1 hover:text-purple-400 transition ${
                comment.likes?.includes(user?._id) ? 'text-purple-400' : ''
              }`}
            >
              <ThumbsUp className="h-3 w-3" />
              {comment.likes?.length > 0 && <span>{comment.likes.length}</span>}
            </button>
            {!isReply && (
              <button
                onClick={() => onReply(comment._id)}
                className="flex items-center gap-1 hover:text-purple-400 transition"
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
            {(user?._id === comment.user?._id || user?.role === 'admin') && (
              <button
                onClick={() => onDelete(comment._id)}
                className="flex items-center gap-1 hover:text-red-400 transition"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-4 space-y-4">
            {comment.replies.map((reply) => (
              <Comment 
                key={reply._id} 
                comment={reply} 
                user={user}
                isAuthenticated={isAuthenticated}
                onReply={onReply}
                onDelete={onDelete}
                onLike={onLike}
                isReply 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentSection;
