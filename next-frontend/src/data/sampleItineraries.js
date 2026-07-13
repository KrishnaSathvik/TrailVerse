/**
 * Curated Trailie sample itineraries for /itineraries.
 * Each card links to a public shared trip at /plan-ai/shared/[shareId].
 * `prompt` is the natural user question shown in the shared chat.
 */
export const SAMPLE_ITINERARIES = [
  {
    slug: 'yellowstone-3-day-first-timer',
    title: 'Trailie Planned the Perfect 3-Day Yellowstone Trip',
    prompt:
      'hey, can you plan a chill 3-day Yellowstone trip for a first-timer? no crazy hikes — just a good mix of wildlife and geyser basins',
    parkName: 'Yellowstone National Park',
    parkCode: 'yell',
    excerpt:
      'A first-timer friendly 3-day Yellowstone plan with wildlife, geyser basins, and no crazy hikes.',
    badge: '3 days',
    shareId: '6ab0412f-5e5',
  },
  {
    slug: 'glacier-5-day-mid-july',
    title: "Exactly How I'd Spend 5 Days in Glacier National Park",
    prompt: 'exactly how would you spend 5 days in Glacier in mid-July?',
    parkName: 'Glacier National Park',
    parkCode: 'glac',
    excerpt:
      'A mid-July Glacier itinerary with realistic pacing across Going-to-the-Sun and classic viewpoints.',
    badge: '5 days',
    shareId: '9ac0c4b7-878',
  },
  {
    slug: 'utah-mighty-5-7-day',
    title: 'The Ultimate 7-Day Utah Mighty 5 Road Trip (AI Planned)',
    prompt:
      'can you put together a 7-day Utah Mighty 5 road trip? keep the drive times between parks realistic',
    parkName: 'Utah Mighty 5',
    parkCode: null,
    excerpt:
      'Zion, Bryce, Capitol Reef, Arches, and Canyonlands with drive times that actually work.',
    badge: '7 days',
    shareId: '74d79b7b-d3d',
  },
  {
    slug: 'alaska-10-day-highlights',
    title: 'This 10-Day Alaska Itinerary Covers Everything',
    prompt:
      "I've got 10 days in Alaska — what national park highlights should I hit without rushing?",
    parkName: 'Alaska National Parks',
    parkCode: null,
    excerpt: 'A paced 10-day Alaska itinerary that hits the highlights without feeling rushed.',
    badge: '10 days',
    shareId: '9a7c9d7b-f57',
  },
  {
    slug: 'yosemite-3-day-first-time',
    title: 'The Perfect First-Time Yosemite Trip (3 Days)',
    prompt:
      'planning a first trip to Yosemite for 3 days — mostly valley views and maybe one moderate hike?',
    parkName: 'Yosemite National Park',
    parkCode: 'yose',
    excerpt: 'Valley views, one moderate hike, and a clean first-timer Yosemite weekend.',
    badge: '3 days',
    shareId: '6e8bbdc3-f3a',
  },
  {
    slug: 'grand-canyon-page-4-day',
    title: 'Grand Canyon + Page in 4 Days — Copy This Plan',
    prompt:
      'got 4 days for Grand Canyon + Page — one big scenic day and one chill day. what would you do?',
    parkName: 'Grand Canyon National Park',
    parkCode: 'grca',
    excerpt: 'Grand Canyon and Page with one big scenic day and one intentionally chill day.',
    badge: '4 days',
    shareId: 'c236ca19-8f9',
  },
  {
    slug: 'olympic-4-day-road-trip',
    title: 'Olympic National Park Road Trip: Mountains, Rainforest & Coast',
    prompt:
      'olympic in 4 days — can we hit mountains, rainforest, and coast without it feeling insane?',
    parkName: 'Olympic National Park',
    parkCode: 'olym',
    excerpt: 'Mountains, rainforest, and coast packed into a 4-day Olympic road trip.',
    badge: '4 days',
    shareId: '5a7a7ece-36f',
  },
  {
    slug: 'big-bend-astrophotography-weekend',
    title: 'Big Bend Astrophotography Weekend (AI Planned by Trailie)',
    prompt:
      'weekend in Big Bend for Milky Way / stargazing photography — how would you time it?',
    parkName: 'Big Bend National Park',
    parkCode: 'bibe',
    excerpt:
      'A weekend built around dark skies, Milky Way windows, and photo-friendly timing.',
    badge: 'Weekend',
    shareId: 'f237cd5c-c2f',
  },
  {
    slug: 'washington-parks-7-day',
    title: "7 Days Across Washington's National Parks",
    prompt:
      "week in Washington — Olympic, Rainier, and North Cascades. how would you split the days?",
    parkName: "Washington's National Parks",
    parkCode: null,
    excerpt:
      'Olympic, Mount Rainier, and North Cascades in one week with realistic logistics.',
    badge: '7 days',
    shareId: '7a6d7df6-a11',
  },
  {
    slug: 'acadia-fall-colors',
    title: "Acadia Fall Colors Itinerary You'll Want to Copy",
    prompt:
      'acadia for peak fall foliage weekend — where should I go for sunrise and scenic drives?',
    parkName: 'Acadia National Park',
    parkCode: 'acad',
    excerpt: 'Peak foliage weekend with sunrise spots and the best scenic drives in Acadia.',
    badge: 'Fall',
    shareId: '3dd3712b-909',
  },
];

