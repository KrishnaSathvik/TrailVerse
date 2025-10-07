import React from 'react';
import MDEditor from '@uiw/react-md-editor';
import './RichTextEditor.css';

const RichTextEditor = ({ value, onChange, placeholder = "Write your content here..." }) => {
  return (
    <div className="rich-text-editor" data-color-mode="dark">
      <MDEditor
        value={value || ''}
        onChange={(val) => onChange(val || '')}
        placeholder={placeholder}
        height={400}
        data-color-mode="dark"
        preview="edit"
      />
    </div>
  );
};

export default RichTextEditor;
