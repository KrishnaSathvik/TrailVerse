import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Link, 
  Image,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  Eye,
  Code,
  X,
  Maximize2,
  Minimize2
} from '@components/icons';
import imageUploadService from '../services/imageUploadService';
import { useToast } from '../context/ToastContext';
import './ModernRichTextEditor.css';

const ModernRichTextEditor = ({ value, onChange, placeholder = "Start writing your story..." }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const formatSelectRef = useRef(null);
  const toolbarRef = useRef(null);
  const containerRef = useRef(null);
  
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isToolbarSticky, setIsToolbarSticky] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFormat, setCurrentFormat] = useState('normal');
  const isInternalUpdateRef = useRef(false);
  const toolbarHeightRef = useRef(0);
  const toolbarWidthRef = useRef(0);
  const toolbarLeftRef = useRef(0);
  
  const { showToast } = useToast();

  // Get current block format
  const getCurrentFormat = useCallback(() => {
    if (!editorRef.current) return 'normal';
    
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return 'normal';
      
      const range = selection.getRangeAt(0);
      let element = range.startContainer;
      
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
      }
      
      while (element && element !== editorRef.current) {
        if (!element || !element.tagName) {
          element = element?.parentElement;
          continue;
        }
        
        const tagName = element.tagName.toLowerCase();
        
        if (tagName.match(/^h[1-6]$/)) return tagName;
        if (tagName === 'p') return 'normal';
        if (tagName === 'blockquote') return 'quote';
        
        element = element.parentElement;
      }
    } catch (error) {
      console.error('Error getting current format:', error);
    }
    
    return 'normal';
  }, []);

  // Update format display
  const updateFormatDisplay = useCallback(() => {
    if (!editorRef.current || !formatSelectRef.current) return;
    
    try {
      const format = getCurrentFormat();
      setCurrentFormat(format);
      if (formatSelectRef.current.value !== format) {
        formatSelectRef.current.value = format;
      }
    } catch (error) {
      console.error('Error updating format display:', error);
    }
  }, [getCurrentFormat]);

  // Initialize content
  useEffect(() => {
    // Skip if this is an internal update (from handleInput)
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }
    
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
      // Use setTimeout to avoid infinite loops
      const timeoutId = setTimeout(() => {
        if (formatSelectRef.current) {
          updateFormatDisplay();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [value]); // Removed updateFormatDisplay from dependencies

  // Handle input changes
  const handleInput = () => {
    if (editorRef.current && onChange) {
      isInternalUpdateRef.current = true;
      onChange(editorRef.current.innerHTML);
      // Update format display after a short delay to avoid blocking
      setTimeout(() => {
        updateFormatDisplay();
      }, 0);
    }
  };

  // Execute formatting commands
  const execCommand = (command, value = null) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, value);
      handleInput();
    }
  };

  // Insert link
  const insertLink = () => {
    const selection = window.getSelection();
    const selectedText = selection.toString();
    const url = prompt('Enter URL:', 'https://');
    
    if (url && url !== 'https://') {
      if (selectedText) {
        execCommand('createLink', url);
      } else {
        const linkText = prompt('Enter link text:', url);
        if (linkText) {
          const link = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
          execCommand('insertHTML', link);
        }
      }
    }
  };

  // Insert code block
  const insertCodeBlock = () => {
    const code = prompt('Enter code:');
    if (code) {
      const codeBlock = `<pre><code>${code}</code></pre>`;
      execCommand('insertHTML', codeBlock);
    }
  };

  // Handle image upload button click
  const handleImageButtonClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (fileInputRef.current && !isUploading) {
      fileInputRef.current.click();
    }
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the editor entirely
    if (e.target === editorRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  }, []);

  // Handle file selection and upload
  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles = [];

    // Validate files
    for (const file of fileArray) {
      try {
        imageUploadService.validateImageFile(file);
        validFiles.push(file);
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload images
      const uploadResult = await imageUploadService.uploadImages(validFiles, {
        category: 'blog',
        isPublic: true
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Handle response structure - could be { data: [...] } or { success: true, data: [...] }
      const imageData = uploadResult.data || uploadResult;
      const images = Array.isArray(imageData) ? imageData : (imageData.data || []);

      if (images && images.length > 0) {
        // Insert images into editor
        if (editorRef.current) {
          editorRef.current.focus();
          
          images.forEach((imageData) => {
            const imageHTML = `
              <figure class="blog-image" contenteditable="false">
                <img src="${imageData.url}" 
                     alt="${imageData.originalName || 'Uploaded image'}" 
                     loading="lazy"
                     style="max-width: 100%; height: auto; border-radius: 12px; display: block;" />
                <figcaption contenteditable="true" placeholder="Add a caption (optional)..."></figcaption>
              </figure>
              <p><br></p>
            `;
            
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = imageHTML;
              const frag = document.createDocumentFragment();
              let node;
              while ((node = tempDiv.firstChild)) {
                frag.appendChild(node);
              }
              range.insertNode(frag);
            } else {
              execCommand('insertHTML', imageHTML);
            }
          });
          
          handleInput();
          showToast(`${images.length} image${images.length > 1 ? 's' : ''} uploaded successfully!`, 'success');
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      console.error('Error details:', {
        response: error.response?.data,
        status: error.response?.status,
        message: error.message,
        stack: error.stack
      });
      
      // Extract error message from various possible locations
      let errorMessage = 'Failed to upload images';
      
      if (error.response) {
        // Server responded with error status
        const serverError = error.response.data;
        errorMessage = serverError?.error || 
                      serverError?.message || 
                      `Server error: ${error.response.status}`;
        
        // Include development details if available
        if (process.env.NODE_ENV === 'development' && serverError?.details) {
          console.error('Server error details:', serverError.details);
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Network error: Unable to connect to server';
      } else {
        // Something else happened
        errorMessage = error.message || 'Failed to upload images';
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Store toolbar dimensions on mount and resize
  useEffect(() => {
    const updateToolbarDimensions = () => {
      if (toolbarRef.current && containerRef.current) {
        toolbarHeightRef.current = toolbarRef.current.offsetHeight;
        const containerRect = containerRef.current.getBoundingClientRect();
        toolbarWidthRef.current = containerRect.width;
        toolbarLeftRef.current = containerRect.left;
      }
    };

    updateToolbarDimensions();
    window.addEventListener('resize', updateToolbarDimensions, { passive: true });
    
    return () => {
      window.removeEventListener('resize', updateToolbarDimensions);
    };
  }, []);

  // Sticky toolbar on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!toolbarRef.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Only make sticky when container top is above viewport and container is still visible
      const shouldBeSticky = containerRect.top < 0 && containerRect.bottom > toolbarHeightRef.current + 50;

      if (shouldBeSticky !== isToolbarSticky) {
        // Update dimensions when becoming sticky
        if (shouldBeSticky && !isToolbarSticky) {
          toolbarWidthRef.current = containerRect.width;
          toolbarLeftRef.current = containerRect.left;
        }
        setIsToolbarSticky(shouldBeSticky);
      }
    };

    let ticking = false;
    const optimizedHandleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', optimizedHandleScroll, { passive: true });
    window.addEventListener('resize', optimizedHandleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', optimizedHandleScroll);
      window.removeEventListener('resize', optimizedHandleScroll);
    };
  }, [isToolbarSticky]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const ToolbarButton = ({ onClick, children, title, isActive = false, disabled = false, className = '' }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) {
          onClick(e);
        }
      }}
      title={title}
      className={`toolbar-btn ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );

  return (
    <div 
      className={`modern-rich-text-editor ${isFullscreen ? 'fullscreen' : ''}`} 
      ref={containerRef}
    >
      {/* Toolbar Placeholder - maintains space when toolbar is sticky */}
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
      
      {/* Toolbar */}
      <div 
        ref={toolbarRef}
        className={`editor-toolbar ${isToolbarSticky ? 'sticky' : ''}`}
        style={isToolbarSticky ? {
          width: `${toolbarWidthRef.current}px`,
          left: `${toolbarLeftRef.current}px`
        } : {}}
      >
        <div className="toolbar-section">
          {/* Text Formatting */}
          <div className="toolbar-group">
            <ToolbarButton onClick={() => execCommand('bold')} title="Bold (Ctrl+B)">
              <Bold size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCommand('italic')} title="Italic (Ctrl+I)">
              <Italic size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCommand('underline')} title="Underline (Ctrl+U)">
              <Type size={18} />
            </ToolbarButton>
          </div>

          {/* Format Selector */}
          <div className="toolbar-group">
            <select
              ref={formatSelectRef}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'normal') {
                  execCommand('formatBlock', 'p');
                } else if (value === 'quote') {
                  execCommand('formatBlock', 'blockquote');
                } else if (value.startsWith('h')) {
                  execCommand('formatBlock', value);
                }
                setTimeout(updateFormatDisplay, 100);
              }}
              className="format-selector"
              title="Text Format"
              value={currentFormat}
            >
              <option value="normal">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="quote">Quote</option>
            </select>
          </div>

          {/* Lists */}
          <div className="toolbar-group">
            <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Bullet List">
              <List size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Numbered List">
              <ListOrdered size={18} />
            </ToolbarButton>
          </div>

          {/* Alignment */}
          <div className="toolbar-group">
            <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Align Left">
              <AlignLeft size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Align Center">
              <AlignCenter size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => execCommand('justifyRight')} title="Align Right">
              <AlignRight size={18} />
            </ToolbarButton>
          </div>

          {/* Insert Elements */}
          <div className="toolbar-group">
            <ToolbarButton onClick={insertLink} title="Insert Link">
              <Link size={18} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={handleImageButtonClick} 
              title="Upload Image"
              disabled={isUploading}
              className="primary-btn"
            >
              <Upload size={18} />
              <span className="btn-label">Image</span>
            </ToolbarButton>
            <ToolbarButton onClick={insertCodeBlock} title="Insert Code">
              <Code size={18} />
            </ToolbarButton>
          </div>
        </div>

        {/* View Controls */}
        <div className="toolbar-section">
          <div className="toolbar-group">
            <ToolbarButton 
              onClick={() => setShowPreview(!showPreview)} 
              title="Toggle Preview"
              isActive={showPreview}
            >
              <Eye size={18} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={toggleFullscreen} 
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </ToolbarButton>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Editor / Preview */}
      <div className="editor-wrapper">
        {/* Editor */}
        <div 
          className={`editor-pane ${showPreview ? 'split-view' : ''}`}
          style={{ display: showPreview ? 'block' : 'block' }}
        >
          <div
            ref={editorRef}
            className={`editor-content ${isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''}`}
            contentEditable
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyUp={updateFormatDisplay}
            onClick={updateFormatDisplay}
            data-placeholder={placeholder}
            suppressContentEditableWarning={true}
          />
          
          {/* Drag Overlay */}
          {isDragging && (
            <div className="drag-overlay">
              <div className="drag-overlay-content">
                <Upload size={48} />
                <p>Drop images here to upload</p>
              </div>
            </div>
          )}
          
          {/* Upload Overlay */}
          {isUploading && (
            <div className="upload-overlay">
              <div className="upload-overlay-content">
                <div className="upload-spinner"></div>
                <p>Uploading images...</p>
                {uploadProgress > 0 && (
                  <div className="upload-progress">
                    <div 
                      className="upload-progress-bar" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="preview-pane">
            <div className="preview-header">
              <h3>Preview</h3>
              <button 
                onClick={() => setShowPreview(false)}
                className="close-preview"
                title="Close Preview"
              >
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

      {/* Word Count */}
      <div className="editor-footer">
        <div className="word-count">
          {value ? `${value.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length} words` : '0 words'}
        </div>
      </div>
    </div>
  );
};

export default ModernRichTextEditor;

