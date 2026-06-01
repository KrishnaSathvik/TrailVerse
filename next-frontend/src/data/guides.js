/** @typedef {{ headers: string[]; rows: string[][] }} GuideTable */
/** @typedef {{ id?: string; heading: string; paragraphs?: string[]; bullets?: string[]; table?: GuideTable }} GuideSection */
/** @typedef {{ q: string; a: string }} GuideFaqItem */
/**
 * @typedef {Object} Guide
 * @property {string} slug
 * @property {string} title — on-page H1
 * @property {string} [metadataTitle] — full document title tag (defaults to title + | TrailVerse)
 * @property {string} metaDescription
 * @property {string} hubExcerpt
 * @property {string} [category] — badge on hub cards (e.g. "Trip planning")
 * @property {string} quickAnswer
 * @property {string} updatedAt
 * @property {GuideSection[]} sections
 * @property {GuideFaqItem[]} faq
 * @property {string[]} relatedSlugs — bare slugs only; GuideDetailClient resolves via getGuideBySlug → /guides/{slug}
 * @property {string} [verifiedAt] — ISO date when live TrailVerse/NPS data was checked
 * @property {string[]} [verifiedSources]
 * @property {{ label: string; href: string }[]} [trailverseLinks]
 * @property {string} [seasonNote] — e.g. "Updated for the 2026 season"
 */

const BASE_URL = 'https://www.nationalparksexplorerusa.com';

