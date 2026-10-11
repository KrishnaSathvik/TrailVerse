/** Shared mobile destinations for landing, Trailie, and public browsing pages. */
export function resolveHeaderMobileNav({ primaryNavItems, moreNavItems }) {
  return {
    inlineNavItems: primaryNavItems,
    mobileMoreNavItems: moreNavItems,
  };
}
