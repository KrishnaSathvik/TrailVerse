import React, { useState, useEffect } from 'react';
import { Heart, Bookmark } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';

const LikeFavorite = ({ post, onUpdate, isPublic = false, embedded = false }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (post) {
      if (user) {
        const userId = String(user._id || user.id || '');
        const liked = (post.likes || []).some((id) => String(id) === userId);
        const favorited = (post.favorites || []).some((id) => String(id) === userId);
        setIsLiked(liked);
        setIsFavorited(favorited);
      } else {
        setIsLiked(false);
        setIsFavorited(false);
      }
      setLikesCount(post.likes?.length || 0);
      setFavoritesCount(post.favorites?.length || 0);
    }
  }, [post, user]);

  const handleLike = async () => {
    setLoading(true);
    try {
      const result = await blogService.toggleLike(post._id);
      setIsLiked(result.isLiked);
      setLikesCount(result.likesCount);
      
      if (onUpdate) {
        const userId = String(user?._id || user?.id || '');
        onUpdate({
          ...post,
          likes: result.isLiked 
            ? [...(post.likes || []), userId]
            : (post.likes || []).filter((id) => String(id) !== userId)
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      showToast('Failed to update like', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    setLoading(true);
    try {
      const result = await blogService.toggleFavorite(post._id);
      setIsFavorited(result.isFavorited);
      setFavoritesCount(result.favoritesCount);
      
      if (onUpdate) {
        const userId = String(user?._id || user?.id || '');
        onUpdate({
          ...post,
          favorites: result.isFavorited 
            ? [...(post.favorites || []), userId]
            : (post.favorites || []).filter((id) => String(id) !== userId)
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Failed to update favorite', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Always show likes/comments, but disable interaction for non-logged-in users

  return (
    <div className={`flex items-center gap-2 ${embedded ? '' : 'mb-6'}`}>
      <button
        onClick={handleLike}
        disabled={loading}
        className={`flex items-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
          embedded ? 'px-3 py-2 text-sm' : 'px-6 py-3 rounded-xl font-semibold gap-2'
        }`}
        style={{
          backgroundColor: isLiked ? 'color-mix(in srgb, var(--error-red) 12%, transparent)' : 'transparent',
          color: isLiked ? 'var(--error-red)' : 'var(--text-secondary)',
          border: '1px solid',
          borderColor: isLiked ? 'color-mix(in srgb, var(--error-red) 35%, var(--border))' : 'var(--border)',
        }}
      >
        <Heart
          size={embedded ? 16 : 18}
          weight={isLiked ? 'fill' : 'regular'}
        />
        <span>{likesCount}</span>
        {embedded ? (
          <span>Love</span>
        ) : (
          <span className="hidden sm:inline">
            {likesCount === 1 ? 'Like' : 'Likes'}
          </span>
        )}
      </button>

      <button
        onClick={handleFavorite}
        disabled={loading}
        className={`flex items-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
          embedded ? 'px-3 py-2 text-sm' : 'px-6 py-3 rounded-xl font-semibold gap-2'
        }`}
        style={{
          backgroundColor: isFavorited ? 'color-mix(in srgb, var(--accent-blue) 12%, transparent)' : 'transparent',
          color: isFavorited ? 'var(--accent-blue)' : 'var(--text-secondary)',
          border: '1px solid',
          borderColor: isFavorited ? 'color-mix(in srgb, var(--accent-blue) 35%, var(--border))' : 'var(--border)',
        }}
      >
        <Bookmark
          size={embedded ? 16 : 18}
          weight={isFavorited ? 'fill' : 'regular'}
        />
        <span>{favoritesCount}</span>
        {embedded ? (
          <span>Save</span>
        ) : (
          <span className="hidden sm:inline">
            {favoritesCount === 1 ? 'Favorite' : 'Favorites'}
          </span>
        )}
      </button>
    </div>
  );
};

export default LikeFavorite;
