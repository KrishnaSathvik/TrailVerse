import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';
import SimpleRichTextEditor from '../../components/SimpleRichTextEditor';
import TableOfContents from '../../components/blog/TableOfContents';
import {
  ArrowLeft, Save, Eye, Image, Calendar, Tag,
  Upload, X, Plus, AlignLeft, Type, FileText
} from '@components/icons';

const CreateBlogPage = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    category: '',
    tags: [],
    featuredImage: '',
    featured: false,
    status: 'draft',
    publishDate: new Date().toISOString().split('T')[0],
    scheduledAt: '',
    isScheduled: false
  });

  const [newTag, setNewTag] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = [
    'Hiking',
    'Photography',
    'Wildlife',
    'Travel Tips',
    'Park Guides',
    'Camping',
    'History',
    'Conservation',
    'Fall Travel Blog',
    'Travel Blogs'
  ];

  // No need for auth check since AdminRoute handles it

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-generate slug from title
    if (name === 'title') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setFormData(prev => ({ ...prev, featuredImage: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (status) => {
    if (!formData.title.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    if (!formData.excerpt.trim()) {
      showToast('Please enter an excerpt', 'error');
      return;
    }

    if (formData.excerpt.length > 300) {
      showToast('Excerpt cannot be more than 300 characters', 'error');
      return;
    }

    if (!formData.content.trim()) {
      showToast('Please enter content', 'error');
      return;
    }

    setLoading(true);

    try {
      // Handle scheduling logic
      let finalStatus = status;
      let scheduledAt = null;

      if (formData.isScheduled && formData.scheduledAt) {
        const scheduledDate = new Date(formData.scheduledAt);
        const now = new Date();
        
        if (scheduledDate > now) {
          finalStatus = 'scheduled';
          scheduledAt = formData.scheduledAt;
        } else {
          showToast('Scheduled time must be in the future', 'error');
          setLoading(false);
          return;
        }
      }

      // Save blog post - only send required fields to backend
      const postData = {
        title: formData.title.trim(),
        excerpt: formData.excerpt.trim(),
        content: formData.content.trim(),
        category: formData.category ? formData.category.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Park Guides',
        tags: formData.tags,
        featuredImage: formData.featuredImage || null,
        featured: formData.featured,
        author: 'Admin',
        status: finalStatus,
        scheduledAt
      };

      console.log('📝 Frontend: Creating blog post with data:', postData);
      
      // Log request size
      const requestSize = JSON.stringify(postData).length;
      console.log(`📊 Frontend request size: ${requestSize} bytes (${(requestSize / 1024).toFixed(2)} KB)`);
      
      await blogService.createPost(postData);
      
      let successMessage;
      if (finalStatus === 'scheduled') {
        successMessage = `Post scheduled for ${new Date(scheduledAt).toLocaleString()}!`;
      } else if (finalStatus === 'published') {
        successMessage = 'Post published successfully!';
      } else {
        successMessage = 'Draft saved!';
      }
      
      showToast(successMessage, 'success');

      navigate('/admin');
    } catch (error) {
      console.error('Error creating post:', error);
      showToast('Failed to create post', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', overflow: 'visible' }}>
      {/* Hero Section */}
      <section className="relative py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <FileText className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Create New Post
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Create New Post
              </h1>
              <p className="text-lg sm:text-xl max-w-3xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                Share your TrailVerse stories, park guides, and travel insights with the community. 
                Create engaging content that inspires adventure.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate('/admin')}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 hover:shadow-md whitespace-nowrap"
                style={{
                  backgroundColor: 'white',
                  borderWidth: '1px',
                  borderColor: '#e5e7eb',
                  color: '#374151',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                }}
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </button>
              <button
                onClick={() => handleSubmit('draft')}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 hover:shadow-md disabled:opacity-50 whitespace-nowrap"
                style={{
                  backgroundColor: 'white',
                  borderWidth: '1px',
                  borderColor: '#e5e7eb',
                  color: '#374151',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                }}
              >
                <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Save Draft</span>
                <span className="sm:hidden">Draft</span>
              </button>
              {formData.isScheduled ? (
                <button
                  onClick={() => handleSubmit('scheduled')}
                  disabled={loading || !formData.scheduledAt}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 hover:shadow-md disabled:opacity-50 whitespace-nowrap"
                  style={{
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                  }}
                >
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                  Schedule
                </button>
              ) : (
                <button
                  onClick={() => handleSubmit('published')}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 hover:shadow-md disabled:opacity-50 whitespace-nowrap"
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                  }}
                >
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                  Publish
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24" style={{ overflow: 'visible' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ overflow: 'visible' }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6" style={{ overflow: 'visible' }}>
            {/* Title */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Type className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Post Title
                </label>
              </div>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter your blog post title..."
                className="w-full px-4 py-3 rounded-xl text-2xl font-bold outline-none transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              
              {/* Slug */}
              <div className="mt-4">
                <label className="text-xs font-medium mb-2 block"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  URL Slug: /{formData.slug || 'post-slug'}
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder="post-slug"
                  className="w-full px-4 py-2 rounded-lg text-sm outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>

            {/* Excerpt */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <AlignLeft className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Excerpt
                </label>
              </div>
              <textarea
                name="excerpt"
                value={formData.excerpt}
                onChange={handleChange}
                rows={3}
                placeholder="Brief summary of your post (appears in previews)..."
                className="w-full px-4 py-3 rounded-xl outline-none resize-none transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              <p className="mt-2 text-xs"
                style={{ color: formData.excerpt.length > 300 ? 'var(--error)' : 'var(--text-tertiary)' }}
              >
                {formData.excerpt.length} / 300 characters
              </p>
            </div>

            {/* Table of Contents Preview */}
            {formData.content && (
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <TableOfContents 
                  content={formData.content}
                  onContentUpdate={(updatedContent) => {
                    setFormData(prev => ({ ...prev, content: updatedContent }));
                  }}
                />
              </div>
            )}

            {/* Content */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                overflow: 'visible'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <AlignLeft className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Content
                </label>
              </div>
              <SimpleRichTextEditor
                value={formData.content}
                onChange={(content) => {
                  setFormData(prev => ({ ...prev, content }));
                }}
                placeholder="Write your blog post content here... Use the toolbar above to format your text with bold, italic, lists, links, and more! Use the dropdown to select headings."
              />
              <p className="mt-2 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {formData.content ? formData.content.replace(/[#*`_~[\]()]/g, '').split(' ').filter(w => w.trim()).length : 0} words
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Featured Image */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Image className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Featured Image
                </label>
              </div>

              {imagePreview ? (
                <div className="relative group">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <button
                    onClick={() => {
                      setImagePreview(null);
                      setFormData(prev => ({ ...prev, featuredImage: '' }));
                    }}
                    className="absolute top-2 right-2 p-2 rounded-xl font-semibold opacity-0 group-hover:opacity-100 transition"
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white'
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-xl cursor-pointer hover:bg-white/5 transition"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Upload className="h-8 w-8 mb-2" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Click to upload image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Category */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Tag className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Category
                </label>
              </div>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl outline-none transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="">Select a category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Tag className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Tags
                </label>
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="flex-1 px-4 py-2 rounded-xl text-sm outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button
                  onClick={handleAddTag}
                  className="px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md"
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {formData.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-400 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Publishing Options */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Calendar className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Publishing Options
                </label>
              </div>
              
              {/* Schedule Toggle */}
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="isScheduled"
                  checked={formData.isScheduled}
                  onChange={(e) => setFormData(prev => ({ ...prev, isScheduled: e.target.checked }))}
                  className="w-4 h-4 rounded border-2 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isScheduled" className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Schedule for later publication
                </label>
              </div>

              {formData.isScheduled ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-2"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="scheduledAt"
                      value={formData.scheduledAt}
                      onChange={handleChange}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-4 py-3 rounded-xl outline-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                  <p className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    The post will be automatically published at the scheduled time.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-2"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Publish Date (for immediate publishing)
                  </label>
                  <input
                    type="date"
                    name="publishDate"
                    value={formData.publishDate}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Featured Post */}
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex items-center gap-2 mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Tag className="h-5 w-5" />
                <label className="text-sm font-semibold uppercase tracking-wider">
                  Featured Post
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="featured"
                  name="featured"
                  checked={formData.featured}
                  onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
                  className="w-4 h-4 rounded border-2 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="featured" className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mark this post as featured (will appear in Featured Stories section)
                </label>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CreateBlogPage;
