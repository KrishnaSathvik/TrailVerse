// Analytics is best effort. A full/unavailable database must not cause a write
// and a rejected-document log dump on every subsequent request.
let retryAfter = 0;
let failures = 0;

async function persistAnalytics(write) {
  if (Date.now() < retryAfter) return false;
  try {
    await write();
    failures = 0;
    return true;
  } catch (error) {
    failures = Math.min(failures + 1, 6);
    retryAfter = Date.now() + Math.min(300000, 10000 * 2 ** (failures - 1));
    // Never log batch documents, visitor identifiers, or raw driver errors.
    console.warn('[analytics] write failed; persistence paused', {
      code: typeof error?.code === 'number' ? error.code : 'unavailable',
      retryAfter: new Date(retryAfter).toISOString(),
    });
    return false;
  }
}

module.exports = { persistAnalytics };
