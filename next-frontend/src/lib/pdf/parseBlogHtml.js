import { sanitizePdfText, sanitizeInlinePdfText, stripHtml, stripInlineHtml, toAbsoluteAssetUrl } from './pdfUtils';

function normalizePdfHref(href = '') {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  return toAbsoluteAssetUrl(trimmed) || trimmed;
}

function mergeAdjacentTextParts(parts) {
  const merged = [];
  parts.forEach((part) => {
    if (
      part.type === 'text'
      && merged.length > 0
      && merged[merged.length - 1].type === 'text'
    ) {
      merged[merged.length - 1].value = sanitizeInlinePdfText(
        `${merged[merged.length - 1].value}${part.value}`,
      );
      return;
    }
    merged.push(part);
  });
  return merged.filter((part) => {
    if (part.type === 'link') return part.text && part.href;
    return part.value && part.value.trim();
  });
}

function decodeInlineEntities(text = '') {
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return sanitizeInlinePdfText(el.value);
  }

  return sanitizeInlinePdfText(
    text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  );
}

function parseInlineHtmlFallback(html = '') {
  const parts = [];
  const normalized = html.replace(/<br\s*\/?>/gi, ' ');
  const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index);
    if (before) {
      const text = decodeInlineEntities(stripInlineHtml(before));
      if (text) parts.push({ type: 'text', value: text });
    }
    const href = normalizePdfHref(match[1]);
    const linkText = decodeEntities(stripHtml(match[2]));
    if (href && linkText) {
      parts.push({ type: 'link', href, text: linkText });
    }
    lastIndex = match.index + match[0].length;
  }

  const after = normalized.slice(lastIndex);
  if (after) {
    const text = decodeInlineEntities(stripInlineHtml(after));
    if (text) parts.push({ type: 'text', value: text });
  }

  return mergeAdjacentTextParts(parts);
}

function parseInlineContent(node) {
  if (!node) return [];

  if (typeof node === 'string') {
    return parseInlineHtmlFallback(node);
  }

  const parts = [];

  function walk(inlineNode) {
    if (inlineNode.nodeType === Node.TEXT_NODE) {
      const text = decodeInlineEntities(inlineNode.textContent || '');
      if (text) parts.push({ type: 'text', value: text });
      return;
    }

    if (inlineNode.nodeType !== Node.ELEMENT_NODE) return;

    const tag = inlineNode.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;

    if (tag === 'BR') {
      parts.push({ type: 'text', value: ' ' });
      return;
    }

    if (tag === 'A') {
      const href = normalizePdfHref(inlineNode.getAttribute('href') || '');
      const linkParts = [];
      Array.from(inlineNode.childNodes).forEach((child) => {
        const childParts = collectInlineParts(child);
        linkParts.push(...childParts);
      });
      const linkText = linkParts
        .map((part) => (part.type === 'link' ? part.text : part.value))
        .join('')
        .trim();
      if (href && linkText) {
        parts.push({ type: 'link', href, text: sanitizePdfText(linkText) });
      } else if (linkText) {
        parts.push({ type: 'text', value: sanitizePdfText(linkText) });
      }
      return;
    }

    if (tag === 'STRONG' || tag === 'B' || tag === 'EM' || tag === 'I' || tag === 'SPAN' || tag === 'U') {
      Array.from(inlineNode.childNodes).forEach(walk);
      return;
    }

    Array.from(inlineNode.childNodes).forEach(walk);
  }

  function collectInlineParts(inlineNode) {
    if (inlineNode.nodeType === Node.TEXT_NODE) {
      const text = decodeInlineEntities(inlineNode.textContent || '');
      return text ? [{ type: 'text', value: text }] : [];
    }
    if (inlineNode.nodeType !== Node.ELEMENT_NODE) return [];

    const tag = inlineNode.tagName;
    if (tag === 'BR') return [{ type: 'text', value: ' ' }];
    if (tag === 'A') {
      const href = normalizePdfHref(inlineNode.getAttribute('href') || '');
      const linkText = decodeEntities(stripHtml(inlineNode.innerHTML));
      if (href && linkText) return [{ type: 'link', href, text: linkText }];
      if (linkText) return [{ type: 'text', value: linkText }];
      return [];
    }
    return Array.from(inlineNode.childNodes).flatMap(collectInlineParts);
  }

  Array.from(node.childNodes).forEach(walk);
  return mergeAdjacentTextParts(parts);
}

