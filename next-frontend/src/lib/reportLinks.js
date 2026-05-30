/**
 * Build static report URLs with ?from= so report pages can link back to the caller.
 */
export function reportHref(reportPath, { from, park } = {}) {
  const params = new URLSearchParams();
  if (park) params.set('park', String(park).toUpperCase());
  if (from) {
    const path = from.startsWith('/') ? from : `/${from}`;
    if (!path.startsWith('/reports/')) {
      params.set('from', path);
    }
  }
  const qs = params.toString();
  return qs ? `${reportPath}?${qs}` : reportPath;
}
