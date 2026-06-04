const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const npsService = require('../npsService');

const HAS_NPS_KEY = !!process.env.NPS_API_KEY;

/** Mirror collectParkImagesForChat in ai.js */
async function collectParkImagesForChat(parkCode, need) {
  const [gallery, parkRecord] = await Promise.all([
    npsService.getParkGalleryPhotos(parkCode),
    npsService.getParkImages(parkCode),
  ]);
  const seen = new Set();
  const pool = [];
  for (const list of [gallery, parkRecord]) {
    for (const img of list || []) {
      if (img?.url && !seen.has(img.url)) {
        seen.add(img.url);
        pool.push(img);
      }
    }
  }
  return pool.slice(0, need);
}

(HAS_NPS_KEY ? describe : describe.skip)('park chat images (Photos tab parity)', () => {
  test('Grand Canyon park record has <4 but gallery fills 4 for chat', async () => {
    const record = await npsService.getParkImages('grca');
    const gallery = await npsService.getParkGalleryPhotos('grca');
    expect(record.length).toBeLessThan(4);
    expect(gallery.length).toBeGreaterThanOrEqual(4);

    const chat = await collectParkImagesForChat('grca', 4);
    expect(chat.length).toBe(4);
  }, 15000);
});
