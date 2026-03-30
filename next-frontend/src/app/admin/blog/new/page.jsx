'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import blogService from '@/services/blogService';
import imageUploadService from '@/services/imageUploadService';
import ModernRichTextEditor from '@components/ModernRichTextEditor';
import TableOfContents from '@components/blog/TableOfContents';
import AdminRoute from '@components/admin/AdminRoute';
import {
  ArrowLeft, Save, Send, Eye, Image as ImageIcon, Calendar, Tag,
  Upload, X, Plus, AlertCircle, Check, Clock
} from '@components/icons';
import '../ModernBlogEditor.css';

const CreateBlogPage = () => {
  const { showToast } = useToast();
  const router = useRouter();

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
    scheduledAt: '',
    isScheduled: false
  });

  const [newTag, setNewTag] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState({});

  const categories = [
    'Hiking', 'Photography', 'Wildlife', 'Travel Tips', 'Park Guides',
    'Camping', 'History', 'Conservation', 'Fall Travel Blog', 'Travel Blogs'
  ];

  // Auto-save draft functionality
  useEffect(() => {
    if (!formData.title && !formData.content) return;

    const autoSaveTimer = setTimeout(() => {
      handleAutoSave();
    }, 30000); // Auto-save every 30 seconds

    return () => clearTimeout(autoSaveTimer);
  }, [formData]);

  // Update word count
  useEffect(() => {
    if (formData.content) {
      const text = formData.content.replace(/<[^>]*>/g, '');
      const words = text.split(/\s+/).filter(Boolean).length;
      setWordCount(words);
    } else {
      setWordCount(0);
    }
  }, [formData.content]);

  const handleAutoSave = async () => {
    if (!formData.title || !formData.content) return;

    setAutoSaving(true);
    try {
      // Save to localStorage as backup
      localStorage.setItem('blog_draft', JSON.stringify(formData));
      setLastSaved(new Date());
      setTimeout(() => setAutoSaving(false), 1000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Auto-generate slug from title
    if (name === 'title') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }

    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleContentChange = (content) => {
    setFormData(prev => ({ ...prev, content }));

    if (validationErrors.content) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.content;
        return newErrors;
      });
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

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      imageUploadService.validateImageFile(file);
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }

    setUploadingImage(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Upload image
      const uploadedImage = await imageUploadService.uploadSingleImage(file, {
        category: 'blog',
        isPublic: true
      });

      const imageUrl = uploadedImage.url;
      setFormData(prev => ({ ...prev, featuredImage: imageUrl }));
      setImagePreview(imageUrl);

      showToast('Featured image uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast(error.message || 'Failed to upload image', 'error');
      setImagePreview(null);
      setFormData(prev => ({ ...prev, featuredImage: '' }));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, featuredImage: '' }));
    setImagePreview(null);
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }

    if (!formData.excerpt.trim()) {
      errors.excerpt = 'Excerpt is required';
    } else if (formData.excerpt.length > 300) {
      errors.excerpt = 'Excerpt cannot exceed 300 characters';
    }

    if (!formData.content.trim()) {
      errors.content = 'Content is required';
    }

    if (!formData.category) {
      errors.category = 'Please select a category';
    }

    if (formData.isScheduled && !formData.scheduledAt) {
      errors.scheduledAt = 'Please select a scheduled date and time';
    }

    if (formData.isScheduled && formData.scheduledAt) {
      const scheduledDate = new Date(formData.scheduledAt);
      if (scheduledDate <= new Date()) {
        errors.scheduledAt = 'Scheduled time must be in the future';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (status) => {
    if (!validateForm()) {
      showToast('Please fix the errors before submitting', 'error');
      return;
    }

    setLoading(true);

    try {
      let finalStatus = status;
      let scheduledAt = null;

      if (formData.isScheduled && formData.scheduledAt) {
        const scheduledDate = new Date(formData.scheduledAt);
        const now = new Date();

        if (scheduledDate > now) {
          finalStatus = 'scheduled';
          scheduledAt = formData.scheduledAt;
        }
      }

      const postData = {
        title: formData.title.trim(),
        excerpt: formData.excerpt.trim(),
        content: formData.content.trim(),
        category: formData.category,
        tags: formData.tags,
        featuredImage: formData.featuredImage || null,
        featured: formData.featured,
        author: 'Admin',
        status: finalStatus,
        scheduledAt
      };

      await blogService.createPost(postData);

      // Clear draft from localStorage
      localStorage.removeItem('blog_draft');

      let successMessage;
      if (finalStatus === 'scheduled') {
        successMessage = `Post scheduled for ${new Date(scheduledAt).toLocaleString()}!`;
      } else if (finalStatus === 'published') {
        successMessage = 'Post published successfully!';
      } else {
        successMessage = 'Draft saved!';
      }

      showToast(successMessage, 'success');
      router.push('/admin');
    } catch (error) {
      console.error('Error creating post:', error);
      showToast(error.message || 'Failed to create post', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('blog_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        const shouldLoad = window.confirm('Found a saved draft. Would you like to restore it?');
        if (shouldLoad) {
          setFormData(draft);
          if (draft.featuredImage) {
            setImagePreview(draft.featuredImage);
          }
        }
      } catch (error) {
        console.error('Error loading draft:', error);
      }
    }
  }, []);

  return (
    <AdminRoute>
      <div className="modern-blog-editor">
        {/* Header */}
        <header className="editor-header">
          <div className="editor-header-content">
            <button
              onClick={() => router.push('/admin')}
              className="btn-back"
              title="Back to Dashboard"
            >
              <ArrowLeft size={20} />
              <span>Back</span>
            </button>

            <div className="header-actions">
              {autoSaving && (
                <div className="auto-save-indicator">
                  <Clock size={16} />
                  <span>Saving...</span>
                </div>
              )}

              {lastSaved && !autoSaving && (
                <div className="last-saved">
                  <Check size={16} />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </div>
              )}

              <button
                onClick={() => handleSubmit('draft')}
                className="btn-secondary"
                disabled={loading}
              >
                <Save size={18} />
                <span>Save Draft</span>
              </button>

              <button
                onClick={() => handleSubmit('published')}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="spinner-small"></div>
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Publish</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="editor-layout">
          {/* Main Editor Column */}
          <div className="editor-main">
            {/* Title Input */}
            <div className="title-section">
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter your post title..."
                className={`title-input ${validationErrors.title ? 'error' : ''}`}
                autoFocus
              />
              {validationErrors.title && (
                <div className="validation-error">
                  <AlertCircle size={16} />
                  <span>{validationErrors.title}</span>
                </div>
              )}

              {formData.title && (
                <div className="slug-preview">
                  <span className="slug-label">URL:</span>
                  <span className="slug-value">{formData.slug || 'auto-generated'}</span>
                </div>
              )}
            </div>

            {/* Excerpt */}
            <div className="excerpt-section">
              <label className="section-label">
                <span>Excerpt</span>
                <span className="char-count">
                  {formData.excerpt.length}/300
                </span>
              </label>
              <textarea
                name="excerpt"
                value={formData.excerpt}
                onChange={handleChange}
                placeholder="Write a brief summary of your post (max 300 characters)..."
                className={`excerpt-input ${validationErrors.excerpt ? 'error' : ''}`}
                maxLength={300}
                rows={3}
              />
              {validationErrors.excerpt && (
                <div className="validation-error">
                  <AlertCircle size={16} />
                  <span>{validationErrors.excerpt}</span>
                </div>
              )}
            </div>

            {/* Content Editor */}
            <div className="content-section">
              <label className="section-label">
                <span>Content</span>
                <span className="word-count">{wordCount} words</span>
              </label>
              <ModernRichTextEditor
                value={formData.content}
                onChange={handleContentChange}
                placeholder="Start writing your amazing content..."
              />
              {validationErrors.content && (
                <div className="validation-error">
                  <AlertCircle size={16} />
                  <span>{validationErrors.content}</span>
                </div>
              )}
            </div>

            {/* Table of Contents Preview */}
            {formData.content && (
              <div className="toc-preview">
                <TableOfContents content={formData.content} />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="editor-sidebar">
            {/* Featured Image */}
            <div className="sidebar-card">
              <h3 className="card-title">
                <ImageIcon size={18} />
                <span>Featured Image</span>
              </h3>

              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Featured" />
                  <button
                    onClick={handleRemoveImage}
                    className="btn-remove-image"
                    title="Remove image"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="image-upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  {uploadingImage ? (
                    <div className="uploading-state">
                      <div className="spinner"></div>
                      <span>Uploading...</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} />
                      <span className="upload-text">Click to upload</span>
                      <span className="upload-hint">PNG, JPG, GIF up to 10MB</span>
                    </>
                  )}
                </label>
              )}
            </div>

            {/* Category */}
            <div className="sidebar-card">
              <h3 className="card-title">
                <Tag size={18} />
                <span>Category</span>
              </h3>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className={`category-select ${validationErrors.category ? 'error' : ''}`}
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {validationErrors.category && (
                <div className="validation-error">
                  <AlertCircle size={14} />
                  <span>{validationErrors.category}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="sidebar-card">
              <h3 className="card-title">
                <Tag size={18} />
                <span>Tags</span>
              </h3>

              <div className="tag-input-group">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="tag-input"
                />
                <button
                  onClick={handleAddTag}
                  className="btn-add-tag"
                  title="Add tag"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="tags-list">
                {formData.tags.map(tag => (
                  <span key={tag} className="tag-item">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="btn-remove-tag"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Publishing Options */}
            <div className="sidebar-card">
              <h3 className="card-title">
                <Calendar size={18} />
                <span>Publishing</span>
              </h3>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleChange}
                />
                <span>Featured Post</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="isScheduled"
                  checked={formData.isScheduled}
                  onChange={handleChange}
                />
                <span>Schedule for later</span>
              </label>

              {formData.isScheduled && (
                <div className="schedule-input">
                  <input
                    type="datetime-local"
                    name="scheduledAt"
                    value={formData.scheduledAt}
                    onChange={handleChange}
                    min={new Date().toISOString().slice(0, 16)}
                    className={validationErrors.scheduledAt ? 'error' : ''}
                  />
                  {validationErrors.scheduledAt && (
                    <div className="validation-error">
                      <AlertCircle size={14} />
                      <span>{validationErrors.scheduledAt}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AdminRoute>
  );
};

export default CreateBlogPage;
