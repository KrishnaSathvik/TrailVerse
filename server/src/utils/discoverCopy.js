const TYPE_INTROS = {
  parks:
    'National Parks preserve iconic landscapes, wildlife, and recreation areas managed for public enjoyment and long-term conservation. These are the flagship destinations many travelers picture when they plan a parks road trip — from mountain wilderness and desert canyons to coral reefs and ancient forests.',
  monuments:
    'National Monuments protect cultural landscapes, geologic wonders, and historic resources that are often compact enough for a focused day or weekend visit. Many monuments highlight Indigenous heritage, fossil beds, cliff dwellings, or dramatic rock formations.',
  'historic-sites':
    'National Historic Sites preserve places tied to American history — homes, battlefields, forts, and landmarks where stories of people and events come alive through exhibits and ranger programs.',
  'historical-parks':
    'National Historical Parks weave together multiple sites, corridors, and landscapes that tell a broader historical story across a region.',
  memorials:
    'National Memorials honor people, events, and ideals through monuments, interpretive spaces, and reflective landscapes.',
  preserves:
    'National Preserves balance resource protection with traditional uses such as hunting, fishing, or grazing where those activities are part of the landscape’s story.',
  'recreation-areas':
    'National Recreation Areas center on reservoirs, lakes, and rivers — destinations built for boating, swimming, camping, and shoreline exploration.',
  seashores:
    'National Seashores and Lakeshores protect coastal and shoreline environments with beaches, dunes, marshes, and water-based recreation.',
  'other-designations':
    'The National Park System includes many other designations — parkways, trails, heritage areas, and affiliated sites — each with its own focus and visitor experience.'
};

const DIMENSION_FALLBACKS = {
  activity: (title) =>
    `${title} is an official activity category in the National Park Service directory. Parks tag their programs, trails, and experiences with this label so visitors can find relevant opportunities.`,
  topic: (title) =>
    `${title} is a curatorial topic the National Park Service uses to connect parks, stories, and collections. Explore units below where this theme shows up in exhibits, landscapes, or programs.`,
  type: () => null
};

function getTypeIntro(typeSlug) {
  return TYPE_INTROS[typeSlug] || TYPE_INTROS['other-designations'];
}

function getDimensionFallbackIntro(dimension, title) {
  const fn = DIMENSION_FALLBACKS[dimension];
  return fn ? fn(title) : null;
}

function buildParkCountParagraph(dimension, title, parkCount) {
  const countLabel = parkCount === 1 ? '1 park and site' : `${parkCount} parks and sites`;

  if (dimension === 'activity') {
    return `The NPS directory lists ${title.toLowerCase()} at ${countLabel} nationwide. Compare destinations below, filter to national parks only, and open any park page for trails, alerts, campgrounds, and trip planning.`;
  }
  if (dimension === 'topic') {
    return `You will find the ${title.toLowerCase()} topic represented across ${countLabel} in the National Park System. Browse the full list to see which destinations match your interests.`;
  }
  if (dimension === 'type') {
    return `The National Park Service includes ${countLabel} with this designation. Browse the list below to compare units and open any park for hours, alerts, maps, and trip planning.`;
  }
  return `Explore ${countLabel} below.`;
}

module.exports = {
  TYPE_INTROS,
  getTypeIntro,
  getDimensionFallbackIntro,
  buildParkCountParagraph
};
