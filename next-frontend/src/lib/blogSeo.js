/** @param {string | null | undefined} value */
export function blogMetaDescription(value) {
  const text = (value || '').trim();
  if (!text) {
    return 'Read the latest national park stories and planning guides on TrailVerse.';
  }
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** @param {{ seoNoindex?: boolean }} post */
export function blogRobots(post) {
  if (post?.seoNoindex) {
    return { index: false, follow: false };
  }
  return {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  };
}
