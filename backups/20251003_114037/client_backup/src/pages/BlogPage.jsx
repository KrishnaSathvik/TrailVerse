import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Search, X, Tag, Calendar, Clock, User, ArrowRight,
  TrendingUp, Bookmark, Share2, Eye, ChevronLeft, ChevronRight
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import OptimizedImage from '../components/common/OptimizedImage';
import BlogCard from '../components/blog/BlogCard';
import blogService from '../services/blogService';

const BlogPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const postsPerPage = 9;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch categories
        const categoriesData = await blogService.getBlogCategories();
        const formattedCategories = [
          { id: 'all', label: 'All Posts', count: 0 },
          ...categoriesData.data.map(cat => ({
            id: cat._id,
            label: cat._id,
            count: cat.count
          }))
        ];
        
        // Update all posts count
        const totalCount = categoriesData.data.reduce((sum, cat) => sum + cat.count, 0);
        formattedCategories[0].count = totalCount;
        setCategories(formattedCategories);

        // Fetch featured posts (first 3 posts)
        const featuredData = await blogService.getAllPosts({ limit: 3, page: 1 });
        setFeaturedPosts(featuredData.data);

        // Fetch popular posts (sorted by views)
        const popularData = await blogService.getAllPosts({ limit: 5, page: 1, sortBy: 'views' });
        setPopularPosts(popularData.data);

        // Fetch main posts
        const params = {
          page: currentPage,
          limit: postsPerPage
        };
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (searchTerm) params.search = searchTerm;

        const data = await blogService.getAllPosts(params);
        setPosts(data.data);
        setTotalPages(data.pages);
      } catch (error) {
        console.error('Error fetching blog data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage, selectedCategory, searchTerm]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setCurrentPage(1);
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
              Expert guides, travel tips, and inspiring stories from America's national parks. 
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
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="h-5 w-5" />
                </button>
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
              <TrendingUp className="h-5 w-5 text-blue-400" />
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
                    <button
                      key={category.id}
                      onClick={() => handleCategoryChange(category.id)}
                      className={`px-5 py-2.5 rounded-full font-medium whitespace-nowrap transition ${
                        selectedCategory === category.id
                          ? 'bg-blue-500 text-white'
                          : 'ring-1 hover:bg-white/5'
                      }`}
                      style={
                        selectedCategory !== category.id
                          ? {
                              backgroundColor: 'var(--surface)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-secondary)'
                            }
                          : {}
                      }
                    >
                      <span className="text-sm">{category.label}</span>
                      <span className="ml-2 text-xs opacity-75">({category.count})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Results Count */}
              <div className="mb-6">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {posts.length} {posts.length === 1 ? 'article' : 'articles'} found
                </p>
              </div>

              {/* Posts Grid */}
              {posts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                  {posts.map((post) => (
                    <BlogCard key={post._id} post={post} />
                  ))}
                </div>
              ) : (
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
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-4 py-2 rounded-lg font-medium transition ${
                        currentPage === page
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-white/5'
                      }`}
                      style={
                        currentPage !== page
                          ? {
                              backgroundColor: 'var(--surface)',
                              borderWidth: '1px',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)'
                            }
                          : {}
                      }
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:w-96 flex-shrink-0 space-y-6">
              {/* Popular Posts */}
              {popularPosts.length > 0 && (
                <div className="rounded-2xl p-6 backdrop-blur sticky top-24"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <TrendingUp className="h-5 w-5 text-blue-400" />
                    Popular Posts
                  </h3>
                  <div className="space-y-4">
                    {popularPosts.map((post) => (
                      <Link
                        key={post._id}
                        to={`/blog/${post.slug}`}
                        className="flex gap-3 group"
                      >
                        <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                          <OptimizedImage
                            src={post.featuredImage}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-blue-400 transition"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {post.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-xs"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>{post.views.toLocaleString()} views</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Newsletter CTA */}
              <div className="rounded-2xl p-6 backdrop-blur text-center"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Stay Updated
                </h3>
                <p className="text-sm mb-4"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Get the latest stories, tips, and park news delivered to your inbox
                </p>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full px-4 py-2.5 rounded-xl text-sm mb-3 outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition">
                  Subscribe
                </button>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  Unsubscribe anytime. No spam.
                </p>
              </div>
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
