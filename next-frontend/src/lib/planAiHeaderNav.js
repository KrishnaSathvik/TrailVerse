/**
 * Mobile header destinations.
 *
 * Trailie uses the same inline row as the other product pages. The landing
 * page keeps its own shorter set. Desktop (≥ lg) always renders the full
 * primary row from Header.
 */

/**
 * @param {object} args
 * @param {boolean} args.isLandingPage
 * @param {Array<{path: string, label: string}>} args.primaryNavItems
 * @param {Array<{path: string, label: string}>} args.moreNavItems
 * @param {Array<{path: string, label: string}>} args.landingInlineItems
 * @param {Array<{path: string, label: string}>} args.landingMoreItems
 */
export function resolveHeaderMobileNav({
  isLandingPage,
  primaryNavItems,
  moreNavItems,
  landingInlineItems,
  landingMoreItems,
}) {
  if (isLandingPage) {
    return {
      inlineNavItems: landingInlineItems,
      mobileMoreNavItems: landingMoreItems,
    };
  }

  return {
    inlineNavItems: primaryNavItems,
    mobileMoreNavItems: moreNavItems,
  };
}
