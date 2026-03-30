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
  if (typeof document === 'undefined' || !html) {
    return [];
  }

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const headings = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4')).map((heading, index) => {
    const text = (heading.textContent || '').trim();
    return text
      ? {
          id: heading.id || `heading-${index}-${sanitizeHeadingText(text) || index}`,
          text,
          level: Number(heading.tagName.slice(1))
        }
      : null;
  }).filter(Boolean);

  if (headings.length > 0) {
    return headings;
  }

  return Array.from(tempDiv.querySelectorAll('p, div, strong'))
    .map((element, index) => parseLegacyHeadingCandidate(element, index))
    .filter(Boolean);
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
  if (typeof document === 'undefined' || !html || headings.length === 0) {
    return html;
  }

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const targetHeadings = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4'));
  if (targetHeadings.length > 0) {
    targetHeadings.forEach((heading, index) => {
      const item = headings[index];
      if (item) {
        heading.id = item.id;
      }
    });
    return tempDiv.innerHTML;
  }

  const legacyBlocks = Array.from(tempDiv.querySelectorAll('p, div, strong'));
  let headingIndex = 0;

  legacyBlocks.forEach((element) => {
    if (headingIndex >= headings.length) {
      return;
    }

    const text = (element.textContent || '').trim();
    if (text === headings[headingIndex].text) {
      element.id = headings[headingIndex].id;
      headingIndex += 1;
    }
  });

  return tempDiv.innerHTML;
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
