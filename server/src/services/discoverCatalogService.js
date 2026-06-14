const path = require('path');
const fs = require('fs');
const npsService = require('./npsService');
const BlogPost = require('../models/BlogPost');
const {
  slugify,
  activityIconKey,
  STATE_CODE_TO_SLUG,
  STATE_NAMES,
  TYPE_GROUPS,
  parkMatchesTypeSlug,
  stripHtml,
  isParkIndexHealthy
} = require('../utils/discoverUtils');
const {
  normalizeDiscoverEvents,
  sampleParkCodesForEvents
} = require('../utils/discoverEventUtils');
const {
  getTypeIntro,
  getDimensionFallbackIntro,
  buildParkCountParagraph
} = require('../utils/discoverCopy');

const FEATURED_PATH = path.join(__dirname, '../../data/discover-featured.json');
const CATALOG_SNAPSHOT_KEY = 'discover-catalog';
const ACTIVITY_INDEX_SNAPSHOT_KEY = 'discover-activity-park-index';
const TOPIC_INDEX_SNAPSHOT_KEY = 'discover-topic-park-index';

let memoryCatalog = null;
let memoryCatalogAt = 0;
const MEMORY_TTL = 60 * 60 * 1000;

function loadFeaturedConfig() {
  try {
    const raw = fs.readFileSync(FEATURED_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function mergeParksByCode(allParks, codeRows) {
  const byCode = new Map(allParks.map((p) => [p.parkCode?.toLowerCase(), p]));
  const codes = new Set();

  codeRows.forEach((row) => {
    const code = (row.parkCode || row.code || '').toLowerCase();
    if (code) codes.add(code);
  });

  return Array.from(codes)
    .map((code) => byCode.get(code))
    .filter(Boolean);
}

const INDEX_BUILD_DELAY_MS = 280;
const INDEX_BUILD_CONCURRENCY = 2;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, mapper, concurrency = INDEX_BUILD_CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
      await sleep(INDEX_BUILD_DELAY_MS);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchParkCodesForTaxonomyItem(fetchParks, item) {
  const id = item.id;
  if (!id) return [];

  let parks = await fetchParks(id);
  let codes = parks.map((p) => (p.parkCode || '').toLowerCase()).filter(Boolean);

  if (!codes.length) {
    await sleep(INDEX_BUILD_DELAY_MS * 2);
    parks = await fetchParks(id);
    codes = parks.map((p) => (p.parkCode || '').toLowerCase()).filter(Boolean);
  }

  return codes;
}

async function buildActivityParkIndex(activities, { force = false } = {}) {
  if (!force) {
    const snapshot = await npsService._loadSnapshot(ACTIVITY_INDEX_SNAPSHOT_KEY, 7 * 24 * 60 * 60 * 1000);
    if (snapshot && !snapshot.stale && snapshot.data && isParkIndexHealthy(snapshot.data, activities.length)) {
      return snapshot.data;
    }
    if (snapshot?.data && !isParkIndexHealthy(snapshot.data, activities.length)) {
      console.warn('discover: activity park index unhealthy — rebuilding');
      await npsService.deleteSnapshot(ACTIVITY_INDEX_SNAPSHOT_KEY);
    }
  }

  const index = {};
  await mapWithConcurrency(activities, async (activity) => {
    const id = activity.id;
    if (!id) return;
    index[id] = await fetchParkCodesForTaxonomyItem(
      (activityId) => npsService.getParksForActivityId(activityId),
      activity
    );
  });

  await npsService._saveSnapshot(ACTIVITY_INDEX_SNAPSHOT_KEY, index);
  return index;
}

async function buildTopicParkIndex(topics, { force = false } = {}) {
  if (!force) {
    const snapshot = await npsService._loadSnapshot(TOPIC_INDEX_SNAPSHOT_KEY, 7 * 24 * 60 * 60 * 1000);
    if (snapshot && !snapshot.stale && snapshot.data && isParkIndexHealthy(snapshot.data, topics.length)) {
      return snapshot.data;
    }
    if (snapshot?.data && !isParkIndexHealthy(snapshot.data, topics.length)) {
      console.warn('discover: topic park index unhealthy — rebuilding');
      await npsService.deleteSnapshot(TOPIC_INDEX_SNAPSHOT_KEY);
    }
  }

  const index = {};
  await mapWithConcurrency(topics, async (topic) => {
    const id = topic.id;
    if (!id) return;
    index[id] = await fetchParkCodesForTaxonomyItem(
      (topicId) => npsService.getParksForTopicId(topicId),
      topic
    );
  });

  await npsService._saveSnapshot(TOPIC_INDEX_SNAPSHOT_KEY, index);
  return index;
}

async function clearDiscoverSnapshots() {
  await Promise.all([
    npsService.deleteSnapshot(ACTIVITY_INDEX_SNAPSHOT_KEY),
    npsService.deleteSnapshot(TOPIC_INDEX_SNAPSHOT_KEY),
    npsService.deleteSnapshot(CATALOG_SNAPSHOT_KEY)
  ]);
  memoryCatalog = null;
  memoryCatalogAt = 0;
}

function buildStateCounts(allParks) {
  const counts = {};

  allParks.forEach((park) => {
    if (!park.states) return;
    park.states.split(',').forEach((raw) => {
      const code = raw.trim().toUpperCase();
      if (!code) return;
      counts[code] = (counts[code] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .map(([code, parkCount]) => ({
      code,
      name: STATE_NAMES[code] || code,
      slug: STATE_CODE_TO_SLUG[code] || slugify(STATE_NAMES[code] || code),
      parkCount
    }))
    .filter((s) => s.slug)
    .sort((a, b) => b.parkCount - a.parkCount);
}

function buildRelatedBySharedParks(items, indexById, { limit = 8 } = {}) {
  const related = {};

  items.forEach((item) => {
    const setA = new Set(indexById[item.id] || []);
    const scores = [];

    items.forEach((other) => {
      if (other.id === item.id) return;
      const setB = new Set(indexById[other.id] || []);
      let shared = 0;
      setA.forEach((code) => {
        if (setB.has(code)) shared += 1;
      });
      if (shared > 0) {
        scores.push({
          id: other.id,
          name: other.name,
          slug: slugify(other.name),
          iconKey: activityIconKey(other.name),
          parkCount: setB.size,
          sharedCount: shared
        });
      }
    });

    scores.sort((a, b) => b.sharedCount - a.sharedCount || b.parkCount - a.parkCount);
    related[item.id] = scores.slice(0, limit);
  });

  return related;
}

const ABOUT_SNIPPET_MAX_CHARS = 2400;

function programIdentity(program) {
  if (program?.id != null && program.id !== '') return String(program.id);
  return `${(program.title || '').toLowerCase()}|${(program.parkCode || '').toLowerCase()}`;
}

function buildAboutFromNps(programs, activityTitle) {
  const snippets = [];
  const seen = new Set();

  programs.forEach((program) => {
    const raw = program.longDescription || program.shortDescription || '';
    const text = stripHtml(raw);
    if (!text || text.length < 40) return;
    const key = text.slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);
    const description =
      text.length > ABOUT_SNIPPET_MAX_CHARS
        ? `${text.slice(0, ABOUT_SNIPPET_MAX_CHARS).trim()}…`
        : text;
    snippets.push({
      id: program.id || null,
      title: program.title,
      parkName: program.parkName,
      parkCode: program.parkCode,
      description,
      excerpt: description,
      image: program.image || null,
      imageAlt: program.imageAlt || program.title || null,
      url: program.url
    });
  });

  return {
    title: `About ${activityTitle}`,
    summary: null,
    snippets: snippets.slice(0, 5),
    source: 'nps-thingstodo'
  };
}

function excludeProgramsInAbout(programs, about) {
  if (!about?.snippets?.length) return programs;

  const aboutKeys = new Set(about.snippets.map((snippet) => programIdentity(snippet)));
  return programs.filter((program) => !aboutKeys.has(programIdentity(program)));
}

function buildTypeCounts(allParks) {
  const assigned = new Set();
  const groups = TYPE_GROUPS.filter((g) => g.slug !== 'other-designations').map((g) => ({
    name: g.name,
    slug: g.slug,
    parkCount: 0
  }));

  const other = { name: 'Other Designations', slug: 'other-designations', parkCount: 0 };

  allParks.forEach((park) => {
    const designation = park.designation || 'Unknown';
    let matched = false;
    for (const group of TYPE_GROUPS) {
      if (group.slug === 'other-designations') continue;
      if (group.match(designation)) {
        const entry = groups.find((g) => g.slug === group.slug);
        if (entry) entry.parkCount += 1;
        matched = true;
        break;
      }
    }
    if (!matched) other.parkCount += 1;
  });

  return [...groups.filter((g) => g.parkCount > 0), other].filter((g) => g.parkCount > 0);
}

async function buildCatalog({ forceIndexes = false } = {}) {
  const [allParks, activityTaxonomy, topicTaxonomy] = await Promise.all([
    npsService.getAllParks(),
    npsService.getActivityTaxonomy(),
    npsService.getTopicTaxonomy()
  ]);

  const [activityIndex, topicIndex, amenities] = await Promise.all([
    buildActivityParkIndex(activityTaxonomy, { force: forceIndexes }),
    buildTopicParkIndex(topicTaxonomy, { force: forceIndexes }),
    npsService.getAmenityTaxonomy()
  ]);

  const relatedActivities = buildRelatedBySharedParks(activityTaxonomy, activityIndex);
  const relatedTopics = buildRelatedBySharedParks(topicTaxonomy, topicIndex);

  const activities = activityTaxonomy
    .map((a) => {
      const slug = slugify(a.name);
      const parkCodes = activityIndex[a.id] || [];
      return {
        id: a.id,
        name: a.name,
        slug,
        parkCount: parkCodes.length,
        iconKey: activityIconKey(a.name)
      };
    })
    .filter((a) => a.slug)
    .sort((a, b) => a.name.localeCompare(b.name));

  const topics = topicTaxonomy
    .map((t) => {
      const slug = slugify(t.name);
      const parkCodes = topicIndex[t.id] || [];
      return {
        id: t.id,
        name: t.name,
        slug,
        parkCount: parkCodes.length
      };
    })
    .filter((t) => t.slug)
    .sort((a, b) => a.name.localeCompare(b.name));

  const catalog = {
    activities,
    topics,
    types: buildTypeCounts(allParks),
    states: buildStateCounts(allParks),
    indexes: {
      activity: activityIndex,
      topic: topicIndex
    },
    relatedActivities,
    relatedTopics,
    amenities: amenities.map((a) => ({ id: a.id, name: a.name, slug: slugify(a.name) })),
    updatedAt: new Date().toISOString(),
    stale: false
  };

  await npsService._saveSnapshot(CATALOG_SNAPSHOT_KEY, catalog);
  memoryCatalog = catalog;
  memoryCatalogAt = Date.now();
  return catalog;
}

function catalogIndexesLookHealthy(catalog) {
  const activityIndex = catalog?.indexes?.activity;
  const topicIndex = catalog?.indexes?.topic;
  const activities = catalog?.activities || [];
  const topics = catalog?.topics || [];
  return (
    isParkIndexHealthy(activityIndex, activities.length) &&
    isParkIndexHealthy(topicIndex, topics.length)
  );
}

async function getCatalog({ force = false } = {}) {
  if (!force && memoryCatalog && Date.now() - memoryCatalogAt < MEMORY_TTL) {
    if (catalogIndexesLookHealthy(memoryCatalog)) {
      return memoryCatalog;
    }
    console.warn('discover: in-memory catalog indexes unhealthy — rebuilding');
    force = true;
  }

  const snapshot = await npsService._loadSnapshot(CATALOG_SNAPSHOT_KEY, 7 * 24 * 60 * 60 * 1000);
  if (!force && snapshot?.data && !snapshot.stale && catalogIndexesLookHealthy(snapshot.data)) {
    memoryCatalog = snapshot.data;
    memoryCatalogAt = Date.now();
    return snapshot.data;
  }

  if (!force && snapshot?.data && !catalogIndexesLookHealthy(snapshot.data)) {
    console.warn('discover: catalog snapshot indexes unhealthy — rebuilding');
    force = true;
  }

  try {
    return await buildCatalog({ forceIndexes: force });
  } catch (error) {
    console.error('discover catalog build failed:', error.message);
    if (snapshot?.data) {
      return { ...snapshot.data, stale: true };
    }
    if (memoryCatalog) {
      return { ...memoryCatalog, stale: true };
    }
    throw error;
  }
}

function findTaxonomyItem(catalog, dimension, slug) {
  const list = dimension === 'activity' ? catalog.activities : catalog.topics;
  return list.find((item) => item.slug === slug);
}

async function getBlogPosts(slugs = []) {
  if (!slugs.length) return [];
  const posts = await BlogPost.find({ slug: { $in: slugs }, status: 'published' })
    .select('slug title excerpt featuredImage coverImage publishedAt')
    .lean();
  return posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    image: p.featuredImage || p.coverImage || null,
    publishedAt: p.publishedAt
  }));
}

function synthesizeIntroFromPrograms(programs, maxChars = 900) {
  const snippets = [];
  const seen = new Set();

  programs.forEach((program) => {
    const raw = program.longDescription || program.shortDescription || '';
    const text = stripHtml(raw);
    if (!text || text.length < 60) return;
    const key = text.slice(0, 72);
    if (seen.has(key)) return;
    seen.add(key);
    snippets.push(text);
  });

  if (!snippets.length) return null;

  let combined = snippets.slice(0, 2).join(' ');
  if (combined.length > maxChars) {
    combined = `${combined.slice(0, maxChars - 1).trim()}…`;
  }
  return combined;
}

function buildRichIntro({ dimension, title, parkCount, editorialIntro, programs, typeSlug, npsGuide }) {
  const paragraphs = [];

  if (dimension === 'type' && typeSlug) {
    paragraphs.push(getTypeIntro(typeSlug));
  }

  if (editorialIntro) {
    paragraphs.push(editorialIntro);
  } else if (npsGuide?.summary && !npsGuide?.body) {
    paragraphs.push(npsGuide.summary);
  } else if (npsGuide?.summary && npsGuide?.body) {
    paragraphs.push(npsGuide.summary);
  } else if (dimension === 'activity' || dimension === 'topic') {
    const fromNps = synthesizeIntroFromPrograms(programs);
    if (fromNps) {
      paragraphs.push(fromNps);
    } else {
      const fallback = getDimensionFallbackIntro(dimension, title);
      if (fallback) paragraphs.push(fallback);
    }
  }

  if (dimension !== 'type') {
    paragraphs.push(buildParkCountParagraph(dimension, title, parkCount));
  }

  return paragraphs.filter(Boolean).join('\n\n');
}

async function resolveDiscoverEntry(dimension, slug) {
  const catalog = await getCatalog();
  const allParks = await npsService.getAllParks();

  let title;
  let taxonomyId;
  let parkCodes = [];

  if (dimension === 'activity') {
    const item = findTaxonomyItem(catalog, 'activity', slug);
    if (!item) return null;
    title = item.name;
    taxonomyId = item.id;
    parkCodes = catalog.indexes?.activity?.[taxonomyId] || [];
    if (!parkCodes.length && taxonomyId) {
      const parks = await npsService.getParksForActivityId(taxonomyId);
      parkCodes = parks.map((p) => (p.parkCode || '').toLowerCase()).filter(Boolean);
    }
  } else if (dimension === 'topic') {
    const item = findTaxonomyItem(catalog, 'topic', slug);
    if (!item) return null;
    title = item.name;
    taxonomyId = item.id;
    parkCodes = catalog.indexes?.topic?.[taxonomyId] || [];
    if (!parkCodes.length && taxonomyId) {
      const parks = await npsService.getParksForTopicId(taxonomyId);
      parkCodes = parks.map((p) => (p.parkCode || '').toLowerCase()).filter(Boolean);
    }
  } else if (dimension === 'type') {
    const typeItem = catalog.types.find((t) => t.slug === slug);
    if (!typeItem) return null;
    title = typeItem.name;
    parkCodes = allParks
      .filter((p) => parkMatchesTypeSlug(p, slug))
      .map((p) => p.parkCode?.toLowerCase())
      .filter(Boolean);
  } else {
    return null;
  }

  const parks = parkCodes
    .map((code) => allParks.find((p) => p.parkCode?.toLowerCase() === code))
    .filter(Boolean)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { catalog, allParks, dimension, slug, title, taxonomyId, parkCodes, parks };
}

function filterNationalParksOnly(parks) {
  return parks.filter(
    (p) =>
      p.designation?.toLowerCase().includes('national park') ||
      p.fullName?.toLowerCase().includes('national park')
  );
}

async function getDetail(dimension, slug) {
  const resolved = await resolveDiscoverEntry(dimension, slug);
  if (!resolved) return null;

  const { catalog, parks, title, taxonomyId, parkCodes } = resolved;
  const featuredConfig = loadFeaturedConfig();
  const configKey = `${dimension}:${slug}`;
  const editorial = featuredConfig[configKey] || {};

  const allowedCodes = new Set(parkCodes);
  const featuredCodes = (editorial.featuredParkCodes || [])
    .map((c) => c.toLowerCase())
    .filter((c) => allowedCodes.has(c));

  const missingFeatured = (editorial.featuredParkCodes || []).filter(
    (c) => !allowedCodes.has(c.toLowerCase())
  );
  if (missingFeatured.length) {
    console.warn(`discover featured parks not in NPS set for ${configKey}:`, missingFeatured.join(', '));
  }

  let featuredParks = featuredCodes
    .map((code) => resolved.allParks.find((p) => p.parkCode?.toLowerCase() === code))
    .filter(Boolean);

  if (!featuredParks.length && parks.length) {
    featuredParks = parks.slice(0, 5);
  }

  const npsGuide =
    dimension === 'activity' || dimension === 'topic' || dimension === 'type'
      ? await npsService.getNpsGuideForDiscover({ title, slug: resolved.slug })
      : null;

  const programs =
    dimension === 'activity'
      ? await npsService.getThingsToDoForActivityName(title, 15, { includeLongDescription: true })
      : dimension === 'topic'
        ? await npsService.getThingsToDoForTopicName(title, 15, { includeLongDescription: true })
        : [];

  const eventParkCodes = sampleParkCodesForEvents(
    parkCodes.length ? parkCodes : featuredParks.map((p) => p.parkCode),
    30
  );
  const rawEvents = await npsService.getUpcomingEventsForParkCodes(eventParkCodes, 12);
  const events = normalizeDiscoverEvents(rawEvents, resolved.allParks, 12);

  const relatedContent = {
    blogPosts: await getBlogPosts(editorial.blogSlugs || [])
  };

  const about =
    (dimension === 'activity' || dimension === 'topic') && programs.length
      ? buildAboutFromNps(programs, title)
      : null;

  const intro = buildRichIntro({
    dimension,
    title,
    parkCount: parks.length,
    editorialIntro: editorial.intro,
    programs,
    typeSlug: dimension === 'type' ? slug : null,
    npsGuide
  });

  const parksPageSize = 12;

  const mappedPrograms = programs.map(({ longDescription, shortDescription, activityTags, ...rest }) => {
    const raw = longDescription || shortDescription || '';
    const description = stripHtml(raw);
    return {
      ...rest,
      description: description || null
    };
  });

  const programsForPage = excludeProgramsInAbout(mappedPrograms, about);

  return {
    dimension,
    slug,
    title,
    intro,
    about,
    npsGuide,
    nps: {
      taxonomyId: taxonomyId || null,
      parkCount: parks.length
    },
    featured: {
      title: editorial.featuredTitle || `Featured parks for ${title.toLowerCase()}`,
      parks: featuredParks
    },
    programs: programsForPage,
    relatedContent,
    parksPagination: {
      page: 1,
      limit: parksPageSize,
      total: parks.length,
      pages: Math.ceil(parks.length / parksPageSize) || 1
    },
    parks: parks.slice(0, parksPageSize),
    events,
    meta: {
      stale: catalog.stale === true,
      updatedAt: catalog.updatedAt
    }
  };
}

async function getParksPage(dimension, slug, { page = 1, limit = 12, nationalParksOnly = false } = {}) {
  const resolved = await resolveDiscoverEntry(dimension, slug);
  if (!resolved) return null;

  let parks = resolved.parks;
  if (nationalParksOnly) {
    parks = filterNationalParksOnly(parks);
  }

  const start = (page - 1) * limit;
  const slice = parks.slice(start, start + limit);

  return {
    dimension,
    slug,
    title: resolved.title,
    page,
    limit,
    total: parks.length,
    pages: Math.ceil(parks.length / limit) || 1,
    nationalParksOnly,
    data: slice
  };
}

module.exports = {
  getCatalog,
  getDetail,
  getParksPage,
  buildCatalog,
  clearDiscoverSnapshots,
  catalogIndexesLookHealthy
};
