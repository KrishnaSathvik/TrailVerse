#!/usr/bin/env node
/**
 * Update astro guides: NIKKOR Z 14-30mm f/4 S → 14-24mm f/2.8 S,
 * Milky Way / star-trail apertures, strip invalid 30mm 500-rule lines.
 *
 *   node scripts/apply-astro-lens-updates.js --audit
 *   node scripts/apply-astro-lens-updates.js              # dry-run (needs updates)
 *   node scripts/apply-astro-lens-updates.js --apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const LENS_FROM = 'NIKKOR Z 14-30mm f/4 S';
const LENS_TO = 'NIKKOR Z 14-24mm f/2.8 S';
const LENS_FROM_ALT = 'Nikkor Z 14-30mm f/4 S';

/** Milky Way / sky rows: ISO ceiling + f/4 → f/2.8 */
const MILKY_WAY_ROW_REPLACEMENTS = [
  {
    label: 'Milky Way Wide Field (20–25s at 14mm)',
    from:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s (at 14mm)</p>',
    to:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s (at 14mm)</p>',
  },
  {
    label: 'Milky Way Wide Field (20–25s)',
    from:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way Wide Field (30s — Grand Teton)',
    from:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>30s</p>',
    to:
      '<p>Milky Way Wide Field</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way wide field (20–25s)',
    from:
      '<p>Milky Way wide field</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way wide field</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way wide field (20s)',
    from:
      '<p>Milky Way wide field</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20s</p>',
    to:
      '<p>Milky Way wide field</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20s</p>',
  },
  {
    label: 'Milky Way wide field bold (20–25s, @ 14mm)',
    from:
      '<p><strong>Milky Way wide field</strong></p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p></td><td colspan="1" rowspan="1"><p>3800–4000K</p></td><td colspan="1" rowspan="1"><p>NIKKOR Z 14-24mm f/2.8 S @ 14mm</p>',
    to:
      '<p><strong>Milky Way wide field</strong></p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p></td><td colspan="1" rowspan="1"><p>3800–4000K</p></td><td colspan="1" rowspan="1"><p>NIKKOR Z 14-24mm f/2.8 S @ 14mm</p>',
  },
  {
    label: 'Monsoon + Milky Way',
    from:
      '<p>Monsoon + Milky Way (July)</p></td><td colspan="1" rowspan="1"><p>3200–6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>15–20s</p>',
    to:
      '<p>Monsoon + Milky Way (July)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>15–20s</p>',
  },
  {
    label: 'Milky Way — Tuolumne',
    from:
      '<p>Milky Way — Tuolumne (Bortle 3)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way — Tuolumne (Bortle 3)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way — Valley',
    from:
      '<p>Milky Way — Valley (Bortle 4–5)</p></td><td colspan="1" rowspan="1"><p>6400</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way — Valley (Bortle 4–5)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way — Lamar',
    from:
      '<p>Milky Way — Lamar (Bortle 1)</p></td><td colspan="1" rowspan="1"><p>1600–3200</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way — Lamar (Bortle 1)</p></td><td colspan="1" rowspan="1"><p>1600–3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Milky Way — Hayden',
    from:
      '<p>Milky Way — Hayden (Bortle 2)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Milky Way — Hayden (Bortle 2)</p></td><td colspan="1" rowspan="1"><p>3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
  {
    label: 'Grand Prismatic Steam + Sky',
    from:
      '<p>Grand Prismatic Steam + Sky</p></td><td colspan="1" rowspan="1"><p>1600–3200</p></td><td colspan="1" rowspan="1"><p>f/4</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
    to:
      '<p>Grand Prismatic Steam + Sky</p></td><td colspan="1" rowspan="1"><p>1600–3200</p></td><td colspan="1" rowspan="1"><p>f/2.8</p></td><td colspan="1" rowspan="1"><p>20–25s</p>',
  },
];

const PROSE_REPLACEMENTS = [
  ['ISO 3200, f/4', 'ISO 3200, f/2.8'],
  ['f/4, 20–25 seconds at 14mm', 'f/2.8, 20–25 seconds at 14mm'],
  ['f/4, 20 seconds at 14mm', 'f/2.8, 20 seconds at 14mm'],
  ['ISO 3200, f/4, 20–25 seconds', 'ISO 3200, f/2.8, 20–25 seconds'],
  ['ISO 3200, f/4, 30 seconds', 'ISO 3200, f/2.8, 20–25 seconds'],
  ['ISO 3200, f/4, and 20–25 seconds', 'ISO 3200, f/2.8, and 20–25 seconds'],
  ['ISO 1600–3200, f/4, 20–25 seconds', 'ISO 1600–3200, f/2.8, 20–25 seconds'],
  [
    'Its full-frame sensor handles ISO 3200–6400 cleanly enough that you can get publishable results without any hardware modifications, and at Bortle 2–3 you don\'t need to push exposure nearly as hard as you would in a light-polluted location.',
    'Its full-frame sensor handles ISO 3200 cleanly at f/2.8, so you can get publishable results without hardware modifications, and at Bortle 2–3 you don\'t need to push exposure nearly as hard as you would in a light-polluted location.',
  ],
  [
    'ISO 3200 produces clean results here that would require 6400+ from a suburban sky.',
    'ISO 3200 at f/2.8 produces clean results here that would require much higher ISO from a suburban sky with a slower lens.',
  ],
  [
    'The Z6II\'s back-illuminated sensor handles ISO 3200–6400 cleanly enough that you\'ll think about composition more than noise.',
    'The Z6II\'s back-illuminated sensor handles ISO 3200 cleanly at f/2.8, so you\'ll think about composition more than noise.',
  ],
  [
    'In the Valley at Bortle 4–5, push to ISO 6400 for equivalent signal.',
    'In the Valley at Bortle 4–5, ISO 3200 at f/2.8 usually delivers enough signal.',
  ],
  [
    'For Valley shots, expose the sky at ISO 6400 / 25 seconds for the Milky Way, then expose the foreground separately at ISO 800 / 4–8 seconds during blue hour or with',
    'For Valley shots, expose the sky at ISO 3200 / 25 seconds for the Milky Way, then expose the foreground separately at ISO 800 / 4–8 seconds during blue hour or with',
  ],
  [
    'At Tuolumne (Bortle 3): ISO 3200, f/4, 20–25 seconds at 14mm with the NIKKOR Z 14-24mm f/2.8 S, white balance 3800–4000K. In the Valley (Bortle 4–5): push to ISO 6400.',
    'At Tuolumne (Bortle 3): ISO 3200, f/2.8, 20–25 seconds at 14mm with the NIKKOR Z 14-24mm f/2.8 S, white balance 3800–4000K. In the Valley (Bortle 4–5): use ISO 3200 at f/2.8.',
  ],
  [
    'In the Valley (Bortle 4–5): push to ISO 6400.',
    'In the Valley (Bortle 4–5): use ISO 3200 at f/2.8.',
  ],
  [
    'At Lamar Valley (Bortle 1): ISO 1600–3200, f/4, 20–25 seconds, 3800–4000K with the NIKKOR Z 14-24mm f/2.8 S at 14mm.',
    'At Lamar Valley (Bortle 1): ISO 1600–3200, f/2.8, 20–25 seconds, 3800–4000K with the NIKKOR Z 14-24mm f/2.8 S at 14mm.',
  ],
  [
    'the NIKKOR Z 14-30mm f/4 S is sharp to the corners even wide open',
    'the NIKKOR Z 14-24mm f/2.8 S is sharp to the corners even wide open',
  ],
  [
    'Start at ISO 3200, f/4, 20 seconds, with white balance at 3800K. That\'s a safe baseline for the Nikkor Z 14-30mm f/4 S at 14mm. Review your first frame at 100% crop and adjust ISO up (toward 6400',
    'Start at ISO 3200, f/2.8, 20 seconds, with white balance at 3800K. That\'s a safe baseline for the NIKKOR Z 14-24mm f/2.8 S at 14mm. Review your first frame at 100% crop and adjust ISO up only if the histogram needs it',
  ],
  [
    'At 24mm, stay at or under 15 seconds. At 30mm, 12–13 seconds.',
    'At 24mm, stay at or under 15 seconds.',
  ],
];

/** Strip 30mm lines the 14-24 cannot reach (500-rule quick refs). */
const FOCAL_STRIP_REPLACEMENTS = [
  ['<li><p>30mm → ~16s max</p></li>', ''],
  ['<li><p>500 ÷ 30mm = ~16 seconds</p></li>', ''],
  ['<li><p>500 ÷ 30mm = 16 seconds</p></li>', ''],
  ['<p>500 ÷ 30mm = 14 seconds</p>', ''],
];

function replaceAll(content, from, to, label, changes) {
  if (!from || !content.includes(from)) return content;
  const count = content.split(from).length - 1;
  changes.push(`${label} (×${count})`);
  return content.split(from).join(to);
}

function updateStarTrailRows(content, changes) {
  return content.replace(/<tr>[\s\S]*?<\/tr>/gi, (row) => {
    if (!/Star [Tt]rails?/i.test(row)) return row;
    if (/(foreground|blend)/i.test(row)) return row;
    if (!/<p>f\/4<\/p>/.test(row)) return row;
    changes.push('Star Trails row: f/4 → f/2.8');
    return row.replace('<p>f/4</p>', '<p>f/2.8</p>');
  });
}

function applyRules(content) {
  const changes = [];
  let out = content;

  out = replaceAll(out, LENS_FROM, LENS_TO, 'Rule 1: lens name', changes);
  out = replaceAll(out, LENS_FROM_ALT, LENS_TO, 'Rule 1: lens name (Nikkor)', changes);

  for (const { label, from, to } of MILKY_WAY_ROW_REPLACEMENTS) {
    out = replaceAll(out, from, to, `Rule 2: ${label}`, changes);
  }

  out = updateStarTrailRows(out, changes);
  out = fixMilkyWayRowsStillAtF4(out, changes);

  for (const [from, to] of FOCAL_STRIP_REPLACEMENTS) {
    out = replaceAll(out, from, to, `Strip invalid focal: ${from.slice(0, 30)}…`, changes);
  }

  for (const [from, to] of PROSE_REPLACEMENTS) {
    out = replaceAll(out, from, to, `Prose/FAQ: ${from.slice(0, 40)}…`, changes);
  }

  out = replaceAll(
    out,
    'At Tuolumne (Bortle 3): ISO 3200, f/4, 20–25 seconds at 14mm',
    'At Tuolumne (Bortle 3): ISO 3200, f/2.8, 20–25 seconds at 14mm',
    'Prose: Tuolumne FAQ f/4',
    changes
  );

  return { content: out, changes };
}

function fixMilkyWayRowsStillAtF4(content, changes) {
  return content.replace(/<tr>[\s\S]*?<\/tr>/gi, (row) => {
    if (!/Milky Way/i.test(row)) return row;
    if (/(foreground|blend|Monsoon \+ Milky Way — Tuolumne|Valley \(Bortle)/i.test(row)) return row;
    if (!/<p>f\/4<\/p>/.test(row)) return row;
    if (!/14-24mm/.test(row)) return row;
    changes.push('Milky Way row on 14-24: f/4 → f/2.8, ISO cap');
    let out = row.replace('<p>f/4</p>', '<p>f/2.8</p>');
    out = out.replace('<p>3200–6400</p>', '<p>3200</p>');
    out = out.replace('<p>6400</p>', '<p>3200</p>');
    return out;
  });
}

function auditContent(content) {
  const c = content || '';
  const oldLens = (c.match(/14-30mm/g) || []).length;
  const stripped = c.replace(/14-30mm/g, '');
  const thirty = (stripped.match(/30mm/g) || []).length;
  const twentyEight = (stripped.match(/(?<![0-9-])28mm/g) || []).length;
  const contradict = /14-30[^<]{0,60}f\/2\.8|f\/2\.8[^<]{0,60}14-30/i.test(c);
  const rows = c.match(/<tr>[\s\S]*?<\/tr>/gi) || [];
  const mwF4 = rows.some(
    (row) =>
      /Milky Way/i.test(row) &&
      /<p>f\/4<\/p>/.test(row) &&
      /14-24mm/.test(row) &&
      !/(foreground|blend)/i.test(row)
  );
  return { oldLens, thirty, twentyEight, contradict, mwF4 };
}

async function loadAstroPosts() {
  return BlogPost.find({ category: 'astrophotography', status: 'published' })
    .select('slug title content')
    .sort({ slug: 1 });
}

async function runAudit() {
  const posts = await loadAstroPosts();
  console.log('ASTRO COLLECTION AUDIT');
  console.log('─'.repeat(72));
  console.log(
    'slug'.padEnd(44),
    '14-30',
    '30mm*',
    '28mm',
    'contradict',
    'MW f/4'
  );
  for (const post of posts) {
    const a = auditContent(post.content);
    const flag =
      a.oldLens || a.thirty || a.twentyEight || a.contradict || a.mwF4 ? '⚠' : '✓';
    console.log(
      flag,
      post.slug.slice(0, 42).padEnd(42),
      String(a.oldLens).padStart(5),
      String(a.thirty).padStart(5),
      String(a.twentyEight).padStart(5),
      String(a.contradict ? 1 : 0).padStart(5),
      String(a.mwF4 ? 1 : 0).padStart(5)
    );
  }
  console.log('\n*30mm excludes 14-30mm substring hits');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const auditOnly = process.argv.includes('--audit');

  await mongoose.connect(process.env.MONGODB_URI);

  if (auditOnly) {
    await runAudit();
    await mongoose.disconnect();
    return;
  }

  const posts = await loadAstroPosts();
  const targets = posts.filter((p) => {
    const a = auditContent(p.content);
    return a.oldLens > 0 || a.mwF4;
  });

  console.log(apply ? 'APPLYING' : 'DRY RUN');
  console.log(`Targets needing updates: ${targets.length}`);
  console.log('─'.repeat(60));

  if (!targets.length) {
    console.log('No guides need lens swap.');
    await runAudit();
    await mongoose.disconnect();
    return;
  }

  for (const post of targets) {
    const before = post.content || '';
    const { content, changes } = applyRules(before);

    if (content === before) {
      console.log(`\n${post.slug}\n  (no changes — unexpected)`);
      continue;
    }

    console.log(`\n${post.slug}`);
    changes.forEach((c) => console.log(`  • ${c}`));

    const after = auditContent(content);
    if (after.oldLens) console.log(`  ⚠ still has 14-30mm ×${after.oldLens}`);
    if (after.thirty) console.log(`  ⚠ still has 30mm ×${after.thirty}`);
    if (after.mwF4) console.log('  ⚠ Milky Way row still f/4');

    if (apply) {
      post.content = content;
      await post.save();
      console.log('  ✅ saved');
    }
  }

  if (apply) {
    console.log('\nPost-apply audit:');
    await runAudit();
  } else {
    console.log('\nRe-run with --apply to write.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
