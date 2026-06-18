/** Direct photo URLs we can render in chat; skip NPS gallery asset pages that 404 in <img>. */
export function isUsableParkChatImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (/npgallery\/getasset\//i.test(lower)) return false;
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(lower);
}

export function filterParkChatImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((img) => img?.url && isUsableParkChatImageUrl(img.url));
}
