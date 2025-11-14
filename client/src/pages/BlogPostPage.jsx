import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../components/common/Header';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import CommentSection from '../components/blog/CommentSection';
import LikeFavorite from '../components/blog/LikeFavorite';
import ShareButtons from '../components/common/ShareButtons';
import RelatedPosts from '../components/blog/RelatedPosts';
import TableOfContents from '../components/blog/TableOfContents';
import { useAuth } from '../context/AuthContext';
import blogService from '../services/blogService';
import { logBlogView } from '../utils/analytics';
import { Calendar, Clock, Eye, ArrowLeft } from '@components/icons';
import '../styles/blog-prose.css';

// Component to render TOC after content is rendered (but display it before content)
const TableOfContentsWrapper = ({ content, postId }) => {
  const [headings, setHeadings] = useState([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // First, try to detect headings from HTML string (for faster display)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    const tempHeadings = [];
    const standardHeadings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    standardHeadings.forEach((heading, index) => {
      const text = heading.textContent || heading.innerText;
      if (!text || !text.trim()) return;
      
      const level = parseInt(heading.tagName.charAt(1));
      const sanitizedText = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const id = `heading-${index}-${sanitizedText}`;
      
      tempHeadings.push({
        id: id,
        text: text.trim(),
        level: level
      });
    });
    
    // Also look for all-caps headings in HTML string (for existing posts)
    // Only if we have NO standard headings
    if (standardHeadings.length === 0) {
      const allElements = tempDiv.querySelectorAll('p, div');
      const seenTexts = new Set(tempHeadings.map(h => h.text));
      let headingIndex = tempHeadings.length;
      
      allElements.forEach((element) => {
        // Skip if it's inside a list or table
        let parent = element.parentElement;
        while (parent && parent !== tempDiv) {
          if (parent.tagName === 'LI' || parent.tagName === 'TD' || parent.tagName === 'TH' || parent.tagName === 'UL' || parent.tagName === 'OL') {
            return;
          }
          parent = parent.parentElement;
        }
        
        const text = (element.textContent || element.innerText).trim();
        if (!text || text.length < 5) return;
        if (seenTexts.has(text)) return;
        
        // STRICT: Only all-caps headings
        const isAllCaps = text === text.toUpperCase() && text.length > 5;
        const words = text.split(/\s+/);
        const isShortHeading = words.length <= 12 && text.length < 150;
        
        // Must NOT contain sentence-ending punctuation
        const hasEndingPunctuation = text.includes('.') || text.includes('!') || text.includes('?');
        
        // Remove emojis for cleaner detection
        const textWithoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        const textOnly = textWithoutEmojis.replace(/[^\w\s]/g, '');
        
        // Skip if it contains common sentence words (likely not a heading)
        const hasSentenceWords = text.toLowerCase().includes(' the ') || 
                                 text.toLowerCase().includes(' a ') || 
                                 text.toLowerCase().includes(' an ') ||
                                 text.toLowerCase().includes(' is ') ||
                                 text.toLowerCase().includes(' are ');
        
        // Check if it looks like a heading: all caps, short, no punctuation, not a sentence
        if (isAllCaps && isShortHeading && !hasEndingPunctuation && !hasSentenceWords && 
            textOnly.length >= 5 && words.length >= 2) {
          const sanitizedText = textWithoutEmojis.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const id = `heading-${headingIndex}-${sanitizedText}`;
          
          tempHeadings.push({
            id: id,
            text: textWithoutEmojis,
            level: 2
          });
          headingIndex++;
          seenTexts.add(text);
        }
      });
    }
    
    // If we found headings in HTML, use them immediately
    if (tempHeadings.length > 0) {
      setHeadings(tempHeadings);
      setIsReady(true);
    }

    // Then wait for DOM to be ready and refine detection
    const timer = setTimeout(() => {
      const blogProse = document.querySelector('.blog-prose');
      if (!blogProse) {
        // If still no headings from HTML parsing, keep the ones we found
        if (tempHeadings.length > 0) {
          setHeadings(tempHeadings);
          setIsReady(true);
        }
        return;
      }

      const detectedHeadings = [];

      // Find standard headings in rendered DOM
      const standardHeadings = blogProse.querySelectorAll('h1, h2, h3, h4, h5, h6');
      standardHeadings.forEach((heading, index) => {
        if (!heading.id) {
          const text = heading.textContent || heading.innerText;
          const sanitizedText = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const id = `heading-${index}-${sanitizedText}`;
          heading.id = id;
        }
        
        const text = heading.textContent || heading.innerText;
        const level = parseInt(heading.tagName.charAt(1));
        detectedHeadings.push({
          id: heading.id,
          text: text.trim(),
          level: level
        });
      });

      // If no standard headings, look for all-caps section titles ONLY
      // DO NOT detect bold text in body - only actual section headings
      if (standardHeadings.length === 0) {
        const allElements = blogProse.querySelectorAll('p, div');
        let headingIndex = 0;
        const seenTexts = new Set();
        
        allElements.forEach((element) => {
          // Skip if it's inside a list, table, or other nested structure
          let parent = element.parentElement;
          while (parent && parent !== blogProse) {
            if (parent.tagName === 'LI' || parent.tagName === 'TD' || parent.tagName === 'TH' || 
                parent.tagName === 'UL' || parent.tagName === 'OL' || parent.tagName === 'TABLE') {
              return;
            }
            parent = parent.parentElement;
          }
          
          if (element.id || !element.textContent) return;
          
          const text = element.textContent.trim();
          if (text.length < 5) return;
          
          // Skip if we've already seen this text
          if (seenTexts.has(text)) return;
          
          // STRICT: ONLY detect all-caps standalone section titles
          // Must be: all caps + short + no punctuation + standalone paragraph/div
          const isAllCaps = text === text.toUpperCase() && text.length > 5;
          const words = text.split(/\s+/);
          const isShortHeading = words.length <= 12 && text.length < 150;
          
          // Must NOT contain periods, exclamation marks, or question marks (not a sentence)
          const hasEndingPunctuation = text.includes('.') || text.includes('!') || text.includes('?');
          
          // Must be a standalone paragraph or div (not inline)
          const isStandalone = element.tagName === 'P' || element.tagName === 'DIV';
          
          // Check if it's followed by content (list, another paragraph, etc.) - indicates section heading
          const nextSibling = element.nextElementSibling;
          const hasListAfter = nextSibling && (nextSibling.tagName === 'UL' || nextSibling.tagName === 'OL');
          const hasContentAfter = nextSibling && (nextSibling.tagName === 'P' || nextSibling.tagName === 'DIV');
          
          // Check if previous sibling suggests this is a section break
          const prevSibling = element.previousElementSibling;
          const isAfterParagraph = prevSibling && (prevSibling.tagName === 'P' || prevSibling.tagName === 'DIV');
          
          // Remove emojis for cleaner detection
          const textWithoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
          const textOnly = textWithoutEmojis.replace(/[^\w\s]/g, '');
          
          // Skip if it contains common sentence words (likely not a heading)
          const hasSentenceWords = text.toLowerCase().includes(' the ') || 
                                   text.toLowerCase().includes(' a ') || 
                                   text.toLowerCase().includes(' an ') ||
                                   text.toLowerCase().includes(' is ') ||
                                   text.toLowerCase().includes(' are ') ||
                                   text.toLowerCase().includes(' was ') ||
                                   text.toLowerCase().includes(' were ') ||
                                   text.toLowerCase().includes(' this ') ||
                                   text.toLowerCase().includes(' that ');
          
          // STRICT detection: Only all-caps standalone section titles
          // Must be: all caps + short + no punctuation + standalone + followed by content + not a sentence
          const looksLikeHeading = (
            isAllCaps && 
            isShortHeading && 
            !hasEndingPunctuation &&
            isStandalone &&
            !hasSentenceWords &&
            textOnly.length >= 5 && // At least 5 letters
            words.length >= 2 && // At least 2 words
            (hasListAfter || hasContentAfter || isAfterParagraph) // Has content before/after
          );
          
          if (looksLikeHeading) {
            // Skip if it's just numbers, symbols, or emojis
            if (/^[\d\s\-•]+$/.test(textWithoutEmojis)) return;
            
            const sanitizedText = textWithoutEmojis.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const id = `heading-${headingIndex}-${sanitizedText}`;
            element.id = id;
            
            seenTexts.add(text);
            
            detectedHeadings.push({
              id: id,
              text: textWithoutEmojis || text,
              level: 2 // All-caps headings are typically H2
            });
            headingIndex++;
          }
        });
      }

      // Update with detected headings (prefer DOM detected ones)
      if (detectedHeadings.length > 0) {
        setHeadings(detectedHeadings);
      } else if (tempHeadings.length > 0) {
        // Fallback to HTML parsed headings
        setHeadings(tempHeadings);
      }
      
      setIsReady(true);
      console.log('✅ TableOfContentsWrapper: Detected headings', detectedHeadings.length || tempHeadings.length);
    }, 300); // Shorter delay since we already have HTML parsed headings

    return () => clearTimeout(timer);
  }, [content]);

  // Show TOC immediately if we have headings from HTML parsing, otherwise wait
  if (!isReady && headings.length === 0) return null;
  if (headings.length === 0) return null;

  return (
    <div className="mb-8">
      <TableOfContents headings={headings} />
    </div>
  );
};

