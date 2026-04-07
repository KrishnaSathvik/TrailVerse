import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu as BubbleMenuExtension } from '@tiptap/extension-bubble-menu';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link,
  Upload,
  Eye,
  Code,
  Undo,
  Redo,
  Quote,
  Minus,
  Grid,
  X,
  Maximize2,
  Minimize2
} from '@components/icons';
import imageUploadService from '../services/imageUploadService';
import { useToast } from '../context/ToastContext';
import './ModernRichTextEditor.css';

/**
 * Detect whether plain text looks like Markdown (has links, headings, bold, etc.)
 * and convert it to HTML so TipTap can render it properly.
 */
function looksLikeMarkdown(text) {
  return /\[.+?\]\(.+?\)/.test(text)      // [text](url)
    || /^#{1,4} /m.test(text)              // headings
    || /\*\*.+?\*\*/.test(text)            // bold
    || /^[-*+] /m.test(text)               // unordered list
    || /^\d+\. /m.test(text)               // ordered list
    || /^> /m.test(text)                   // blockquote
    || /^\|.+\|$/m.test(text);             // table
}

function markdownToHtml(md) {
  let html = md
    // Images before links (both use [] syntax)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
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
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^[-*_]{3,}$/gm, '<hr />')
    // Unordered list items
    .replace(/^[-*+] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Tables
  html = html.replace(
    /^(\|.+\|[ \t]*\n)(\|[ \t]*[-:]+[-| :\t]*\n)((\|.+\|[ \t]*\n?)*)/gm,
    (_match, headerLine, _sep, bodyBlock) => {
      const parseRow = (row, tag) =>
        '<tr>' + row.replace(/^\||\|$/g, '').split('|')
          .map((cell) => `<${tag}>${cell.trim()}</${tag}>`).join('') + '</tr>';
      const thead = '<thead>' + parseRow(headerLine.trim(), 'th') + '</thead>';
      const bodyRows = bodyBlock.trim().split('\n')
        .filter((r) => r.trim())
        .map((r) => parseRow(r.trim(), 'td')).join('');
      const tbody = bodyRows ? '<tbody>' + bodyRows + '</tbody>' : '';
      return '<table>' + thead + tbody + '</table>\n';
    }
  );

  // Wrap remaining plain lines in <p>
  const lines = html.split('\n');
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr|pre|div|table|img)/.test(trimmed)) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  return result.join('\n');
}

