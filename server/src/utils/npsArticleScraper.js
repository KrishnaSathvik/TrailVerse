const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'TrailVerse/1.0 (National Parks Explorer; +https://www.nationalparksexplorerusa.com)';

function cleanText(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function isPhotoCredit(text) {
  return /^NPS\s*\/\s*.+/i.test(text) && text.length < 80;
}

function sanitizeArticleSections(sections) {
  return (sections || [])
    .map((section) => ({
      heading: section.heading,
      paragraphs: (section.paragraphs || []).filter(
        (p) => p && p.length >= 12 && !isPhotoCredit(p)
      )
    }))
    .filter((section) => section.paragraphs.length > 0);
}

function buildBodyFromSections(sections) {
  return sections
    .map((section) => {
      const parts = [];
      if (section.heading) parts.push(section.heading);
      parts.push(...section.paragraphs);
      return parts.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function mapVideoSource($, el) {
  const src = $(el).attr('src') || '';
  const type = ($(el).attr('type') || '').toLowerCase();
  if (!src) return null;
  const url = src.startsWith('http') ? src : `https://www.nps.gov${src.startsWith('/') ? src : `/${src}`}`;
  return { url, type: type || null };
}

function extractArticleVideo(html) {
  const $ = cheerio.load(html);
  const videoEl = $('video').first();
  if (!videoEl.length) return null;

  const posterRaw = videoEl.attr('poster') || '';
  const poster = posterRaw
    ? posterRaw.startsWith('http')
      ? posterRaw
      : `https://www.nps.gov${posterRaw.startsWith('/') ? posterRaw : `/${posterRaw}`}`
    : null;

  const sources = videoEl
    .find('source')
    .toArray()
    .map((el) => mapVideoSource($, el))
    .filter(Boolean);

  const iframeSrc = $('iframe[src*="nps.gov/media/video"]').first().attr('src');
  const embedUrl = iframeSrc
    ? iframeSrc.startsWith('http')
      ? iframeSrc
      : `https://www.nps.gov${iframeSrc.startsWith('/') ? iframeSrc : `/${iframeSrc}`}`
    : null;

  if (!sources.length && !embedUrl) return null;

  return {
    poster,
    sources,
    embedUrl
  };
}

function extractArticleSections(html) {
  const $ = cheerio.load(html);
  const contentRoot = $('.Article__Content').first();
  const textGroups = $('.ArticleTextGroup');
  const root =
    contentRoot.length && cleanText(contentRoot.text()).length >= 200
      ? contentRoot
      : textGroups.length
        ? textGroups
        : contentRoot;

  if (!root.length) return { sections: [], body: '' };

  const sections = [];
  let current = { heading: null, paragraphs: [] };

  const flush = () => {
    if (current.paragraphs.length > 0) {
      sections.push({
        heading: current.heading,
        paragraphs: [...current.paragraphs]
      });
    }
    current = { heading: null, paragraphs: [] };
  };

  root.find('h2, h3, p, li').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = cleanText($(el).text());
    if (!text || text.length < 12) return;
    if (/^last updated:/i.test(text)) return;
    if (/^you might also like$/i.test(text)) return;
    if (/^loading results/i.test(text)) return;

    if (tag === 'h2' || tag === 'h3') {
      flush();
      current.heading = text;
      return;
    }

    if (tag === 'p' || tag === 'li') {
      if (isPhotoCredit(text)) return;
      const paragraph = tag === 'li' ? `• ${text}` : text;
      if (!current.paragraphs.includes(paragraph)) {
        current.paragraphs.push(paragraph);
      }
    }
  });

  flush();

  const sanitized = sanitizeArticleSections(sections);
  const body = buildBodyFromSections(sanitized);

  const video = extractArticleVideo(html);

  return { sections: sanitized, body, video };
}

async function fetchNpsArticleBody(url) {
  if (!url) return { sections: [], body: '' };

  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
    maxRedirects: 3
  });

  return extractArticleSections(response.data);
}

const NPS_SOLR_URL = 'https://www.nps.gov/solr/';

function npsPagePath(pageUrl) {
  if (!pageUrl) return '';
  if (pageUrl.startsWith('http')) {
    try {
      return new URL(pageUrl).pathname;
    } catch {
      return pageUrl;
    }
  }
  return pageUrl.startsWith('/') ? pageUrl : `/${pageUrl}`;
}

function mapSolrDoc(doc) {
  const pageUrl = Array.isArray(doc.PageURL) ? doc.PageURL[0] : doc.PageURL;
  const title = Array.isArray(doc.Title) ? doc.Title[0] : doc.Title;
  const type = Array.isArray(doc.Type) ? doc.Type[0] : doc.Type;
  const imagePath = Array.isArray(doc.Image_URL) ? doc.Image_URL[0] : doc.Image_URL;
  const imageAlt = Array.isArray(doc.Image_Alt_Text) ? doc.Image_Alt_Text[0] : doc.Image_Alt_Text;
  const path = npsPagePath(pageUrl);

  let image = null;
  if (imagePath) {
    const base = imagePath.startsWith('http') ? imagePath : `https://www.nps.gov${imagePath}`;
    image =
      base.includes('npgallery') || base.includes('?')
        ? base
        : `${base}?width=465&height=261&mode=crop&quality=90`;
  }

  return {
    title: title || null,
    type: type || null,
    url: path ? `https://www.nps.gov${path}` : null,
    image,
    imageAlt: imageAlt || title || null
  };
}

/**
 * Same Solr feed NPS.gov uses for article "You Might Also Like" carousels.
 */
async function fetchNpsYouMightAlsoLike({ query, excludePageUrl, rows = 6 } = {}) {
  if (!query) return [];

  const excludePath = excludePageUrl ? npsPagePath(excludePageUrl) : '';
  const fq = [
    'Category:"Articles"',
    '(Type:"Article" OR Type:"Person" OR Type:"Place")',
    excludePath ? `-PageURL:"${excludePath}"` : null,
    '-Allow_Listing_Display:false'
  ]
    .filter(Boolean)
    .join(' AND ');

  const response = await axios.get(NPS_SOLR_URL, {
    params: {
      q: query,
      fl: 'PageURL,Title,Type,Image_URL,Image_Alt_Text',
      defType: 'edismax',
      sort: 'score desc',
      start: 0,
      fq,
      rows: String(rows)
    },
    headers: { 'User-Agent': USER_AGENT },
    timeout: 12000
  });

  const docs = response.data?.response?.docs || [];
  return docs.map(mapSolrDoc).filter((item) => item.title && item.url);
}

module.exports = {
  extractArticleSections,
  fetchNpsArticleBody,
  fetchNpsYouMightAlsoLike,
  cleanText,
  sanitizeArticleSections,
  buildBodyFromSections,
  isPhotoCredit,
  mapSolrDoc,
  extractArticleVideo
};
