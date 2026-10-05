// Existing upload policy, shared with regression tests. No cache-policy change.
module.exports = {
  maxAge: '365d',
  immutable: true,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  },
};
