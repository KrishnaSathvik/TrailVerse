import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import parkSlugsData from '@/data/park-slugs.json';
import parkCrowdFacts from '@/data/parkCrowdFacts.json';
import { INTENT_LANDINGS } from '@/data/intentLandings';
import { getAllParkCodes } from '@/lib/parkApi';
import { hasCrowdCalendar } from '@/lib/crowdCalendar';
import { slugToParkCode } from '@/utils/parkSlug';
import { linkifyParkNames } from '@/utils/parkLinkifier';
import { withNewParkSpotlight } from '@/lib/landingSpotlight';

// Chiricahua National Monument became Chiricahua National Park on Oct 20, 2026
// (NPS code `chir`, the 64th national park). Same unit, same park code.

const NP_DESIGNATIONS = new Set(['National Park', 'National Park & Preserve', 'National Parks']);

/** Evaluate the real next.config.mjs in Node (it reads files via import.meta.url). */
function loadNextRedirects() {
  const configUrl = new URL(`file://${path.resolve(process.cwd(), 'next.config.mjs')}`).href;
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { default: c } = await import(${JSON.stringify(configUrl)}); console.log(JSON.stringify(await c.redirects()));`,
    ],
    { encoding: 'utf-8' }
  );
  return JSON.parse(out.trim().split('\n').pop());
}

/**
 * Official count from NPS unit records: designation-based records, plus the
 * two national parks whose NPS designation field doesn't say so (American
 * Samoa is blank, Redwood is "National and State Parks"), plus Kings Canyon,
 * which shares the `seki` record with Sequoia.
 */
function officialNationalParkCount(parks) {
  const designated = parks.filter((p) => NP_DESIGNATIONS.has(p.designation)).length;
  const undesignated = parks.filter((p) => ['npsa', 'redw'].includes(p.parkCode)).length;
  const sharedRecord = parks.some((p) => p.parkCode === 'seki') ? 1 : 0;
  return designated + undesignated + sharedRecord;
}

describe('Chiricahua redesignation', () => {
  it('keeps a single chir record, now designated National Park', () => {
    const chir = parkSlugsData.filter((p) => p.parkCode === 'chir');
    expect(chir).toEqual([
      { parkCode: 'chir', fullName: 'Chiricahua National Park', designation: 'National Park' },
    ]);
  });

  it('counts 64 national parks in the slug snapshot', () => {
    expect(officialNationalParkCount(parkSlugsData)).toBe(64);
  });

  it('includes chir in the national-park subset', () => {
    return getAllParkCodes().then((codes) => {
      expect(codes).toContain('chir');
      expect(codes.filter((c) => c === 'chir')).toHaveLength(1);
    });
  });

  it('resolves the new canonical slug to chir', () => {
    expect(slugToParkCode('chiricahua-national-park')).toBe('chir');
  });

  it('301s the former monument slug and short name to the new slug', () => {
    const redirects = loadNextRedirects();
    const find = (source) => redirects.find((r) => r.source === source);

    expect(find('/parks/chiricahua-national-monument')).toMatchObject({
      destination: '/parks/chiricahua-national-park',
      permanent: true,
    });
    expect(find('/parks/chiricahua')).toMatchObject({
      destination: '/parks/chiricahua-national-park',
      permanent: true,
    });
    expect(find('/parks/chir')).toMatchObject({
      destination: '/parks/chiricahua-national-park',
      permanent: true,
    });
  }, 120_000); // spawns node to evaluate next.config.mjs

  it('has crowd calendar data alongside the other national parks', () => {
    expect(hasCrowdCalendar({ parkCode: 'chir' })).toBe(true);
    expect(Object.keys(parkCrowdFacts)).toHaveLength(64);
    expect(parkCrowdFacts.chir).toMatchObject({ state: 'Arizona', permitSystem: 'None required' });
  });

  it('links both the new and former park names to the new park page', () => {
    expect(linkifyParkNames('Visit Chiricahua National Park in spring.')).toContain(
      '/parks/chiricahua-national-park'
    );
    expect(linkifyParkNames('Formerly Chiricahua National Monument.')).toContain(
      '/parks/chiricahua-national-park'
    );
  });

  it('does not link Chiricahua Apache or the Chiricahua Mountains', () => {
    const text = 'The Chiricahua Apache homeland includes the Chiricahua Mountains.';
    expect(linkifyParkNames(text)).toBe(text);
  });

  it('uses the new name on the quiet-parks landing', () => {
    const standouts = INTENT_LANDINGS.flatMap((landing) => landing.standouts || [])
      .filter((s) => s.parkCode === 'chir');
    expect(standouts.length).toBeGreaterThan(0);
    for (const s of standouts) expect(s.fullName).toBe('Chiricahua National Park');
  });
});

describe('landing new-park spotlight', () => {
  const defaults = ['yell', 'yose', 'grca', 'zion', 'glac', 'acad'].map((parkCode) => ({ parkCode }));
  const allParks = [{ parkCode: 'chir', fullName: 'Chiricahua National Park', states: 'AZ' }];

  it('leads "Start exploring" with Chiricahua and keeps six cards while active', () => {
    const cards = withNewParkSpotlight(defaults, allParks, new Date('2026-11-01T00:00:00Z'));
    expect(cards).toHaveLength(6);
    expect(cards[0]).toMatchObject({ parkCode: 'chir', fullName: 'Chiricahua National Park' });
    expect(cards[0].badge).toMatch(/64th/);
    expect(cards.map((c) => c.parkCode)).not.toContain('acad');
  });

  it('falls back to the default picks after the spotlight window', () => {
    expect(withNewParkSpotlight(defaults, allParks, new Date('2027-02-01T00:00:00Z'))).toEqual(defaults);
  });

  it('still renders the card when the parks API returned nothing', () => {
    const [first] = withNewParkSpotlight(defaults, [], new Date('2026-11-01T00:00:00Z'));
    expect(first).toMatchObject({ parkCode: 'chir', fullName: 'Chiricahua National Park', states: 'AZ' });
  });
});
