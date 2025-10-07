import React, { useRef, useEffect, useState } from 'react';
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
  AlignRight
} from 'lucide-react';
import './SimpleRichTextEditor.css';

const SimpleRichTextEditor = ({ value, onChange, placeholder = "Write your content here..." }) => {
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command, value = null) => {
    console.log('Executing command:', command, value);
    if (editorRef.current) {
      editorRef.current.focus();
      const result = document.execCommand(command, false, value);
      console.log('Command result:', result);
      handleInput();
    }
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      execCommand('insertImage', url);
    }
  };

  const ToolbarButton = ({ onClick, children, title, isActive = false }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={`toolbar-btn ${isActive ? 'active' : ''}`}
      style={{ pointerEvents: 'auto' }}
    >
      {children}
    </button>
  );

  return (
    <div className="simple-rich-text-editor">
      {/* Toolbar */}
      <div className="editor-toolbar">
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
          <ToolbarButton onClick={insertImage} title="Insert Image">
            <Image size={16} />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        className={`editor-content ${isFocused ? 'focused' : ''}`}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
    </div>
  );
};

export default SimpleRichTextEditor;
