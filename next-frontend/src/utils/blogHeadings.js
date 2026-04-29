const sanitizeHeadingText = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const parseLegacyHeadingCandidate = (element, index) => {
  const text = (element.textContent || '').trim();
  if (!text) return null;

  const words = text.split(/\s+/).filter(Boolean);
  const hasSentencePunctuation = /[.!?]/.test(text);
  const isAllCaps = text === text.toUpperCase();

  if (!isAllCaps || hasSentencePunctuation || words.length < 2 || words.length > 10) {
    return null;
  }

  return {
    id: `heading-${index}-${sanitizeHeadingText(text) || index}`,
    text,
    level: 2
  };
};

export const parseBlogHeadingsFromHtml = (html = '') => {
  if (!html) return [];

  // Regex-based parser — works on both server (no document) and client
  const headingRegex = /<(h[1-4])([^>]*)>([\s\S]*?)<\/\1>/gi;
  const headings = [];
  let match;
  let index = 0;

  while ((match = headingRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const inner = match[3];
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : `heading-${index}-${sanitizeHeadingText(text) || index}`;

    headings.push({ id, text, level: Number(tag[1]) });
    index++;
  }

  return headings;
};

export const applyHeadingIdsToElement = (container, headings = []) => {
  if (!container || headings.length === 0) {
    return;
  }

  const targetHeadings = Array.from(container.querySelectorAll('h1, h2, h3, h4'));
  if (targetHeadings.length > 0) {
    targetHeadings.forEach((heading, index) => {
      const item = headings[index];
      if (item && !heading.id) {
        heading.id = item.id;
      }
    });
    return;
  }

  const legacyBlocks = Array.from(container.querySelectorAll('p, div, strong'));
  let headingIndex = 0;

  legacyBlocks.forEach((element) => {
    if (headingIndex >= headings.length || element.id) {
      return;
    }

    const text = (element.textContent || '').trim();
    if (text === headings[headingIndex].text) {
      element.id = headings[headingIndex].id;
      headingIndex += 1;
    }
  });
};

export const injectHeadingIdsIntoHtml = (html = '', headings = []) => {
  if (!html || headings.length === 0) return html;

  // Regex-based injection — works on both server and client
  let headingIndex = 0;
  return html.replace(/<(h[1-4])(\s[^>]*)?\s*>/gi, (match, tag, attrs) => {
    if (headingIndex >= headings.length) return match;
    const item = headings[headingIndex];
    headingIndex++;
    // If already has an id attribute, replace it; otherwise add one
    if (attrs && /id\s*=\s*["'][^"']*["']/i.test(attrs)) {
      return `<${tag}${attrs.replace(/id\s*=\s*["'][^"']*["']/i, `id="${item.id}"`)}>`;
    }
    return `<${tag}${attrs || ''} id="${item.id}">`;
  });
};

export const collectHeadingsFromElement = (container) => {
  if (!container) {
    return [];
  }

  const renderedHeadings = Array.from(container.querySelectorAll('h1, h2, h3, h4'));
  if (renderedHeadings.length > 0) {
    return renderedHeadings
      .map((heading, index) => {
        const text = (heading.textContent || '').trim();
        if (!text) {
          return null;
        }

        if (!heading.id) {
          heading.id = `heading-${index}-${sanitizeHeadingText(text) || index}`;
        }

        return {
          id: heading.id,
          text,
          level: Number(heading.tagName.slice(1))
        };
      })
      .filter(Boolean);
  }

  const legacyCandidates = [];
  Array.from(container.querySelectorAll('p, div, strong')).forEach((element, index) => {
    const candidate = parseLegacyHeadingCandidate(element, index);
    if (!candidate) {
      return;
    }

    if (!element.id) {
      element.id = candidate.id;
    }

    legacyCandidates.push(candidate);
  });

  return legacyCandidates;
};
