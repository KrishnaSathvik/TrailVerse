'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import blogService from '@/services/blogService';
import imageUploadService from '@/services/imageUploadService';
import ModernRichTextEditor from '@components/ModernRichTextEditor';
import TableOfContents from '@components/blog/TableOfContents';
import AdminRoute from '@components/admin/AdminRoute';
import OptimizedImage from '@components/common/OptimizedImage';
import {
  ArrowLeft,
  Save,
  Send,
  Image as ImageIcon,
  Calendar,
  Tag,
  Upload,
  X,
  Plus,
  AlertCircle,
  Check,
  Clock,
  Trash2
} from '@components/icons';
import '@/app/admin/blog/ModernBlogEditor.css';

const EMPTY_FORM = {
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
  isScheduled: false,
  seoSchema: ''
};

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
  'Travel Blogs',
  'Astrophotography',
  'National Parks',
  'Seasonal Guides'
];

const createSlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Parse a .md file string into BlogPost form fields.
 * Strips YAML frontmatter, converts Markdown body to HTML,
 * injects JSON-LD schema if present in frontmatter.
 */
function parseMarkdownArticle(mdContent) {
  // --- Strip and parse YAML frontmatter ---
  const frontmatter = {};
  let body = mdContent;

  const fmMatch = mdContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmRaw = fmMatch[1];
    body = fmMatch[2];

    fmRaw.split('\n').forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) return;
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();

      // Handle array values like: tags: [a, b, c] or tags: ["a","b"]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      // Handle multi-line arrays (- item format) — collect next lines starting with '-'
      frontmatter[key] = val;
    });

    // Handle block array style (- item on separate lines)
    const blockArrayRegex = /^(\w+):\s*\n((?:[ \t]+-[^\n]+\n?)+)/gm;
    let blockMatch;
    while ((blockMatch = blockArrayRegex.exec(fmRaw)) !== null) {
      const key = blockMatch[1];
      const items = blockMatch[2].match(/- ([^\n]+)/g)?.map(m => m.replace('- ', '').trim()) || [];
      frontmatter[key] = items;
    }
  }

  // --- Convert Markdown to HTML ---
  // Use a simple but reliable inline converter (no external deps needed)
  let html = body
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^[-*_]{3,}$/gm, '<hr />')
    // Unordered lists — group consecutive li items
    .replace(/^[-*+] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> items in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

  // Tables — convert markdown table blocks to HTML
  html = html.replace(
    /^(\|.+\|[ \t]*\n)(\|[ \t]*[-:]+[-| :\t]*\n)((\|.+\|[ \t]*\n?)*)/gm,
    (match, headerLine, separatorLine, bodyBlock) => {
      const parseRow = (row, tag) =>
        '<tr>' + row.replace(/^\||\|$/g, '').split('|')
          .map(cell => `<${tag}>${cell.trim()}</${tag}>`).join('') + '</tr>';
      const thead = '<thead>' + parseRow(headerLine.trim(), 'th') + '</thead>';
      const bodyRows = bodyBlock.trim().split('\n')
        .filter(r => r.trim())
        .map(r => parseRow(r.trim(), 'td')).join('');
      const tbody = bodyRows ? '<tbody>' + bodyRows + '</tbody>' : '';
      return '<table>' + thead + tbody + '</table>\n';
    }
  );

  // Paragraphs — wrap non-HTML lines
  const lines = html.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr|pre|div|script|table)/.test(line)) {
      result.push(line);
    } else if (line) {
      result.push(`<p>${line}</p>`);
    }
    i++;
  }
  html = result.join('\n');

  // --- Extract title from H1 if not in frontmatter ---
  let title = frontmatter.title || '';
  if (!title) {
    const h1Match = body.match(/^# (.+)$/m);
    if (h1Match) title = h1Match[1];
  }
  // Remove H1 from HTML if it duplicates the title field
  if (title) {
    html = html.replace(`<h1>${title}</h1>`, '').trim();
  }

  // --- Build slug ---
  const slug = frontmatter.slug || createSlug(title);

  // --- Excerpt ---
  const excerpt = (frontmatter.description || frontmatter.excerpt || '')
    .toString().slice(0, 295);

  // --- Tags ---
  let tags = frontmatter.tags || [];
  if (typeof tags === 'string') {
    tags = tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  // --- Category ---
  const category = frontmatter.category || 'Park Guides';

  // --- Featured image ---
  const featuredImage = frontmatter.image || frontmatter.featuredImage || '';

  // --- Author ---
  const author = frontmatter.author || 'Krishna';

  // --- SEO schema (JSON-LD) — store separately, not in HTML content ---
  const seoSchema = frontmatter.faqSchema || frontmatter.seo_schema || frontmatter.schema || frontmatter.jsonld || '';

  return { title, slug, excerpt, content: html, tags, category, featuredImage, author, seoSchema };
}

const BlogPostForm = ({ mode, postId }) => {
  const isEditMode = mode === 'edit';
  const draftStorageKey = isEditMode ? `blog_draft_edit_${postId}` : 'blog_draft_new';
  const { showToast } = useToast();
  const router = useRouter();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [newTag, setNewTag] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const mdFileInputRef = useRef(null);

  useEffect(() => {
    if (!isEditMode || !postId) {
      return;
    }

    let cancelled = false;

    const loadPost = async () => {
      try {
        setInitialLoading(true);
        const post = await blogService.getPostById(postId);
        if (cancelled) {
          return;
        }

        const nextValue = {
          title: post.title || '',
          slug: post.slug || '',
          excerpt: post.excerpt || '',
          content: post.content || '',
          category: post.category || '',
          tags: post.tags || [],
          featuredImage: post.featuredImage || '',
          featured: post.featured || false,
          status: post.status || 'draft',
          scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '',
          isScheduled: Boolean(post.scheduledAt)
        };

        setFormData(nextValue);
        setImagePreview(post.featuredImage || null);
      } catch (error) {
        showToast('Failed to load post', 'error');
        router.push('/admin');
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    };

    loadPost();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, postId, router, showToast]);

  useEffect(() => {
    if (isEditMode || typeof window === 'undefined') {
      return;
    }

    const savedDraft = window.localStorage.getItem(draftStorageKey);
    if (!savedDraft) {
      return;
    }

    try {
      const draft = JSON.parse(savedDraft);
      if (window.confirm('Found a saved draft. Restore it?')) {
        setFormData(draft);
        setImagePreview(draft.featuredImage || null);
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, isEditMode]);

  const wordCount = formData.content
    ? formData.content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length
    : 0;

  const updateFormField = (name, nextValue) => {
    setFormData((previous) => {
      const updated = {
        ...previous,
        [name]: nextValue
      };

      if (name === 'title') {
        updated.slug = createSlug(nextValue);
      }

      return updated;
    });

    if (validationErrors[name]) {
      setValidationErrors((previous) => {
        const nextErrors = { ...previous };
        delete nextErrors[name];
        return nextErrors;
      });
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    updateFormField(name, type === 'checkbox' ? checked : value);
  };

  const buildPayload = useCallback((requestedStatus) => {
    let finalStatus = requestedStatus;
    let scheduledAt = null;

    if (formData.isScheduled && formData.scheduledAt) {
      const scheduledDate = new Date(formData.scheduledAt);
      if (scheduledDate > new Date()) {
        finalStatus = 'scheduled';
        scheduledAt = formData.scheduledAt;
      }
    }

    return {
      title: formData.title.trim(),
      excerpt: formData.excerpt.trim(),
      content: formData.content.trim(),
      category: formData.category,
      tags: formData.tags,
      featuredImage: formData.featuredImage || null,
      featured: formData.featured,
      author: 'Admin',
      status: finalStatus,
      scheduledAt,
      readTime: Math.max(1, Math.ceil(wordCount / 200)),
      seoSchema: formData.seoSchema || null
    };
  }, [formData]);

  const handleAutoSave = useCallback(async () => {
    setAutoSaving(true);
    try {
      if (isEditMode && postId) {
        await blogService.updatePost(postId, buildPayload('draft'));
      } else if (typeof window !== 'undefined') {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(formData));
      }
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      window.setTimeout(() => setAutoSaving(false), 400);
    }
  }, [buildPayload, draftStorageKey, formData, isEditMode, postId]);

  useEffect(() => {
    if (initialLoading || !formData.title.trim() || !formData.content.trim()) {
      return;
    }

    const timer = window.setTimeout(() => {
      handleAutoSave();
    }, 30000);

    return () => window.clearTimeout(timer);
  }, [formData, handleAutoSave, initialLoading]);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || formData.tags.includes(trimmed)) {
      return;
    }

    setFormData((previous) => ({
      ...previous,
      tags: [...previous.tags, trimmed]
    }));
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData((previous) => ({
      ...previous,
      tags: previous.tags.filter((tag) => tag !== tagToRemove)
    }));
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      imageUploadService.validateImageFile(file);
      setUploadingImage(true);

      const preview = await imageUploadService.createImagePreview(file);
      setImagePreview(preview);

      const uploadedImage = await imageUploadService.uploadSingleImage(file, {
        category: 'blog',
        isPublic: true
      });

      if (isEditMode && postId) {
        setSavingImage(true);
        await blogService.updatePost(postId, {
          featuredImage: uploadedImage.url
        });
        setLastSaved(new Date());
      }

      setFormData((previous) => ({
        ...previous,
        featuredImage: uploadedImage.url
      }));
      setImagePreview(uploadedImage.url);
      showToast('Featured image uploaded successfully', 'success');
    } catch (error) {
      setImagePreview(formData.featuredImage || null);
      showToast(error.message || 'Failed to upload image', 'error');
    } finally {
      setSavingImage(false);
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const handleMarkdownImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
      showToast('Please select a Markdown (.md) file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseMarkdownArticle(ev.target.result);

        // Only fill empty fields — don't overwrite existing content
        setFormData(prev => ({
          ...prev,
          title: prev.title || parsed.title,
          slug: prev.slug || parsed.slug,
          excerpt: prev.excerpt || parsed.excerpt,
          content: prev.content || parsed.content,
          tags: prev.tags?.length > 0 ? prev.tags : parsed.tags,
          category: prev.category || parsed.category,
          featuredImage: prev.featuredImage || parsed.featuredImage,
          author: prev.author || parsed.author,
          seoSchema: prev.seoSchema || parsed.seoSchema,
        }));

        // Set image preview if parsed a featured image
        if (!imagePreview && parsed.featuredImage) {
          setImagePreview(parsed.featuredImage);
        }

        showToast(`Imported "${parsed.title || file.name}" — review and publish!`, 'success');
      } catch (err) {
        console.error('Markdown import error:', err);
        showToast('Failed to parse Markdown file', 'error');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-imported
    e.target.value = '';
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

    if (!formData.content.trim() || formData.content === '<p></p>') {
      errors.content = 'Content is required';
    }

    if (!formData.category) {
      errors.category = 'Please select a category';
    }

    if (formData.isScheduled && !formData.scheduledAt) {
      errors.scheduledAt = 'Please select a scheduled date and time';
    }

    if (formData.isScheduled && formData.scheduledAt && new Date(formData.scheduledAt) <= new Date()) {
      errors.scheduledAt = 'Scheduled time must be in the future';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (requestedStatus) => {
    // Check for unresolved affiliate placeholders before publishing
    if (requestedStatus === 'published') {
      const affiliatePlaceholders = [
        '{{AFFILIATE_LINK}}',
        '{{AFFILIATE_URL}}',
        '[AFFILIATE_LINK]',
        '[AFFILIATE_URL]',
        'YOUR_AFFILIATE_LINK',
        'INSERT_AFFILIATE',
        '{{REI_LINK}}',
        '{{BOOKING_LINK}}',
        '{{RECREATION_GOV_LINK}}'
      ];

      const contentToCheck = formData.content || '';
      const titleToCheck = formData.title || '';
      const foundPlaceholders = affiliatePlaceholders.filter(p =>
        contentToCheck.includes(p) || titleToCheck.includes(p)
      );

      if (foundPlaceholders.length > 0) {
        showToast(
          `Warning: ${foundPlaceholders.length} unresolved affiliate placeholder(s) found. Publishing anyway — replace these before going live.`,
          'warning'
        );
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (!validateForm()) {
      showToast('Please fix the errors before submitting', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload(requestedStatus);

      if (isEditMode) {
        await blogService.updatePost(postId, payload);
      } else {
        await blogService.createPost(payload);
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(draftStorageKey);
      }

      const successMessage = payload.status === 'scheduled'
        ? `Post scheduled for ${new Date(payload.scheduledAt).toLocaleString()}`
        : payload.status === 'published'
        ? isEditMode ? 'Post updated and published' : 'Post published successfully'
        : isEditMode ? 'Draft updated' : 'Draft saved';

      showToast(successMessage, 'success');
      router.push('/admin');
    } catch (error) {
      showToast(error.message || 'Failed to save post', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditMode) {
      return;
    }

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      window.setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }

    setLoading(true);
    try {
      await blogService.deletePost(postId);
      showToast('Post deleted successfully', 'success');
      router.push('/admin');
    } catch (error) {
      showToast(error.message || 'Failed to delete post', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <AdminRoute>
        <div className="modern-blog-editor loading-state">
          <div className="loading-spinner">
            <div className="spinner" />
            <p>Loading post...</p>
          </div>
        </div>
      </AdminRoute>
    );
  }

  return (
    <AdminRoute>
      <div className="modern-blog-editor admin-blog-page">
        <section className="pt-8 pb-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div
              className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div className="space-y-3">
                  <button type="button" onClick={() => router.push('/admin')} className="btn-back" title="Back to Dashboard">
                    <ArrowLeft size={20} />
                    <span>Back to Dashboard</span>
                  </button>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                      {isEditMode ? 'Edit Blog Post' : 'Create Blog Post'}
                    </h1>
                    <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                      {isEditMode
                        ? 'Update content, featured media, and publishing details using the same admin workflow.'
                        : 'Draft and publish new content using the existing admin layout and publishing controls.'}
                    </p>
                  </div>
                </div>

                <div className="header-actions">
                  <input
                    ref={mdFileInputRef}
                    type="file"
                    accept=".md,.markdown"
                    onChange={handleMarkdownImport}
                    className="hidden"
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    onClick={() => mdFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                    title="Import a .md article file — auto-fills all fields"
                  >
                    <Upload className="h-4 w-4" />
                    Import Markdown
                  </button>

                  {autoSaving && (
                    <div className="auto-save-indicator">
                      <Clock size={16} />
                      <span>Saving...</span>
                    </div>
                  )}

                  {savingImage && (
                    <div className="auto-save-indicator">
                      <Clock size={16} />
                      <span>Saving image...</span>
                    </div>
                  )}

                  {lastSaved && !autoSaving && (
                    <div className="last-saved">
                      <Check size={16} />
                      <span>Saved {lastSaved.toLocaleTimeString()}</span>
                    </div>
                  )}

                  {isEditMode && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className={`btn-danger ${deleteConfirm ? 'confirm' : ''}`}
                      disabled={loading}
                    >
                      <Trash2 size={18} />
                      <span>{deleteConfirm ? 'Confirm Delete?' : 'Delete'}</span>
                    </button>
                  )}

                  <button type="button" onClick={() => handleSubmit('draft')} className="btn-secondary" disabled={loading || uploadingImage || savingImage}>
                    <Save size={18} />
                    <span>Save Draft</span>
                  </button>

                  <button type="button" onClick={() => handleSubmit('published')} className="btn-primary" disabled={loading || uploadingImage || savingImage}>
                    {loading ? <div className="spinner-small" /> : <Send size={18} />}
                    <span>{loading ? (isEditMode ? 'Updating...' : 'Publishing...') : (isEditMode ? 'Update & Publish' : 'Publish')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="editor-layout">
              <div className="editor-main">
            <div className="title-section">
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter your post title..."
                className={`title-input ${validationErrors.title ? 'error' : ''}`}
                autoFocus={!isEditMode}
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

            <div className="excerpt-section">
              <label className="section-label">
                <span>Excerpt</span>
                <span className="char-count">{formData.excerpt.length}/300</span>
              </label>
              <textarea
                name="excerpt"
                value={formData.excerpt}
                onChange={handleChange}
                placeholder="Write a brief summary of your post..."
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

            <div className="content-section">
              <label className="section-label">
                <span>Content</span>
                <span className="word-count">{wordCount} words</span>
                {(() => {
                  const placeholders = ['{{AFFILIATE_LINK}}','{{AFFILIATE_URL}}','[AFFILIATE_LINK]','YOUR_AFFILIATE_LINK','{{REI_LINK}}','{{BOOKING_LINK}}','{{RECREATION_GOV_LINK}}'];
                  const count = placeholders.filter(p => (formData.content || '').includes(p)).length;
                  return count > 0 ? (
                    <span
                      className="ml-3 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        color: '#d97706',
                        border: '1px solid rgba(217, 119, 6, 0.3)'
                      }}
                      title="Unresolved affiliate placeholders — replace before publishing"
                    >
                      {count} affiliate placeholder{count > 1 ? 's' : ''}
                    </span>
                  ) : null;
                })()}
              </label>
              <ModernRichTextEditor
                value={formData.content}
                onChange={(content) => updateFormField('content', content)}
                placeholder="Start writing your amazing content..."
              />
              {validationErrors.content && (
                <div className="validation-error">
                  <AlertCircle size={16} />
                  <span>{validationErrors.content}</span>
                </div>
              )}
            </div>

            {formData.content && (
              <div className="toc-preview">
                <TableOfContents content={formData.content} />
              </div>
            )}
              </div>

              <aside className="editor-sidebar">
                <div className="sidebar-card">
              <h3 className="card-title">
                <ImageIcon size={18} />
                <span>Featured Image</span>
              </h3>

              {imagePreview ? (
                <div className="image-preview">
                  <OptimizedImage src={imagePreview} alt="Featured" />
                  <button type="button" onClick={() => {
                    setFormData((previous) => ({ ...previous, featuredImage: '' }));
                    setImagePreview(null);
                  }} className="btn-remove-image" title="Remove image">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="image-upload-area">
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  {uploadingImage ? (
                    <div className="uploading-state">
                      <div className="spinner" />
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
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {validationErrors.category && (
                <div className="validation-error">
                  <AlertCircle size={14} />
                  <span>{validationErrors.category}</span>
                </div>
              )}
                </div>

                <div className="sidebar-card">
              <h3 className="card-title">
                <Tag size={18} />
                <span>Tags</span>
              </h3>

              <div className="tag-input-group">
                <input
                  type="text"
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="tag-input"
                />
                <button type="button" onClick={handleAddTag} className="btn-add-tag" title="Add tag">
                  <Plus size={16} />
                </button>
              </div>

              <div className="tags-list">
                {formData.tags.map((tag) => (
                  <span key={tag} className="tag-item">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="btn-remove-tag">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
                </div>

                <div className="sidebar-card">
              <h3 className="card-title">
                <Calendar size={18} />
                <span>Publishing</span>
              </h3>

              <label className="checkbox-label">
                <input type="checkbox" name="featured" checked={formData.featured} onChange={handleChange} />
                <span>Featured Post</span>
              </label>

              <label className="checkbox-label">
                <input type="checkbox" name="isScheduled" checked={formData.isScheduled} onChange={handleChange} />
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
        </section>
      </div>
    </AdminRoute>
  );
};

export default BlogPostForm;
