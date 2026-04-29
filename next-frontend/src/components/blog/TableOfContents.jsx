import React, { useEffect, useMemo, useState } from 'react';
import { List, ChevronDown } from '@components/icons';
import { applyHeadingIdsToElement, parseBlogHeadingsFromHtml } from '@/utils/blogHeadings';
import './TableOfContents.css';

const findHeadingElement = (id, container) => {
  if (!id) {
    return null;
  }

  if (container?.querySelector) {
    try {
      const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
      const scopedMatch = container.querySelector(`#${escapedId}`);
      if (scopedMatch) {
        return scopedMatch;
      }
    } catch {
      // Fall back to document lookup when selector escaping is unavailable.
    }
  }

  return document.getElementById(id);
};

const scrollToHeading = (id, containerRef, setActiveId) => {
  const element = findHeadingElement(id, containerRef?.current);
  if (!element) {
    return false;
  }

  setActiveId(id);

  if (window.location.hash !== `#${id}`) {
    window.history.pushState(null, '', `#${id}`);
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  element.style.backgroundColor = 'rgba(16, 185, 129, 0.16)';
  element.style.transition = 'background-color 0.3s ease';
  window.setTimeout(() => {
    element.style.backgroundColor = '';
  }, 1000);

  return true;
};

const TableOfContents = ({
  content,
  className = '',
  headings: providedHeadings,
  sticky = false,
  containerRef = null
}) => {
  const [activeId, setActiveId] = useState(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const headings = useMemo(() => {
    if (providedHeadings?.length) {
      return providedHeadings;
    }
    return parseBlogHeadingsFromHtml(content);
  }, [content, providedHeadings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setIsOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (headings.length === 0) {
      return;
    }

    const container =
      containerRef?.current ||
      document.querySelector('.blog-prose') ||
      document.querySelector('.tiptap') ||
      document.querySelector('.editor-content');

    applyHeadingIdsToElement(container, headings);
  }, [containerRef, headings]);

  useEffect(() => {
    if (headings.length === 0) {
      return;
    }

    const container = containerRef?.current;
    const elements = headings
      .map((heading) => findHeadingElement(heading.id, container))
      .filter(Boolean);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries[0]?.target?.id) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: '-15% 0px -65% 0px',
        threshold: [0.1, 0.35, 0.6]
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [containerRef, headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className={`table-of-contents ${sticky ? 'table-of-contents-sticky' : ''} ${className}`}>
      {isDesktop ? (
        <div className="toc-header toc-header-desktop">
          <span className="toc-header-main">
            <List size={18} />
            <h3 className="toc-title">Table of Contents</h3>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="toc-header toc-mobile-toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span className="toc-header-main">
            <List size={18} />
            <h3 className="toc-title">Table of Contents</h3>
          </span>
          <span className="toc-header-button">
            <ChevronDown size={18} className={`toc-chevron ${isOpen ? 'open' : ''}`} />
          </span>
        </button>
      )}
      <nav className={`toc-nav ${(isDesktop || isOpen) ? 'open' : 'collapsed'}`}>
        <ul className="toc-list">
          {headings.map((heading, index) => (
            <li key={`${heading.id}-${index}`} className={`toc-item toc-level-${heading.level}`}>
              <a
                href={`#${heading.id}`}
                className={`toc-link ${activeId === heading.id ? 'active' : ''}`}
                aria-current={activeId === heading.id ? 'location' : undefined}
                onClick={(event) => {
                  const didScroll = scrollToHeading(heading.id, containerRef, setActiveId);
                  if (didScroll) {
                    event.preventDefault();
                  }
                  if (!isDesktop) {
                    setIsOpen(false);
                  }
                }}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default TableOfContents;
