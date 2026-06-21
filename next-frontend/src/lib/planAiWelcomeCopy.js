/**
 * Trailie welcome messages — keep short; prompts + composer teach the rest.
 */

import STATE_NAMES from '@/utils/stateNames';

function displayName(user) {
  const name = user?.firstName || user?.name?.split?.(' ')?.[0];
  return name?.trim() || null;
}

function greeting(user) {
  const name = displayName(user);
  return name ? `Hey ${name}!` : 'Hey!';
}

/** Generic / new chat — no park selected yet */
export function getGenericWelcomeMessage(user) {
  const name = displayName(user);
  const hey = name ? `Hey ${name},` : 'Hey,';
  return `${hey} I'm **Trailie**. I help you choose where to go outdoors — national parks, state parks, or anywhere you're thinking — and plan a trip that fits your time, season, group, and travel style.

Tell me a destination or describe the kind of trip you want.`;
}

/** Park already chosen (Quick Fill, park page, landing cards, etc.) */
export function getParkWelcomeMessage(user, parkName) {
  const park = shortParkName(parkName);
  const name = displayName(user);
  const hey = name ? `Hey ${name},` : 'Hey,';

  return `${hey} I'm **Trailie** — let's plan **${park}**.

When are you going and how many days do you have? Tell me what you want to do — hikes, scenic drives, wildlife, easy walks — or say **plan it** and I'll map a day-by-day itinerary.`;
}

/** Shared copy for "My Recommendations" / "For Me" */
export const MY_RECOMMENDATIONS_INFO = {
  title: 'My Recommendations',
  body: 'Trailie suggests your next park or trip using your saved and visited parks, trip history, and seasonality. Unlocks after you\'ve planned 3 different parks in chat.',
};

export const MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE =
  'Suggestions based on your trip history and favorites';

export const MY_RECOMMENDATIONS_PROMPTS_SUBTITLE =
  'Based on parks you’ve planned or visited';

/** Logged-in "My Recommendations" entry */
export function getPersonalizedWelcomeMessage(user) {
  return `I'm **Trailie** — I'll use your past trips, saved parks, and favorites to suggest what's next (not live booking data).

I'll ask one quick question first, then we can narrow in on parks.`;
}

/** From compare page — multi-park road trip */
export function getRoadTripWelcomeMessage(user, suggestText) {
  return `${greeting(user)} Let's plan a road trip through **${suggestText}**.

How many days, where you're starting from, and camping vs lodges?`;
}

/** From a parks-by-vibe intent guide (/parks-for-couples, etc.) */
export function getIntentWelcomeMessage(user, intentContext) {
  const name = displayName(user);
  const hey = name ? `Hey ${name},` : 'Hey,';
  const guideTitle = intentContext?.title || 'this trip style';
  const quickAnswer = intentContext?.quickAnswer?.trim();
  const picks = (intentContext?.standouts || [])
    .slice(0, 4)
    .map((item) => (typeof item === 'string' ? item : item.fullName || item.label))
    .filter(Boolean);

  let body = `${hey} I'm **Trailie** — you're planning from our **${guideTitle}** guide.`;

  if (quickAnswer) {
    body += `\n\n${quickAnswer}`;
  }

  if (picks.length > 0) {
    const pickList = picks.map((name) => `**${shortParkName(name)}**`).join(', ');
    body += `\n\nStrong picks from that list include ${pickList}.`;
  }

  body += `\n\nTell me your dates, where you're starting from, and how many days you have — or name a park and say **plan it** for a day-by-day itinerary.`;

  return body;
}

/** From compare page — single park picked after side-by-side comparison */
export function getCompareWelcomeMessage(user, parkName) {
  const park = shortParkName(parkName);
  const name = displayName(user);
  const hey = name ? `Hey ${name},` : 'Hey,';

  return `${hey} I'm **Trailie** — you picked **${park}** after comparing your options. Let's plan that trip.

When are you going and how many days do you have? Tell me what you want to do — hikes, scenic drives, wildlife — or say **plan it** for a day-by-day itinerary.`;
}

/**
 * Pick welcome copy from entry source — keep in sync with derivePlanAiHeaderMeta entry modes.
 * @param {'general'|'park'|'compare'|'road_trip'|'intent'|'personalized'|'chat_history'} entryMode
 */
