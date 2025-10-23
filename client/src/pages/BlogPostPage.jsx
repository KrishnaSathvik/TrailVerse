import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../components/common/Header';
import SEO from '../components/common/SEO';
import CommentSection from '../components/blog/CommentSection';
import LikeFavorite from '../components/blog/LikeFavorite';
import ShareButtons from '../components/common/ShareButtons';
import RelatedPosts from '../components/blog/RelatedPosts';
import { useAuth } from '../context/AuthContext';
import blogService from '../services/blogService';
import { logBlogView } from '../utils/analytics';
import { Calendar, Clock, Eye, ArrowLeft } from '@components/icons';
import '../styles/blog-prose.css';

const BlogPostPage = ({ isPublic = false }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Determine if this is a public access (not authenticated)
  const isPublicAccess = isPublic || !isAuthenticated;

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const data = await blogService.getPostBySlug(slug);
        setPost(data);
        
        // Track blog view
        if (data) {
          logBlogView(data.title, data._id, data.category || 'general');
        }
      } catch (error) {
        console.error('Error fetching post:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-green)' }}></div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="text-center py-12">
          <p style={{ color: 'var(--text-secondary)' }}>Blog post not found</p>
          <Link to="/blog" className="mt-4 inline-block transition" style={{ color: 'var(--accent-green)' }} onMouseEnter={(e) => e.target.style.opacity = '0.8'} onMouseLeave={(e) => e.target.style.opacity = '1'}>
            ← Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleTagClick = (tag) => {
    // Navigate to blog page with tag filter
    navigate(`/blog?tag=${encodeURIComponent(tag)}`);
  };

  const blogStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.featuredImage,
    author: {
      '@type': 'Person',
      name: post.author
    },
    publisher: {
      '@type': 'Organization',
      name: 'TrailVerse',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.nationalparksexplorerusa.com/logo.png'
      }
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.nationalparksexplorerusa.com/blog/${post.slug}`
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Public Access Banner */}
      {isPublicAccess && (
        <div className="bg-blue-600 text-white py-2 px-4 text-center">
          <p className="text-sm">
            You're viewing a blog post. You can like and comment below!
            <button 
              onClick={() => navigate('/login')}
              className="underline hover:no-underline ml-1 font-semibold"
            >
              Login
            </button>
            {' '}to save your favorites and access all features.
          </p>
        </div>
      )}
      
      <SEO
        title={post.title}
        description={post.excerpt}
        keywords={post.tags?.join(', ')}
        url={`https://www.nationalparksexplorerusa.com/blog/${post.slug}`}
        image={post.featuredImage}
        type="article"
        author={post.author}
        published={post.publishedAt}
        modified={post.updatedAt}
      />

      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(blogStructuredData)}
        </script>
      </Helmet>

      <Header />

      <article className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button - Only show for authenticated users */}
        {!isPublicAccess && (
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 mb-6 transition"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        )}

        {/* Category Badge */}
        <div className="mb-4">
          <span 
            className="inline-block px-4 py-1 rounded-full text-sm font-semibold"
            style={{ 
              backgroundColor: 'var(--accent-green)',
              color: 'white'
            }}
          >
            {post.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center justify-between text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-medium">By {post.author}</span>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(post.publishedAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{post.readTime} min read</span>
            </div>
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{post.views} views</span>
            </div>
          </div>
          <ShareButtons 
            url={window.location.href}
            title={post.title}
            description={post.excerpt}
          />
        </div>

        {/* Featured Image */}
        {post.featuredImage && (
          <img
            src={post.featuredImage}
            alt={post.title}
            className="w-full h-96 object-cover rounded-xl mb-8"
          />
        )}

        {/* Content */}
        <div 
          className="blog-prose max-w-none"
          style={{ color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Like and Favorite Buttons */}
        <LikeFavorite post={post} onUpdate={setPost} isPublic={isPublicAccess} />

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-8 pt-8 pb-8" style={{ borderTop: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Tags:</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <button
                  key={index}
                  onClick={() => handleTagClick(tag)}
                  className="px-3 py-1 rounded-full text-sm transition-colors cursor-pointer"
                  style={{ 
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'var(--surface-hover)';
                    e.target.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'var(--surface)';
                    e.target.style.color = 'var(--text-secondary)';
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-12">
          <CommentSection blogId={post._id} isPublic={isPublicAccess} />
        </div>

        {/* Related Posts */}
        <RelatedPosts 
          currentPostId={post._id} 
          category={post.category} 
          tags={post.tags || []} 
          isPublic={isPublicAccess}
        />
      </article>
    </div>
  );
};

export default BlogPostPage;
