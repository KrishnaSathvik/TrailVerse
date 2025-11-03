import React, { useMemo, useEffect, useState } from 'react';
import { List } from '@components/icons';
import './TableOfContents.css';

const TableOfContents = ({ content, onContentUpdate, className = '', headings: providedHeadings }) => {
  const [processedContent, setProcessedContent] = useState(content);

  const headings = useMemo(() => {
    // If headings are provided directly, use them (for blog post pages)
    if (providedHeadings && providedHeadings.length > 0) {
      return providedHeadings;
    }
    
    // Otherwise, parse from content
    if (!content) return [];

    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    const tocItems = [];
    let headingIndex = 0;

    // Find all standard headings (h1, h2, h3, h4, h5, h6)
    const standardHeadings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    // Process standard headings first
    standardHeadings.forEach((heading) => {
      const text = heading.textContent || heading.innerText;
      if (!text || !text.trim()) return;
      
      const level = parseInt(heading.tagName.charAt(1));
      const sanitizedText = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const id = `heading-${headingIndex}-${sanitizedText}`;
      
      tocItems.push({
        id: id,
        text: text.trim(),
        level: level,
        originalHeading: heading,
        isStandard: true
      });
      headingIndex++;
    });

    // If we have standard headings, use those and return early
    if (standardHeadings.length > 0) {
      return tocItems;
    }

    // For existing posts without proper headings, try to detect them
    // Look for patterns that indicate section headings:
    
    // 1. All-caps text that's short (likely a heading)
    const allElements = tempDiv.querySelectorAll('p, div, span, strong, b, h1, h2, h3, h4, h5, h6');
    const seenTexts = new Set();
    
    allElements.forEach((element) => {
      const text = element.textContent || element.innerText;
      if (!text || !text.trim()) return;
      
      const trimmedText = text.trim();
      
      // Skip if already processed
      if (seenTexts.has(trimmedText)) return;
      seenTexts.add(trimmedText);
      
      // Skip if too long (probably not a heading)
      if (trimmedText.length > 100) return;
      
      // Skip if it's just a single word and not all caps
      const words = trimmedText.split(/\s+/);
      if (words.length === 1 && trimmedText !== trimmedText.toUpperCase()) return;
      
      // Check for heading patterns:
      const isAllCaps = trimmedText === trimmedText.toUpperCase() && trimmedText.length > 5;
      const isBold = element.tagName === 'STRONG' || element.tagName === 'B';
      const isShortHeading = words.length <= 10 && trimmedText.length < 150;
      
      // Also check if it's followed by a list or other content (sign of a section heading)
      const nextSibling = element.nextElementSibling;
      const hasListAfter = nextSibling && (nextSibling.tagName === 'UL' || nextSibling.tagName === 'OL');
      
      // Pattern: All caps OR (bold + short) OR (short + followed by list)
      if ((isAllCaps && isShortHeading) || (isBold && isShortHeading) || (isShortHeading && hasListAfter)) {
        // Skip if it's just a number or symbol
        if (/^[\d\s\-•]+$/.test(trimmedText)) return;
        
        // Determine level - all caps is usually H2, bold is H3
        let level = isAllCaps ? 2 : 3;
        
        const sanitizedText = trimmedText.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const id = `heading-${headingIndex}-${sanitizedText}`;
        
        tocItems.push({
          id: id,
          text: trimmedText,
          level: level,
          originalHeading: element,
          isStandard: false
        });
        headingIndex++;
      }
    });

    // Also try to find headings by looking for text patterns
    // Look for lines that are all caps and separated by other content
    if (tocItems.length === 0) {
      const textContent = tempDiv.textContent || '';
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      lines.forEach((line, index) => {
        // Skip if it's too long
        if (line.length > 100) return;
        
        // Check if it's all caps and looks like a heading
        const isAllCaps = line === line.toUpperCase() && line.length > 5;
        const words = line.split(/\s+/);
        const isShortHeading = words.length <= 10;
        
        if (isAllCaps && isShortHeading && !seenTexts.has(line)) {
          // Skip if it's just numbers or symbols
          if (/^[\d\s\-•]+$/.test(line)) return;
          
          const sanitizedText = line.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const id = `heading-${headingIndex}-${sanitizedText}`;
          
          // Try to find the element in the DOM
          let foundElement = null;
          allElements.forEach(el => {
            if ((el.textContent || el.innerText).trim() === line) {
              foundElement = el;
            }
          });
          
          tocItems.push({
            id: id,
            text: line,
            level: 2,
            originalHeading: foundElement || tempDiv,
            isStandard: false
          });
          headingIndex++;
          seenTexts.add(line);
        }
      });
    }

    return tocItems;
  }, [content, providedHeadings]);

  // Process content to add IDs to headings (both standard and detected ones)
  useEffect(() => {
    if (!content || headings.length === 0) {
      setProcessedContent(content);
      return;
    }

    // Create a temporary div to modify the content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    // Add IDs to all detected headings (both standard and non-standard)
    headings.forEach((headingItem) => {
      const headingElement = headingItem.originalHeading;
      if (headingElement && !headingElement.id) {
        headingElement.id = headingItem.id;
      }
    });

    const updatedContent = tempDiv.innerHTML;
    setProcessedContent(updatedContent);

    // Notify parent component if content was modified
    if (onContentUpdate && updatedContent !== content) {
      onContentUpdate(updatedContent);
    }
  }, [content, headings, onContentUpdate]);

  const scrollToHeading = (id) => {
    // Try to find in blog prose content first (for blog post pages)
    const blogProse = document.querySelector('.blog-prose');
    if (blogProse) {
      const heading = blogProse.querySelector(`#${id}`);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Highlight the heading briefly
        heading.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        heading.style.transition = 'background-color 0.3s ease';
        setTimeout(() => {
          heading.style.backgroundColor = '';
        }, 1000);
        return;
      }
    }

    // Try to find element in the editor (for admin pages)
    const editorElement = document.querySelector('.editor-content');
    if (editorElement) {
      const heading = editorElement.querySelector(`#${id}`);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Highlight the heading briefly
        heading.style.backgroundColor = 'var(--accent-green)';
        heading.style.transition = 'background-color 0.3s ease';
        setTimeout(() => {
          heading.style.backgroundColor = '';
        }, 1000);
        return;
      }
    }

    // Fallback to document element
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Highlight briefly
      element.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      element.style.transition = 'background-color 0.3s ease';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 1000);
    } else {
      console.warn('⚠️ TableOfContents: Heading not found:', id);
    }
  };

  // Debug logging (remove in production if needed)
  useEffect(() => {
    if (content && headings.length === 0) {
      console.log('🔍 TableOfContents: No headings found in content', {
        contentLength: content.length,
        contentPreview: content.substring(0, 200)
      });
    } else if (headings.length > 0) {
      console.log('✅ TableOfContents: Found headings', {
        count: headings.length,
        headings: headings.map(h => ({ text: h.text, level: h.level }))
      });
    }
  }, [content, headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className={`table-of-contents ${className}`}>
      <div className="toc-header">
        <List size={18} />
        <h3 className="toc-title">Table of Contents</h3>
      </div>
      <nav className="toc-nav">
        <ul className="toc-list">
          {headings.map((heading, index) => (
            <li
              key={`${heading.id}-${index}`}
              className={`toc-item toc-level-${heading.level}`}
            >
              <button
                onClick={() => scrollToHeading(heading.id)}
                className="toc-link"
                style={{ color: 'var(--text-secondary)' }}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default TableOfContents;

