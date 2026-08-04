/**
 * Compress raster uploads for bandwidth (Render egress).
 * Resizes to max edge, writes WebP (JPEG fallback), aims for ~400KB.
 */
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const MAX_EDGE = 1600;
const TARGET_BYTES = 400 * 1024;
const WEBP_QUALITIES = [80, 72, 64, 55, 45];
const JPEG_QUALITIES = [82, 74, 66, 58, 48];

function isSvgPath(filePath, mimeType) {
  return (
    mimeType === 'image/svg+xml' ||
    path.extname(filePath).toLowerCase() === '.svg'
  );
}

/**
 * Compress a raster image on disk.
 * @param {string} inputPath
 * @param {object} [options]
 * @param {number} [options.maxEdge=1600]
 * @param {number} [options.targetBytes=400*1024]
 * @param {boolean} [options.replaceOriginal=true] Delete input when output path differs
 * @param {string} [options.mimeType]
 * @returns {Promise<object>}
 */
async function compressImageFile(inputPath, options = {}) {
  const maxEdge = options.maxEdge || MAX_EDGE;
  const targetBytes = options.targetBytes || TARGET_BYTES;
  const replaceOriginal = options.replaceOriginal !== false;
  const mimeHint = options.mimeType;

  const inputStat = await fs.stat(inputPath);

  if (isSvgPath(inputPath, mimeHint)) {
    return {
      path: inputPath,
      filename: path.basename(inputPath),
      mimeType: 'image/svg+xml',
      size: inputStat.size,
      metadata: { width: null, height: null, format: 'svg', colorSpace: 'srgb', exif: null },
      skipped: true,
      reason: 'svg',
      originalBytes: inputStat.size,
    };
  }

  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.gif') {
    const metadata = await sharp(inputPath, { animated: true }).metadata();
    return {
      path: inputPath,
      filename: path.basename(inputPath),
      mimeType: 'image/gif',
      size: inputStat.size,
      metadata,
      skipped: true,
      reason: 'gif',
      originalBytes: inputStat.size,
    };
  }

  // Already small enough and web-friendly — leave alone
  if (
    inputStat.size <= targetBytes &&
    (ext === '.webp' || ext === '.jpg' || ext === '.jpeg')
  ) {
    const metadata = await sharp(inputPath).metadata();
    const longEdge = Math.max(metadata.width || 0, metadata.height || 0);
    if (longEdge > 0 && longEdge <= maxEdge) {
      return {
        path: inputPath,
        filename: path.basename(inputPath),
        mimeType: ext === '.webp' ? 'image/webp' : 'image/jpeg',
        size: inputStat.size,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          colorSpace: metadata.space,
          exif: metadata.exif,
        },
        skipped: true,
        reason: 'already-optimized',
        originalBytes: inputStat.size,
      };
    }
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const inputMeta = await sharp(inputPath).metadata();

  const buildResize = () =>
    sharp(inputPath)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });

  const webpOut = path.join(dir, `${base}.webp`);
  let best = null;

  for (const quality of WEBP_QUALITIES) {
    const buf = await buildResize()
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    best = {
      buffer: buf.data,
      info: buf.info,
      path: webpOut,
      mimeType: 'image/webp',
      format: 'webp',
    };
    if (buf.data.length <= targetBytes) break;
  }

  // Prefer JPEG if it ends up meaningfully smaller
  const jpegOut = path.join(dir, `${base}.jpg`);
  for (const quality of JPEG_QUALITIES) {
    const buf = await buildResize()
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (!best || buf.data.length < best.buffer.length * 0.92) {
      best = {
        buffer: buf.data,
        info: buf.info,
        path: jpegOut,
        mimeType: 'image/jpeg',
        format: 'jpeg',
      };
    }
    if (buf.data.length <= targetBytes) break;
  }

  await fs.writeFile(best.path, best.buffer);

  if (replaceOriginal && path.resolve(inputPath) !== path.resolve(best.path)) {
    try {
      await fs.unlink(inputPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return {
    path: best.path,
    filename: path.basename(best.path),
    mimeType: best.mimeType,
    size: best.buffer.length,
    metadata: {
      width: best.info.width,
      height: best.info.height,
      format: best.format,
      colorSpace: inputMeta.space,
      exif: inputMeta.exif,
    },
    skipped: false,
    originalBytes: inputStat.size,
  };
}

module.exports = {
  compressImageFile,
  MAX_EDGE,
  TARGET_BYTES,
};
