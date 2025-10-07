import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';
import {
  ArrowLeft, Save, Eye, Image, Calendar, Tag,
  Upload, X, Plus, AlignLeft, Type, Link as LinkIcon
} from 'lucide-react';

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
    status: 'draft',
    publishDate: new Date().toISOString().split('T')[0]
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
    'Conservation'
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

    if (!formData.content.trim()) {
      showToast('Please enter content', 'error');
      return;
    }

    setLoading(true);

    try {
      // Save blog post
      const postData = {
        ...formData,
        status,
        author: 'Admin',
        createdAt: new Date().toISOString()
      };

      await blogService.createPost(postData);
      
      showToast(
        status === 'published' ? 'Post published successfully!' : 'Draft saved!',
        'success'
      );

      navigate('/admin');
    } catch (error) {
      console.error('Error creating post:', error);
      showToast('Failed to create post', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition hover:bg-white/5"
              style={{ color: 'var(--text-primary)' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSubmit('draft')}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              <button
                onClick={() => handleSubmit('published')}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-forest-500 hover:bg-forest-600 text-white font-semibold transition disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
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
                style={{ color: 'var(--text-tertiary)' }}
              >
                {formData.excerpt.length} / 200 characters
              </p>
            </div>

            {/* Content */}
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
                  Content
                </label>
              </div>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleChange}
                rows={20}
                placeholder="Write your blog post content here... (Markdown supported)"
                className="w-full px-4 py-3 rounded-xl outline-none resize-none font-mono text-sm transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              <p className="mt-2 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {formData.content.split(' ').filter(w => w).length} words
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
                    className="absolute top-2 right-2 p-2 rounded-lg bg-red-500 text-white opacity-0 group-hover:opacity-100 transition"
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
                  <option key={cat} value={cat.toLowerCase()}>
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
                  className="flex-1 px-4 py-2 rounded-lg text-sm outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button
                  onClick={handleAddTag}
                  className="px-4 py-2 rounded-lg bg-forest-500 hover:bg-forest-600 text-white transition"
                >
                  <Plus className="h-4 w-4" />
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

            {/* Publish Date */}
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
                  Publish Date
                </label>
              </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateBlogPage;
