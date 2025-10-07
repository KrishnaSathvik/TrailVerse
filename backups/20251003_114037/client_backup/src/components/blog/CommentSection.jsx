import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import commentService from '../../services/commentService';
import { MessageCircle, ThumbsUp, Reply, MoreVertical, Trash2 } from 'lucide-react';

const CommentSection = ({ postId, comments: initialComments = [] }) => {
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(!initialComments.length);
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
      showToast('Failed to load comments', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const comment = await commentService.createComment(postId, newComment);
      setComments([comment, ...comments]);
      setNewComment('');
      showToast('Comment posted successfully!', 'success');
    } catch (error) {
      showToast('Failed to post comment', 'error');
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
      showToast('Failed to delete comment', 'error');
    }
  };

  const handleLike = async (commentId) => {
    try {
      const updatedComment = await commentService.likeComment(commentId);
      setComments(comments.map(c => 
        c._id === commentId ? updatedComment : c
      ));
    } catch (error) {
      showToast('Failed to like comment', 'error');
    }
  };

  return (
    <div className="rounded-2xl p-8 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
        <h3 className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Comments ({comments.length})
        </h3>
      </div>

      {/* Comment Form */}
      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="mb-8">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={4}
            maxLength={500}
            className="w-full px-4 py-3 rounded-xl outline-none resize-none mb-3"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {newComment.length}/500
            </span>
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="px-6 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-8 p-4 rounded-lg text-center"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>Please login to comment</p>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle className="h-12 w-12 mx-auto mb-3"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <p style={{ color: 'var(--text-secondary)' }}>
            No comments yet. Be the first to share your thoughts!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
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
      )}
    </div>
  );
};

const Comment = ({ comment, user, isAuthenticated, onReply, onDelete, onLike, isReply = false }) => {
  return (
    <div className={`flex gap-4 ${isReply ? 'ml-12' : ''}`}>
      <img
        src={comment.user?.avatar || `https://i.pravatar.cc/150?u=${comment.userName}`}
        alt={comment.userName}
        className="w-10 h-10 rounded-full flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="rounded-xl p-4"
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
              disabled={!isAuthenticated}
              className={`flex items-center gap-1 hover:text-blue-400 transition disabled:opacity-50 ${
                comment.likes?.includes(user?._id) ? 'text-blue-400' : ''
              }`}
            >
              <ThumbsUp className="h-3 w-3" />
              {comment.likes?.length > 0 && <span>{comment.likes.length}</span>}
            </button>
            {!isReply && (
              <button
                onClick={() => onReply(comment._id)}
                className="flex items-center gap-1 hover:text-blue-400 transition"
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