const ModernRichTextEditor = ({ value, onChange, placeholder = 'Start writing your story...' }) => {
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);
  const fileInputRef = useRef(null);
  const toolbarHeightRef = useRef(0);

  const [bubbleMenuEl] = useState(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'bubble-menu';
    return el;
  });
  const toolbarWidthRef = useRef(0);
  const toolbarLeftRef = useRef(0);
  const { showToast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isToolbarSticky, setIsToolbarSticky] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] }
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank'
        }
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: 'editor-inline-image'
        }
      }),
      Placeholder.configure({
        placeholder
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph']
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      BubbleMenuExtension.configure({
        element: bubbleMenuEl,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentHtml = editor.getHTML();
    if ((value || '') !== currentHtml) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  // Convert pasted Markdown to HTML so TipTap renders links, headings, etc.
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (view, event) => {
      // If clipboard already has HTML, let TipTap handle it natively
      if (event.clipboardData?.types.includes('text/html')) return false;

      const text = event.clipboardData?.getData('text/plain');
      if (!text || !looksLikeMarkdown(text)) return false;

      event.preventDefault();
      const html = markdownToHtml(text);
      editor.commands.insertContent(html, { parseOptions: { preserveWhitespace: false } });
      return true;
    };

    editor.view.props.handlePaste = handlePaste;

    return () => {
      if (editor.view) {
        editor.view.props.handlePaste = undefined;
      }
    };
  }, [editor]);

  useEffect(() => {
    const updateToolbarDimensions = () => {
      if (!toolbarRef.current || !containerRef.current) {
        return;
      }

      toolbarHeightRef.current = toolbarRef.current.offsetHeight;
      const containerRect = containerRef.current.getBoundingClientRect();
      toolbarWidthRef.current = containerRect.width;
      toolbarLeftRef.current = containerRect.left;
    };

    updateToolbarDimensions();
    window.addEventListener('resize', updateToolbarDimensions, { passive: true });

    return () => {
      window.removeEventListener('resize', updateToolbarDimensions);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (!toolbarRef.current || !containerRef.current) {
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const shouldBeSticky = containerRect.top < 0 && containerRect.bottom > toolbarHeightRef.current + 50;

      if (shouldBeSticky && !isToolbarSticky) {
        toolbarWidthRef.current = containerRef.current.getBoundingClientRect().width;
        toolbarLeftRef.current = containerRef.current.getBoundingClientRect().left;
      }

      setIsToolbarSticky(shouldBeSticky);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isToolbarSticky]);

  useEffect(() => {
    document.body.style.overflow = (isFullscreen || showPreview) ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen, showPreview]);

  const insertLink = () => {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes('link').href || 'https://';
    const url = window.prompt('Enter URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const uploadAndInsertImages = async (files) => {
    if (!editor || !files?.length) {
      return;
    }

    const validFiles = [];
    for (const file of Array.from(files)) {
      try {
        imageUploadService.validateImageFile(file);
        validFiles.push(file);
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    if (validFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    const progressInterval = window.setInterval(() => {
      setUploadProgress((previous) => (previous >= 85 ? previous : previous + 15));
    }, 180);

    try {
      const uploadResult = await imageUploadService.uploadImages(validFiles, {
        category: 'blog',
        isPublic: true
      });

      const images = uploadResult.data || [];
      images.forEach((image) => {
        editor.chain().focus().setImage({ src: image.url, alt: image.originalName || 'Uploaded image' }).run();
        editor.chain().focus().createParagraphNear().run();
      });

      setUploadProgress(100);
      showToast(`${images.length} image${images.length > 1 ? 's' : ''} uploaded successfully`, 'success');
    } catch (error) {
      showToast(error.message || 'Failed to upload images', 'error');
    } finally {
      window.clearInterval(progressInterval);
      window.setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 200);
    }
  };

  const handleFileInputChange = (event) => {
    uploadAndInsertImages(event.target.files);
    event.target.value = '';
  };

  const toolbarButtonClass = (isActive) => `toolbar-btn ${isActive ? 'active' : ''}`;

  const wordCount = value ? value.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={`modern-rich-text-editor ${isFullscreen ? 'fullscreen' : ''}`} ref={containerRef}>
      {isToolbarSticky && toolbarHeightRef.current > 0 && (
        <div
          style={{
            height: `${toolbarHeightRef.current}px`,
            visibility: 'hidden',
            pointerEvents: 'none',
            flexShrink: 0
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={toolbarRef}
        className={`editor-toolbar ${isToolbarSticky ? 'sticky' : ''}`}
        style={isToolbarSticky ? {
          width: `${toolbarWidthRef.current}px`,
          left: `${toolbarLeftRef.current}px`
        } : {}}
      >
        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(false)} onClick={() => editor?.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
            <Undo size={18} />
          </button>
          <button type="button" className={toolbarButtonClass(false)} onClick={() => editor?.chain().focus().redo().run()} title="Redo (Ctrl+Shift+Z)">
            <Redo size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            <span className="heading-label">H2</span>
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            <span className="heading-label">H3</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <Bold size={18} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <Italic size={18} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('strike'))} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough (Ctrl+Shift+X)">
            <Strikethrough size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('blockquote'))} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Blockquote">
            <Quote size={18} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
            <Minus size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List">
            <List size={18} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('orderedList'))} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List">
            <ListOrdered size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('link'))} onClick={insertLink} title="Insert Link (Ctrl+K)">
            <Link size={18} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('image'))} onClick={() => fileInputRef.current?.click()} title="Upload Image">
            <Upload size={18} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table">
            <Grid size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(editor?.isActive('codeBlock'))} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} title="Code Block">
            <Code size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className={toolbarButtonClass(showPreview)} onClick={() => setShowPreview((previous) => !previous)} title="Toggle Preview">
            <Eye size={18} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => setIsFullscreen((previous) => !previous)} title="Toggle Fullscreen">
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      <div className="editor-wrapper">
        <div className="editor-pane">
          <div
            className={`editor-content ${isDragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) {
                setIsDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              uploadAndInsertImages(event.dataTransfer.files);
            }}
          >
            <EditorContent editor={editor} />
          </div>

          {isDragging && (
            <div className="drag-overlay">
              <div className="drag-overlay-content">
                <Upload size={48} />
                <p>Drop images here to upload</p>
              </div>
            </div>
          )}

          {isUploading && (
            <div className="upload-overlay">
              <div className="upload-overlay-content">
                <div className="upload-spinner" />
                <p>Uploading images...</p>
                {uploadProgress > 0 && (
                  <div className="upload-progress">
                    <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {showPreview && (
          <div className="preview-pane">
            <div className="preview-header">
              <h3>Preview</h3>
              <button onClick={() => setShowPreview(false)} className="close-preview" title="Close Preview">
                <X size={18} />
              </button>
            </div>
            {/* Preview content uses editor-generated HTML which is sanitized by TipTap */}
            <div
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: value || '<p class="empty-preview">Start writing to see preview...</p>' }}
            />
          </div>
        )}
      </div>

      {bubbleMenuEl && createPortal(
        <>
          <button type="button" className={toolbarButtonClass(editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <Bold size={16} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <Italic size={16} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('strike'))} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough size={16} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('link'))} onClick={insertLink} title="Link (Ctrl+K)">
            <Link size={16} />
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            <span style={{ fontWeight: 700, fontSize: 14 }}>H2</span>
          </button>
          <button type="button" className={toolbarButtonClass(editor?.isActive('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            <span style={{ fontWeight: 700, fontSize: 14 }}>H3</span>
          </button>
        </>,
        bubbleMenuEl
      )}

      <div className="editor-footer">
        <div className="footer-info">
          <span className="word-count">{wordCount} words</span>
          <span className="footer-divider">&middot;</span>
          <span className="read-time">{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
        </div>
      </div>
    </div>
  );
};

export default ModernRichTextEditor;
