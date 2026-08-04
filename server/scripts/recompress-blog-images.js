#!/usr/bin/env node
/**
 * Recompress blog images and rewrite BlogPost paths.
 *
 * Cuts Render egress from multi‑MB PNG/JPEG heroes (target ~≤400KB WebP/JPEG).
 *
 * Usage:
 *   node scripts/recompress-blog-images.js                         # dry-run
 *   node scripts/recompress-blog-images.js --fetch-missing         # dry-run + download
 *   node scripts/recompress-blog-images.js --apply --via-upload --fetch-missing
 *       Compress locally, upload small files to TrailVerse via admin API,
 *       then rewrite MongoDB featuredImage/content to the new URLs.
 *   node scripts/recompress-blog-images.js --apply
 *       In-place on local UPLOADS_DIR + MongoDB (use on Render SSH for prod disk).
 *   node scripts/recompress-blog-images.js --slug=my-post
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');
const https = require('https');
const FormData = require('form-data');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');
const ImageUpload = require('../src/models/ImageUpload');
const User = require('../src/models/User');
const generateToken = require('../src/utils/generateToken');
const { getUploadsDir } = require('../src/utils/uploads');
const { compressImageFile, TARGET_BYTES } = require('../src/utils/imageCompression');

const APPLY = process.argv.includes('--apply');
const FETCH_MISSING = process.argv.includes('--fetch-missing');
const VIA_UPLOAD = process.argv.includes('--via-upload');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const SLUG_FILTER = slugArg ? slugArg.split('=')[1] : null;

const SITE_ORIGIN = 'https://www.nationalparksexplorerusa.com';
const RENDER_ORIGIN = (
  process.env.RECOMPRESS_UPLOAD_ORIGIN ||
  process.env.CLIENT_API_ORIGIN ||
  'https://trailverse.onrender.com'
).replace(/\/$/, '');
const UPLOADS_DIR = getUploadsDir();

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;

function isRasterUploadPath(rel) {
  if (!rel || rel.includes('_thumb.')) return false;
  if (rel.includes('<') || rel.includes('>') || rel.includes('&lt;')) return false;
  return IMAGE_EXT_RE.test(rel);
}

function toUploadsRelative(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith('data:')) return null;
  const idx = trimmed.indexOf('/uploads/');
  if (idx === -1) return null;
  const rel = trimmed.substring(idx + '/uploads/'.length).split('?')[0];
  return isRasterUploadPath(rel) ? rel : null;
}

function collectUploadRefs(post) {
  const refs = new Set();
  const featured = toUploadsRelative(post.featuredImage);
  if (featured) refs.add(featured);

  const content = post.content || '';
  const found = content.match(/\/uploads\/[^"'?\s]+/gi) || [];
  for (const raw of found) {
    const rel = raw.replace(/^\/uploads\//i, '').split('?')[0];
    if (isRasterUploadPath(rel)) refs.add(rel);
  }
  return [...refs];
}

function rewritePath(oldRel, newRel, text) {
  if (!text || oldRel === newRel) return text;
  const variants = [
    `/uploads/${oldRel}`,
    `${SITE_ORIGIN}/uploads/${oldRel}`,
    `${RENDER_ORIGIN}/uploads/${oldRel}`,
    `${RENDER_ORIGIN}/api/images/file/${oldRel}`,
    `/api/images/file/${oldRel}`,
  ];
  let out = text;
  for (const v of variants) {
    out = out.split(v).join(`/uploads/${newRel}`);
  }
  return out;
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchBuffer(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function postForm(url, form, token) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
    };
    const req = lib.request(url, { method: 'POST', headers, timeout: 180000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          /* ignore */
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
          return;
        }
        reject(new Error(`Upload HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upload timeout'));
    });
    form.pipe(req);
  });
}

async function ensureLocalFile(relPath) {
  const abs = path.join(UPLOADS_DIR, relPath);
  try {
    await fs.access(abs);
    return abs;
  } catch {
    if (!FETCH_MISSING) return null;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const url = `${RENDER_ORIGIN}/uploads/${relPath}`;
    console.log(`   download ${url}`);
    const buf = await fetchBuffer(url);
    await fs.writeFile(abs, buf);
    return abs;
  }
}

async function compressToTemp(absPath) {
  const tmpDir = path.join(UPLOADS_DIR, '.recompress-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpIn = path.join(tmpDir, `${Date.now()}-${path.basename(absPath)}`);
  await fs.copyFile(absPath, tmpIn);
  const result = await compressImageFile(tmpIn, { replaceOriginal: true });
  return { result, tmpDir };
}

async function updateImageUploadRecord(oldRel, newRel, compressed) {
  const oldUrl = `/uploads/${oldRel}`;
  const newUrl = `/uploads/${newRel}`;
  const doc = await ImageUpload.findOne({
    $or: [{ url: oldUrl }, { filename: path.basename(oldRel) }],
  });
  if (!doc) return false;
  if (!APPLY) return true;
  doc.url = newUrl;
  doc.filename = path.basename(newRel);
  doc.mimeType = compressed.mimeType;
  doc.size = compressed.size;
  if (doc.metadata) {
    doc.metadata.width = compressed.metadata.width;
    doc.metadata.height = compressed.metadata.height;
    doc.metadata.format = compressed.metadata.format;
  }
  await doc.save();
  return true;
}

async function processRefInPlace(relPath, stats) {
  let abs;
  try {
    abs = await ensureLocalFile(relPath);
  } catch (err) {
    console.log(`   fetch/access failed: ${relPath} (${err.message})`);
    stats.missing += 1;
    return null;
  }
  if (!abs) {
    console.log(`   missing locally (use --fetch-missing): ${relPath}`);
    stats.missing += 1;
    return null;
  }

  const before = (await fs.stat(abs)).size;

  if (!APPLY) {
    const { result, tmpDir } = await compressToTemp(abs);
    console.log(
      `   ${relPath}: ${(before / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB` +
        (result.skipped ? ` (skip: ${result.reason})` : ` → ${result.filename}`)
    );
    stats.beforeBytes += before;
    stats.afterBytes += result.size;
    if (!result.skipped) stats.compressed += 1;
    else stats.skipped += 1;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return {
      oldRel: relPath,
      newRel: path.posix.join(path.posix.dirname(relPath), result.filename),
      skipped: result.skipped,
    };
  }

  const result = await compressImageFile(abs, { replaceOriginal: true });
  const newRel = path.posix.join(path.posix.dirname(relPath.replace(/\\/g, '/')), result.filename);
  console.log(
    `   ok ${relPath}: ${(before / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB` +
      (result.skipped ? ` (skip: ${result.reason})` : '')
  );
  stats.beforeBytes += before;
  stats.afterBytes += result.size;
  if (!result.skipped) stats.compressed += 1;
  else stats.skipped += 1;
  await updateImageUploadRecord(relPath, newRel, result);
  return { oldRel: relPath, newRel, skipped: result.skipped, result };
}

async function processRefViaUpload(relPath, stats, token) {
  let abs;
  try {
    abs = await ensureLocalFile(relPath);
  } catch (err) {
    console.log(`   fetch/access failed: ${relPath} (${err.message})`);
    stats.missing += 1;
    return null;
  }
  if (!abs) {
    console.log(`   missing locally (use --fetch-missing): ${relPath}`);
    stats.missing += 1;
    return null;
  }

  const before = (await fs.stat(abs)).size;
  const { result, tmpDir } = await compressToTemp(abs);

  stats.beforeBytes += before;
  stats.afterBytes += result.size;

  if (result.skipped && result.reason === 'already-optimized' && before <= TARGET_BYTES) {
    console.log(`   skip ${relPath}: already ≤${Math.round(TARGET_BYTES / 1024)}KB`);
    stats.skipped += 1;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { oldRel: relPath, newRel: relPath, skipped: true };
  }

  if (!APPLY) {
    console.log(
      `   ${relPath}: ${(before / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB (would upload ${result.filename})`
    );
    stats.compressed += 1;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return {
      oldRel: relPath,
      newRel: path.posix.join('blog', result.filename),
      skipped: false,
    };
  }

  const form = new FormData();
  form.append('category', 'blog');
  form.append('isPublic', 'true');
  form.append('images', fsSync.createReadStream(result.path), {
    filename: result.filename,
    contentType: result.mimeType,
  });

  const uploaded = await postForm(`${RENDER_ORIGIN}/api/images/upload`, form, token);
  const newUrl = uploaded?.data?.[0]?.url;
  if (!newUrl) {
    throw new Error(`Upload missing url for ${relPath}: ${JSON.stringify(uploaded).slice(0, 200)}`);
  }
  const newRel = toUploadsRelative(newUrl) || newUrl.replace(/^\/uploads\//, '');
  console.log(
    `   uploaded ${relPath}: ${(before / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB as ${newRel}`
  );
  stats.compressed += 1;
  stats.uploaded += 1;

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return { oldRel: relPath, newRel, skipped: false };
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* ignore */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
            return;
          }
          reject(new Error(`POST ${url} HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout POST ${url}`));
    });
    req.write(data);
    req.end();
  });
}

async function obtainUploadToken() {
  const email =
    process.env.RECOMPRESS_ADMIN_EMAIL ||
    process.env.REACT_APP_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL;
  const password =
    process.env.RECOMPRESS_ADMIN_PASSWORD ||
    process.env.REACT_APP_ADMIN_PASSWORD;

  if (email && password) {
    console.log(`Logging in to ${RENDER_ORIGIN} as ${email}`);
    const res = await postJson(`${RENDER_ORIGIN}/api/auth/login`, { email, password });
    const token = res?.token || res?.data?.token;
    if (!token) {
      throw new Error('Login succeeded but no token in response');
    }
    return token;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('Need REACT_APP_ADMIN_PASSWORD (or RECOMPRESS_ADMIN_*) or JWT_SECRET');
  }
  const admin = await User.findOne({ role: 'admin' }).select('_id email');
  if (!admin) {
    throw new Error('No admin user found for token minting');
  }
  console.log(`Minting local JWT for ${admin.email || admin._id} (may fail if JWT_SECRET ≠ prod)`);
  return generateToken(admin._id);
}

async function main() {
  console.log(
    `\nrecompress-blog-images  apply=${APPLY} fetchMissing=${FETCH_MISSING} viaUpload=${VIA_UPLOAD}`
  );
  console.log(`   uploads: ${UPLOADS_DIR}`);
  console.log(`   origin:  ${RENDER_ORIGIN}`);
  console.log(`   target:  ≤${Math.round(TARGET_BYTES / 1024)}KB\n`);

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let token = null;
  if (VIA_UPLOAD && APPLY) {
    token = await obtainUploadToken();
    console.log('Upload auth ok\n');
  }

  const query = { status: { $in: ['published', 'draft'] } };
  if (SLUG_FILTER) query.slug = SLUG_FILTER;

  const posts = await BlogPost.find(query)
    .select('title slug featuredImage content')
    .lean();

  console.log(`Found ${posts.length} post(s)\n`);

  const stats = {
    compressed: 0,
    skipped: 0,
    missing: 0,
    uploaded: 0,
    postsUpdated: 0,
    beforeBytes: 0,
    afterBytes: 0,
  };

  const fileMap = new Map();
  const allRefs = new Set();
  for (const post of posts) {
    for (const ref of collectUploadRefs(post)) allRefs.add(ref);
  }

  console.log(`Unique /uploads refs: ${allRefs.size}\n`);

  for (const rel of [...allRefs].sort()) {
    try {
      const outcome = VIA_UPLOAD
        ? await processRefViaUpload(rel, stats, token)
        : await processRefInPlace(rel, stats);
      if (outcome) fileMap.set(outcome.oldRel, outcome.newRel);
    } catch (err) {
      console.error(`   FAILED ${rel}: ${err.message}`);
      stats.missing += 1;
    }
  }

  for (const post of posts) {
    let featuredImage = post.featuredImage || '';
    let content = post.content || '';
    let changed = false;

    for (const [oldRel, newRel] of fileMap.entries()) {
      if (oldRel === newRel) continue;
      const nextFeatured = rewritePath(oldRel, newRel, featuredImage);
      const nextContent = rewritePath(oldRel, newRel, content);
      if (nextFeatured !== featuredImage || nextContent !== content) {
        featuredImage = nextFeatured;
        content = nextContent;
        changed = true;
      }
    }

    if (featuredImage.includes('trailverse.onrender.com/uploads/')) {
      const rel = toUploadsRelative(featuredImage);
      if (rel) {
        featuredImage = `/uploads/${fileMap.get(rel) || rel}`;
        changed = true;
      }
    }

    if (!changed) continue;

    console.log(`post ${post.slug}: path updates`);
    stats.postsUpdated += 1;
    if (APPLY) {
      await BlogPost.updateOne(
        { _id: post._id },
        { $set: { featuredImage, content } }
      );
    }
  }

  console.log('\n--- summary ---');
  console.log(
    `compressed: ${stats.compressed}  skipped: ${stats.skipped}  missing: ${stats.missing}  uploaded: ${stats.uploaded}`
  );
  console.log(`posts with path updates: ${stats.postsUpdated}`);
  if (stats.beforeBytes) {
    console.log(
      `bytes: ${(stats.beforeBytes / 1e6).toFixed(2)}MB → ${(stats.afterBytes / 1e6).toFixed(2)}MB` +
        ` (saved ${((stats.beforeBytes - stats.afterBytes) / 1e6).toFixed(2)}MB)`
    );
  }
  if (!APPLY) {
    console.log('\nDry-run only. For production:');
    console.log('  node scripts/recompress-blog-images.js --apply --via-upload --fetch-missing');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