export function resolvePlanAiWelcomeMessage({
  entryMode = 'general',
  user,
  parkName = '',
  suggestText = '',
  intentContext = null,
  isPersonalized = false,
  isNewChat = false,
  fromCompare = false,
}) {
  if (isPersonalized || entryMode === 'personalized') {
    return getPersonalizedWelcomeMessage(user);
  }
  if (entryMode === 'intent' && intentContext) {
    return getIntentWelcomeMessage(user, intentContext);
  }
  if (entryMode === 'road_trip' || suggestText) {
    return getRoadTripWelcomeMessage(user, suggestText);
  }
  if (fromCompare && parkName) {
    return getCompareWelcomeMessage(user, parkName);
  }
  if (entryMode === 'park' || (parkName && !isNewChat)) {
    return getParkWelcomeMessage(user, parkName);
  }
  return getGenericWelcomeMessage(user);
}

/** Resuming a saved trip from chat history */
export function getWelcomeBackMessage(parkName) {
  const label = parkName || 'this trip';
  return `Welcome back — ready to continue **${label}**? Tell me what to change.`;
}

/** Explore page — mobile-only plan CTA at bottom of results */
export function getExploreMobilePlanCta({ user, isAuthenticated, searchTerm, stateCodes = [] }) {
  const name = displayName(user);
  const trimmedSearch = searchTerm?.trim();

  if (isAuthenticated) {
    if (trimmedSearch) {
      return {
        title: name ? `${name}, plan around “${trimmedSearch}”?` : `Plan around “${trimmedSearch}”?`,
        body: 'Trailie can turn what you’re browsing into a day-by-day itinerary — dates, hikes, and where to stay.',
        button: 'Plan this trip',
      };
    }

    if (stateCodes.length === 1) {
      const stateName = STATE_NAMES[stateCodes[0]] || stateCodes[0];
      return {
        title: name ? `Planning ${stateName}, ${name}?` : `Planning a ${stateName} trip?`,
        body: 'Tell Trailie when you’re going and what you love — hiking, scenic drives, family-friendly — and get a trip built around these parks.',
        button: `Plan my ${stateName} trip`,
      };
    }

    if (name) {
      return {
        title: `Where next, ${name}?`,
        body: 'Trailie uses your saved and visited parks to suggest what fits you — or start fresh from anything you find here.',
        button: 'Plan with Trailie',
      };
    }

    return {
      title: 'Ready for your next trip?',
      body: 'Your saved and visited parks help Trailie suggest what fits you — or start fresh from anything here.',
      button: 'Plan with Trailie',
    };
  }

  if (trimmedSearch) {
    return {
      title: `Planning around “${trimmedSearch}”?`,
      body: 'Tell me your dates and pace — I’ll map hikes, drives, and where to stay from the parks you’re browsing here.',
      button: 'Plan this trip',
    };
  }

  if (stateCodes.length === 1) {
    const stateName = STATE_NAMES[stateCodes[0]] || stateCodes[0];
    return {
      title: `Planning ${stateName}?`,
      body: `How many days do you have? Tell me your travel style and I’ll build a day-by-day route through these ${stateName} parks.`,
      button: `Plan a ${stateName} trip`,
    };
  }

  return {
    title: 'Know where you want to go?',
    body: 'Pick your dates and what matters — big hikes, scenic drives, kid-friendly stops — and I’ll sketch a day-by-day route from what you find here.',
    button: 'Plan with Trailie',
  };
}

function shortParkName(fullName) {
  return fullName
    ?.replace(/\s+National (Park|Monument|Historic Site|Preserve|Seashore|Recreation Area).*$/i, '')
    ?.trim() || fullName || 'this park';
}

/** Park detail sidebar / mobile plan CTA */
export function getParkPlanVisitCta({
  user,
  isAuthenticated,
  parkName,
  isVisited = false,
  isSaved = false,
}) {
  const name = displayName(user);
  const park = shortParkName(parkName);

  if (isAuthenticated) {
    if (isVisited) {
      return {
        title: name ? `${name}, plan your return to ${park}?` : `Plan your return to ${park}?`,
        body: `You’ve been before — Trailie can help you see ${park} differently this time, with new trails, seasons, or a longer stay.`,
        button: `Plan my ${park} trip`,
      };
    }

    if (isSaved) {
      return {
        title: name ? `${name}, ready for ${park}?` : `Ready for ${park}?`,
        body: `It’s on your saved list — tell Trailie your dates and travel style, and get a day-by-day plan for ${parkName}.`,
        button: `Plan my ${park} trip`,
      };
    }

    if (name) {
      return {
        title: `${name}, let's plan ${park}`,
        body: `Tell Trailie when you're going, who's coming, and what you love — hiking, wildlife, easy walks — and get an itinerary built for ${parkName}.`,
        button: `Plan my ${park} trip`,
      };
    }

    return {
      title: `Plan your visit to ${park}`,
      body: `Tell Trailie when you're going and what you love, and get a day-by-day itinerary for ${parkName}.`,
      button: 'Plan with Trailie',
    };
  }

  return {
    title: `Build your ${park} itinerary`,
    body: `Tell Trailie your dates, pace, and interests — get a day-by-day ${parkName} plan with hikes, drives, and must-see stops.`,
    button: `Plan ${park} with Trailie`,
  };
}

