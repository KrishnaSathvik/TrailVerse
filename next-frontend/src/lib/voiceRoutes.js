/** Routes where the voice chrome is hidden and any live session is ended. */
export const VOICE_HIDDEN_PATHS = [
  '/plan-ai',
  '/dev',
  '/trailie-demo',
  '/blog',
  '/map',
  '/magazine',
  '/privacy',
  '/terms',
  '/testimonials',
  '/faq',
];

export function isVoiceHiddenPath(pathname) {
  if (!pathname) return false;
  return VOICE_HIDDEN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