const BlogPostPage = ({ isPublic = false }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const articleRef = useRef(null);
  const contentRef = useRef(null);
  
  // Determine if this is a public access (not authenticated)
  const isPublicAccess = isPublic || !isAuthenticated;

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const data = await blogService.getPostBySlug(slug);
        setPost(data);
        
        // Update meta tags immediately after fetching post data
        // This helps platforms that check meta tags early see correct values
        if (data) {
          // Update Open Graph tags immediately via DOM manipulation
          // This runs before React Helmet updates them, helping crawlers see correct tags
          const updateMetaTag = (property, content) => {
            if (!content) return;
            let meta = document.querySelector(`meta[property="${property}"]`);
            if (!meta) {
              meta = document.createElement('meta');
              meta.setAttribute('property', property);
              document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
          };
          
          const updateTwitterTag = (name, content) => {
            if (!content) return;
            let meta = document.querySelector(`meta[name="${name}"]`);
            if (!meta) {
              meta = document.createElement('meta');
              meta.setAttribute('name', name);
              document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
          };
          
          // Get absolute image URL
          const getAbsoluteImageUrl = (imgUrl) => {
            if (!imgUrl || imgUrl.trim() === '') {
              return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
            }
            if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
              return imgUrl;
            }
            if (imgUrl.startsWith('data:')) {
              return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
            }
            const productionBaseUrl = 'https://www.nationalparksexplorerusa.com';
            if (imgUrl.startsWith('/')) {
              return `${productionBaseUrl}${imgUrl}`;
            }
            return `${productionBaseUrl}/${imgUrl}`;
          };
          
          const blogUrl = `https://www.nationalparksexplorerusa.com/blog/${data.slug}`;
          const blogTitle = `${data.title} | TrailVerse`;
          const blogImage = getAbsoluteImageUrl(data.featuredImage);
          
          // Update Open Graph tags immediately
          updateMetaTag('og:type', 'article');
          updateMetaTag('og:url', blogUrl);
          updateMetaTag('og:title', blogTitle);
          updateMetaTag('og:description', data.excerpt || '');
          updateMetaTag('og:image', blogImage);
          
          // Update Twitter tags
          updateTwitterTag('twitter:card', 'summary_large_image');
          updateTwitterTag('twitter:url', blogUrl);
          updateTwitterTag('twitter:title', blogTitle);
          updateTwitterTag('twitter:description', data.excerpt || '');
          updateTwitterTag('twitter:image', blogImage);
          
          // Track blog view
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

  // Reading progress bar
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || !articleRef.current) return;

      const articleTop = articleRef.current.offsetTop;
      const articleHeight = articleRef.current.offsetHeight;
      const windowHeight = window.innerHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      // Calculate reading progress
      const scrollableHeight = articleHeight - windowHeight + articleTop;
      const scrolled = Math.max(0, scrollTop - articleTop);
      const progress = Math.min(100, (scrolled / scrollableHeight) * 100);
      setReadingProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, [post]);

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

  // Helper to get absolute image URL
  const getAbsoluteImageUrl = (imgUrl) => {
    if (!imgUrl || imgUrl.trim() === '') {
      return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
    }
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl;
    }
    if (imgUrl.startsWith('data:')) {
      return 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg';
    }
    const baseUrl = 'https://www.nationalparksexplorerusa.com';
    if (imgUrl.startsWith('/')) {
      return `${baseUrl}${imgUrl}`;
    }
    return `${baseUrl}/${imgUrl}`;
  };

  // Calculate word count from content
  const wordCount = post.content ? post.content.split(/\s+/).filter(word => word.length > 0).length : 0;

  const blogStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.featuredImage ? [
      {
        '@type': 'ImageObject',
        url: getAbsoluteImageUrl(post.featuredImage),
        width: 1200,
        height: 630
      }
    ] : 'https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg',
    author: {
      '@type': 'Person',
      name: post.author || 'TrailVerse Team'
    },
    publisher: {
      '@type': 'Organization',
      name: 'TrailVerse',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.nationalparksexplorerusa.com/logo.png',
        width: 512,
        height: 512
      }
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.nationalparksexplorerusa.com/blog/${post.slug}`
    },
    articleSection: post.category || 'Travel',
    keywords: post.tags && post.tags.length > 0 ? post.tags.join(', ') : undefined,
    wordCount: wordCount,
    inLanguage: 'en-US',
    url: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`
  };

  // Breadcrumb structured data
  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.nationalparksexplorerusa.com'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://www.nationalparksexplorerusa.com/blog'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`
      }
    ]
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
        additionalStructuredData={[blogStructuredData, breadcrumbStructuredData]}
      />

      <Helmet>
        {/* Article tag meta tags for each tag */}
        {post.tags && post.tags.length > 0 && post.tags.map((tag, index) => (
          <meta key={index} property="article:tag" content={tag} />
        ))}
        {/* Dynamic article section based on category */}
        {post.category && (
          <meta property="article:section" content={post.category} />
        )}
      </Helmet>

      <Header />

      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50" style={{ backgroundColor: 'transparent' }}>
        <div
          className="h-full transition-all duration-150 ease-out"
          style={{
            width: `${readingProgress}%`,
            backgroundColor: 'var(--accent-green)',
            boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)'
          }}
        />
      </div>

      <article ref={articleRef} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
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
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight" style={{ color: 'var(--text-primary)' }}>
          {post.title}
        </h1>

        {/* Excerpt/Lead Paragraph */}
        {post.excerpt && (
          <div className="mb-8">
            <p className="text-lg sm:text-xl md:text-2xl leading-relaxed font-medium" style={{ color: 'var(--text-secondary)' }}>
              {post.excerpt}
            </p>
          </div>
        )}

        {/* Meta Info */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm mb-8 pb-6" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>By {post.author}</span>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(post.publishedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{post.readTime} min read</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              <span>{post.views?.toLocaleString() || 0} views</span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <ShareButtons 
              url={`https://www.nationalparksexplorerusa.com/blog/${post.slug}`}
              title={post.title}
              description={post.excerpt}
              image={post.featuredImage}
            />
          </div>
        </div>

        {/* Featured Image */}
        {post.featuredImage && (
          <div className="mb-10 relative">
            <OptimizedImage
              src={post.featuredImage}
              alt={post.title}
              className="w-full aspect-video object-cover rounded-xl shadow-lg"
            />
          </div>
        )}

        {/* Table of Contents - Render BEFORE content so it appears at the beginning */}
        {post.content && (
          <TableOfContentsWrapper content={post.content} postId={post._id} />
        )}

        {/* Content */}
        <div 
          ref={contentRef}
          className="blog-prose max-w-none mb-12"
          style={{ color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Like and Favorite Buttons */}
        <LikeFavorite post={post} onUpdate={setPost} isPublic={isPublicAccess} />

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 pb-8" style={{ borderTop: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <button
                  key={index}
                  onClick={() => handleTagClick(tag)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105"
                  style={{ 
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'var(--surface-hover)';
                    e.target.style.color = 'var(--text-primary)';
                    e.target.style.borderColor = 'var(--accent-green)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'var(--surface)';
                    e.target.style.color = 'var(--text-secondary)';
                    e.target.style.borderColor = 'var(--border)';
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