/** Compare page — per-park quick action button label */
export function getCompareParkPlanButton({
  isAuthenticated,
  parkName,
  isVisited = false,
  isSaved = false,
}) {
  const short = shortParkName(parkName);

  if (!isAuthenticated) {
    return `Plan ${short} trip`;
  }
  if (isVisited) {
    return `Revisit ${short}`;
  }
  if (isSaved) {
    return `Plan ${short}`;
  }
  return `Plan my ${short} trip`;
}

/** Compare page — bottom road-trip / multi-park CTA */
export function getCompareRoadTripCta({
  user,
  isAuthenticated,
  parks = [],
  visitedCodes = [],
  savedCodes = [],
}) {
  const name = displayName(user);
  const count = parks.length;
  if (count === 0) return null;

  const shorts = parks.map((park) => shortParkName(park.fullName));
  const codes = parks.map((park) => park.parkCode);
  const visitedAmong = codes.filter((code) => visitedCodes.includes(code));

  if (count === 1) {
    const single = getParkPlanVisitCta({
      user,
      isAuthenticated,
      parkName: parks[0].fullName,
      isVisited: visitedAmong.length > 0,
      isSaved: savedCodes.includes(codes[0]),
    });
    return {
      title: single.title,
      subtitle: single.body,
      button: single.button,
    };
  }

  if (count === 2) {
    const [shortA, shortB] = shorts;

    if (isAuthenticated) {
      if (visitedAmong.length === 1) {
        const visitedIdx = codes.findIndex((code) => visitedCodes.includes(code));
        const visitedShort = shorts[visitedIdx];
        const newShort = shorts[1 - visitedIdx];

        return {
          title: name ? `${name}, add ${newShort} to ${visitedShort}?` : `Add ${newShort} to your ${visitedShort} trip?`,
          subtitle: `You've visited ${visitedShort}. Trailie can link both parks in one road trip — your dates, pace, and where to stay.`,
          button: 'Plan both with Trailie',
          buttonCompact: 'Plan both',
        };
      }

      if (visitedAmong.length === 2) {
        return {
          title: name ? `${name}, revisit both?` : 'Revisit both parks?',
          subtitle: `Trailie can plan a fresh loop through ${shortA} and ${shortB} — new season, trails, or a longer stay.`,
          button: `Plan ${shortA} & ${shortB}`,
          buttonCompact: 'Plan both',
        };
      }

      return {
        title: name ? `${name}, ${shortA} or ${shortB}?` : `${shortA} or ${shortB}?`,
        subtitle: 'Trailie routes both in one trip — drive days, hikes, and where to stay. Share your dates and travel style.',
        button: 'Plan both with Trailie',
        buttonCompact: 'Plan both',
      };
    }

    return {
      title: `${shortA} or ${shortB}?`,
      subtitle: `You don't have to pick one. Tell me your dates and starting city — I'll link both parks into one road trip with drive days and where to stay.`,
      button: `Plan ${shortA} & ${shortB}`,
      buttonCompact: 'Plan both',
    };
  }

  if (count === 3) {
    if (isAuthenticated) {
      return {
        title: name ? `${name}, plan all three?` : 'Plan all three in one trip?',
        subtitle:
          'Share your dates, starting city, and camping vs lodges — Trailie maps the full driving loop with daily stops.',
        button: 'Plan a 3-park road trip',
        buttonCompact: 'Plan 3-park trip',
      };
    }

    return {
      title: 'Plan all three together',
      subtitle:
        "Share how many days you have and where you're starting from — I'll map one driving loop with the best order, daily stops, and places to stay.",
      button: 'Plan a 3-park road trip',
      buttonCompact: 'Plan 3-park trip',
    };
  }

  if (isAuthenticated) {
    return {
      title: name ? `${name}, one loop for all four?` : 'One loop for all four?',
      subtitle: 'Trailie can sequence all four parks into one road trip — your dates, starting point, and daily pace.',
      button: 'Plan a 4-park road trip',
      buttonCompact: 'Plan 4-park trip',
    };
  }

  return {
    title: 'Plan all four together',
    subtitle:
      "Share your dates and starting point — I'll build one day-by-day loop with drives, stops, and where to stay.",
    button: 'Plan a 4-park road trip',
    buttonCompact: 'Plan 4-park trip',
  };
}
