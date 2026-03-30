import React, { useState } from 'react';
import { Facebook, Twitter, Instagram, Link2, Mail, Share2, Printer } from '@components/icons';
import { useToast } from '../../context/ToastContext';
import Button from './Button';

const ShareButtons = ({ url, title, description, image, type = 'default', showPrint = null }) => {
  const { showToast } = useToast();
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  
  // Determine if print should be shown
  // If showPrint prop is explicitly set, use it
  // Otherwise, only show print on blog post pages
  const shouldShowPrint = showPrint !== null 
    ? showPrint 
    : (typeof window !== 'undefined' && window.location.pathname.includes('/blog/') && window.location.pathname !== '/blog');
  
  // Generate share URL - use production URL for rich previews, current URL as fallback
  const generatePublicUrl = () => {
    // If URL prop is provided and it's a production URL, use it
    // This ensures platforms can fetch Open Graph meta tags for rich previews
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      // If it's already a production URL, use it
      if (url.includes('nationalparksexplorerusa.com')) {
        return url;
      }
    }
    
    // If we're on a production domain, use current URL
    if (typeof window !== 'undefined' && window.location.href) {
      const currentUrl = window.location.href;
      // If current URL is production, use it
      if (currentUrl.includes('nationalparksexplorerusa.com')) {
        return currentUrl;
      }
      // If on localhost/development, construct production URL from pathname
      if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        const pathname = window.location.pathname;
        const search = window.location.search;
        const hash = window.location.hash;
        // Construct production URL from current path
        const productionUrl = `https://www.nationalparksexplorerusa.com${pathname}${search}${hash}`;
        return productionUrl;
      }
      return currentUrl;
    }
    
    // Fallback to prop if window is not available (SSR case)
    return url || '';
  };
  
  // Convert relative image URL to absolute URL
  const getAbsoluteImageUrl = (imgUrl) => {
    if (!imgUrl || imgUrl.trim() === '') return null;
    
    // If already absolute URL, return as is
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl;
    }
    
    // If data URL, return as is
    if (imgUrl.startsWith('data:')) {
      return imgUrl;
    }
    
    // If relative URL, make it absolute
    const baseUrl = window.location.origin;
    
    // Handle protocol-relative URLs (//example.com/image.jpg)
    if (imgUrl.startsWith('//')) {
      return `${window.location.protocol}${imgUrl}`;
    }
    
    // Handle relative URLs
    if (imgUrl.startsWith('/')) {
      return `${baseUrl}${imgUrl}`;
    }
    
    // Handle relative paths without leading slash
    return `${baseUrl}/${imgUrl}`;
  };
  
  // Generate share URL dynamically - compute at share time to ensure current page URL
  const shareUrl = generatePublicUrl();
  const shareImageUrl = image ? getAbsoluteImageUrl(image) : null;

  // Shorten URL for display (remove protocol, www, etc.)
  const shortenUrl = (url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      // Remove 'www.' prefix if present
      let hostname = urlObj.hostname.replace(/^www\./, '');
      // Return hostname + pathname
      return hostname + urlObj.pathname;
    } catch (e) {
      // If URL parsing fails, try to extract manually
      const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)(.*)/);
      if (match) {
        return match[1] + match[2];
      }
      return url;
    }
  };

  const handleCopyLink = () => {
    // Always get current URL at copy time
    const currentUrl = generatePublicUrl();
    // Only copy the link, not title
    navigator.clipboard.writeText(currentUrl);
    showToast('Link copied to clipboard!', 'success');
  };

  // Native Web Share API - Share to other apps with image
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        // Always get current URL at share time to ensure correct URL
        const currentUrl = generatePublicUrl();
        const currentTitle = title || 'Check this out!';
        
        // For rich previews like TravelswithKrishna, we need to share the URL
        // Platforms (WhatsApp, Facebook, etc.) will fetch Open Graph meta tags from the URL
        // to generate rich previews with image, title, and description
        // Some platforms auto-detect URLs from text field, causing duplication
        // Solution: Only provide URL field (which generates rich preview) - no text field
        // This ensures the URL appears once and rich preview is generated
        const shareData = {
          title: currentTitle,
          url: currentUrl, // URL is key - platforms fetch this to get Open Graph tags for rich preview
          // Note: We intentionally omit 'text' field to avoid URL duplication
          // Platforms will show the title and generate rich preview from the URL
        };

        // Note: We don't include files here because:
        // 1. When sharing a URL, platforms fetch Open Graph meta tags from the page
        // 2. This generates rich previews with proper image, title, and description
        // 3. Including files might cause platforms to show the file instead of the rich preview
        // The SEO component already sets up proper og:image, og:title, og:description tags

        await navigator.share(shareData);
        showToast('Shared successfully!', 'success');
      } catch (error) {
        // User cancelled or error occurred
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          showToast('Failed to share. Please try again.', 'error');
        }
      }
    } else {
      // Fallback: Copy link if Web Share API not supported
      handleCopyLink();
    }
  };

  // Print functionality with PDF save option
  const handlePrint = () => {
    // Check if we're on a blog post page
    const isBlogPost = window.location.pathname.includes('/blog/') && 
                       window.location.pathname !== '/blog';
    
    let contentHTML = '';
    let featuredImageHTML = '';
    
    if (isBlogPost) {
      // For blog posts, extract only the blog content
      const article = document.querySelector('article');
      if (article) {
        // Clone the article to avoid modifying the original
        const articleClone = article.cloneNode(true);
        
        // Remove elements we don't want to print
        const elementsToRemove = articleClone.querySelectorAll(
          'header, nav, footer, .share-buttons, button, .comment-section, .related-posts, .back-button, .like-favorite, .table-of-contents, iframe, script, style, link[rel="stylesheet"], meta'
        );
        elementsToRemove.forEach(el => el.remove());
        
        // Remove only the "Back to Blog" navigation link, not all blog links
        const backLink = articleClone.querySelector('a[href*="/blog"]:not(.blog-prose a)');
        if (backLink && (backLink.textContent.includes('Back') || backLink.textContent.includes('back'))) {
          backLink.remove();
        }
        
        // Remove meta info section (author, date, views, etc.) - look for div containing share buttons or meta info
        const metaInfoSections = articleClone.querySelectorAll('div');
        metaInfoSections.forEach(section => {
          // Check if this section contains share buttons or looks like meta info
          const hasShareButtons = section.querySelector('.share-buttons') || 
                                  section.querySelector('button[title*="Share"]') ||
                                  section.querySelector('a[title*="Share"]');
          const hasMetaInfo = section.textContent.includes('By ') || 
                             section.textContent.includes('min read') ||
                             section.textContent.includes('views');
          
          if (hasShareButtons || (hasMetaInfo && section.textContent.length < 200)) {
            section.remove();
          }
        });
        
        // Remove category badge (usually a rounded-full span)
        const categoryBadges = articleClone.querySelectorAll('span[class*="rounded-full"]');
        categoryBadges.forEach(badge => {
          // Remove badge if it looks like a category badge (contains category-like text)
          const text = badge.textContent.toLowerCase();
          if (text.length < 50 && !text.includes('read') && !text.includes('view')) {
            badge.remove();
          }
        });
        
        // Remove "Back to Blog" navigation link (already handled above, but keep for safety)
        const additionalBackLinks = articleClone.querySelectorAll('a[href*="/blog"]');
        additionalBackLinks.forEach(link => {
          // Only remove if it's clearly a navigation link (contains "Back" or "back" in text)
          const linkText = link.textContent.toLowerCase();
          if (linkText.includes('back') || linkText.includes('←') || link.parentElement?.classList.contains('back-button')) {
            link.remove();
          }
        });
        
        // Get the featured image if it exists (check multiple locations)
        let featuredImg = articleClone.querySelector('img[src*="featured"]');
        if (!featuredImg) {
          // Try to find the first large image (likely the featured image)
          const images = articleClone.querySelectorAll('img');
          featuredImg = Array.from(images).find(img => {
            const src = img.src || '';
            // Check if it's a large image (not an icon or small image)
            return !src.includes('icon') && !src.includes('logo') && !src.includes('avatar');
          });
        }
        
        // Use shareImageUrl if available, otherwise use featuredImg src
        const featuredImageSrc = shareImageUrl || (featuredImg ? getAbsoluteImageUrl(featuredImg.src || featuredImg.getAttribute('src') || '') : null);
        
        if (featuredImageSrc) {
          const escapedImageSrc = featuredImageSrc.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          const escapedAlt = (featuredImg?.alt || title || 'Blog post image').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          featuredImageHTML = `<div class="print-featured-image" style="margin-bottom: 1em; margin-top: 0; text-align: center; page-break-inside: avoid; page-break-after: avoid;">
            <img src="${escapedImageSrc}" alt="${escapedAlt}" style="max-width: 100%; max-height: 350px; height: auto; border-radius: 4px; margin: 0 auto; display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onerror="this.style.display='none';" crossorigin="anonymous" />
          </div>`;
        }
        
        // Get the blog prose content (main article content)
        const blogProse = articleClone.querySelector('.blog-prose');
        let blogContent = blogProse ? blogProse.innerHTML : articleClone.innerHTML;
        
        // Convert all relative link URLs to absolute URLs so they work in PDFs
        blogContent = blogContent.replace(/<a([^>]*?)href="([^"]*)"([^>]*?)>/gi, (match, before, href, after) => {
          // Skip if it's already absolute or is a data/mailto link
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
            return match; // Keep as is
          }
          // Convert relative URLs to absolute
          const absoluteHref = getAbsoluteImageUrl(href);
          if (!absoluteHref) return match;
          const escapedHref = absoluteHref.replace(/"/g, '&quot;');
          return `<a${before}href="${escapedHref}"${after}>`;
        });
        
        // Also handle links with single quotes
        blogContent = blogContent.replace(/<a([^>]*?)href='([^']*)'([^>]*?)>/gi, (match, before, href, after) => {
          // Skip if it's already absolute or is a data/mailto link
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
            return match; // Keep as is
          }
          // Convert relative URLs to absolute
          const absoluteHref = getAbsoluteImageUrl(href);
          if (!absoluteHref) return match;
          const escapedHref = absoluteHref.replace(/'/g, '&#39;');
          return `<a${before}href="${escapedHref}"${after}>`;
        });
        
        // Convert all relative image URLs to absolute URLs in the blog content
        blogContent = blogContent.replace(/<img([^>]*?)src="([^"]*)"([^>]*?)>/gi, (match, before, src, after) => {
          const absoluteSrc = getAbsoluteImageUrl(src);
          if (!absoluteSrc) return match; // Skip if URL conversion failed
          const escapedSrc = absoluteSrc.replace(/"/g, '&quot;');
          // Check if crossorigin already exists
          const hasCrossorigin = before.includes('crossorigin') || after.includes('crossorigin');
          const crossoriginAttr = hasCrossorigin ? '' : ' crossorigin="anonymous"';
          return `<img${before}src="${escapedSrc}"${after}${crossoriginAttr}>`;
        });
        
        // Also handle images with single quotes
        blogContent = blogContent.replace(/<img([^>]*?)src='([^']*)'([^>]*?)>/gi, (match, before, src, after) => {
          const absoluteSrc = getAbsoluteImageUrl(src);
          if (!absoluteSrc) return match; // Skip if URL conversion failed
          const escapedSrc = absoluteSrc.replace(/'/g, '&#39;');
          // Check if crossorigin already exists
          const hasCrossorigin = before.includes('crossorigin') || after.includes('crossorigin');
          const crossoriginAttr = hasCrossorigin ? '' : ' crossorigin="anonymous"';
          return `<img${before}src="${escapedSrc}"${after}${crossoriginAttr}>`;
        });
        
        // Add error handling to all images in content (without duplicating)
        blogContent = blogContent.replace(/<img([^>]*?)>/gi, (match) => {
          if (match.includes('onerror')) return match; // Already has error handler
          return match.replace('>', ' onerror="this.style.display=\'none\';">');
        });
        
        // Get title and excerpt from the article
        const articleTitle = articleClone.querySelector('h1')?.textContent || title || '';
        const articleExcerpt = articleClone.querySelector('p[class*="excerpt"], p[class*="lead"]')?.textContent || description || '';
        
        // Build clean blog post HTML with compact spacing
        contentHTML = `
          <div class="print-blog-content" style="max-width: 100%; margin: 0 auto; padding: 0 10px;">
            ${articleTitle ? `<h1 class="print-blog-title" style="font-size: 24pt; font-weight: 700; margin-bottom: 0.5em; margin-top: 0; color: #000; line-height: 1.2; page-break-after: avoid;">${articleTitle}</h1>` : ''}
            ${articleExcerpt ? `<p class="print-blog-excerpt" style="font-size: 11pt; color: #444; margin-bottom: 1em; font-style: italic; line-height: 1.5; border-left: 3px solid #0369A1; padding-left: 0.75em;">${articleExcerpt}</p>` : ''}
            ${featuredImageHTML}
            <div class="print-blog-body">
              ${blogContent}
            </div>
          </div>
        `;
      } else {
        // Fallback for blog posts without article tag
        const blogProse = document.querySelector('.blog-prose');
        contentHTML = blogProse ? blogProse.innerHTML : '';
      }
    } else {
      // For other pages, use the general content extraction
      const mainContent = document.querySelector('article') || 
                         document.querySelector('main') || 
                         document.querySelector('[role="main"]') ||
                         document.body;
      
      if (mainContent) {
        const contentClone = mainContent.cloneNode(true);
        // Remove navigation and UI elements
        const elementsToRemove = contentClone.querySelectorAll(
          'header, nav, footer, button, .share-buttons, .comment-section, .related-posts, .back-button, iframe, script, style'
        );
        elementsToRemove.forEach(el => el.remove());
        contentHTML = contentClone.innerHTML;
      }
    }
    
    // Create print styles
    const printStyles = `
      <style>
        @media print {
          @page {
            margin: 1cm 1.2cm;
            size: A4;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.5;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 0;
          }
          .no-print,
          header,
          nav,
          footer,
          button,
          .share-buttons,
          .comment-section,
          .related-posts,
          .back-button,
          .like-favorite,
          .table-of-contents,
          iframe,
          script,
          style {
            display: none !important;
          }
          
          /* Ensure all links in blog content are visible and styled */
          a {
            color: #000 !important;
            text-decoration: underline !important;
            display: inline !important;
          }
          
          /* Links display as normal text without URL in print, but remain clickable in PDFs */
          
          /* Ensure links are clickable in PDFs */
          a[href] {
            cursor: pointer;
          }
          
          /* Ensure links within blog content are visible */
          .blog-prose a,
          .print-blog-body a,
          .print-blog-content a,
          article a,
          a[href^="http"],
          a[href^="https"],
          a[href^="/"],
          a[href^="#"] {
            display: inline !important;
            color: #000 !important;
            text-decoration: underline !important;
          }
          
          /* Only hide specific navigation links, not all blog links */
          a.back-button,
          a[title*="Back"],
          a[aria-label*="Back"] {
            display: none !important;
          }
          img {
            max-width: 100% !important;
            max-height: 400px !important;
            height: auto !important;
            page-break-inside: avoid;
            page-break-after: avoid;
            display: block;
            margin: 0.75em auto !important;
            border-radius: 4px;
          }
          
          /* Featured image spacing */
          .print-blog-content img:first-of-type {
            margin-top: 0 !important;
            margin-bottom: 1em !important;
            max-height: 350px !important;
          }
          
          /* Images after headings */
          h1 + img, h2 + img, h3 + img {
            margin-top: 0.5em !important;
          }
          img[src=""],
          img:not([src]) {
            display: none !important;
          }
          /* Blog Content Container */
          .print-blog-content {
            max-width: 800px;
            margin: 0 auto;
          }
          
          .print-blog-title {
            font-size: 24pt !important;
            font-weight: 700 !important;
            line-height: 1.2 !important;
            margin-top: 0 !important;
            margin-bottom: 0.5em !important;
            color: #000 !important;
            page-break-after: avoid;
          }
          
          .print-blog-excerpt {
            font-size: 11pt !important;
            line-height: 1.5 !important;
            margin-bottom: 1em !important;
            color: #444 !important;
            font-style: italic;
          }
          
          .print-blog-body {
            margin-top: 0.75em;
          }
          
          /* Headings - Improved spacing and hierarchy */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
            page-break-inside: avoid;
            color: #000 !important;
            font-weight: 700 !important;
            line-height: 1.3 !important;
          }
          
          /* Remove duplicate h1 styling from blog content */
          .print-blog-body h1 {
            font-size: 18pt !important;
            margin-top: 1.25em !important;
            margin-bottom: 0.5em !important;
            padding-bottom: 0.3em !important;
            border-bottom: 2px solid #0369A1 !important;
            color: #000 !important;
          }
          
          h2 {
            font-size: 15pt !important;
            margin-top: 1.25em !important;
            margin-bottom: 0.5em !important;
            padding-bottom: 0.3em !important;
            border-bottom: 1px solid #ddd !important;
            color: #000 !important;
          }
          
          h3 {
            font-size: 13pt !important;
            margin-top: 1em !important;
            margin-bottom: 0.4em !important;
            color: #000 !important;
          }
          
          h4 {
            font-size: 11pt !important;
            margin-top: 0.75em !important;
            margin-bottom: 0.3em !important;
            color: #000 !important;
          }
          
          h5, h6 {
            font-size: 10pt !important;
            margin-top: 0.75em !important;
            margin-bottom: 0.3em !important;
            color: #000 !important;
          }
          
          /* Paragraphs - Compact spacing */
          p {
            orphans: 2;
            widows: 2;
            page-break-inside: avoid;
            margin-top: 0 !important;
            margin-bottom: 0.6em !important;
            line-height: 1.5 !important;
            font-size: 10pt !important;
            color: #000 !important;
          }
          
          /* Lists - Compact spacing */
          ul, ol {
            margin-top: 0.5em !important;
            margin-bottom: 0.5em !important;
            padding-left: 1.5em !important;
            page-break-inside: avoid;
          }
          
          li {
            orphans: 2;
            widows: 2;
            page-break-inside: avoid;
            margin-bottom: 0.3em !important;
            line-height: 1.5 !important;
            color: #000 !important;
            font-size: 10pt !important;
          }
          
          /* First paragraph after heading */
          h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p {
            margin-top: 0.4em !important;
          }
          blockquote {
            border-left: 3px solid #0369A1 !important;
            margin-left: 0 !important;
            margin-top: 0.75em !important;
            margin-bottom: 0.75em !important;
            padding: 0.6em 1em !important;
            background: #f5f5f5;
            font-style: italic;
            page-break-inside: avoid;
            color: #333 !important;
            font-size: 10pt !important;
          }
          
          blockquote p {
            margin-bottom: 0.3em !important;
          }
          
          blockquote p:last-child {
            margin-bottom: 0 !important;
          }
          
          table {
            page-break-inside: avoid;
            border-collapse: collapse;
            margin-top: 0.75em !important;
            margin-bottom: 0.75em !important;
            width: 100% !important;
            font-size: 9pt !important;
          }
          
          table th, table td {
            padding: 0.4em 0.6em !important;
            border: 1px solid #ddd !important;
            text-align: left !important;
            color: #000 !important;
          }
          
          table th {
            background: #f5f5f5 !important;
            font-weight: 700 !important;
          }
          
          /* Code blocks */
          code {
            background: #f5f5f5 !important;
            padding: 0.15em 0.3em !important;
            border-radius: 3px !important;
            font-size: 9pt !important;
            color: #000 !important;
            font-family: 'Monaco', 'Menlo', monospace !important;
          }
          
          pre {
            background: #f5f5f5 !important;
            padding: 0.6em !important;
            border-radius: 4px !important;
            margin: 0.75em 0 !important;
            overflow-x: auto;
            page-break-inside: avoid;
            border: 1px solid #ddd !important;
            font-size: 9pt !important;
          }
          
          pre code {
            background: transparent !important;
            padding: 0 !important;
          }
          
          /* Horizontal rules */
          hr {
            border: none !important;
            border-top: 1px solid #ddd !important;
            margin: 1em 0 !important;
            page-break-inside: avoid;
          }
          .print-header {
            margin-bottom: 2em;
            padding-bottom: 1em;
            border-bottom: 2px solid #000;
          }
          .print-brand-header {
            margin-bottom: 1em !important;
            padding-bottom: 0.75em;
            border-bottom: 2px solid #0369A1;
            text-align: center;
            page-break-inside: avoid;
          }
          
          /* Ensure proper spacing after brand header */
          .print-brand-header + .print-blog-content {
            margin-top: 0.5em;
          }
          .print-brand-logo {
            max-width: 60px !important;
            max-height: 30px !important;
            width: auto !important;
            height: auto !important;
            margin: 0 auto 0.4em !important;
            display: block !important;
            object-fit: contain !important;
          }
          .print-brand-name {
            font-size: 18pt;
            font-weight: bold;
            color: #0369A1;
            margin: 0.3em 0 0.15em;
            letter-spacing: -0.5px;
          }
          .print-brand-tagline {
            font-size: 9pt;
            color: #666;
            font-style: italic;
            margin: 0 0 0.3em;
          }
          .print-brand-url {
            font-size: 8pt;
            color: #999;
            margin-top: 0.3em;
          }
          .print-footer {
            margin-top: 1em;
            padding-top: 0.5em;
            border-top: 1px solid #ccc;
            font-size: 8pt;
            color: #666;
          }
          
          .print-footer p {
            margin-bottom: 0.3em !important;
          }
        }
        @media screen {
          body {
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        }
      </style>
    `;

    // Create an iframe for printing - make it briefly visible to avoid browser blocking
    // Browsers block automatic printing from hidden iframes, so we make it visible briefly
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = 'none';
    printFrame.style.opacity = '0.01'; // Very slightly visible to avoid blocking
    printFrame.style.pointerEvents = 'none';
    printFrame.style.zIndex = '-9999'; // Behind everything
    document.body.appendChild(printFrame);

    const printWindow = printFrame.contentWindow || printFrame.contentDocument;
    if (!printWindow) {
      showToast('Print feature not supported in this browser.', 'error');
      document.body.removeChild(printFrame);
      return;
    }

    // Add an ID to the iframe for easier cleanup (before writing to iframe)
    const printFrameId = 'print-frame-' + Date.now();
    printFrame.id = printFrameId;
    
    const printDoc = printWindow.document || printWindow;
    printDoc.open();
    printDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title || 'Print'}</title>
          ${printStyles}
        </head>
        <body>
          ${isBlogPost ? `
            <div class="print-brand-header">
              <img src="${getAbsoluteImageUrl('/logo.png')}" alt="TrailVerse Logo" class="print-brand-logo" style="max-width: 60px !important; max-height: 30px !important; width: auto !important; height: auto !important;" onerror="this.style.display='none';" />
              <div class="print-brand-name">TrailVerse</div>
              <div class="print-brand-tagline">Your Universe of National Parks Exploration</div>
              <div class="print-brand-url">www.nationalparksexplorerusa.com</div>
            </div>
            ${contentHTML}
            <div class="print-footer" style="margin-top: 3em; padding-top: 1em; border-top: 1px solid #ccc; text-align: center; font-size: 10pt; color: #666;">
              <p>Printed on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
              <p style="margin-top: 0.5em; color: #0369A1;">© ${new Date().getFullYear()} TrailVerse. All rights reserved.</p>
            </div>
          ` : `
            <div class="print-brand-header">
              <img src="${getAbsoluteImageUrl('/logo.png')}" alt="TrailVerse Logo" class="print-brand-logo" style="max-width: 60px !important; max-height: 30px !important; width: auto !important; height: auto !important;" onerror="this.style.display='none';" />
              <div class="print-brand-name">TrailVerse</div>
              <div class="print-brand-tagline">Your Universe of National Parks Exploration</div>
              <div class="print-brand-url">www.nationalparksexplorerusa.com</div>
            </div>
            <div class="print-header">
              <h1>${title || ''}</h1>
              ${description ? `<p style="font-size: 14pt; color: #333; margin-top: 0.5em;">${description}</p>` : ''}
              <p style="font-size: 10pt; color: #666; margin-top: 1em;">
                <strong>Printed on:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <div class="print-content">
              ${contentHTML}
            </div>
            <div class="print-footer">
              <p>Printed from ${window.location.hostname} on ${new Date().toLocaleDateString()}</p>
              <p style="margin-top: 0.5em; color: #0369A1;">© ${new Date().getFullYear()} TrailVerse. All rights reserved.</p>
            </div>
          `}
          <script>
            window.onload = function() {
              // Wait for all images to load before printing
              const images = document.querySelectorAll('img');
              let loadedImages = 0;
              const totalImages = images.length;
              let hasPrinted = false;
              let printTriggered = false;
              let iframeRemoved = false;
              
              // Function to remove iframe from parent
              function removeIframe() {
                if (iframeRemoved) return;
                iframeRemoved = true;
                try {
                  if (window.parent && window.parent.document) {
                    // Try to find the iframe by ID or by style
                    const iframeId = '${printFrameId}';
                    const iframe = (iframeId && window.parent.document.getElementById(iframeId)) ||
                                   window.parent.document.querySelector('iframe[style*="opacity: 0"]') ||
                                   window.parent.document.querySelector('iframe[style*="height: 0"]');
                    if (iframe && iframe.parentNode) {
                      iframe.parentNode.removeChild(iframe);
                    }
                  }
                } catch (e) {
                  // Cross-origin or other error, ignore
                }
              }
              
              // Don't trigger print from inside iframe - let parent handle it
              // This prevents duplicate print dialogs
              // The print is triggered from the parent window's triggerPrintOnce function
              // We only wait for images to load here, then the parent will trigger print
              
              // Wait for images to load, then notify parent (optional - parent handles timing)
              if (totalImages === 0) {
                // No images, content is ready
                return;
              }
              
              // Track image loading (parent will handle print timing)
              images.forEach(function(img) {
                if (img.complete && img.naturalHeight !== 0) {
                  // Image already loaded
                  loadedImages++;
                } else {
                  // Wait for image to load
                  img.onload = function() {
                    loadedImages++;
                  };
                  img.onerror = function() {
                    // Image failed to load, hide it and continue
                    this.style.display = 'none';
                    loadedImages++;
                  };
                }
              });
            };
          </script>
        </body>
      </html>
    `);
    printDoc.close();
    
    showToast('Print dialog opening...', 'success');
    
    // Track if print has been triggered to prevent multiple triggers
    let printTriggered = false;
    let iframeRemoved = false;
    
    // Function to remove iframe after printing/canceling
    const removePrintFrame = function() {
      if (iframeRemoved) return;
      iframeRemoved = true;
      try {
        if (printFrame && printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      } catch (e) {
        // Iframe already removed or error
      }
    };
    
    // Function to trigger print only once
    const triggerPrintOnce = function() {
      if (printTriggered) return;
      printTriggered = true;
      
      const iframeWindow = printFrame.contentWindow || printFrame.contentDocument.defaultView;
      if (!iframeWindow) {
        removePrintFrame();
        return;
      }
      
      try {
        iframeWindow.focus();
        // Small delay to ensure content is fully loaded
        setTimeout(function() {
          try {
            iframeWindow.print();
            
            // Set up immediate cleanup detection
            let cleanupDone = false;
            const doCleanup = function() {
              if (cleanupDone) return;
              cleanupDone = true;
              removePrintFrame();
            };
            
            // Strategy 1: afterprint event (primary)
            iframeWindow.addEventListener('afterprint', function() {
              doCleanup();
            }, { once: true });
            
            // Strategy 2: Immediate polling check (detects when dialog closes quickly)
            // Check every 100ms if window is still focused after print
            let checkCount = 0;
            const checkInterval = setInterval(function() {
              checkCount++;
              // After 10 checks (1 second), if window is still focused, dialog likely closed
              if (checkCount >= 10) {
                clearInterval(checkInterval);
                if (!cleanupDone) {
                  doCleanup();
                }
              }
            }, 100);
            
            // Strategy 3: Focus/blur detection (works when user cancels/prints)
            let focusLost = false;
            const handleBlur = function() {
              focusLost = true;
            };
            const handleFocus = function() {
              if (focusLost) {
                clearInterval(checkInterval);
                setTimeout(function() {
                  if (!cleanupDone) {
                    doCleanup();
                  }
                  window.removeEventListener('blur', handleBlur);
                  window.removeEventListener('focus', handleFocus);
                }, 50);
              }
            };
            
            window.addEventListener('blur', handleBlur, { once: true });
            window.addEventListener('focus', handleFocus, { once: true });
            
            // Strategy 4: Fallback timeout (faster cleanup - 1 second)
            setTimeout(function() {
              clearInterval(checkInterval);
              if (!cleanupDone) {
                doCleanup();
              }
            }, 1000);
          } catch (e) {
            console.error('Error triggering print:', e);
            removePrintFrame();
          }
        }, 250);
      } catch (e) {
        console.error('Error accessing iframe:', e);
        removePrintFrame();
      }
    };
    
    // Wait for iframe to load, then trigger print
    printFrame.onload = function() {
      triggerPrintOnce();
    };
    
    // Fallback: trigger print after a delay if onload doesn't fire
    // But only if print hasn't been triggered yet
    setTimeout(function() {
      if (!printTriggered) {
        const iframeWindow = printFrame.contentWindow || printFrame.contentDocument.defaultView;
        if (iframeWindow && iframeWindow.document && iframeWindow.document.body) {
          triggerPrintOnce();
        } else {
          // Iframe not ready, remove it
          removePrintFrame();
        }
      }
    }, 1500);
  };

  // Get share URL for a platform dynamically at call time
  const getShareUrl = (platform) => {
    const currentUrl = generatePublicUrl();
    const currentTitle = title || '';
    const shortenedUrl = shortenUrl(currentUrl);
    
    switch (platform) {
      case 'Facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;
      case 'Twitter':
        // Twitter: Only title in text (URL is provided separately, Twitter will auto-append it)
        // This prevents showing the link twice
        return `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(currentTitle)}`;
      case 'Instagram':
        return `https://www.instagram.com/`;
      case 'LinkedIn':
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`;
      case 'WhatsApp':
        // WhatsApp: Title + shortened link
        const whatsappText = `${currentTitle} ${shortenedUrl}`;
        return `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
      case 'Reddit':
        return `https://reddit.com/submit?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(currentTitle)}`;
      case 'Email':
        // Email: Title as subject, Title + shortened link in body
        const emailBody = `${currentTitle}\n${shortenedUrl}`;
        return `mailto:?subject=${encodeURIComponent(currentTitle)}&body=${encodeURIComponent(emailBody)}`;
      default:
        return currentUrl;
    }
  };

  // Share links configuration
  const shareLinks = [
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'hover:bg-blue-600'
    },
    {
      name: 'Twitter',
      icon: Twitter,
      color: 'hover:bg-sky-500'
    },
    {
      name: 'Instagram',
      icon: Instagram,
      color: 'hover:bg-pink-600'
    },
    {
      name: 'LinkedIn',
      icon: Share2, // Using Share2 as LinkedIn icon alternative
      color: 'hover:bg-blue-700'
    },
    {
      name: 'WhatsApp',
      icon: Share2, // Using Share2 as WhatsApp icon alternative
      color: 'hover:bg-green-600'
    },
    {
      name: 'Reddit',
      icon: Share2, // Using Share2 as Reddit icon alternative
      color: 'hover:bg-orange-600'
    },
    {
      name: 'Email',
      icon: Mail,
      color: 'hover:bg-gray-600'
    }
  ];

  // Check if Web Share API is supported
  const supportsNativeShare = typeof navigator !== 'undefined' && navigator.share;

  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap sm:flex-nowrap relative">
      {/* Primary social links - always visible */}
      {shareLinks.slice(0, 3).map((link) => {
        const Icon = link.icon;
        return (
          <Button
            key={link.name}
            onClick={() => {
              // Compute share URL dynamically at click time to ensure current page URL
              const shareUrl = getShareUrl(link.name);
              window.open(shareUrl, '_blank', 'noopener,noreferrer');
            }}
            variant="secondary"
            size="sm"
            icon={Icon}
            title={`Share on ${link.name}`}
            className="backdrop-blur flex-shrink-0"
            style={{ 
              padding: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: '1px',
              borderColor: 'rgba(255, 255, 255, 0.3)'
            }}
          />
        );
      })}
      
      {/* Single External Share Button - Native Share or Dropdown */}
      <div className="relative flex-shrink-0">
        <Button
          onClick={async () => {
            // Try native share first if supported
            if (supportsNativeShare) {
              try {
                await handleNativeShare();
                return; // If native share succeeds, don't show dropdown
              } catch (error) {
                // If user cancels or error, fall through to show dropdown
                if (error.name === 'AbortError') {
                  return; // User cancelled, don't show dropdown
                }
              }
            }
            // Show dropdown with all share options
            setShowMoreOptions(!showMoreOptions);
          }}
          variant="secondary"
          size="sm"
          icon={Share2}
          title={supportsNativeShare ? "Share to other apps" : "More sharing options"}
          className="backdrop-blur flex-shrink-0"
          style={{ 
            padding: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: '1px',
            borderColor: 'rgba(255, 255, 255, 0.3)'
          }}
        />
        
        {/* Dropdown with all share options (shown when native share not available or as fallback) */}
        {showMoreOptions && (
          <div className="absolute right-0 mt-2 p-2 rounded-lg backdrop-blur z-50 min-w-[150px]"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {shareLinks.slice(3).map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.name}
                  onClick={() => {
                    // Compute share URL dynamically at click time to ensure current page URL
                    const shareUrl = getShareUrl(link.name);
                    window.open(shareUrl, '_blank', 'noopener,noreferrer');
                    setShowMoreOptions(false);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={Icon}
                  title={`Share on ${link.name}`}
                  className="w-full justify-start mb-1"
                >
                  {link.name}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Close dropdown when clicking outside */}
      {showMoreOptions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMoreOptions(false)}
          style={{ cursor: 'pointer' }}
        />
      )}
      
      {/* Copy Link */}
      <Button
        onClick={handleCopyLink}
        variant="secondary"
        size="sm"
        icon={Link2}
        title="Copy link"
        className="backdrop-blur flex-shrink-0"
        style={{ 
          padding: '0.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: '1px',
          borderColor: 'rgba(255, 255, 255, 0.3)'
        }}
      />

      {/* Print / Save as PDF - Only show on blog posts */}
      {shouldShowPrint && (
        <Button
          onClick={handlePrint}
          variant="secondary"
          size="sm"
          icon={Printer}
          title="Print or Save as PDF"
          className="backdrop-blur flex-shrink-0"
          style={{ 
            padding: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: '1px',
            borderColor: 'rgba(255, 255, 255, 0.3)'
          }}
        />
      )}
    </div>
  );
};

export default ShareButtons;
