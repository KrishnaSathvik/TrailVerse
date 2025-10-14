/**
 * Utility functions for safely handling HTML content
 */

/**
 * Safely processes HTML content to render only br tags while removing other HTML
 * @param {string} htmlContent - The HTML content to process
 * @returns {string} - Processed HTML content with only br tags
 */
export const processHtmlContent = (htmlContent) => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  return htmlContent
    .replace(/<br\s*\/?>/gi, '<br />')  // Normalize br tags to consistent format
    .replace(/<[^>]*(?!br)[^>]*>/g, '')  // Remove all HTML tags except br
    .replace(/&nbsp;/g, ' ')  // Convert &nbsp; to regular spaces
    .replace(/&amp;/g, '&')   // Convert &amp; to &
    .replace(/&lt;/g, '<')    // Convert &lt; to <
    .replace(/&gt;/g, '>')    // Convert &gt; to >
    .replace(/&quot;/g, '"')  // Convert &quot; to "
    .replace(/&#39;/g, "'")   // Convert &#39; to '
    .trim();  // Remove leading/trailing whitespace
};

/**
 * Creates a React element with processed HTML content
 * @param {string} htmlContent - The HTML content to process and render
 * @param {string} className - CSS class name for the container
 * @param {object} style - Inline styles for the container
 * @returns {object} - React element props for dangerouslySetInnerHTML
 */
export const createHtmlElement = (htmlContent, className = '', style = {}) => {
  const processedContent = processHtmlContent(htmlContent);
  
  return {
    className,
    style,
    dangerouslySetInnerHTML: {
      __html: processedContent
    }
  };
};

/**
 * Converts HTML content to plain text with line breaks preserved
 * @param {string} htmlContent - The HTML content to convert
 * @returns {string} - Plain text with line breaks
 */
export const htmlToPlainText = (htmlContent) => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  return htmlContent
    .replace(/<br\s*\/?>/gi, '\n')  // Convert br tags to newlines
    .replace(/<[^>]*>/g, '')        // Remove all HTML tags
    .replace(/&nbsp;/g, ' ')        // Convert &nbsp; to spaces
    .replace(/&amp;/g, '&')         // Convert &amp; to &
    .replace(/&lt;/g, '<')          // Convert &lt; to <
    .replace(/&gt;/g, '>')          // Convert &gt; to >
    .replace(/&quot;/g, '"')        // Convert &quot; to "
    .replace(/&#39;/g, "'")         // Convert &#39; to '
    .replace(/\n\s*\n/g, '\n\n')    // Clean up multiple newlines
    .trim();  // Remove leading/trailing whitespace
};