export function partsToPlainText(parts = []) {
  return parts.map((part) => (part.type === 'link' ? part.text : part.value)).join('');
}

function decodeEntities(text = '') {
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return sanitizePdfText(el.value);
  }

  return sanitizePdfText(
    text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  );
}

function parseListItems(listElement) {
  return Array.from(listElement.querySelectorAll(':scope > li'))
    .map((item) => parseInlineContent(item))
    .filter((parts) => parts.length > 0);
}

function walkNode(node, blocks) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = decodeEntities(node.textContent || '');
    if (text) {
      blocks.push({ type: 'paragraph', parts: [{ type: 'text', value: text }] });
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'SVG') return;

  if (tag === 'IMG') {
    const src = node.getAttribute('src');
    const alt = node.getAttribute('alt') || '';
    if (src) blocks.push({ type: 'image', src, alt });
    return;
  }

  if (tag === 'HR') {
    blocks.push({ type: 'hr' });
    return;
  }

  if (tag === 'BLOCKQUOTE') {
    const parts = parseInlineContent(node);
    if (parts.length) blocks.push({ type: 'blockquote', parts });
    return;
  }

  if (tag === 'UL' || tag === 'OL') {
    blocks.push({ type: tag === 'OL' ? 'ol' : 'ul', items: parseListItems(node) });
    return;
  }

  if (/^H[1-4]$/.test(tag)) {
    const parts = parseInlineContent(node);
    if (parts.length) {
      blocks.push({ type: 'heading', level: Number(tag.slice(1)), parts });
    }
    return;
  }

  if (tag === 'PRE') {
    blocks.push({ type: 'pre', text: sanitizePdfText(node.textContent || '') });
    return;
  }

  if (tag === 'P' || tag === 'LI') {
    const parts = parseInlineContent(node);
    if (parts.length) blocks.push({ type: 'paragraph', parts });
    return;
  }

  if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'FIGURE') {
    Array.from(node.childNodes).forEach((child) => walkNode(child, blocks));
    return;
  }

  Array.from(node.childNodes).forEach((child) => walkNode(child, blocks));
}

function mergeParagraphBlocks(blocks) {
  const merged = [];
  blocks.forEach((block) => {
    if (block.type === 'paragraph' && merged.length > 0 && merged[merged.length - 1].type === 'paragraph') {
      merged[merged.length - 1].parts = mergeAdjacentTextParts([
        ...merged[merged.length - 1].parts,
        { type: 'text', value: ' ' },
        ...block.parts,
      ]);
      return;
    }
    merged.push(block);
  });
  return merged;
}

export function parseBlogHtml(html = '') {
  if (!html) return [];

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = [];
    Array.from(doc.body.childNodes).forEach((node) => walkNode(node, blocks));
    return mergeParagraphBlocks(blocks);
  }

  const blocks = [];
  const paragraphRegex = /<(p|h1|h2|h3|h4|blockquote|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = paragraphRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const parts = parseInlineHtmlFallback(match[2]);
    if (!parts.length) continue;
    if (tag.startsWith('h')) {
      blocks.push({ type: 'heading', level: Number(tag.slice(1)), parts });
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'blockquote', parts });
    } else if (tag === 'li') {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(parts);
      else blocks.push({ type: 'ul', items: [parts] });
    } else {
      blocks.push({ type: 'paragraph', parts });
    }
  }
  return mergeParagraphBlocks(blocks);
}

export function normalizeBlogPostForPdf(post = {}) {
  const author = post.author && post.author !== 'Admin' ? post.author : 'Krishna';
  return {
    slug: post.slug,
    title: sanitizePdfText(post.title || 'TrailVerse Blog'),
    excerpt: sanitizePdfText(post.excerpt || ''),
    author: sanitizePdfText(author),
    category: sanitizePdfText(post.category || 'Blog'),
    publishedAt: post.publishedAt,
    readTime: post.readTime,
    featuredImage: post.featuredImage,
    contentHtml: post.contentHtml || post.content || '',
    canonicalUrl: post.canonicalUrl
      || (post.slug ? `https://www.nationalparksexplorerusa.com/blog/${post.slug}` : null),
  };
}
