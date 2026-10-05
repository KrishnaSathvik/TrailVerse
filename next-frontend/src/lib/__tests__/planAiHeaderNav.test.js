import { describe, expect, it } from 'vitest';
import { resolveHeaderMobileNav } from '../planAiHeaderNav';

const EXPLORE = { path: '/explore', label: 'Explore' };
const MAP = { path: '/map', label: 'Map' };
const BLOG = { path: '/blog', label: 'Blog' };
const TRAILIE = { path: '/plan-ai', label: 'Trailie' };
const HOME = { path: '/home', label: 'Home' };
const EVENTS = { path: '/events', label: 'Events' };
const COMPARE = { path: '/compare', label: 'Compare' };

const guestPrimary = [EXPLORE, MAP, TRAILIE, BLOG];
const authPrimary = [HOME, EXPLORE, MAP, TRAILIE];
const guestMore = [EVENTS, COMPARE];
const authMore = [BLOG, EVENTS, COMPARE, { path: '/profile', label: 'Profile' }];

describe('planAiHeaderNav', () => {
  it('keeps the same inline row on Trailie as on other product pages', () => {
    const trailie = resolveHeaderMobileNav({
      isLandingPage: false,
      primaryNavItems: guestPrimary,
      moreNavItems: guestMore,
    });
    const explore = resolveHeaderMobileNav({
      isLandingPage: false,
      primaryNavItems: guestPrimary,
      moreNavItems: guestMore,
    });

    expect(trailie.inlineNavItems).toEqual(guestPrimary);
    expect(trailie.mobileMoreNavItems).toEqual(guestMore);
    expect(trailie).toEqual(explore);
  });

  it('keeps Home in the Trailie row when the visitor is signed in', () => {
    const result = resolveHeaderMobileNav({
      isLandingPage: false,
      primaryNavItems: authPrimary,
      moreNavItems: authMore,
    });

    expect(result.inlineNavItems).toEqual(authPrimary);
    expect(result.mobileMoreNavItems).toEqual(authMore);
  });

  it('keeps the landing page on its own shorter set', () => {
    const landing = resolveHeaderMobileNav({
      isLandingPage: true,
      primaryNavItems: guestPrimary,
      moreNavItems: guestMore,
      landingInlineItems: [EXPLORE, BLOG],
      landingMoreItems: [MAP, TRAILIE],
    });

    expect(landing.inlineNavItems).toEqual([EXPLORE, BLOG]);
    expect(landing.mobileMoreNavItems).toEqual([MAP, TRAILIE]);
  });
});
