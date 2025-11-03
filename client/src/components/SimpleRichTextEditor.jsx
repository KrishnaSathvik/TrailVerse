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
  Upload
} from '@components/icons';
import imageUploadService from '../services/imageUploadService';
import { useToast } from '../context/ToastContext';
import './SimpleRichTextEditor.css';

const SimpleRichTextEditor = ({ value, onChange, placeholder = "Write your content here..." }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const formatSelectRef = useRef(null);
  const toolbarRef = useRef(null);
  const containerRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isToolbarSticky, setIsToolbarSticky] = useState(false);
  const { showToast } = useToast();

  // Get current block format (heading level or paragraph)
  const getCurrentFormat = useCallback(() => {
    if (!editorRef.current) return 'normal';
    
    try {
      const editor = editorRef.current;
      
      // Check if editor has focus
      if (!editor.contains(document.activeElement)) {
        return 'normal';
      }
      
      // Try using queryCommandValue first (most reliable)
      try {
        // Focus editor first
        if (document.activeElement !== editor) {
          editor.focus();
        }
        
        const formatBlock = document.queryCommandValue('formatBlock');
        if (formatBlock && formatBlock !== 'false' && formatBlock !== '') {
          const tagName = formatBlock.toLowerCase().trim();
          if (tagName.match(/^h[1-6]$/)) {
            return tagName;
          }
          if (tagName === 'p') {
            return 'normal';
          }
        }
      } catch (e) {
        // queryCommandValue might not work in all browsers
      }
      
      // Fallback: Check selection
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return 'normal';
      }
      
      const range = selection.getRangeAt(0);
      
      // Get the start container (where cursor is)
      let element = range.startContainer;
      
      // If it's a text node, get the parent element
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
      }
      
      // If it's still not an element, get parent
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        element = element?.parentElement || range.commonAncestorContainer;
      }
      
      // Traverse up to find the block element (h1-h6 or p)
      while (element && element !== editor) {
        if (!element || !element.tagName) {
          element = element?.parentElement;
          continue;
        }
        
        const tagName = element.tagName.toLowerCase();
        
        // Check for headings
        if (tagName.match(/^h[1-6]$/)) {
          return tagName;
        }
        
        // Check for paragraph
        if (tagName === 'p') {
          return 'normal';
        }
        
        // Skip inline elements
        if (['span', 'strong', 'b', 'em', 'i', 'u', 'a', 'code'].includes(tagName)) {
          element = element.parentElement;
          continue;
        }
        
        // For divs, check if they're block-level but not headings
        if (tagName === 'div') {
          // Check parent to see if it's a heading container
          const parent = element.parentElement;
          if (parent && parent !== editor) {
            const parentTag = parent.tagName?.toLowerCase();
            if (parentTag && parentTag.match(/^h[1-6]$/)) {
              return parentTag;
            }
          }
          // If it's a direct child of editor, it's likely a paragraph
          if (element.parentElement === editor) {
            return 'normal';
          }
        }
        
        element = element.parentElement;
      }
    } catch (error) {
      console.error('Error getting current format:', error);
    }
    
    return 'normal';
  }, []);

  // Update format selector to show current format
  const updateFormatDisplay = useCallback(() => {
    if (!editorRef.current || !formatSelectRef.current) return;
    
    try {
      const currentFormat = getCurrentFormat();
      if (formatSelectRef.current.value !== currentFormat) {
        formatSelectRef.current.value = currentFormat;
      }
    } catch (error) {
      console.error('Error updating format display:', error);
    }
  }, [getCurrentFormat]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
      // Update format display after content is set
      setTimeout(updateFormatDisplay, 100);
    }
  }, [value, updateFormatDisplay]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command, value = null) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, value);
      handleInput();
    }
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const insertImageByUrl = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      execCommand('insertImage', url);
    }
  };

  const handleFileSelect = useCallback(async (files) => {
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

    try {
      // Upload images
      const uploadResult = await imageUploadService.uploadImages(validFiles, {
        category: 'blog',
        isPublic: true
      });

      if (uploadResult.data && uploadResult.data.length > 0) {
        // Insert images into editor
        if (editorRef.current) {
          editorRef.current.focus();
          
          uploadResult.data.forEach((imageData, index) => {
            const img = document.createElement('img');
            img.src = imageData.url;
            img.alt = imageData.originalName || 'Uploaded image';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.borderRadius = '8px';
            img.style.margin = '16px 0';
            
            // Insert image at cursor position or at end
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.insertNode(img);
              // Add a line break after image
              const br = document.createElement('br');
              range.setStartAfter(img);
              range.insertNode(br);
            } else {
              editorRef.current.appendChild(img);
              const br = document.createElement('br');
              editorRef.current.appendChild(br);
            }
            
            // Move cursor after image
            if (index < uploadResult.data.length - 1) {
              const br = document.createElement('br');
              editorRef.current.appendChild(br);
            }
          });

          // Update content
          handleInput();
          showToast(`${validFiles.length} image(s) uploaded successfully`, 'success');
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      showToast('Failed to upload images', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [showToast]);

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files) {
      handleFileSelect(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  const handleImageButtonClick = () => {
    // Show file picker
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const insertHeading = (level) => {
    execCommand('formatBlock', `h${level}`);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Update format display on selection change
    const handleSelectionChange = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const anchorNode = selection.anchorNode;
          if (anchorNode && editor.contains(anchorNode)) {
            setTimeout(() => {
              updateFormatDisplay();
            }, 10);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };

    const handleClick = (e) => {
      if (editor.contains(e.target)) {
        setTimeout(() => {
          updateFormatDisplay();
        }, 10);
      }
    };

    const handleKeyUp = (e) => {
      if (editor.contains(e.target)) {
        setTimeout(() => {
          updateFormatDisplay();
        }, 10);
      }
    };

    const handleKeyDown = (e) => {
      if (editor.contains(e.target)) {
        // Update on arrow keys and other navigation
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) {
          setTimeout(() => {
            updateFormatDisplay();
          }, 10);
        }
      }
    };

    const handleInput = () => {
      // Update format display when content changes
      setTimeout(() => {
        updateFormatDisplay();
      }, 10);
    };

    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);
    editor.addEventListener('click', handleClick);
    editor.addEventListener('keyup', handleKeyUp);
    editor.addEventListener('keydown', handleKeyDown);
    editor.addEventListener('input', handleInput);
    
    // Initial update
    setTimeout(() => {
      updateFormatDisplay();
    }, 200);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      editor.removeEventListener('click', handleClick);
      editor.removeEventListener('keyup', handleKeyUp);
      editor.removeEventListener('keydown', handleKeyDown);
      editor.removeEventListener('input', handleInput);
    };
  }, [updateFormatDisplay]);

  // Make toolbar sticky when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!toolbarRef.current || !containerRef.current) {
        console.log('Toolbar refs not ready');
        return;
      }

      const toolbar = toolbarRef.current;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Find the parent wrapper that has padding
      let parentWrapper = container.parentElement;
      let searchDepth = 0;
      while (parentWrapper && searchDepth < 5) {
        if (parentWrapper.classList.contains('rounded-2xl')) {
          break;
        }
        parentWrapper = parentWrapper.parentElement;
        searchDepth++;
      }
      
      // Calculate position and width - use container's actual position
      let containerLeft = containerRect.left;
      let containerWidth = containerRect.width;

      // If we found a parent wrapper, account for its padding
      if (parentWrapper && parentWrapper !== document.body) {
        const parentRect = parentWrapper.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(parentWrapper);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        
        // Position toolbar to match container's content area
        containerLeft = parentRect.left + paddingLeft;
        containerWidth = parentRect.width - paddingLeft - paddingRight;
      }

      // Simplified condition: toolbar sticks when container top is above viewport
      // and container is still visible
      const shouldBeSticky = containerRect.top < 0 && containerRect.bottom > 50;

      if (shouldBeSticky && !isToolbarSticky) {
        setIsToolbarSticky(true);
        // Apply fixed positioning
        toolbar.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: ${containerLeft}px !important;
          width: ${containerWidth}px !important;
          max-width: ${containerWidth}px !important;
          z-index: 1000 !important;
          background-color: var(--surface-hover) !important;
          backdrop-filter: blur(10px) !important;
          -webkit-backdrop-filter: blur(10px) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
          border-bottom: 1px solid var(--border) !important;
          border-radius: 0 !important;
        `;
      } else if (!shouldBeSticky && isToolbarSticky) {
        setIsToolbarSticky(false);
        // Reset to default sticky positioning
        toolbar.style.cssText = '';
      } else if (shouldBeSticky && isToolbarSticky) {
        // Update position if already sticky (for resize/scrolling)
        toolbar.style.left = `${containerLeft}px`;
        toolbar.style.width = `${containerWidth}px`;
        toolbar.style.maxWidth = `${containerWidth}px`;
      }
    };

    // Simple scroll handler
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
    window.addEventListener('resize', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();
    setTimeout(handleScroll, 200);
    setTimeout(handleScroll, 500);

    return () => {
      window.removeEventListener('scroll', optimizedHandleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isToolbarSticky]);


  const ToolbarButton = ({ onClick, children, title, isActive = false, disabled = false }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      title={title}
      className={`toolbar-btn ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      style={{ pointerEvents: 'auto', opacity: disabled ? 0.5 : 1 }}
      disabled={disabled}
    >
      {children}
    </button>
  );

  return (
    <div className="simple-rich-text-editor" ref={containerRef}>
      {/* Toolbar - Sticky when scrolling */}
      <div 
        ref={toolbarRef}
        className={`editor-toolbar sticky-toolbar ${isToolbarSticky ? 'toolbar-sticky-active' : ''}`}
      >
        <div className="toolbar-group">
          <ToolbarButton onClick={() => execCommand('bold')} title="Bold">
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand('italic')} title="Italic">
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand('underline')} title="Underline">
            <Type size={16} />
          </ToolbarButton>
        </div>

        <div className="toolbar-group">
          <select
            ref={formatSelectRef}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'normal') {
                execCommand('formatBlock', 'p');
              } else if (value.startsWith('h')) {
                execCommand('formatBlock', value);
              }
              // Update display after format change
              setTimeout(updateFormatDisplay, 100);
            }}
            onClick={(e) => {
              // Allow click to work normally for dropdown
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              // Allow mouse down to work normally for dropdown
              e.stopPropagation();
            }}
            className="toolbar-select"
            title="Select Format (Heading or Body Text)"
            defaultValue="normal"
            style={{ pointerEvents: 'auto', zIndex: 1000 }}
          >
            <option value="normal">Body Text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="h5">Heading 5</option>
            <option value="h6">Heading 6</option>
          </select>
        </div>

        <div className="toolbar-group">
          <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Bullet List">
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Numbered List">
            <ListOrdered size={16} />
          </ToolbarButton>
        </div>

        <div className="toolbar-group">
          <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Align Left">
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Align Center">
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => execCommand('justifyRight')} title="Align Right">
            <AlignRight size={16} />
          </ToolbarButton>
        </div>

        <div className="toolbar-group">
          <ToolbarButton onClick={() => execCommand('formatBlock', 'blockquote')} title="Quote">
            <Quote size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={insertLink} title="Insert Link">
            <Link size={16} />
          </ToolbarButton>
          <ToolbarButton 
            onClick={handleImageButtonClick} 
            title="Upload Image (Click or Drag & Drop)"
            disabled={isUploading}
          >
            <Upload size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={insertImageByUrl} title="Insert Image by URL">
            <Image size={16} />
          </ToolbarButton>
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

      {/* Editor with drag & drop */}
      <div
        ref={editorRef}
        className={`editor-content ${isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      >
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
              <div className="spinner"></div>
              <p>Uploading images...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleRichTextEditor;
