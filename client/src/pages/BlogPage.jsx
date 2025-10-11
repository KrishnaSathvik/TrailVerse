import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, X, Clock, TrendingUp, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import BlogCard from '../components/blog/BlogCard';
import Button from '../components/common/Button';
import blogService from '../services/blogService';

const BlogPage = () => {
  const _navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  
  // Responsive posts per page: 3 on mobile, 6 on desktop
  const [postsPerPage, setPostsPerPage] = useState(6); // Default to desktop

  // Handle responsive posts per page
  useEffect(() => {
    const updatePostsPerPage = () => {
      if (window.innerWidth < 768) { // Mobile
        setPostsPerPage(3);
      } else { // Desktop
        setPostsPerPage(8);
      }
    };

    // Set initial value
    updatePostsPerPage();

    // Listen for resize events
    window.addEventListener('resize', updatePostsPerPage);
    
    return () => window.removeEventListener('resize', updatePostsPerPage);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Clear cache to ensure fresh data
        blogService.clearBlogCache();
        
        // Fetch categories
        const categoriesData = await blogService.getBlogCategories();
        console.log('📊 Categories data:', categoriesData);
        console.log('📊 Total count from API:', categoriesData.totalCount);
        
        const formattedCategories = [
          { id: 'all', label: 'All Posts', count: categoriesData.totalCount || 0 },
          ...(categoriesData.data || []).map(cat => ({
            id: cat._id,
            label: cat._id,
            count: cat.count
          }))
        ];
        setCategories(formattedCategories);

        // Fetch featured posts (posts marked as featured)
        const featuredData = await blogService.getFeaturedPosts(3);
        console.log('📊 Featured data:', featuredData);
        setFeaturedPosts(featuredData.data || []);

        // Fetch popular posts (sorted by views)
        const popularData = await blogService.getAllPosts({ limit: 5, page: 1, sortBy: 'views' });
        console.log('📊 Popular data:', popularData);
        setPopularPosts(popularData.data || []);

        // Fetch main posts
        const params = {
          page: currentPage,
          limit: postsPerPage
        };
        console.log('📊 Posts per page:', postsPerPage, 'Current page:', currentPage);
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (searchTerm) params.search = searchTerm;
        if (selectedTag) params.tag = selectedTag;

        const data = await blogService.getAllPosts(params);
        console.log('📊 Main posts data:', data);
        setPosts(data.data || []);
        setTotalPages(data.pages || 1);
      } catch (error) {
        console.error('Error fetching blog data:', error);
        setError('Failed to load blog posts. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage, selectedCategory, searchTerm, selectedTag, postsPerPage]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };


  const clearTagFilter = () => {
    setSelectedTag('');
    setCurrentPage(1);
    setSearchParams({});
  };

  if (loading && currentPage === 1) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="National Parks Blog - Expert Travel Guides & Adventure Tips"
        description="Read expert guides, travel tips, and adventure stories about America's National Parks. Get insider knowledge for your next park visit."
        keywords="national parks blog, park travel guides, hiking tips, camping guides, national park stories, outdoor adventure blog"
        url="https://www.nationalparksexplorerusa.com/blog"
        type="website"
      />
      
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="mt-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Stories & Guides
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Travel Journal
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Expert guides, travel tips, and inspiring stories from America&apos;s national parks. 
              Plan smarter and explore deeper.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mt-8 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search articles..."
                className="w-full pl-14 pr-14 py-4 rounded-2xl text-base font-medium outline-none transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              {searchTerm && (
                <Button
                  onClick={() => setSearchTerm('')}
                  variant="ghost"
                  size="sm"
                  icon={X}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--text-tertiary)' }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {!searchTerm && selectedCategory === 'all' && featuredPosts.length > 0 && (
        <section className="pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5" style={{ color: 'var(--accent-blue)' }} />
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Featured Stories
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredPosts.map((post) => (
                <FeaturedPostCard key={post._id} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Popular Posts - Horizontal Section */}
      {!searchTerm && selectedCategory === 'all' && popularPosts.length > 0 && (
        <section className="pb-16" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-2 mb-4">
                <TrendingUp className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                <h2 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Popular Posts
                </h2>
              </div>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                Discover our most-read stories and trending content
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {popularPosts.slice(0, 3).map((post, index) => (
                <Link
                  key={post._id}
                  to={`/blog/${post.slug}`}
                  className="group block"
                >
                  <div className="rounded-2xl overflow-hidden transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    {/* Popular Badge */}
                    <div className="relative">
                      <OptimizedImage
                        src={post.featuredImage}
                        alt={post.title}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-4 left-4">
                        <div className="flex items-center gap-1 px-3 py-1 rounded-full backdrop-blur"
                          style={{ backgroundColor: 'var(--accent-green)' }}
                        >
                          <TrendingUp className="h-3 w-3 text-white" />
                          <span className="text-xs font-semibold text-white">#{index + 1}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <h3 className="text-lg font-semibold mb-3 line-clamp-2 group-hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {post.title}
                      </h3>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Eye className="h-4 w-4" />
                          <span>{post.views.toLocaleString()} views</span>
                        </div>
                        
                        <div className="text-sm font-medium group-hover:opacity-80 transition-opacity"
                          style={{ color: 'var(--accent-green)' }}
                        >
                          Read more →
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Column */}
            <div className="flex-1 min-w-0">
              {/* Category Tabs */}
              <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
                <div className="flex gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      onClick={() => handleCategoryChange(category.id)}
                      variant={selectedCategory === category.id ? 'secondary' : 'ghost'}
                      size="md"
                      className="whitespace-nowrap"
                    >
                      <span className="text-sm">{category.label}</span>
                      <span className="ml-2 text-xs opacity-75">({category.count})</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tag Filter Indicator */}
              {selectedTag && (
                <div className="mb-6 flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Filtered by tag:
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    #{selectedTag}
                  </span>
                  <Button
                    onClick={clearTagFilter}
                    variant="ghost"
                    size="sm"
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear filter
                  </Button>
                </div>
              )}

              {/* Results Count */}
              <div className="mb-6">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {posts.length} {posts.length === 1 ? 'article' : 'articles'} found
                </p>
              </div>

              {/* Error State */}
              {error && (
                <div className="text-center py-24">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                    <X className="h-8 w-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Something went wrong
                  </h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                    {error}
                  </p>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="secondary"
                    size="md"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Posts Grid */}
              {!error && posts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                  {posts.map((post) => (
                    <BlogCard key={post._id} post={post} />
                  ))}
                </div>
              ) : !error ? (
                <div className="text-center py-24">
                  <Search className="h-16 w-16 mx-auto mb-4"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <p className="text-lg font-semibold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No articles found
                  </p>
                  <p className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : null}

              {/* Pagination */}
              {!error && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    variant="secondary"
                    size="sm"
                    icon={ChevronLeft}
                  />

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                        currentPage === page ? 'ring-2' : ''
                      }`}
                      style={{
                        backgroundColor: currentPage === page ? 'var(--surface-active)' : 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: currentPage === page ? 'var(--border-hover)' : 'var(--border)',
                        color: 'var(--text-primary)',
                        boxShadow: currentPage === page ? 'var(--shadow-lg)' : 'var(--shadow)'
                      }}
                    >
                      {page}
                    </button>
                  ))}

                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    variant="secondary"
                    size="sm"
                    icon={ChevronRight}
                  />
                </div>
              )}
            </div>

            {/* Sidebar - Removed Popular Posts, can be used for other content in the future */}
            <aside className="lg:w-96 flex-shrink-0 space-y-6">
              {/* Future sidebar content can go here */}
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

// Featured Post Card Component
const FeaturedPostCard = ({ post }) => {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="relative h-64 overflow-hidden">
        <OptimizedImage
          src={post.featuredImage}
          alt={post.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500 text-white">
            Featured
          </span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 group-hover:text-blue-300 transition">
            {post.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readTime} min
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.views.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default BlogPage;
