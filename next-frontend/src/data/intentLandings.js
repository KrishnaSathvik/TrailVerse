/**
 * SEO intent landing pages — ranked via GET /api/parks/search?q=
 * @typedef {{ q: string; a: string }} IntentFaqItem
 * @typedef {{ label: string; href: string }} IntentLink
 * @typedef {Object} IntentLanding
 * @property {string} path — URL path e.g. /parks-for-couples
 * @property {string} title — on-page H1
 * @property {string} hubExcerpt — short blurb for /guides hub cards
 * @property {string} [category] — badge on hub cards
 * @property {string} metadataTitle — document title
 * @property {string} metaDescription
 * @property {string} searchQuery — passed to /api/parks/search
 * @property {string} intro
 * @property {string} [quickAnswer]
 * @property {string[]} [featuredParkCodes] — pinned to top of live search results (NPS codes)
 * @typedef {{ parkCode: string; fullName: string; label: string; description: string }} IntentStandout
 * @property {IntentStandout[]} [standouts] — editorial picks with human-written blurbs
 * @property {IntentFaqItem[]} [faq]
 * @property {IntentLink[]} [relatedLinks]
 * @property {string} updatedAt
 */

import { EXTENDED_INTENT_LANDINGS } from './intentLandingsExtended';

const BASE = 'https://www.nationalparksexplorerusa.com';

