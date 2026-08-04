const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { compressImageFile, TARGET_BYTES } = require('../imageCompression');

describe('compressImageFile', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tv-compress-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('compresses a large jpeg under the target size', async () => {
    const input = path.join(tmpDir, 'hero.jpg');
    const width = 2200;
    const height = 1600;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        raw[i] = (x * y) % 256;
        raw[i + 1] = (x + y * 3) % 256;
        raw[i + 2] = (x * 7 + y * 13) % 256;
      }
    }
    await sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .toFile(input);

    const before = (await fs.stat(input)).size;
    expect(before).toBeGreaterThan(500_000);

    const result = await compressImageFile(input, { replaceOriginal: true });
    expect(result.size).toBeLessThan(before);
    expect(result.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(result.mimeType).toMatch(/image\/(webp|jpeg)/);
    await expect(fs.access(result.path)).resolves.toBeUndefined();
  });

  it('skips svg files', async () => {
    const input = path.join(tmpDir, 'icon.svg');
    await fs.writeFile(input, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = await compressImageFile(input, { mimeType: 'image/svg+xml' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('svg');
  });
});
