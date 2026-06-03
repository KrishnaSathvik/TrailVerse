'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import blogService from '@/services/blogService';
import imageUploadService from '@/services/imageUploadService';
import ModernRichTextEditor from '@components/ModernRichTextEditor';
import TableOfContents from '@components/blog/TableOfContents';
import AdminShell from '@components/admin/AdminShell';
import { AdminLoading, AdminSection, AdminBadge } from '@components/admin/AdminUI';
import { BLOG_CATEGORIES, normalizeBlogCategory } from '@/lib/blogCategories';
import OptimizedImage from '@components/common/OptimizedImage';
import {
  Save,
  Send,
  Upload,
  X,
  Plus,
  AlertCircle,
  Check,
  Clock,
  Trash2,
  Eye,
  ArrowLeft,
} from '@components/icons';
import Link from 'next/link';
import '@/app/admin/blog/ModernBlogEditor.css';

const inputStyle = {
  backgroundColor: 'var(--surface-hover)',
  borderWidth: '1px',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
};

const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50';

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
  seoSchema: '',
  metaDescription: '',
  seoNoindex: false
};

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
          category: normalizeBlogCategory(post.category || 'park-guides'),
          tags: post.tags || [],
          featuredImage: post.featuredImage || '',
          featured: post.featured || false,
          status: post.status || 'draft',
          scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '',
          isScheduled: Boolean(post.scheduledAt),
          seoSchema: post.seoSchema || '',
          metaDescription: post.metaDescription || '',
          seoNoindex: Boolean(post.seoNoindex)
        };

        setFormData(nextValue);
        setImagePreview(post.featuredImage || null);
      } catch (error) {
        showToast('Failed to load post', 'error');
        router.push('/admin/content');
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

      if (name === 'title' && !isEditMode) {
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
        // Convert local datetime to UTC ISO string so the server stores the correct time
        scheduledAt = scheduledDate.toISOString();
      }
    }

    return {
      title: formData.title.trim(),
      slug: (formData.slug || createSlug(formData.title)).trim(),
      excerpt: formData.excerpt.trim(),
      metaDescription: formData.metaDescription.trim() || null,
      seoNoindex: Boolean(formData.seoNoindex),
      content: formData.content.trim(),
      category: normalizeBlogCategory(formData.category),
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
      router.push('/admin/content');
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
      router.push('/admin/content');
    } catch (error) {
      showToast(error.message || 'Failed to delete post', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <AdminShell title={isEditMode ? 'Edit post' : 'New post'} subtitle="Loading editor…">
        <AdminLoading label="Loading post…" />
      </AdminShell>
    );
  }

  const statusLabel = formData.status === 'published'
    ? 'Published'
    : formData.isScheduled && formData.scheduledAt
      ? 'Scheduled'
      : 'Draft';

  const statusTone = formData.status === 'published'
    ? 'success'
    : formData.isScheduled
      ? 'info'
      : 'warning';

  const affiliatePlaceholders = ['{{AFFILIATE_LINK}}', '{{AFFILIATE_URL}}', '[AFFILIATE_LINK]', 'YOUR_AFFILIATE_LINK', '{{REI_LINK}}', '{{BOOKING_LINK}}', '{{RECREATION_GOV_LINK}}'];
  const affiliateCount = affiliatePlaceholders.filter((p) => (formData.content || '').includes(p)).length;

  const headerActions = (
    <>
      <input
        ref={mdFileInputRef}
        type="file"
        accept=".md,.markdown"
        onChange={handleMarkdownImport}
        className="hidden"
        aria-hidden="true"
      />

      <Link
        href="/admin/content"
        className={`${btnSecondary} hidden sm:inline-flex`}
        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Content
      </Link>

      <button
        type="button"
        onClick={() => mdFileInputRef.current?.click()}
        className={btnSecondary}
        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
        title="Import a .md article file"
      >
        <Upload className="h-4 w-4" />
        <span className="hidden md:inline">Import .md</span>
      </button>

      {(autoSaving || savingImage || lastSaved) && (
        <span
          className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-secondary)' }}
        >
          {autoSaving || savingImage ? (
            <>
              <Clock className="h-3.5 w-3.5 animate-spin" />
              {savingImage ? 'Saving image…' : 'Saving…'}
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--accent-green)' }} />
              Saved {lastSaved.toLocaleTimeString()}
            </>
          )}
        </span>
      )}

      {isEditMode && formData.slug && (
        <Link
          href={`/blog/${formData.slug}`}
          target="_blank"
          className={btnSecondary}
          style={{ ...inputStyle, color: 'var(--text-secondary)' }}
          title="Preview on site"
        >
          <Eye className="h-4 w-4" />
          <span className="hidden md:inline">Preview</span>
        </Link>
      )}

      {isEditMode && (
        <button
          type="button"
          onClick={handleDelete}
          className={`${btnSecondary} ${deleteConfirm ? 'ring-2 ring-red-400' : ''}`}
          style={{ ...inputStyle, color: '#ef4444', borderColor: deleteConfirm ? '#ef4444' : 'var(--border)' }}
          disabled={loading}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{deleteConfirm ? 'Confirm' : 'Delete'}</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => handleSubmit('draft')}
        className={btnSecondary}
        style={inputStyle}
        disabled={loading || uploadingImage || savingImage}
      >
        <Save className="h-4 w-4" />
        <span className="hidden sm:inline">Draft</span>
      </button>

      <button
        type="button"
        onClick={() => handleSubmit('published')}
        className={btnPrimary}
        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
        disabled={loading || uploadingImage || savingImage}
      >
        {loading ? <span className="spinner-small" /> : <Send className="h-4 w-4" />}
        <span>{loading ? 'Saving…' : 'Publish'}</span>
      </button>
    </>
  );

  return (
    <AdminShell
      title={isEditMode ? 'Edit post' : 'New post'}
      subtitle={isEditMode ? 'Update content, SEO, and publishing settings.' : 'Draft and publish a blog article for TrailVerse.'}
      actions={headerActions}
    >
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <AdminBadge tone={statusTone}>{statusLabel}</AdminBadge>
        <AdminBadge tone="neutral">{wordCount} words</AdminBadge>
        <AdminBadge tone="neutral">{Math.max(1, Math.ceil(wordCount / 200))} min read</AdminBadge>
        {affiliateCount > 0 && (
          <AdminBadge tone="warning">
            {affiliateCount} affiliate placeholder{affiliateCount > 1 ? 's' : ''}
          </AdminBadge>
        )}
      </div>

      <div className="blog-editor grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <AdminSection title="Title & URL" description="Headline and public slug">
            <div className="space-y-4">
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Post title"
                className={`title-input blog-title-input ${validationErrors.title ? 'error' : ''}`}
                autoFocus={!isEditMode}
              />
              {validationErrors.title && (
                <div className="validation-error">
                  <AlertCircle size={16} />
                  <span>{validationErrors.title}</span>
                </div>
              )}

              <div>
                <label className="section-label">
                  <span>URL slug</span>
                  {isEditMode && (
                    <span className="char-count" style={{ fontWeight: 400 }}>
                      Slug changes 301-redirect the old URL
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder={formData.title ? createSlug(formData.title) : 'auto-from-title'}
                  className="w-full px-4 py-2.5 rounded-xl outline-none text-sm font-mono"
                  style={inputStyle}
                />
                {formData.slug && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    /blog/{formData.slug}
                  </p>
                )}
              </div>
            </div>
          </AdminSection>

          <AdminSection title="Summary" description="Card excerpt and search snippet">
            <div className="space-y-4">
              <div>
                <label className="section-label">
                  <span>Excerpt</span>
                  <span className="char-count">{formData.excerpt.length}/300</span>
                </label>
                <textarea
                  name="excerpt"
                  value={formData.excerpt}
                  onChange={handleChange}
                  placeholder="Brief summary for blog cards and social previews"
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

              <div>
                <label className="section-label">
                  <span>Meta description</span>
                  <span className="char-count">{formData.metaDescription.length}/160</span>
                </label>
                <textarea
                  name="metaDescription"
                  value={formData.metaDescription}
                  onChange={handleChange}
                  placeholder="Optional — shown in Google results"
                  className="excerpt-input"
                  maxLength={160}
                  rows={2}
                />
                <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" name="seoNoindex" checked={formData.seoNoindex} onChange={handleChange} />
                  Hide from search engines (noindex)
                </label>
              </div>
            </div>
          </AdminSection>

          <AdminSection
            title="Body"
            description="Main article content"
            action={
              affiliateCount > 0 ? (
                <span className="text-xs font-medium" style={{ color: '#d97706' }}>
                  Replace affiliate placeholders before publishing
                </span>
              ) : null
            }
          >
            <ModernRichTextEditor
              value={formData.content}
              onChange={(content) => updateFormField('content', content)}
              placeholder="Start writing…"
            />
            {validationErrors.content && (
              <div className="validation-error mt-3">
                <AlertCircle size={16} />
                <span>{validationErrors.content}</span>
              </div>
            )}
          </AdminSection>

          {formData.content && (
            <AdminSection title="Table of contents" description="Auto-generated from headings">
              <div className="toc-preview">
                <TableOfContents content={formData.content} />
              </div>
            </AdminSection>
          )}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24">
          <AdminSection title="Featured image">
            {imagePreview ? (
              <div className="image-preview">
                <OptimizedImage src={imagePreview} alt="Featured" />
                <div className="image-preview-actions">
                  <label className="btn-change-image" title="Change image">
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                    <Upload size={16} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((previous) => ({ ...previous, featuredImage: '' }));
                      setImagePreview(null);
                    }}
                    className="btn-remove-image"
                    title="Remove image"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <label className="image-upload-area">
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                {uploadingImage ? (
                  <div className="uploading-state">
                    <div className="spinner" />
                    <span>Uploading…</span>
                  </div>
                ) : (
                  <>
                    <Upload size={28} />
                    <span className="upload-text">Upload image</span>
                    <span className="upload-hint">PNG, JPG, GIF · up to 10MB</span>
                  </>
                )}
              </label>
            )}
          </AdminSection>

          <AdminSection title="Category">
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className={`category-select ${validationErrors.category ? 'error' : ''}`}
            >
              <option value="">Select category</option>
              {Object.entries(BLOG_CATEGORIES).map(([slug, meta]) => (
                <option key={slug} value={slug}>{meta.name}</option>
              ))}
            </select>
            {validationErrors.category && (
              <div className="validation-error">
                <AlertCircle size={14} />
                <span>{validationErrors.category}</span>
              </div>
            )}
          </AdminSection>

          <AdminSection title="Tags">
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
                placeholder="Add tag…"
                className="tag-input"
              />
              <button type="button" onClick={handleAddTag} className="btn-add-tag" title="Add tag">
                <Plus size={16} />
              </button>
            </div>
            {formData.tags.length > 0 ? (
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
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No tags yet</p>
            )}
          </AdminSection>

          <AdminSection title="Publishing">
            <label className="checkbox-label">
              <input type="checkbox" name="featured" checked={formData.featured} onChange={handleChange} />
              <span>Featured post</span>
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
                  min={(() => {
                    const n = new Date();
                    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
                  })()}
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
          </AdminSection>
        </aside>
      </div>
    </AdminShell>
  );
};

export default BlogPostForm;