/** @type {IntentLanding[]} */
export const INTENT_LANDINGS = [
  {
    path: '/parks-for-couples',
    title: 'Best National Parks for Couples',
    category: 'Park picks',
    hubExcerpt:
      'Romantic scenic parks ranked for couples — with live match reasons on every pick.',
    metadataTitle: 'Best National Parks for Couples | TrailVerse',
    metaDescription:
      'Romantic national parks for couples — scenic overlooks, lakeshores, and quiet trails ranked by TrailVerse search across 470+ NPS sites. Plan your trip free.',
    searchQuery: 'best parks for couples',
    intro:
      'The best parks for couples combine scenic views, relaxed pacing, and memorable shared experiences — without needing extreme hikes or crowded peak-season chaos. TrailVerse ranks 470+ NPS sites by romantic and scenic traits, plus live alerts and weather on every park page.',
    quickAnswer:
      'Top picks for couples lean scenic and relaxing: think lakeshores, mountain vistas, and valley overlooks rather than all-day backcountry slogs. Shenandoah, Acadia, and Olympic-style parks often rank well for couples; use Compare to narrow by season and weather before you book.',
    featuredParkCodes: ['acad', 'olym', 'shen', 'viis', 'grte', 'crla'],
    standouts: [
      {
        parkCode: 'acad',
        fullName: 'Acadia National Park',
        label: 'Acadia, Maine',
        description:
          'Maybe the most couple-friendly park in the country. Sunrise from Cadillac Mountain (the first place in the U.S. to catch it for part of the year), the cliffs-and-sea Park Loop Road, and gentle carriage roads you can bike together. Coast, mountains, and lobster towns in one compact trip.',
      },
      {
        parkCode: 'grte',
        fullName: 'Grand Teton National Park',
        label: 'Grand Teton, Wyoming',
        description:
          'The Teton range rises straight out of the valley with no foothills to soften it, and it reflects in Jenny Lake and the Snake River at Oxbow Bend. Alpenglow on the peaks at sunrise is the moment here. Big mountain drama, very little effort required to see it.',
      },
      {
        parkCode: 'crla',
        fullName: 'Crater Lake National Park',
        label: 'Crater Lake, Oregon',
        description:
          'The deepest lake in the U.S., an impossibly blue caldera ringed by Rim Drive. Slow loops around the rim with constant pull-over views, and a historic lodge perched right on the edge. Note the rim road and facilities are seasonal — much of it is snowbound into early summer.',
      },
      {
        parkCode: 'glac',
        fullName: 'Glacier National Park',
        label: 'Glacier, Montana',
        description:
          "Going-to-the-Sun Road is one of the great scenic drives anywhere, threading alpine lakes and cliff walls. Lake McDonald's calm water and stone beaches are made for an unhurried evening. The road opens in stages through early summer, so check status before you set dates.",
      },
      {
        parkCode: 'shen',
        fullName: 'Shenandoah National Park',
        label: 'Shenandoah, Virginia',
        description:
          "The low-effort romantic weekend. Skyline Drive runs the spine of the park with 70+ overlooks, it's an easy reach from D.C. and the mid-Atlantic, and the pace is gentle by design. Fall color here is a classic couples trip.",
      },
      {
        parkCode: 'mora',
        fullName: 'Mount Rainier National Park',
        label: 'Mount Rainier, Washington',
        description:
          'In midsummer the Paradise meadows erupt in wildflowers beneath the volcano, and Reflection Lakes do exactly what the name promises. Short loop walks deliver outsized scenery.',
      },
      {
        parkCode: 'redw',
        fullName: 'Redwood National and State Parks',
        label: 'Redwood, California',
        description:
          'Walking among the tallest trees on Earth in coastal fog is genuinely awe-inducing, and unlike most of this list, the ocean views here are real — the park runs right along the Pacific.',
      },
      {
        parkCode: 'romo',
        fullName: 'Rocky Mountain National Park',
        label: 'Rocky Mountain, Colorado',
        description:
          'Trail Ridge Road carries you above the tree line on the highest continuous paved road in the country, and Bear Lake offers an easy, beautiful stroll. Alpine grandeur without the alpine suffering.',
      },
    ],
    faq: [
      {
        q: 'What makes a national park good for couples?',
        a: 'Look for scenic overlooks, manageable day hikes, lodging or camping options nearby, and a pace that allows time together — not just mileage. TrailVerse ranks parks by romantic, scenic, and relaxing traits from NPS descriptions and activities.',
      },
      {
        q: 'Which season is best for a couples park trip?',
        a: 'Shoulder seasons (May and September) often beat peak summer for crowds and lodging. Check live weather and alerts on each park page before you commit to dates.',
      },
      {
        q: 'Do I need reservations for a couples getaway?',
        a: 'It depends on the park and season. Entrance reservations are rare in 2026, but campgrounds, lodges, and timed-entry permits (like Half Dome) still require Recreation.gov bookings. TrailVerse links permit info from each park page.',
      },
    ],
    relatedLinks: [
      { label: 'Quiet national parks', href: '/quiet-national-parks' },
      { label: 'Dark sky parks', href: '/dark-sky-parks' },
    ],
    updatedAt: '2026-05-31',
  },
  {
    path: '/parks-for-photography',
    title: 'Best National Parks for Photography',
    category: 'Park picks',
    hubExcerpt:
      'Landscape, wildlife, and scenic viewpoints — parks ranked for photography with live match reasons.',
    metadataTitle: 'Best National Parks for Photography | TrailVerse',
    metaDescription:
      'Best national parks for photography — sunrise vistas, wildlife, and iconic landscapes ranked by TrailVerse across 470+ NPS sites. Live weather and alerts included.',
    searchQuery: 'best parks for photography',
    intro:
      'Great park photography needs more than a famous name — you want reliable scenic viewpoints, interesting light, and subjects that match your lens (landscape, wildlife, astro, or waterfalls). TrailVerse ranks every NPS site by photography and scenic traits, with live weather on each park page.',
    quickAnswer:
      'Mount Rainier, Grand Teton, Yosemite, and Zion frequently rank high for photography — mountains, wildlife, and iconic light. For astro work, pair scenic parks with dark-sky planning; check the Photography activity collection in Explore by Activity for NPS-tagged sites.',
    featuredParkCodes: ['yose', 'grte', 'mora', 'zion', 'arch', 'cany'],
    standouts: [
      {
        parkCode: 'yose',
        fullName: 'Yosemite National Park',
        label: 'Yosemite, California',
        description:
          'The valley is a studio with the lights already rigged — Tunnel View, El Capitan, Half Dome, and Bridalveil Fall are the obvious frames, and they work in every season. Mist in the meadows after a storm, golden light on the walls at last light, and (when conditions align in February) the Horsetail Fall "firefall" on the east face. Arrive early; parking and permits matter here more than almost anywhere.',
      },
      {
        parkCode: 'grte',
        fullName: 'Grand Teton National Park',
        label: 'Grand Teton, Wyoming',
        description:
          'Mormon Row at dawn, Oxbow Bend when the Snake River mirrors the range, and Schwabacher Landing when moose step through the shallows — this is the textbook mountain-wildlife portfolio. The Tetons give you vertical drama without a long approach, and summer wildflower meadows add foreground color most parks cannot match.',
      },
      {
        parkCode: 'mora',
        fullName: 'Mount Rainier National Park',
        label: 'Mount Rainier, Washington',
        description:
          'Paradise in July and August is wildflower overload with a volcano backdrop; Reflection Lakes on a calm morning is the shot everyone chases for a reason. Fog, rain, and sudden clearing storms are part of the game — when the mountain steps out of the clouds, the payoff is enormous. Check road and trail status; snow lingers late at elevation.',
      },
      {
        parkCode: 'zion',
        fullName: 'Zion National Park',
        label: 'Zion, Utah',
        description:
          'Red walls, narrow light, and the Virgin River running through the canyon floor. Watchman Trail and Canyon Junction at sunrise, the Narrows when the river is low (check flash-flood forecasts), and the east-side slickrock when you want abstract color and texture. Shuttle season changes how you move — plan slots, not just locations.',
      },
      {
        parkCode: 'arch',
        fullName: 'Arches National Park',
        label: 'Arches, Utah',
        description:
          'Delicate Arch at sunset is crowded because it works — frame it with the La Sal Mountains behind when skies cooperate. Windows Section and Park Avenue are faster wins; balanced rock and Fiery Furnace (permit or guide) reward patience. Some of the best work here is blue hour and Milky Way season under genuinely dark skies.',
      },
      {
        parkCode: 'cany',
        fullName: 'Canyonlands National Park',
        label: 'Canyonlands, Utah',
        description:
          'Mesa Arch at sunrise is the icon — get there early and expect company. Island in the Sky overlooks compress vast canyon country into a single frame; Needles and the Maze are for longer lenses and longer days. Heat and exposure are real in summer; spring and fall light is kinder.',
      },
      {
        parkCode: 'yell',
        fullName: 'Yellowstone National Park',
        label: 'Yellowstone, Wyoming',
        description:
          'Wildlife, geothermal color, and scale — bison and elk in Lamar Valley at dawn, Grand Prismatic from the overlook when steam and sun align, and the Yellowstone River cutting through the canyon. Conditions change hourly; telephoto ethics matter here. Winter snowcoach access opens a completely different, quieter palette.',
      },
      {
        parkCode: 'acad',
        fullName: 'Acadia National Park',
        label: 'Acadia, Maine',
        description:
          'Granite coast, Atlantic fog, and the first U.S. sunrise from Cadillac Mountain (for part of the year). Bass Harbor Head Light, Jordan Pond reflections, and carriage-road bridges in peak fall color give you coast, forest, and mountain in one park. Tide and weather move fast — build slack into every shoot.',
      },
    ],
    faq: [
      {
        q: 'What are the best national parks for landscape photography?',
        a: 'Parks with strong scenic and mountain traits — Grand Teton, Yosemite, Zion, and similar — rank highest in TrailVerse search. Golden hour and weather matter as much as the park; check live forecasts before you go.',
      },
      {
        q: 'Which parks are best for wildlife photography?',
        a: 'Yellowstone, Grand Teton, and coastal parks with wildlife programs often score high on wildlife traits. Always follow NPS distance rules and check active alerts for road or area closures.',
      },
      {
        q: 'Can I plan a photography trip in ChatGPT with live park data?',
        a: 'Yes — the TrailVerse ChatGPT app pulls live alerts, weather, and park details so your shot list reflects current conditions, not outdated training data.',
      },
    ],
    relatedLinks: [
      { label: 'Wildlife national parks', href: '/wildlife-national-parks' },
      { label: 'Fall color parks', href: '/fall-color-parks' },
    ],
    updatedAt: '2026-05-31',
  },
  {
    path: '/ocean-national-parks',
    title: 'Ocean & Coastal National Parks',
    category: 'Park picks',
    hubExcerpt:
      'Seashores, islands, and shoreline parks ranked by ocean and coastal traits.',
    metadataTitle: 'Ocean & Coastal National Parks | TrailVerse',
    metaDescription:
      'Ocean and coastal national parks — seashores, islands, and shoreline NPS sites ranked by TrailVerse. Live alerts, weather, and trip planning across 470+ parks.',
    searchQuery: 'ocean coastal beach national parks',
    intro:
      'Coastal parks span Atlantic seashores, Pacific cliffs, Gulf islands, and Great Lakes shorelines — not just one type of beach. TrailVerse ranks NPS sites by ocean and water traits, with permit links and live alerts on every park page.',
    quickAnswer:
      'Assateague, Cape Hatteras, Channel Islands, and Olympic coast sections rank high for ocean and shoreline traits. Pair this list with national seashores in Explore by Activity for the full NPS designation catalog, then compare finalists by season and weather.',
    featuredParkCodes: ['asis', 'caha', 'chis', 'olym', 'buis', 'calo'],
    standouts: [
      {
        parkCode: 'asis',
        fullName: 'Assateague Island National Seashore',
        label: 'Assateague, Maryland & Virginia',
        description:
          'Wild horses on Atlantic beaches — an image that sells itself when light is soft and wind is up. Walk the shoreline at dawn before the day-trip crowd, watch pony bands move through dunes and surf, and keep a long lens for respectful distance. Mosquitoes in summer are part of the price; spring and fall are gentler.',
      },
      {
        parkCode: 'caha',
        fullName: 'Cape Hatteras National Seashore',
        label: 'Cape Hatteras, North Carolina',
        description:
          "The Outer Banks in one long strip of sand, surf, and sky — Cape Hatteras Lighthouse, Oregon Inlet, and Pea Island for birds and wide-open horizon lines. Nor'easters and hurricanes rewrite the beach; check road and ramp closures. This is Atlantic light, wind texture, and lighthouse geometry more than tropical turquoise.",
      },
      {
        parkCode: 'chis',
        fullName: 'Channel Islands National Park',
        label: 'Channel Islands, California',
        description:
          "California's Galápagos — sea caves, kelp forests, foxes, and cliffs rising from the Pacific with no bridge attached. Most visitors never come because it takes a boat or plane; that is exactly why it feels like a true coastal escape. Island choice matters (Anacapa arches vs. Santa Cruz sea caves); book transport early and watch marine forecasts.",
      },
      {
        parkCode: 'olym',
        fullName: 'Olympic National Park',
        label: 'Olympic, Washington',
        description:
          'Three coasts in one park: ruby-sand Ruby Beach and sea stacks at Rialto, tidepools at Kalaloch, and the Hoh Rain Forest when you want moss, not surf. Fog is a feature, not a bug — it softens stacks and adds mood. Winter storms throw spray; summer can be crowded at roadside viewpoints. Check tide tables for safe beach access.',
      },
      {
        parkCode: 'buis',
        fullName: 'Biscayne National Park',
        label: 'Biscayne, Florida',
        description:
          "Almost entirely underwater — mangrove keys, shallow bay, and coral reef on Miami's doorstep. Snorkel and boat trips are how you see the park; the visitor center on the mainland is only the prologue. Calm, clear days define the experience; wind and summer thunderstorms can cancel plans quickly.",
      },
      {
        parkCode: 'calo',
        fullName: 'Canaveral National Seashore',
        label: 'Canaveral, Florida',
        description:
          'Twenty-four miles of undeveloped Atlantic beach between the space coast and the wildlife refuge — Playalinda Beach when launches light the sky, turtle nesting in season, and surf fishing without high-rise backdrop. Launch schedules and refuge closures can restrict access; verify the day before you drive.',
      },
      {
        parkCode: 'acad',
        fullName: 'Acadia National Park',
        label: 'Acadia, Maine',
        description:
          'The classic rocky North Atlantic coast — granite ledges, pounding surf, and Park Loop Road pulling you from one headland to the next. Bass Harbor Head Light, Thunder Hole when swell is right, and quiet coves on the quieter side of Mount Desert Island. Summer is busy; shoulder seasons still deliver drama if you dress for wind.',
      },
      {
        parkCode: 'viis',
        fullName: 'Virgin Islands National Park',
        label: 'Virgin Islands, U.S. Virgin Islands',
        description:
          'Caribbean water color on Trunk Bay and Cinnamon Bay, reef snorkeling steps from the sand, and short hikes to hilltop views over the chain. Hurricane recovery and ferry logistics shape any trip — confirm facilities and trails before you fly. When conditions align, this is the warm-water end of the NPS coastal map.',
      },
    ],
    faq: [
      {
        q: 'What counts as an ocean or coastal national park?',
        a: 'TrailVerse includes national seashores, lakeshores, coastal monuments, and parks with strong ocean or water traits in NPS data — not only sites on the open ocean.',
      },
      {
        q: 'When is the best time to visit coastal parks?',
        a: 'Shoulder seasons often mean fewer crowds and milder weather, but hurricane season and winter storms affect Atlantic and Gulf sites. Check live alerts and weather on each park page before you travel.',
      },
      {
        q: 'Are beach fires and camping allowed everywhere?',
        a: 'No — rules vary by park and season. Confirm on NPS.gov and Recreation.gov; TrailVerse surfaces permit links but does not issue reservations.',
      },
    ],
    relatedLinks: [
      { label: 'Wildlife national parks', href: '/wildlife-national-parks' },
      { label: 'Parks for photography', href: '/parks-for-photography' },
    ],
    updatedAt: '2026-05-31',
  },
  {
    path: '/fall-color-parks',
    title: 'Best National Parks for Fall Colors',
    category: 'Park picks',
    hubExcerpt:
      'Leaf-peeping destinations ranked for fall foliage — plus timing tips for peak color.',
    metadataTitle: 'Best National Parks for Fall Colors | TrailVerse',
    metaDescription:
      'Best national parks for fall foliage — peak leaf-peeping destinations ranked by TrailVerse across forest and mountain parks. Plan timing with live weather.',
    searchQuery: 'best parks for fall foliage autumn',
    intro:
      'Fall color trips live or die on timing: elevation, latitude, and weather shift peak foliage by weeks. TrailVerse ranks parks with strong forest, scenic, and mountain traits — the same signals that power fall foliage search — plus live weather on every park page.',
    quickAnswer:
      'Great Smoky Mountains, Shenandoah, Acadia, Rocky Mountain, and Cuyahoga Valley are classic fall color destinations. Peak weeks vary year to year — plan a flexible window and check road status and alerts before you drive.',
    featuredParkCodes: ['grsm', 'shen', 'acad', 'romo', 'cuva', 'neri'],
    standouts: [
      {
        parkCode: 'grsm',
        fullName: 'Great Smoky Mountains National Park',
        label: 'Great Smoky Mountains, Tennessee & North Carolina',
        description:
          'The busiest park in the system still puts on the best fall show in the East — sugar maples and hickories rolling in waves across ridgelines. Clingmans Dome and Newfound Gap for big vistas, Cades Cove loop for classic valley color (go at dawn), and low-elevation roads a week or two after peaks up high. Haze and crowds are real; midweek and October shoulder weeks help.',
      },
      {
        parkCode: 'shen',
        fullName: 'Shenandoah National Park',
        label: 'Shenandoah, Virginia',
        description:
          'Skyline Drive is leaf-peeping infrastructure — 105 miles of overlooks when maples and oaks turn along the Blue Ridge. Big Meadows opens up the horizon; Dark Hollow Falls adds water to the palette. Peak moves north to south and down slope over several weeks; one "peak weekend" rarely fits the whole park.',
      },
      {
        parkCode: 'acad',
        fullName: 'Acadia National Park',
        label: 'Acadia, Maine',
        description:
          'Coastal Maine color — birch and maple against granite and Atlantic blue. Cadillac Mountain roads, Jordan Pond, and the carriage roads on Mount Desert Island are the core loop. Peak often lands mid-October, but a cold snap or warm fall can shift it a week either way; flexible dates beat a fixed reservation.',
      },
      {
        parkCode: 'romo',
        fullName: 'Rocky Mountain National Park',
        label: 'Rocky Mountain, Colorado',
        description:
          'Aspen gold at high elevation — Bear Lake, Trail Ridge Road when it is still open, and the Kawuneeche Valley on the west side for broad slopes of yellow. Elk rut overlaps with color in September; traffic and timed entry in peak season require planning. Snow closes Trail Ridge early; check status before you assume the full loop.',
      },
      {
        parkCode: 'cuva',
        fullName: 'Cuyahoga Valley National Park',
        label: 'Cuyahoga Valley, Ohio',
        description:
          'An easy Midwest fall hit — the Cuyahoga River, towpath trails, and Brandywine Falls framed in hardwood color without mountain driving stress. Less elevation drama than the Smokies, but dependable maples and oaks and quick access from Cleveland and Akron. Weekends fill; weekday mornings are the move.',
      },
      {
        parkCode: 'neri',
        fullName: 'New River Gorge National Park and Preserve',
        label: 'New River Gorge, West Virginia',
        description:
          'Appalachian gorge country — the New River cutting through forest, the Bridge Walk when it is open, and slopes of oak and maple along rim trails. Peak color usually runs late September into October, often a touch later than higher northern parks. Whitewater and climbing crowds share the gorge; fall foliage hikers spread out on ridge trails.',
      },
      {
        parkCode: 'blri',
        fullName: 'Blue Ridge Parkway',
        label: 'Blue Ridge Parkway, Virginia & North Carolina',
        description:
          "Not a single park but 469 miles of fall color infrastructure — overlooks, ridge-top driving, and access to higher peaks like Rough Ridge and Graveyard Fields. Peak sweeps south week by week; the Parkway's elevation spread is the whole strategy. Fog, closed gates, and leaf-peeper traffic are part of the game — go early, go midweek.",
      },
      {
        parkCode: 'piro',
        fullName: 'Pictured Rocks National Lakeshore',
        label: 'Pictured Rocks, Michigan',
        description:
          'Lake Superior shore, not ocean — but the fall mix of maple and birch against sandstone cliffs and teal water is underrated. Miners Castle, Chapel Rock, and boat tours when the lake allows. Peak is usually late September into early October; lake effect weather turns fast, so build a buffer day.',
      },
    ],
    faq: [
      {
        q: 'When is peak fall foliage in national parks?',
        a: 'It varies by park and elevation. Northern and high-elevation parks peak earlier (often September–October); southern valleys can run into November. Check local NPS alerts and weather the week you go.',
      },
      {
        q: 'Which parks are best for leaf peeping?',
        a: 'Parks with extensive deciduous forest and scenic drives — Great Smoky Mountains, Shenandoah, Acadia, and similar — rank highest in TrailVerse fall foliage search.',
      },
      {
        q: 'How do I avoid fall crowds?',
        a: 'Visit midweek, arrive early, and consider shoulder weeks on either side of peak color. Our quiet parks list and crowd calendar report can help you plan lower-stress timing.',
      },
    ],
    relatedLinks: [
      { label: 'Parks for photography', href: '/parks-for-photography' },
      { label: 'Winter national parks', href: '/winter-national-parks' },
    ],
    updatedAt: '2026-05-31',
  },
  {
    path: '/quiet-national-parks',
    title: 'Quiet National Parks (Less Crowded Picks)',
    category: 'Park picks',
    hubExcerpt:
      'Peaceful, less crowded parks ranked by relaxing and nature traits — not just the famous names.',
    metadataTitle: 'Quiet National Parks — Less Crowded Picks | TrailVerse',
    metaDescription:
      'Quiet, less crowded national parks for peaceful trips — ranked by relaxing and nature traits across 470+ NPS sites. Live alerts and trip planning on TrailVerse.',
    searchQuery: 'quiet peaceful national parks',
    intro:
      'Quiet does not mean boring — it means parks where you can breathe, hear wildlife, and skip the worst of peak-season gridlock. TrailVerse ranks sites by relaxing, nature, and scenic traits, the same signals used when you ask for peaceful or low-key parks.',
    quickAnswer:
      'Chiricahua, North Cascades, Isle Royale (seasonal), and many monuments and preserves outrank headline parks on quiet traits — often with fewer visitors but equally strong scenery. Always check live alerts; remote parks have their own access constraints.',
    featuredParkCodes: ['noca', 'chir', 'care', 'voya', 'bibe', 'isro'],
    standouts: [
      {
        parkCode: 'noca',
        fullName: 'North Cascades National Park',
        label: 'North Cascades, Washington',
        description:
          "The \"American Alps\" with a fraction of Rainier's foot traffic — jagged peaks, turquoise Diablo and Ross Lakes, and Highway 20 when it is open. Most of the park is backcountry; roadside viewpoints and short trails still deliver scale without a permit lottery. Winters are long; summer and early fall are the practical window.",
      },
      {
        parkCode: 'chir',
        fullName: 'Chiricahua National Monument',
        label: 'Chiricahua, Arizona',
        description:
          'Hoodoos and sky islands in southeast Arizona — a landscape that feels borrowed from Utah, with far fewer people. The Echo Canyon loop winds through rock spires; Bonita Canyon Drive pulls you up into cooler forest. Summer heat is serious; spring and fall are the comfortable seasons. Remote by design; that is the point.',
      },
      {
        parkCode: 'care',
        fullName: 'Capitol Reef National Park',
        label: 'Capitol Reef, Utah',
        description:
          "The quiet corner of Utah's Mighty Five — orchards in Fruita, Cathedral Valley monoliths (high-clearance recommended), and slot canyons without Zion's shuttle lines. Visitor counts are a fraction of Arches or Zion; you can still find a trailhead with space on a summer morning. Water and services are limited; fill tanks and plan fuel.",
      },
      {
        parkCode: 'voya',
        fullName: 'Voyageurs National Park',
        label: 'Voyageurs, Minnesota',
        description:
          'A water park in the original sense — houseboats, kayaks, and boreal forest on the Canadian Shield. Most campsites and trails are reachable only by boat; silence scales with distance from the launch. Mosquitoes in June, aurora potential in darker months, and genuine emptiness if you commit to an overnight on the water.',
      },
      {
        parkCode: 'bibe',
        fullName: 'Big Bend National Park',
        label: 'Big Bend, Texas',
        description:
          'Chihuahuan Desert big sky — the Chisos Basin as an island of mountains, Santa Elena Canyon at sunset, and hot springs on the Rio Grande. Visitor numbers are modest compared with western icons; summer heat limits hiking to early hours. One of the best dark-sky parks in the lower 48 if you stay after dusk.',
      },
      {
        parkCode: 'isro',
        fullName: 'Isle Royale National Park',
        label: 'Isle Royale, Michigan',
        description:
          'Boat or seaplane only — no cars, no roads, and among the lowest visitation of any full national park. Moose, wolves, and inland lakes on a Lake Superior island; most people day-trip, but overnighters get the quiet. Season is short (roughly April through October); confirm ferry schedules before you book lodging on the mainland.',
      },
      {
        parkCode: 'grba',
        fullName: 'Great Basin National Park',
        label: 'Great Basin, Nevada',
        description:
          'Empty highway country with a 13,000-foot peak, ancient bristlecone pines, and Lehman Caves underground. Wheeler Peak Scenic Drive when open, alpine trails above the desert, and ranger-led cave tours. Few crowds because few neighbors — the nearest big city is a long way away. Perfect if your definition of quiet includes wide horizons.',
      },
      {
        parkCode: 'cong',
        fullName: 'Congaree National Park',
        label: 'Congaree, South Carolina',
        description:
          "Old-growth bottomland hardwood forest — a boardwalk through cathedral trees and swamp without the Everglades' airboat circus. Kayaking when water levels cooperate; mosquitoes when they do not. Low visitation, flat terrain, and a completely different texture from mountain or desert quiet parks. Check flood status before you go.",
      },
    ],
    faq: [
      {
        q: 'What is the least crowded national park?',
        a: 'Visitor counts shift by season, but smaller monuments, preserves, and remote parks often see far fewer people than Yellowstone or Yosemite in summer. TrailVerse search ranks by peaceful and nature traits — not official visitation stats alone.',
      },
      {
        q: 'Can popular parks feel quiet?',
        a: 'Yes, if you visit off-season, start at dawn, or hike past the first viewpoint. Check our when-to-go report and live crowd signals on compare for timing help.',
      },
      {
        q: 'Are quiet parks harder to reach?',
        a: 'Sometimes. Remote parks may have limited lodging, seasonal road closures, or long drives. Confirm access on the park page alerts tab before you book flights.',
      },
    ],
    relatedLinks: [
      { label: 'Dark sky parks', href: '/dark-sky-parks' },
      { label: 'Accessible national parks', href: '/accessible-national-parks' },
    ],
    updatedAt: '2026-05-31',
  },
  ...EXTENDED_INTENT_LANDINGS,
];

/** @param {string} path */
export function getIntentLandingByPath(path) {
  return INTENT_LANDINGS.find((l) => l.path === path) ?? null;
}

/** @param {IntentLanding} landing */
export function getIntentLandingCanonicalUrl(landing) {
  return `${BASE}${landing.path}`;
}

export function getAllIntentLandingPaths() {
  return INTENT_LANDINGS.map((l) => l.path);
}