/** @type {Guide[]} */
export const GUIDES = [
  {
    slug: 'best-free-national-park-trip-planner',
    title: 'Best Free National Park Trip Planner (2026)',
    metadataTitle: 'Best Free National Park Trip Planner (2026) | TrailVerse',
    metaDescription:
      'The best free national park trip planner for 2026: browse 470+ parks, compare them, check live alerts and weather, and build AI itineraries — no account needed.',
    hubExcerpt:
      'No single free tool does everything — here is how to combine TrailVerse with NPS.gov, Recreation.gov, and AllTrails.',
    category: 'Trip planning',
    quickAnswer:
      'No single free tool does everything a park trip needs — but the right combination saves hours of tab-juggling, and TrailVerse is the free hub that ties it together. Use it to browse 470+ parks, check live alerts and permits, compare parks side by side, and draft AI itineraries — then pair it with NPS.gov for official safety info, Recreation.gov for reservations, and AllTrails for trail-level conditions once you are on the ground. All of TrailVerse\'s planning tools are free to use without an account.',
    updatedAt: '2026-05-31',
    trailverseLinks: [
      { label: 'Explore all parks', href: '/explore' },
      { label: 'Discover by activity, topic, or state', href: '/discover' },
      { label: 'Compare up to 4 parks', href: '/compare' },
      { label: 'Plan with Trailie', href: '/plan-ai' },
      { label: 'TrailVerse ChatGPT app', href: '/chatgpt' },
    ],
    sections: [
      {
        id: 'planning-jobs',
        heading: 'What planning a park trip actually involves',
        paragraphs: [
          'A good trip runs through several different jobs: picking a park, checking what is closed right now, comparing your options, building a day-by-day route, and finding the right trails once you arrive. Different tools are best at different parts — here is the strongest free option for each.',
          'TrailVerse covers the planning and comparison layer; the others handle the official, reservation, and on-trail layers. Together they replace a dozen open browser tabs.',
        ],
        table: {
          headers: ['Your goal', 'Best free tool'],
          rows: [
            ['Official fees, alerts, and park rules', 'NPS.gov (the authoritative source)'],
            ['Trail conditions and on-trail GPS', 'AllTrails (free Base tier)'],
            ['Compare 2–4 parks before booking', 'TrailVerse'],
            ['AI day-by-day itinerary with live park data', 'TrailVerse (Trailie)'],
            ['Planning inside ChatGPT with live park data', 'TrailVerse (ChatGPT app)'],
            ['Permits and timed-entry reservations', 'Recreation.gov'],
          ],
        },
      },
      {
        id: 'trailverse-free',
        heading: 'What TrailVerse gives you for free',
        paragraphs: [
          'TrailVerse is built around a simple flow: discover → compare → plan → refine. Browsing parks, comparing them, reading live alerts, and checking weather all work without payment or an account.',
          'Trailie gives you a few free messages per session to try it; a free account adds saved trips, chat history, and PDF export.',
        ],
        bullets: [
          '470+ parks to browse — not just headline national parks, but monuments, historic sites, seashores, and more',
          'Live NPS alerts on each park page, so you see today\'s closures, not last year\'s',
          'Permit links pulled from Recreation.gov for each park, in one place',
          'Current weather and seasonal ranges for every park',
          'Side-by-side comparison of up to four parks — weather, crowd level, and campgrounds',
          'Discovery filters by activity, topic, and state or territory',
          'Ranger programs and events drawn from NPS listings',
          'Trailie AI plus the ChatGPT app and Claude connector for building itineraries',
        ],
      },
      {
        id: 'limitations',
        heading: 'What TrailVerse is not',
        paragraphs: [
          'Being clear about this matters more than overclaiming:',
        ],
        bullets: [
          'It is not Recreation.gov — it surfaces permit links but does not issue reservations; you book on Recreation.gov',
          'It is not AllTrails — no turn-by-turn trail GPS or crowdsourced trail reports',
          'It is not a hotel engine — lodging in AI plans are suggestions, not live bookable inventory',
          'For critical safety decisions, confirm on NPS.gov the day you travel. TrailVerse shows you the alert feeds; you make the final call',
        ],
      },
      {
        id: 'workflow',
        heading: 'A free planning workflow that works',
        bullets: [
          'Shortlist parks on the explore and discover pages',
          'Narrow your finalists with the compare tool (up to four parks)',
          'Open each park page for live alerts, permits, and weather',
          'Draft a route with Trailie or the ChatGPT app',
          'Book permits on Recreation.gov using the links from each park page',
          'Check AllTrails for trail-level conditions on your specific hikes the week you go',
        ],
      },
      {
        id: 'verdict',
        heading: 'Bottom line',
        paragraphs: [
          'If you want one free site to browse the full park catalog, compare parks with live weather and crowd signals, and draft AI itineraries, TrailVerse is the most complete free planner available. It does not try to replace NPS.gov, Recreation.gov, or AllTrails — it connects them, so you spend less time gathering information and more time planning the trip.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is TrailVerse really free?',
        a: 'Yes for planning. Exploring, comparing, reading live alerts and weather, and browsing events and guides all require no payment. Trailie offers a few free messages per session; a free account unlocks saved trips, history, and PDF export.',
      },
      {
        q: 'Do I need an account to plan a trip?',
        a: 'No. You can explore, compare, and read live alerts and weather without one. You will only be asked to sign up (free) when you want to keep an AI planning session going or save your work.',
      },
      {
        q: 'How many parks does TrailVerse cover?',
        a: 'More than 470 NPS units, including national parks plus monuments, historic sites, seashores, and other site types — broader than a national-parks-only list.',
      },
      {
        q: 'How is it different from NPS.gov?',
        a: 'NPS.gov is the official regulatory source. TrailVerse adds the planning layer on top: park comparison, activity and topic browsing, weather dashboards, AI itineraries, event aggregation, and reviews — built for planning a full trip across hundreds of sites.',
      },
      {
        q: 'Can ChatGPT plan a national park trip for me?',
        a: 'Generic ChatGPT can miss current closures because it answers from training data. The TrailVerse ChatGPT app pulls live park data — alerts, weather, permits, and itineraries — so the plan reflects today\'s conditions.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'trailverse-vs-alltrails',
      'yosemite-vs-yellowstone-first-timers',
    ],
  },
  {
    slug: 'trailverse-vs-alltrails',
    title: 'TrailVerse vs AllTrails for National Parks (2026)',
    metadataTitle: 'TrailVerse vs AllTrails for National Parks (2026) | TrailVerse',
    category: 'Tool comparison',
    metaDescription:
      'TrailVerse and AllTrails do different jobs — trip planning vs trail hikes. When to use each, AllTrails\' 2026 pricing tiers, and why most park visitors use both.',
    hubExcerpt:
      'Different jobs — most park visitors use both. Plan the trip in TrailVerse, check hikes in AllTrails.',
    quickAnswer:
      'They solve different problems, and most people end up using both. AllTrails is the tool for individual hikes — crowdsourced trail conditions, distance and elevation, and GPS navigation on the trail. TrailVerse is the tool for planning a whole trip across the national park system — live alerts and permits, park-to-park comparisons, weather, ranger events, and AI itineraries. A common rhythm: plan the trip in TrailVerse, then check specific hikes in AllTrails the week you go.',
    updatedAt: '2026-05-31',
    trailverseLinks: [
      { label: 'Compare parks (up to 4)', href: '/compare' },
      { label: 'Discover parks by activity', href: '/discover/activities' },
      { label: 'Plan with Trailie', href: '/plan-ai' },
      { label: 'Explore all NPS parks', href: '/explore' },
    ],
    sections: [
      {
        id: 'different-jobs',
        heading: 'Different tools, different jobs',
        paragraphs: [
          'AllTrails is built around crowdsourced hike data — distance, elevation, recent conditions, photos, and GPS tracks for specific trails. That is exactly what you want standing at a trailhead trying to find out whether a route is muddy, iced over, or has a high river crossing right now.',
          'TrailVerse is built around system-wide trip planning — which of 470+ parks fits your trip, what alerts and permits apply today, how parks stack up on weather and crowds, and how to structure a multi-day itinerary with Trailie or the ChatGPT app. It is for the decisions you make before you pick a trail.',
          'Neither replaces the other, and neither replaces NPS.gov for official safety orders.',
        ],
      },
      {
        id: 'comparison',
        heading: 'Side-by-side',
        table: {
          headers: ['Feature', 'TrailVerse', 'AllTrails'],
          rows: [
            ['Primary focus', 'Full trip planning across the NPS system', 'Individual trail hikes'],
            ['Coverage', '470+ NPS units (parks, monuments, historic sites, seashores)', '450,000+ user-contributed trails worldwide'],
            ['Live NPS alerts', 'Yes, on each park page', 'Not a core feature'],
            ['Recreation.gov permits', 'Listed per park', 'Not a permit hub'],
            ['Park-to-park comparison', 'Yes, up to 4 at once', 'No equivalent'],
            ['AI trip itineraries', 'Yes, via Trailie + ChatGPT app', 'No full park-trip planner'],
            ['On-trail GPS navigation', 'No (park map + Google Maps directions)', 'Yes, a core strength'],
            ['Crowdsourced trail reports', 'No', 'Yes, a core strength'],
            ['Ranger programs / events', 'Yes', 'No'],
            ['Free without an account', 'Yes — browse, compare, park pages', 'Free Base tier; offline maps and extras are paid'],
          ],
        },
      },
      {
        id: 'when-alltrails',
        heading: 'When to reach for AllTrails',
        bullets: [
          'You have already picked a park and need to choose between specific hikes',
          'You want recent hiker reports on mud, ice, river levels, or downed trees',
          'You need offline GPS navigation once you are out of cell service',
          'You are weighing exact mileage and elevation gain for one route',
        ],
      },
      {
        id: 'when-trailverse',
        heading: 'When to reach for TrailVerse',
        bullets: [
          'You have not chosen a park yet and want to browse 470+ options by activity and state',
          'You need today\'s NPS alerts and permit links for a park in one place',
          'You want to compare a few parks — say Zion, Bryce, and Capitol Reef — before booking',
          'You want an AI itinerary built on live park data, in Trailie or the ChatGPT app',
          'You are planning a multi-park road trip and need events, weather, and campground info',
        ],
      },
      {
        id: 'together',
        heading: 'Use them together',
        paragraphs: [
          'The most efficient workflow uses both for what each does best:',
          'TrailVerse handles the system-level questions; AllTrails fills in the hiker-reported micro-conditions that neither NPS nor TrailVerse specializes in.',
          'AllTrails is a separate company, and its features and pricing here reflect publicly available information — confirm the latest on alltrails.com before subscribing.',
        ],
        bullets: [
          'Shortlist and compare parks in TrailVerse',
          'Check alerts and permits on the park pages',
          'Draft an itinerary with Trailie',
          'Book anything that needs a reservation on Recreation.gov',
          'Open AllTrails for trail-level conditions on the specific hikes in your plan',
        ],
      },
    ],
    faq: [
      {
        q: 'Can TrailVerse replace AllTrails?',
        a: 'Not for GPS trail navigation or crowdsourced trail reports — TrailVerse does not do turn-by-turn hike tracking. What it replaces is the multi-tab work of planning a trip across the park system. AllTrails replaces guessing about conditions on a single hike.',
      },
      {
        q: 'Does TrailVerse have trail maps like AllTrails?',
        a: 'TrailVerse has an interactive map of all its parks, Google Maps directions, and the official NPS trail and activity listings on each park page. It does not have AllTrails-style live GPS track following.',
      },
      {
        q: 'How many parks do TrailVerse and AllTrails cover?',
        a: 'TrailVerse lists more than 470 NPS units and is broader for site types like monuments, historic sites, and seashores. AllTrails covers more than 450,000 individual trails, but its depth at any given park depends on what hikers have submitted.',
      },
      {
        q: 'Is TrailVerse free compared to AllTrails?',
        a: 'TrailVerse browsing, comparison, alerts, weather, and discovery are free, with a few free AI messages per session before signup. AllTrails has a free Base tier, with offline maps in Plus ($35.99 per year) and route customization in Peak ($79.99 per year). Check alltrails.com for current pricing.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'trailverse-vs-recreation-gov-and-nps-app',
      'best-free-national-park-trip-planner',
      'plan-national-parks-in-chatgpt',
    ],
  },
  {
    slug: 'plan-national-parks-in-chatgpt',
    title: 'Plan National Park Trips in ChatGPT',
    metadataTitle: 'Plan National Park Trips in ChatGPT | TrailVerse',
    metaDescription:
      'Connect the TrailVerse app in ChatGPT to plan park trips with live alerts, weather, and permits — not outdated guesses. Free to add, and it works in Claude too.',
    hubExcerpt:
      'Connect TrailVerse inside ChatGPT for live park data instead of training-memory guesses.',
    category: 'AI planning',
    quickAnswer:
      'Connect the TrailVerse app inside ChatGPT and you can plan trips using live park data — current alerts, weather, permits, and events — instead of whatever ChatGPT happens to remember from training. Get it from the ChatGPT App Directory (or via nationalparksexplorerusa.com/chatgpt), then ask your question. Prefer the web? Trailie at /plan-ai runs on the same data, free to try.',
    updatedAt: '2026-05-31',
    trailverseLinks: [
      { label: 'TrailVerse ChatGPT app — install link', href: '/chatgpt' },
      { label: 'Claude MCP connector setup', href: '/mcp' },
      { label: 'Plan on the web with Trailie', href: '/plan-ai' },
      { label: 'Compare parks before you ask ChatGPT', href: '/compare' },
    ],
    sections: [
      {
        id: 'problem',
        heading: 'Why plain ChatGPT isn\'t enough for park planning',
        paragraphs: [
          'ChatGPT can draft a believable Yellowstone itinerary from memory. What it cannot reliably know is whether a road opened yesterday, whether your park has an active closure alert today, or which Recreation.gov permit applies this season. That information changes daily, and a model\'s training data does not.',
          'That is the gap the TrailVerse app fills. When you ask a question that needs current information, it fetches the live answer rather than guessing. Two parks can have wildly different alert situations on the same day — one clear, the next with half a dozen active closures — and that difference is exactly what makes or breaks a trip. For time-sensitive park decisions, live data beats memory every time.',
        ],
      },
      {
        id: 'capabilities',
        heading: 'What you can do with it',
        paragraphs: [
          'Once connected, the TrailVerse app lets you:',
        ],
        bullets: [
          'Plan a full itinerary — day-by-day trips shaped by your dates, pace, and interests',
          'Check a park\'s live status — current NPS alerts, weather, campgrounds, and permits',
          'Compare parks — up to four side by side for a single trip decision',
          'Search across 470+ parks — by state, activity, or name',
          'Find ranger programs and events — what is scheduled at a park this month',
          'Keep the conversation going — follow-ups like “now add a fourth day” work within the same chat',
        ],
      },
      {
        id: 'install',
        heading: 'How to install and start',
        paragraphs: [
          'Open the ChatGPT App Directory — the Tools menu in ChatGPT, or chatgpt.com/apps — and search for TrailVerse. You can also use the direct link at nationalparksexplorerusa.com/chatgpt.',
          'Connect the app and authorize it. Bring it into any chat by typing @TrailVerse or selecting it from the Tools menu, then ask your question. The live tools only run when ChatGPT actually needs them.',
        ],
        bullets: [
          '“What NPS alerts are active at Zion right now?”',
          '“Compare Yosemite and Yellowstone for a family trip in June.”',
          '“Plan a 5-day Yellowstone trip — check current alerts first.”',
          '“Find ranger programs at Bryce Canyon this month.”',
          '“Which national parks in Utah are good for hiking?”',
        ],
      },
      {
        id: 'claude',
        heading: 'Using Claude instead',
        paragraphs: [
          'The same live data is available in Claude through a custom connector. Setup steps are at nationalparksexplorerusa.com/mcp. Once it is added, you can ask Claude the same kinds of questions and get the same live alerts, weather, and permit lookups.',
        ],
      },
      {
        id: 'website',
        heading: 'Or just use the website',
        paragraphs: [
          'Do not want to set up an app at all? Trailie at /plan-ai runs on the same live data right in your browser. You get a handful of free messages per session to try it; create a free account for saved trip history, PDF export, and share links. App sessions and website sessions are separate, so to continue a ChatGPT plan on the web, paste your trip details back into Trailie.',
        ],
      },
      {
        id: 'good-to-know',
        heading: 'Good to know',
        bullets: [
          'There is no TrailVerse charge for the integration — usage follows your normal ChatGPT (or Claude) plan',
          'AI output is a starting point, not a permit — confirm permits on Recreation.gov and critical safety info on NPS.gov before you travel',
          'For unlimited saved planning, create a free account and continue at /plan-ai',
        ],
      },
    ],
    faq: [
      {
        q: 'Is the TrailVerse ChatGPT app free?',
        a: 'TrailVerse does not charge for it. Usage is governed by your ChatGPT plan, and the app works across ChatGPT\'s free and paid tiers, though availability can vary by region.',
      },
      {
        q: 'Does ChatGPT know current national park closures without TrailVerse?',
        a: 'Often not. Generic ChatGPT answers from training data, which can be out of date. The TrailVerse app pulls live NPS alert feeds, so two parks that look identical in memory can show very different real-time closures.',
      },
      {
        q: 'Can I use TrailVerse in Claude too?',
        a: 'Yes. The same live data is available in Claude through a custom connector. Setup instructions are at nationalparksexplorerusa.com/mcp.',
      },
      {
        q: 'Can I continue a ChatGPT plan on the TrailVerse website?',
        a: 'Yes. Create a free account and use the web planner for saved history, PDF export, and share links. App and website sessions do not sync automatically, so re-share your plan details with Trailie to continue.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'how-to-compare-national-parks-on-trailverse',
      'best-free-national-park-trip-planner',
      'trailverse-vs-alltrails',
    ],
  },
  {
    slug: 'yosemite-vs-yellowstone-first-timers',
    title: 'Yosemite vs Yellowstone for First-Timers (2026)',
    metadataTitle: 'Yosemite vs Yellowstone for First-Timers (2026) | TrailVerse',
    metaDescription:
      'Bison and geysers, or granite and waterfalls? A 2026 first-timer\'s guide to picking Yosemite or Yellowstone — fees, the new reservation rules, and days needed.',
    hubExcerpt:
      'Two iconic parks, very different first-trip experiences — fees, reservation rules, and days needed.',
    category: 'Park comparison',
    quickAnswer:
      'Pick Yellowstone if your dream first trip is bison, wolves, and geysers spread across a huge landscape — and you have 4–5 days and a rental car. Pick Yosemite if granite cliffs, waterfalls, and a more compact, valley-focused California trip sound better. Both are spectacular; they are different first parks, roughly 850–1,000 driving miles apart — most first-timers should choose one and save the other. Two 2026 changes: Yosemite no longer requires an entrance reservation, and both parks add a $100 per-person surcharge for non-U.S. residents aged 16+ on top of the standard $35 vehicle fee (NPS data verified May 2026). Check live alerts and road status on TrailVerse park pages before you book.',
    updatedAt: '2026-05-31',
    verifiedAt: '2026-05-31',
    verifiedSources: [
      'TrailVerse GET /api/parks/yose/details & /api/parks/yell/details — fees incl. $35 vehicle, $100 nonresident (NPS May 2026)',
      'TrailVerse GET /api/parks/{code}/permits — Half Dome lottery, backcountry, Recreation.gov links',
      'TrailVerse POST /api/parks/compare/summary — weather, crowd, campground counts',
      '2026 entrance reservation status — NPS/Recreation.gov policy (confirm on park Permits tab before travel)',
    ],
    trailverseLinks: [
      { label: 'Yosemite park page — live alerts & weather', href: '/parks/yosemite-national-park' },
      { label: 'Yellowstone park page — live alerts & weather', href: '/parks/yellowstone-national-park' },
      { label: 'Compare Yosemite vs Yellowstone side by side', href: '/compare?parks=yose,yell' },
      { label: 'Plan your trip with Trailie', href: '/plan-ai' },
    ],
    sections: [
      {
        id: 'who-for',
        heading: 'Who each park is for',
        paragraphs: [
          'Yellowstone was the world\'s first national park (established 1872) and is built around hydrothermal wonders — geysers, hot springs, and mud pots — across nearly 3,500 square miles, mostly in northwest Wyoming with slivers in Montana and Idaho. It is the obvious pick if you want big wildlife: bison, elk, and (with luck and patience) wolves in Lamar and Hayden Valleys. The trade-off is scale: you will spend real time driving the Grand Loop between major areas.',
          'Yosemite was first protected in 1864 and is famous for waterfalls, sheer granite, and giant sequoias across about 1,200 square miles of the California Sierra Nevada. Most first-timers center their trip on Yosemite Valley — Tunnel View, Yosemite Falls, Bridalveil Fall — then add Glacier Point or Tioga Road when those seasonal routes are open. The signature sights sit closer together than Yellowstone\'s, but they are concentrated in a 7-mile valley that gets crowded.',
        ],
      },
      {
        id: 'comparison',
        heading: 'Side-by-side',
        table: {
          headers: ['Factor', 'Yellowstone', 'Yosemite'],
          rows: [
            ['Established', '1872 (first national park)', 'Protected 1864'],
            ['Size / states', '~3,500 sq mi · WY, MT, ID', '~1,200 sq mi · CA'],
            ['Known for', 'Geysers, geothermal, bison, wolves', 'Waterfalls, granite, giant sequoias, dark skies'],
            ['Entrance (private vehicle)', '$35 · valid 7 days', '$35 · valid 7 days'],
            ['Non-resident surcharge (2026)', '+$100 per person (16+)', '+$100 per person (16+)'],
            ['Entry reservation in 2026', 'Not required', 'Not required'],
            ['Permits to check', 'Backcountry permits', 'Half Dome lottery; wilderness permits'],
            ['Driving reality', 'Hours between major areas', 'Valley sights close; Glacier Point / Tioga seasonal'],
            ['Year-round access', 'Most loop roads closed to cars in winter', 'Valley open year-round; Tioga Pass closed ~Nov–late May/Jun'],
            ['Suggested first trip', '4–5 days', '3–4 days valley + 1 high-country day'],
          ],
        },
      },
      {
        id: 'fees-2026',
        heading: 'Fees in 2026',
        paragraphs: [
          'The standard entrance fee at both parks is $35 per private vehicle, valid seven consecutive days (motorcycle $30, per person on foot or bike $20). An America the Beautiful annual pass ($80) covers entry for U.S. residents.',
          'New for 2026: both parks are on the National Park Service list of eleven high-traffic parks that charge a $100 per-person surcharge for non-U.S. residents aged 16 and older, on top of the standard fee — verified in live NPS fee data on TrailVerse (May 2026). A car of four international visitors pays the $35 vehicle fee plus $400 in surcharges. The nonresident annual pass is $250 and waives the surcharge across all eleven parks. U.S. residents and green-card holders pay standard rates and should carry ID.',
          'There are also several fee-free days in 2026, but they apply only to U.S. citizens and residents.',
        ],
      },
      {
        id: 'reservations',
        heading: 'Reservations and permits',
        paragraphs: [
          'Yellowstone: No day-use entry reservation is required for 2026. You only need permits for backcountry trips.',
          'Yosemite: After several years of on-and-off systems, Yosemite is not requiring an entrance reservation in 2026 — including peak summer and the February Firefall. You can drive in without a timed-entry permit. The catch: with no reservation throttle, parking fills early and entrance lines get long, so an early arrival matters more than ever.',
          'What still requires a permit at Yosemite: Half Dome (a preseason lottery in March plus daily lotteries during the cable season) and overnight wilderness trips. Reservation and permit rules shift year to year — confirm current rules on the Yosemite park page Permits tab or Recreation.gov before you build dates around any single attraction.',
        ],
      },
      {
        id: 'when-to-go',
        heading: 'When to go',
        paragraphs: [
          'Yellowstone: Most first-timers target June through September, when all entrances and loop roads are reliably open. Summer highs can top 70°F but drop fast in storms, snow is possible any month, and winter lows often fall well below 0°F. Pack layers even in July.',
          'Yosemite: Waterfalls peak in late spring as the snow melts — May is prime. Most of the park stays snow-covered roughly November through May, and Tioga Pass (Highway 120 from the east) is closed about November through late May or June — verify on the park page before an east-side approach. The valley is open year-round.',
          'Shoulder seasons (May and September) at both parks ease the crush of July–August while keeping most facilities open — just check which roads are running.',
        ],
      },
      {
        id: 'crowds',
        heading: 'Crowds',
        paragraphs: [
          'Both rank among the most-visited parks in the country, and summer plus holiday weekends are peak everywhere. The difference is shape: Yellowstone spreads visitors across a big loop, but parking still fills by mid-morning at Old Faithful, the Grand Canyon of the Yellowstone, and Norris. Yosemite funnels everyone into a 7-mile valley, so parking and shuttle planning matter more in a smaller footprint. At either park in summer, treat “arrive before 8 a.m. or visit midweek” as the rule, not a tip.',
        ],
      },
      {
        id: 'gateways',
        heading: 'Gateway towns',
        bullets: [
          'Yellowstone: Gardiner and West Yellowstone, MT; Cody, WY',
          'Yosemite: Fresno, Mariposa, and El Portal, CA',
          'In-park GPS routing is unreliable in both parks — use official park maps and directions rather than trusting your phone',
        ],
      },
      {
        id: 'sample-days',
        heading: 'A first-timer 3-day sketch',
        paragraphs: [
          'Starting points, not gospel — run your real dates through Trailie so live closures shape the order.',
        ],
        bullets: [
          'Yellowstone Day 1: Old Faithful and Upper Geyser Basin, plus Midway (Grand Prismatic) when the boardwalk is open',
          'Yellowstone Day 2: Grand Canyon of the Yellowstone (North and South Rim viewpoints) and a wildlife drive through Hayden or Lamar Valley',
          'Yellowstone Day 3: Mammoth Hot Springs and Norris Geyser Basin',
          'Yosemite Day 1: The valley — Tunnel View, Bridalveil Fall, the lower Yosemite Falls area',
          'Yosemite Day 2: Glacier Point Road when open, or the Mist Trail toward Vernal and Nevada Fall if conditions allow',
          'Yosemite Day 3: Mariposa Grove sequoias, or Tioga Road east when it is open',
        ],
      },
      {
        id: 'verdict',
        heading: 'The verdict',
        paragraphs: [
          'Choose Yellowstone if geothermal features and big mammals across a wide-open landscape are the dream, and you can give it at least four days with a car. Choose Yosemite if waterfalls and granite scenery in California pull harder and you would rather have iconic viewpoints without all-day drives between them.',
          'They are roughly 850–1,000 road miles apart, so combining them only makes sense on a long road trip. For a first visit, compare them side by side on TrailVerse, pick one, and save the other for next time.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which is better for a first national park trip, Yosemite or Yellowstone?',
        a: 'Neither is objectively better. Yellowstone is best for wildlife and geysers across a very large park, while Yosemite is best for waterfalls and granite valley scenery in California. They are different first-park experiences.',
      },
      {
        q: 'How much does it cost to enter Yosemite or Yellowstone in 2026?',
        a: 'Both charge $35 per private vehicle, valid seven consecutive days, for U.S. residents. As of January 1, 2026, non-U.S. residents aged 16 and older also pay a $100 per-person surcharge, or can use the $250 nonresident annual pass.',
      },
      {
        q: 'How many days do first-timers need?',
        a: 'Plan 4 to 5 days for Yellowstone, since its sights spread across about 3,500 square miles. Yosemite\'s core valley works in 3 to 4 days, plus an extra day for Glacier Point or Tioga Road when those seasonal routes are open.',
      },
      {
        q: 'Do I need an entry reservation for Yosemite or Yellowstone in 2026?',
        a: 'No. Neither park requires a day-use entrance reservation in 2026. You still pay the entrance fee, and Yosemite\'s Half Dome and wilderness trips need separate permits. Because rules change year to year, confirm on the park page before you go.',
      },
      {
        q: 'Can I visit both Yosemite and Yellowstone on one trip?',
        a: 'They are roughly 850 to 1,000 driving miles apart. It is possible on a long road trip but not ideal for a first visit, so most people pick one and save the other.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'how-to-compare-national-parks-on-trailverse',
      'best-free-national-park-trip-planner',
      'plan-national-parks-in-chatgpt',
    ],
  },
  {
    slug: 'best-national-park-apps-2026',
    title: 'Best National Park Apps (2026)',
    metadataTitle: 'Best National Park Apps (2026) | TrailVerse',
    metaDescription:
      'Which apps actually help with a national park trip in 2026 — official NPS, Recreation.gov, AllTrails, maps, and planning tools, compared by job.',
    hubExcerpt:
      'Fair roundup of apps by job — reservations, on-trail hikes, official alerts, and trip planning across 470+ sites.',
    category: 'Roundup',
    quickAnswer:
      'No single app does everything. Recreation.gov is for bookings and timed-entry permits. The NPS App is the official source for alerts and basic park info. AllTrails is for individual hikes once you have picked a trail. Google Maps handles driving. TrailVerse is for choosing among 470+ parks, comparing options, reading today\'s alerts in one place, and drafting an itinerary — free to browse without an account. Most trips use three or four of these, not one.',
    updatedAt: '2026-06-01',
    trailverseLinks: [
      { label: 'Explore all parks', href: '/explore' },
      { label: 'Compare parks', href: '/compare' },
      { label: 'Plan with Trailie', href: '/plan-ai' },
      { label: 'TrailVerse vs AllTrails', href: '/guides/trailverse-vs-alltrails' },
    ],
    sections: [
      {
        id: 'how-to-read',
        heading: 'How to read this list',
        paragraphs: [
          'These are the apps people actually open for national park trips, grouped by what you are trying to do. Prices and features change — confirm on each app\'s site before you subscribe.',
          'Official safety orders always come from the National Park Service. Apps aggregate and explain; they do not replace a ranger\'s closure sign or a posted hazard.',
        ],
      },
      {
        id: 'roundup-table',
        heading: 'Apps at a glance',
        table: {
          headers: ['App', 'Best for', 'National park scope', 'Account needed?'],
          rows: [
            ['NPS App', 'Official alerts, offline park downloads, basic park pages', 'NPS-managed sites', 'Optional for extras'],
            ['Recreation.gov', 'Campsite, timed-entry, and permit reservations', 'Federal recreation bookings', 'Yes, to book'],
            ['AllTrails', 'Trail conditions, mileage, on-trail GPS', 'Worldwide trails; depth varies by park', 'Free tier; paid for offline maps'],
            ['Google Maps (or Apple Maps)', 'Driving, lodging nearby, hours for businesses', 'General navigation', 'No'],
            ['Gaia GPS / onX Backcountry', 'Off-grid maps, custom tracks, backcountry navigation', 'Broad; you bring the data', 'Paid subscriptions'],
            ['TrailVerse', 'Pick a park, compare, alerts/weather/permits hub, AI itineraries', '470+ NPS parks and sites', 'No to browse; account for saved trips'],
          ],
        },
      },
      {
        id: 'official',
        heading: 'Official sources first',
        paragraphs: [
          'The NPS App is the Park Service\'s own mobile product. You can download individual parks for offline maps and content before you lose cell service — a genuine edge on remote roads. Use it for alert push notifications and official park pages when you are on the road.',
          'Recreation.gov is not a discovery app — it is the checkout counter. If you need a campsite, a timed-entry slot, or a lottery permit, you end up here regardless of what else you use for planning.',
          'NPS.gov in a browser still matters for detailed alerts, maps, and PDF brochures. Most planning apps, TrailVerse included, point back to official pages for the fine print.',
        ],
      },
      {
        id: 'on-trail',
        heading: 'On the trail vs planning the trip',
        paragraphs: [
          'AllTrails, Gaia, and onX earn their keep after you have chosen a specific hike or backcountry route. They are weak substitutes for answering "which park should we fly into for a week in October?"',
          'TrailVerse and similar planners sit earlier in the trip: narrowing 470+ sites, comparing weather and crowds side by side, and sketching days before you book flights.',
        ],
        bullets: [
          'Planning week: TrailVerse or spreadsheets + Recreation.gov for anything that sells out',
          'Week before: NPS App alerts + AllTrails for trail-level conditions on your short list',
          'Day of: NPS App + paper map backup + the navigation app you trust on dirt roads',
        ],
      },
      {
        id: 'stack',
        heading: 'A simple stack that works',
        bullets: [
          'Shortlist parks in TrailVerse (or Discover by activity/state)',
          'Compare finalists on weather, fees, and crowds — then check alerts on each park page',
          'Book camps and timed entry on Recreation.gov',
          'Save official alert feeds in the NPS App',
          'Pull specific hikes into AllTrails (or Gaia for off-grid) before you go',
          'Use Maps for driving between parks on a road trip',
        ],
      },
    ],
    faq: [
      {
        q: 'What is the best free app for national parks?',
        a: 'Free depends on the job. The NPS App and TrailVerse browsing are free for official alerts and trip planning research. Recreation.gov is free to use but you pay for reservations. AllTrails has a usable free tier; offline maps cost extra.',
      },
      {
        q: 'Do I need both TrailVerse and AllTrails?',
        a: 'Many visitors use both: TrailVerse for which park and how the days fit together, AllTrails for conditions on a named trail. See our TrailVerse vs AllTrails guide for a full breakdown.',
      },
      {
        q: 'Is the NPS App enough on its own?',
        a: 'For a single park you already know, often yes for alerts and basics. It is thin for comparing parks, road-trip routing across sites, or AI itineraries — that is why people add a planner and a trail app.',
      },
      {
        q: 'Which app shows park closures right now?',
        a: 'The NPS App and each park\'s Alerts page on NPS.gov are authoritative. On TrailVerse, compare finalists on weather and crowds, then open each park page for the Alerts tab. See our guide on using Compare.',
      },
    ],
    relatedSlugs: [
      'trailverse-vs-alltrails',
      'trailverse-vs-recreation-gov-and-nps-app',
      'how-to-compare-national-parks-on-trailverse',
      'best-free-national-park-trip-planner',
    ],
  },
  {
    slug: 'trailverse-vs-recreation-gov-and-nps-app',
    title: 'TrailVerse vs Recreation.gov & the NPS App (2026)',
    metadataTitle: 'TrailVerse vs Recreation.gov & the NPS App (2026) | TrailVerse',
    metaDescription:
      'Recreation.gov books camps and permits; the NPS App carries official alerts. TrailVerse plans across 470+ parks. When to use each — and what none of them replace.',
    hubExcerpt:
      'Recreation.gov is for checkout; the NPS App is official alerts; TrailVerse is trip planning — not competitors for the same task.',
    category: 'Tool comparison',
    quickAnswer:
      'These are not three versions of the same app. Recreation.gov is where you buy campsites and timed-entry permits. The NPS App is the Park Service\'s official mobile channel for alerts and park information. TrailVerse is a trip planner across 470+ sites — compare parks, read alerts and weather on one page, browse by activity, and draft itineraries. You will use Recreation.gov when something requires a reservation; you should have the NPS App (or NPS.gov) for authoritative closures; TrailVerse helps before and between those steps.',
    updatedAt: '2026-06-01',
    trailverseLinks: [
      { label: 'Explore parks', href: '/explore' },
      { label: 'Compare parks', href: '/compare' },
      { label: 'Plan with Trailie', href: '/plan-ai' },
      { label: 'Best national park apps roundup', href: '/guides/best-national-park-apps-2026' },
    ],
    sections: [
      {
        id: 'three-jobs',
        heading: 'Three different jobs',
        paragraphs: [
          'Mixing these up is the most common planning mistake. Recreation.gov is a reservation system. The NPS App is an official information channel. TrailVerse is a planning workspace built on top of public park data — not a replacement for paying for a campsite or for a superintendent\'s closure order.',
        ],
      },
      {
        id: 'recreation-gov',
        heading: 'TrailVerse vs Recreation.gov',
        table: {
          headers: ['Question', 'Recreation.gov', 'TrailVerse'],
          rows: [
            ['What is it?', 'Federal booking site for camps, tickets, permits', 'Trip planner for 470+ NPS parks and sites'],
            ['Pick a park', 'Only after you already know what to book', 'Browse, search, filter, compare'],
            ['Alerts & closures', 'Not its job', 'Alert feed on each park page'],
            ['Pay for a site', 'Yes — this is the point', 'Links out; does not process payments'],
            ['Timed-entry / lotteries', 'Yes', 'Surfaces permit info; booking happens on Recreation.gov'],
            ['AI itinerary', 'No', 'Yes, via Trailie or ChatGPT app'],
          ],
        },
        paragraphs: [
          'Use Recreation.gov when you have a specific inventory item to buy — a campground loop, a shuttle ticket, a wilderness permit. Use TrailVerse when you are still deciding whether Bryce or Zion fits your week, or whether alerts make one park a bad bet this month.',
        ],
      },
      {
        id: 'nps-app',
        heading: 'TrailVerse vs the NPS App',
        table: {
          headers: ['Question', 'NPS App', 'TrailVerse'],
          rows: [
            ['Authority', 'Official Park Service product', 'Independent; pulls public NPS feeds and related data'],
            ['Alerts', 'Yes, park-by-park', 'Yes, on each park page + while comparing'],
            ['Compare multiple parks', 'One park at a time', 'Up to four side by side'],
            ['Discover by activity/topic', 'Limited', 'Discover hub across dimensions'],
            ['Ranger events', 'Some park content', 'Events search across sites'],
            ['Offline use', 'Yes — downloadable park content for offline use', 'Web/PWA; plan and save before you lose signal'],
          ],
        },
        paragraphs: [
          'The NPS App should be on your phone for any serious trip — especially for push notifications. TrailVerse is better when you are desktop-planning a road trip, weighing several parks, or want AI help structuring days.',
          'When alerts conflict between sources, trust NPS.gov and the NPS App. Refresh TrailVerse park pages if something looks stale.',
        ],
      },
      {
        id: 'workflow',
        heading: 'Workflow that respects all three',
        bullets: [
          'Discover and compare in TrailVerse',
          'Read alerts on the park page; cross-check in the NPS App',
          'Book inventory on Recreation.gov as soon as release windows open',
          'Keep the NPS App installed for the drive',
          'Use AllTrails or similar once you are picking named trails',
        ],
      },
    ],
    faq: [
      {
        q: 'Can TrailVerse book my campsite?',
        a: 'No. Campgrounds and timed-entry that sell through Recreation.gov must be booked there. TrailVerse links permit and campground information so you know what to book and when.',
      },
      {
        q: 'Is TrailVerse an official National Park Service app?',
        a: 'No. It is an independent planner that uses public NPS data and other sources. The official apps are the NPS App and NPS.gov.',
      },
      {
        q: 'Why use TrailVerse if I already have the NPS App?',
        a: 'The NPS App is built around one park at a time. TrailVerse helps when you are choosing among parks, comparing weather and alerts for a road trip, or building a multi-day itinerary with Trailie.',
      },
      {
        q: 'Does Recreation.gov show live closures?',
        a: 'Recreation.gov focuses on reservations and availability for bookable items. Road and trail closures are posted through NPS alerts — check the NPS App, NPS.gov, or the park page on TrailVerse.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'how-to-find-national-park-permits-and-reservations',
      'how-to-compare-national-parks-on-trailverse',
      'trailverse-vs-alltrails',
      'best-free-national-park-trip-planner',
    ],
  },
  {
    slug: 'how-to-compare-national-parks-on-trailverse',
    title: 'How to Compare National Parks on TrailVerse',
    metadataTitle: 'How to Compare National Parks on TrailVerse | TrailVerse',
    metaDescription:
      'Stack up to four NPS parks side by side — weather, crowds, fees, facilities, and best time to visit. How to use TrailVerse Compare and share a link.',
    hubExcerpt:
      'Pick two to four parks and read weather, crowds, and facilities in one table — then jump to park pages or Trailie.',
    category: 'How-to',
    quickAnswer:
      'Open /compare on TrailVerse, add up to four parks with search or a preset (Zion vs Bryce, Yellowstone vs Grand Teton), and scroll one table for overview, weather, crowd level, facilities, accessibility, best time to visit, parking, and top activities. Share the URL with ?parks=code1,code2 so your travel group sees the same stack. When you pick a winner, use Quick Actions to open the full park page or start a Trailie plan.',
    updatedAt: '2026-06-01',
    trailverseLinks: [
      { label: 'Open Compare', href: '/compare' },
      { label: 'Explore all parks', href: '/explore' },
      { label: 'Discover by activity', href: '/discover' },
      { label: 'Plan with Trailie', href: '/plan-ai' },
    ],
    sections: [
      {
        id: 'when-to-use',
        heading: 'When Compare beats opening ten tabs',
        paragraphs: [
          'You narrowed the trip to a region but cannot choose between two canyon parks, or you want October weather at three different latitudes. Compare is for that decision — not for booking a campsite or reading today\'s road closure (those live on Recreation.gov and each park\'s Alerts tab).',
          'Think of it as a scoreboard for planning: same rows, same columns, up to four parks.',
        ],
      },
      {
        id: 'getting-started',
        heading: 'Add parks (up to four)',
        bullets: [
          'Go to /compare and search by park name — the picker searches the full 470+ site catalog',
          'Tap a preset chip (e.g. Zion vs Bryce) to load a common pairing instantly',
          'Remove a park with the X on its column; add another until you hit four',
          'No account required — Compare works for guests',
        ],
      },
      {
        id: 'what-rows-mean',
        heading: 'What each row shows',
        table: {
          headers: ['Row', 'Use it to…'],
          rows: [
            ['Overview', 'Skim description, state, and how you typically reach the park'],
            ['Ratings & Reviews', 'See community ratings when visitors have reviewed the site on TrailVerse'],
            ['Weather', 'Compare current conditions and seasonal context'],
            ['Facilities', 'Count campgrounds, lodging, and other on-site amenities at a glance'],
            ['Accessibility', 'Contrast accessibility-related facilities between parks'],
            ['Best Time to Visit', 'See seasonal guidance side by side'],
            ['Crowd Level', 'Compare modeled crowd level and confidence — useful for picking dates'],
            ['Parking & Access', 'Entrance fees and parking summary with a link to the full park page'],
            ['Top Activities', 'See which activities NPS lists for each park'],
            ['Quick Actions', 'Open the park page or start Trailie with that park pre-selected'],
          ],
        },
      },
      {
        id: 'share-link',
        heading: 'Share the comparison',
        paragraphs: [
          'After you add parks, the address bar can include their NPS codes, for example /compare?parks=zion,brca or /compare?parks=yell,grte. Send that link to a partner or save it in your notes — anyone opening it loads the same parks (as long as the codes are valid).',
          'Codes are the four-letter NPS park codes (yell, yose, grca), not the long slug URLs used on park detail pages.',
        ],
      },
      {
        id: 'workflow',
        heading: 'A simple compare → plan workflow',
        bullets: [
          'Shortlist on Explore or Discover (by state, activity, or topic)',
          'Load finalists into Compare and eliminate on weather, crowds, or facilities',
          'Open the winner\'s park page for alerts, permits, maps, and tabs you need in depth',
          'Draft days with Trailie or the ChatGPT app — see our planning-in-ChatGPT guide',
          'Book on Recreation.gov using permit links from the park page',
        ],
      },
      {
        id: 'limits',
        heading: 'What Compare does not replace',
        bullets: [
          'Official closures and hazards — Alerts tab on each park page or NPS.gov',
          'Trail-level mud and ice — AllTrails or similar once you know the hike',
          'Live campsite availability — Recreation.gov',
          'A single "winner" score — you still choose based on your dates, driving time, and priorities',
        ],
      },
    ],
    faq: [
      {
        q: 'How many parks can I compare at once?',
        a: 'Up to four. Remove one to add another.',
      },
      {
        q: 'Can I compare a national park with a monument or historic site?',
        a: 'Yes. The catalog includes all NPS designations in the 470+ site list, not only the 63 namesake national parks.',
      },
      {
        q: 'Does Compare show live alerts?',
        a: 'No. Use the Alerts tab on each park\'s detail page for NPS closure posts, or the NPS App on the road.',
      },
      {
        q: 'Is Compare free?',
        a: 'Yes. Browsing and comparing parks does not require an account.',
      },
    ],
    relatedSlugs: [
      'best-national-park-apps-2026',
      'how-to-find-national-park-permits-and-reservations',
      'trailverse-vs-recreation-gov-and-nps-app',
      'trailverse-vs-alltrails',
      'best-free-national-park-trip-planner',
    ],
  },
  {
    slug: 'how-to-find-national-park-permits-and-reservations',
    title: 'How to Find National Park Permits and Reservations',
    metadataTitle: 'How to Find National Park Permits and Reservations | TrailVerse',
    metaDescription:
      'Timed entry, campgrounds, wilderness permits, and lotteries — where each type lives, when Recreation.gov applies, and how to check a park before you book.',
    hubExcerpt:
      'Campgrounds, timed entry, wilderness, and special hikes use different systems. Here is where to look and what to book first.',
    category: 'How-to',
    quickAnswer:
      'Most bookable inventory for national parks flows through Recreation.gov — campsites, timed-entry tickets, some shuttle seats, and many wilderness permits. Not everything uses it: some hikes and climbs use separate lottery sites, and entrance is usually just a pass at the gate unless a park posts a specific timed-entry pilot. Start on the park\'s official Permits page (or TrailVerse park page permit section) to see what exists, then create Recreation.gov alerts for release windows so you do not miss lottery dates.',
    updatedAt: '2026-06-01',
    trailverseLinks: [
      { label: 'Explore parks', href: '/explore' },
      { label: 'Compare parks', href: '/compare' },
      { label: 'TrailVerse vs Recreation.gov', href: '/guides/trailverse-vs-recreation-gov-and-nps-app' },
      { label: 'How to compare parks', href: '/guides/how-to-compare-national-parks-on-trailverse' },
    ],
    sections: [
      {
        id: 'types',
        heading: 'Types of permits and reservations',
        paragraphs: [
          'People say "permit" and mean four different things. Mixing them up is how you show up with a campground booking but no timed-entry ticket, or vice versa.',
        ],
        bullets: [
          'Entrance — America the Beautiful pass or per-vehicle fee at the gate; separate from campsite bookings',
          'Timed entry / vehicle access — a dated ticket for peak-season entry at busy parks (rules change year to year)',
          'Campgrounds and cabins — nights on Recreation.gov or, at a few parks, a concessionaire site',
          'Wilderness and backcountry — zone nights, river trips, or trail quotas, often lottery-based months ahead',
          'Special hikes — Half Dome cables (lottery) and Angels Landing in Zion (year-round permit required for the chained section; seasonal and day-before lotteries on Recreation.gov); The Wave (BLM lottery, not NPS — often paired with Zion/Page trips)',
        ],
      },
      {
        id: 'where',
        heading: 'Where to look first',
        bullets: [
          'NPS.gov → your park → Permits & Reservations (authoritative list of what the park uses)',
          'Recreation.gov → search by park name for camps, timed entry, and many wilderness permits',
          'Park concessionaire websites when NPS.gov links out for in-park lodging',
          'Separate lottery sites when NPS.gov names them (do not assume everything is on Recreation.gov)',
        ],
        paragraphs: [
          'On TrailVerse, open the park page and check the Permits section for linked inventory and notes before you dig through Recreation.gov blind. TrailVerse does not process payments — it surfaces what the park publishes so you know what to hunt for.',
        ],
      },
      {
        id: 'recreation-gov-tips',
        heading: 'Using Recreation.gov without wasting a morning',
        bullets: [
          'Create an account early and save payment info — popular slots disappear in minutes',
          'Set release alerts for camps and permits that use rolling windows or lotteries',
          'Read the facility description: hookups, generator hours, and access road notes matter',
          'Screenshot confirmation numbers; mobile signal at remote campgrounds is unreliable',
        ],
        paragraphs: [
          'Availability on Recreation.gov means the site is open for booking in the system — not that every road into the park is open that day. Cross-check NPS alerts after you book.',
        ],
      },
      {
        id: 'wilderness',
        heading: 'Wilderness and lottery permits',
        paragraphs: [
          'High-demand zones (Half Dome, Mount Whitney corridor trips tied to parks, popular river segments) often use lotteries with application windows months ahead and small daily quotas. Missing the application window is not something you can fix at the entrance station.',
          'Read the park\'s wilderness page for group size limits, bear canister rules, and cancellation policies. Shoulder-season dates have better odds at many parks.',
        ],
      },
      {
        id: 'order',
        heading: 'A sane booking order',
        bullets: [
          'Pick dates and park based on weather, crowds, and roads — Compare finalists, then check alerts on each park page',
          'List every permit type the park requires for your plan',
          'Book the hardest-to-get item first — usually wilderness lottery or peak campground loops',
          'Add timed entry or shuttle tickets if required that season',
          'Arrange entrance pass or fee payment',
          'Fill in flights and lodging last, when park access is confirmed',
        ],
      },
    ],
    faq: [
      {
        q: 'Do all national parks use Recreation.gov?',
        a: 'No. Many do for camps and some timed entry, but inventory varies by park. Always start from the park\'s official permits page rather than assuming one checkout flow.',
      },
      {
        q: 'Can TrailVerse book permits for me?',
        a: 'No. TrailVerse links to permit and campground information from park data. Checkout happens on Recreation.gov or the site the park specifies.',
      },
      {
        q: 'How far ahead should I book?',
        a: 'Campgrounds at iconic parks often open months ahead on rolling schedules. Wilderness lotteries may be four to seven months before your trip date. Timed-entry rules change — check the park page for the season you are targeting.',
      },
      {
        q: 'What if everything is sold out?',
        a: 'Watch for cancellations on Recreation.gov, consider shoulder dates, try first-come campgrounds where the park allows it, or shift to a nearby park with similar scenery. TrailVerse Compare helps weigh alternatives quickly.',
      },
    ],
    relatedSlugs: [
      'trailverse-vs-recreation-gov-and-nps-app',
      'how-to-compare-national-parks-on-trailverse',
      'best-national-park-apps-2026',
      'best-free-national-park-trip-planner',
    ],
  },
];

/** @param {string} slug */
export function getGuideBySlug(slug) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

export function getAllGuideSlugs() {
  return GUIDES.map((g) => g.slug);
}

/** @param {Guide} guide */
export function getGuideCanonicalUrl(guide) {
  return `${BASE_URL}/guides/${guide.slug}`;
}