export function getSampleItineraryByShareId(shareId) {
  if (!shareId) return null;
  return SAMPLE_ITINERARIES.find((item) => item.shareId === shareId) || null;
}

export function getSampleItineraryHref(itinerary) {
  if (itinerary?.shareId) {
    return `/plan-ai/shared/${itinerary.shareId}?from=/itineraries`;
  }
  return '/plan-ai';
}

/**
 * Trailie sometimes restates the same itinerary after locking a structured plan
 * ("Here's the complete N-day plan, locked in…"). Keep the first copy only.
 */
export function stripRestatedItinerary(content) {
  const text = String(content || '');
  if (!text) return text;

  const patterns = [
    /\n\nHere's the complete[\s\S]*?locked in[^\n]*\n+/i,
    /\n\nHere's the full[\s\S]*?locked in[^\n]*\n+/i,
    /\n\nHere's your complete[\s\S]*?\n+/i,
    /\n\nAlready covered[\s\S]*?Here's the clean recap[\s\S]*?\n+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.index != null && match.index > 400) {
      return text.slice(0, match.index).trimEnd();
    }
  }

  const glances = [...text.matchAll(/^## At a glance\b/gim)];
  if (glances.length >= 2) {
    const second = glances[1].index;
    const window = text.slice(Math.max(0, second - 280), second);
    if (/locked in|clean recap|all in one place|here's the complete|here's the full/i.test(window)) {
      const paraStart = text.lastIndexOf('\n\n', second);
      if (paraStart > 400) return text.slice(0, paraStart).trimEnd();
    }
  }

  return text;
}

/**
 * Prefer the curated natural prompt for gallery demos, drop stiff follow-ups,
 * and remove duplicated "locked in" itinerary restatements.
 */
export function softenSampleConversation(conversation, naturalPrompt) {
  if (!Array.isArray(conversation) || conversation.length === 0) return conversation;

  const result = [];
  let replacedFirstUser = false;

  for (const msg of conversation) {
    if (msg?.role === 'assistant') {
      result.push({ ...msg, content: stripRestatedItinerary(msg.content) });
      continue;
    }

    if (msg?.role !== 'user') {
      result.push(msg);
      continue;
    }

    if (!naturalPrompt) {
      result.push(msg);
      continue;
    }

    const text = String(msg.content || '');
    const isStiff =
      /do not ask clarifying questions/i.test(text) ||
      /produce a full day-by-day itinerary/i.test(text) ||
      /include day-by-day morning\/afternoon\/evening/i.test(text) ||
      /full day-by-day plan\.?\s*do not ask/i.test(text);

    if (!replacedFirstUser) {
      result.push({ ...msg, content: naturalPrompt });
      replacedFirstUser = true;
      continue;
    }

    if (isStiff) continue;
    result.push(msg);
  }

  if (naturalPrompt && !replacedFirstUser) {
    result.unshift({
      id: 'sample-prompt',
      role: 'user',
      content: naturalPrompt,
      timestamp: new Date().toISOString(),
    });
  }

  return result;
}
