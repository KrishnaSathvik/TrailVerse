import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link,
  Upload,
  Eye,
  Code,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  X,
  Maximize2,
  Minimize2
} from '@components/icons';
import imageUploadService from '../services/imageUploadService';
import { useToast } from '../context/ToastContext';
import './ModernRichTextEditor.css';

const headingOptions = [
  { value: 'normal', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'quote', label: 'Quote' }
];

const ModernRichTextEditor = ({ value, onChange, placeholder = 'Start writing your story...' }) => {
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);
  const fileInputRef = useRef(null);
  const toolbarHeightRef = useRef(0);
  const toolbarWidthRef = useRef(0);
  const toolbarLeftRef = useRef(0);
  const { showToast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isToolbarSticky, setIsToolbarSticky] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentFormat, setCurrentFormat] = useState('normal');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] }
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
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
      })
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(currentEditor.getHTML());
    }
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
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const syncCurrentFormat = () => {
      if (editor.isActive('blockquote')) {
        setCurrentFormat('quote');
        return;
      }

      for (const level of [1, 2, 3, 4]) {
        if (editor.isActive('heading', { level })) {
          setCurrentFormat(`h${level}`);
          return;
        }
      }

      setCurrentFormat('normal');
    };

    syncCurrentFormat();
    editor.on('selectionUpdate', syncCurrentFormat);
    editor.on('transaction', syncCurrentFormat);

    return () => {
      editor.off('selectionUpdate', syncCurrentFormat);
      editor.off('transaction', syncCurrentFormat);
    };
  }, [editor]);

  const handleFormatChange = (selectedValue) => {
    if (!editor) {
      return;
    }

    editor.chain().focus();

    if (selectedValue === 'normal') {
      editor.chain().focus().setParagraph().run();
      return;
    }

    if (selectedValue === 'quote') {
      editor.chain().focus().toggleBlockquote().run();
      return;
    }

    if (selectedValue.startsWith('h')) {
      editor.chain().focus().toggleHeading({ level: Number(selectedValue.slice(1)) }).run();
    }
  };

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
        <div className="toolbar-section">
          <div className="toolbar-group">
            <button type="button" className={toolbarButtonClass(editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold">
              <Bold size={18} />
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic">
              <Italic size={18} />
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive('underline'))} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline">
              <Type size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <select
              className="format-selector"
              title="Text Format"
              value={currentFormat}
              onChange={(event) => handleFormatChange(event.target.value)}
            >
              {headingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <button type="button" className={toolbarButtonClass(editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List">
              <List size={18} />
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive('orderedList'))} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List">
              <ListOrdered size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <button type="button" className={toolbarButtonClass(editor?.isActive({ textAlign: 'left' }))} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align Left">
              <AlignLeft size={18} />
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive({ textAlign: 'center' }))} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align Center">
              <AlignCenter size={18} />
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive({ textAlign: 'right' }))} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align Right">
              <AlignRight size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <button type="button" className={toolbarButtonClass(editor?.isActive('link'))} onClick={insertLink} title="Insert Link">
              <Link size={18} />
            </button>
            <button type="button" className="toolbar-btn primary-btn" onClick={() => fileInputRef.current?.click()} title="Upload Image">
              <Upload size={18} />
              <span className="btn-label">Image</span>
            </button>
            <button type="button" className={toolbarButtonClass(editor?.isActive('codeBlock'))} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} title="Code Block">
              <Code size={18} />
            </button>
          </div>
        </div>

        <div className="toolbar-section">
          <div className="toolbar-group">
            <button type="button" className={toolbarButtonClass(showPreview)} onClick={() => setShowPreview((previous) => !previous)} title="Toggle Preview">
              <Eye size={18} />
            </button>
            <button type="button" className="toolbar-btn" onClick={() => setIsFullscreen((previous) => !previous)} title="Toggle Fullscreen">
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
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
        <div className={`editor-pane ${showPreview ? 'split-view' : ''}`}>
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
            <div
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: value || '<p class="empty-preview">Start writing to see preview...</p>' }}
            />
          </div>
        )}
      </div>

      <div className="editor-footer">
        <div className="word-count">
          {value ? `${value.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length} words` : '0 words'}
        </div>
      </div>
    </div>
  );
};

export default ModernRichTextEditor;
