import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import commentService, { getCommentRequestErrorMessage } from '../../services/commentService';
import { getBestAvatar } from '../../utils/avatarGenerator';
import { ThumbsUp, Reply, Trash2, MessageSquare, Lock, X } from '@components/icons';

const LOGIN_PROMPT_MESSAGE = 'Sign in to post a comment';

function currentUserId(user) {
  return user?._id || user?.id || null;
}

function userLikedComment(comment, user) {
  const uid = String(currentUserId(user) || '');
  if (!uid) return false;
  return (comment.likes || []).some((id) => String(id) === uid);
}

function updateCommentTree(comments, commentId, updater) {
  return comments.map((comment) => {
    if (String(comment._id) === String(commentId)) {
      return updater(comment);
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: updateCommentTree(comment.replies, commentId, updater),
      };
    }
    return comment;
  });
}

function removeFromCommentTree(comments, commentId) {
  return comments
    .filter((c) => String(c._id) !== String(commentId))
    .map((c) => ({
      ...c,
      replies: c.replies ? removeFromCommentTree(c.replies, commentId) : [],
    }));
}

const CommentSection = ({
  postId,
  comments: initialComments = [],
  embedded = false,
  unified = false,
}) => {
  const { user, isAuthenticated, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, userName }
  const [submitting, setSubmitting] = useState(false);
  const replyTextareaRef = useRef(null);

  useEffect(() => {
    if (!initialComments.length && postId) {
      fetchComments();
    }
  }, [postId, initialComments.length]);

  useEffect(() => {
    if (replyTo && replyTextareaRef.current) {
      replyTextareaRef.current.focus();
    }
  }, [replyTo]);

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

  const promptSignIn = (message = LOGIN_PROMPT_MESSAGE) => {
    showLoginPrompt(message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAuthenticated) {
      promptSignIn();
      return;
    }

    const content = newComment.trim();
    if (!content) return;

    setSubmitting(true);
    try {
      const comment = await commentService.createComment(
        postId,
        content,
        replyTo?.id || null
      );

      if (replyTo?.id) {
        setComments((prev) =>
          updateCommentTree(prev, replyTo.id, (parent) => ({
            ...parent,
            replies: [...(parent.replies || []), { ...comment, replies: [] }],
          }))
        );
        setReplyTo(null);
      } else {
        setComments((prev) => [{ ...comment, replies: [] }, ...prev]);
      }

      setNewComment('');
      showToast(replyTo ? 'Reply posted!' : 'Comment posted successfully!', 'success');
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
      setComments((prev) => removeFromCommentTree(prev, commentId));
      if (replyTo && String(replyTo.id) === String(commentId)) {
        setReplyTo(null);
      }
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
      promptSignIn('Sign in to like comments');
      return;
    }

    try {
      const updatedComment = await commentService.likeComment(commentId);
      setComments((prev) =>
        updateCommentTree(prev, commentId, (existing) => ({
          ...existing,
          ...updatedComment,
          replies: updatedComment.replies?.length
            ? updatedComment.replies
            : existing.replies || [],
        }))
      );
    } catch (error) {
      showToast(
        getCommentRequestErrorMessage(error, 'Failed to like comment'),
        'error'
      );
    }
  };

  const startReply = (comment) => {
    if (!isAuthenticated) {
      promptSignIn('Sign in to reply');
      return;
    }
    setReplyTo({ id: comment._id, userName: comment.userName });
  };

  const cancelReply = () => setReplyTo(null);

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
      {replyTo && (
        <div
          className="mb-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            Replying to <strong style={{ color: 'var(--text-primary)' }}>{replyTo.userName}</strong>
          </span>
          <button
            type="button"
            onClick={cancelReply}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:opacity-80"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      )}
      <textarea
        ref={replyTextareaRef}
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        placeholder={replyTo ? `Reply to ${replyTo.userName}…` : 'Share your thoughts...'}
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
          {submitting ? 'Posting...' : replyTo ? 'Post reply' : 'Post comment'}
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
        onClick={() => promptSignIn()}
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
          onReply={startReply}
          onDelete={handleDelete}
          onLike={handleLike}
          activeReplyId={replyTo?.id}
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

const Comment = ({
  comment,
  user,
  onReply,
  onDelete,
  onLike,
  isReply = false,
  activeReplyId = null,
}) => {
  const liked = userLikedComment(comment, user);
  const canDelete =
    String(currentUserId(user) || '') === String(comment.user?._id || comment.user || '') ||
    user?.role === 'admin';
  const isActiveReplyTarget = activeReplyId && String(activeReplyId) === String(comment._id);

  return (
    <div className={`flex gap-2.5 sm:gap-4 ${isReply ? 'ml-3 sm:ml-8 pl-3 sm:pl-4 border-l-2' : ''}`}
      style={isReply ? { borderColor: 'var(--border)' } : undefined}
    >
      <img
        src={comment.user?.avatar || getBestAvatar(comment.user || { userName: comment.userName }, {}, 'travel')}
        alt={comment.userName}
        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div
          className="rounded-2xl p-3 sm:p-4"
          style={{
            backgroundColor: isActiveReplyTarget
              ? 'color-mix(in srgb, var(--accent-green) 8%, var(--surface-hover))'
              : 'var(--surface-hover)',
            borderWidth: '1px',
            borderColor: isActiveReplyTarget
              ? 'color-mix(in srgb, var(--accent-green) 35%, var(--border))'
              : 'var(--border)',
          }}
        >
          <h4 className="font-semibold mb-2 text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
            {comment.userName}
          </h4>
          <p className="text-sm mb-3 break-words" style={{ color: 'var(--text-secondary)' }}>
            {comment.content}
          </p>
          <div
            className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span className="pr-2 tabular-nums">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>

            <button
              type="button"
              onClick={() => onLike(comment._id)}
              aria-pressed={liked}
              aria-label={liked ? 'Unlike comment' : 'Like comment'}
              className="inline-flex items-center gap-1 min-h-9 min-w-9 px-2 rounded-lg transition hover:opacity-80"
              style={{ color: liked ? 'var(--accent-green)' : 'var(--text-tertiary)' }}
            >
              <ThumbsUp className="h-4 w-4" weight={liked ? 'fill' : 'regular'} />
              {(comment.likes?.length > 0) && <span>{comment.likes.length}</span>}
            </button>

            {!isReply && (
              <button
                type="button"
                onClick={() => onReply(comment)}
                aria-label={`Reply to ${comment.userName}`}
                className="inline-flex items-center gap-1.5 min-h-9 px-2 rounded-lg transition hover:opacity-80"
                style={{ color: isActiveReplyTarget ? 'var(--accent-green)' : 'var(--text-tertiary)' }}
              >
                <Reply className="h-4 w-4" />
                <span>Reply</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment._id)}
                aria-label="Delete comment"
                className="inline-flex items-center gap-1.5 min-h-9 px-2 rounded-lg transition hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </div>
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
            {comment.replies.map((reply) => (
              <Comment
                key={reply._id}
                comment={reply}
                user={user}
                onReply={onReply}
                onDelete={onDelete}
                onLike={onLike}
                isReply
                activeReplyId={activeReplyId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentSection;
