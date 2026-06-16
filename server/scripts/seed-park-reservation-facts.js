#!/usr/bin/env node
/**
 * Seed parkReservationFacts.json from Recreation.gov public search + editorial overrides.
 *
 * Usage:
 *   node server/scripts/seed-park-reservation-facts.js
 *   node server/scripts/seed-park-reservation-facts.js --limit 20
 *   node server/scripts/seed-park-reservation-facts.js --codes cave,yose,arch
 *
 * Writes:
 *   server/src/data/parkReservationFacts.json
 *   next-frontend/src/data/parkReservationFacts.json
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '../..');
const SLUGS_PATH = path.join(ROOT, 'next-frontend/src/data/park-slugs.json');
const CROWD_PATH = path.join(ROOT, 'server/src/data/parkCrowdFacts.json');
const OUT_SERVER = path.join(ROOT, 'server/src/data/parkReservationFacts.json');
const OUT_FRONTEND = path.join(ROOT, 'next-frontend/src/data/parkReservationFacts.json');

const REC_GOV_ENTITY_TYPES = ['permit', 'ticketfacility', 'tour'];
const DELAY_MS = 120;

/** Editorial overrides — authoritative for FAQ when live RIDB rows are stale. */
const AUTHORITATIVE_OVERRIDES = {
  arch: {
    parkWideEntry: 'none',
    summary: 'No park-wide timed entry in 2026 (Devils Garden campground and Fiery Furnace permits still apply).',
    authoritative: true,
    preserveActivityTimedEntry: true,
    lastReviewed: '2026-06',
  },
  yose: {
    parkWideEntry: 'none',
    summary: 'No park-wide timed entry in 2026 — arrive early for parking.',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  glac: {
    parkWideEntry: 'partial',
    summary: 'No vehicle reservation in 2026; Logan Pass shuttle ticket Jul–Labor Day for some alpine hikes.',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  mora: {
    parkWideEntry: 'none',
    summary: 'No timed entry in 2026 — parking management only.',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  zion: {
    parkWideEntry: 'partial',
    summary: 'Canyon shuttle Mar–Nov (no ticket); Angels Landing permit required year-round.',
    authoritative: true,
    preserveActivityTimedEntry: true,
    lastReviewed: '2026-06',
  },
  grte: {
    parkWideEntry: 'none',
    summary: 'No timed entry in 2026 — popular lots fill by mid-morning in summer.',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  shen: {
    parkWideEntry: 'partial',
    summary: 'Old Rag day-use ticket Mar–Nov (Old Rag trails only; not whole park).',
    authoritative: true,
    preserveActivityTimedEntry: true,
    lastReviewed: '2026-06',
  },
  acad: {
    parkWideEntry: 'partial',
    summary: 'Cadillac Summit vehicle reservation May 20–Oct 25.',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  romo: {
    parkWideEntry: 'required',
    summary: 'Timed entry May 22–mid-Oct (certain hours; Bear Lake corridor rules differ).',
    authoritative: true,
    lastReviewed: '2026-06',
  },
  cave: {
    parkWideEntry: 'none',
    summary: 'No park-wide entry reservation, but cave tour timed entry is required year-round (separate from the entrance pass).',
    authoritative: true,
    preserveActivityTimedEntry: true,
    lastReviewed: '2026-06',
  },
  hale: {
    parkWideEntry: 'partial',
    summary: 'Summit sunrise reservations required year-round.',
    authoritative: true,
    preserveActivityTimedEntry: true,
    lastReviewed: '2026-06',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripSuffix(name) {
  return (name || '')
    .replace(/\s+(National Park & Preserve|National Park and Preserve|National Park|National Monument|National Memorial|National Historic Site|National Historical Park|National Seashore|National Lakeshore|National Recreation Area|National Preserve)$/i, '')
    .trim();
}

function entityTypeToLabel(entityType, name) {
  const t = (entityType || '').toLowerCase().replace(/_/g, ' ');
  const n = (name || '').toLowerCase();
  if (t.includes('timed') && t.includes('entry')) return 'Timed Entry';
  if (t === 'tour' && n.includes('timed entry')) return 'Timed Entry';
  if (t.includes('ticket')) return 'Ticket Facility';
  if (t === 'tour') return 'Tour Ticket';
  return 'Permit';
}

function permitCategory(typeLabel, name) {
  const type = (typeLabel || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (type === 'timed entry') return 'timed_entry';
  if (type === 'tour ticket' && n.includes('timed entry')) return 'timed_entry';
  if (type === 'ticket facility') return 'ticket';
  return 'permit';
}

function buildReservationUrl(result, typeLabel) {
  const id = String(result.entity_id);
  const entityType = (result.entity_type || '').toLowerCase();
  const parentId = result.parent_id;
  const type = (typeLabel || '').toLowerCase();

  if (type === 'timed entry') {
    if (entityType === 'tour' && parentId) return `https://www.recreation.gov/ticket/facility/${parentId}`;
    return `https://www.recreation.gov/timed-entry/${id}`;
  }
  if (type === 'ticket facility' || entityType === 'ticketfacility') {
    return `https://www.recreation.gov/ticket/facility/${id}`;
  }
  if (type === 'tour ticket' || entityType === 'tour') {
    if (parentId && result.parent_type === 'facility') {
      return `https://www.recreation.gov/ticket/facility/${parentId}`;
    }
    return `https://www.recreation.gov/ticket/tour/${id}`;
  }
  return `https://www.recreation.gov/permits/${id}`;
}

function matchesPark(result, parkName, fullName) {
  const needles = [parkName, fullName, stripSuffix(fullName)]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const parentName = (result.parent_name || '').toLowerCase();
  const name = (result.name || '').toLowerCase();
  return needles.some((needle) => parentName.includes(needle) || name.includes(needle));
}

async function searchRecGovForPark(fullName) {
  const stripped = stripSuffix(fullName);
  const seen = new Set();
  const items = [];

  for (const entityType of REC_GOV_ENTITY_TYPES) {
    try {
      const response = await axios.get('https://www.recreation.gov/api/search', {
        params: { q: stripped, fq: `entity_type:${entityType}`, size: 25 },
        timeout: 12000,
      });
      for (const result of response.data?.results || []) {
        if (!matchesPark(result, stripped, fullName)) continue;
        const id = String(result.entity_id);
        if (seen.has(id)) continue;
        seen.add(id);
        const type = entityTypeToLabel(result.entity_type, result.name);
        items.push({
          name: result.name || 'Reservation',
          type,
          category: permitCategory(type, result.name),
          entityId: id,
          reservationUrl: buildReservationUrl(result, type),
        });
      }
    } catch (err) {
      console.warn(`rec.gov ${entityType} failed for ${fullName}:`, err.message);
    }
    await sleep(DELAY_MS);
  }

  return items;
}

function inferParkWideEntry(items, crowdPermitSystem) {
  const hasTimed = items.some((i) => i.category === 'timed_entry');
  if (hasTimed) return 'required';
  if (crowdPermitSystem && !/^none required/i.test(crowdPermitSystem)) return 'partial';
  if (crowdPermitSystem && /^none required/i.test(crowdPermitSystem)) return 'none';
  return items.length > 0 ? 'partial' : 'unknown';
}

function buildSummaryFromItems(items) {
  const timed = items.filter((i) => i.category === 'timed_entry');
  if (timed.length === 1) return `${timed[0].name} listed on Recreation.gov.`;
  if (timed.length > 1) return `${timed.length} timed-entry products listed on Recreation.gov.`;
  if (items.length === 1) return `${items[0].name} listed on Recreation.gov.`;
  if (items.length > 1) return `${items.length} reservation types listed on Recreation.gov.`;
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const codesIdx = args.indexOf('--codes');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
  const codeFilter = codesIdx >= 0
    ? new Set(args[codesIdx + 1].split(',').map((c) => c.trim().toLowerCase()))
    : null;

  const slugs = JSON.parse(fs.readFileSync(SLUGS_PATH, 'utf8'));
  const crowd = JSON.parse(fs.readFileSync(CROWD_PATH, 'utf8'));
  let parks = slugs.map((p) => ({
    code: (p.parkCode || '').toLowerCase(),
    fullName: p.fullName,
  }));

  if (codeFilter) parks = parks.filter((p) => codeFilter.has(p.code));
  if (limit) parks = parks.slice(0, limit);

  const output = {};
  let i = 0;
  for (const park of parks) {
    i += 1;
    const override = AUTHORITATIVE_OVERRIDES[park.code];
    const crowdRow = crowd[park.code];
    process.stdout.write(`[${i}/${parks.length}] ${park.code} ${park.fullName}… `);

    const liveItems = await searchRecGovForPark(park.fullName);
    const parkWideEntry = override?.parkWideEntry || inferParkWideEntry(liveItems, crowdRow?.permitSystem);

    if (override) {
      output[park.code] = {
        ...override,
        liveItems,
        seededAt: new Date().toISOString().slice(0, 10),
      };
      console.log(`override + ${liveItems.length} live`);
      continue;
    }

    const summary = crowdRow?.permitSystem && !/^none required/i.test(crowdRow.permitSystem)
      ? crowdRow.permitSystem
      : buildSummaryFromItems(liveItems);

    output[park.code] = {
      parkWideEntry,
      summary,
      authoritative: false,
      lastReviewed: new Date().toISOString().slice(0, 7),
      liveItems,
      seededAt: new Date().toISOString().slice(0, 10),
    };
    console.log(`${liveItems.length} live`);
  }

  const json = `${JSON.stringify(output, null, 2)}\n`;
  fs.writeFileSync(OUT_SERVER, json);
  fs.writeFileSync(OUT_FRONTEND, json);
  console.log(`\nWrote ${Object.keys(output).length} parks →\n  ${OUT_SERVER}\n  ${OUT_FRONTEND}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
