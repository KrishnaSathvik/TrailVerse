import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('PlanWorkspace map isolation', () => {
  it('uses canonical abstract transfers while retaining Directions for legacy workspace plans', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../PlanWorkspace.jsx'),
      'utf8',
    );
    const mapCall = source.match(/<ItineraryMapView[\s\S]*?\/>/);
    expect(mapCall).not.toBeNull();
    expect(mapCall[0]).toContain("pathMode={canonicalMap ? 'abstract-edges' : 'directions'}");
    expect(mapCall[0]).toContain('days={mapDays}');
    expect(mapCall[0]).not.toMatch(/fitPadding/);
    expect(mapCall[0]).not.toMatch(/controlsPlacement/);
  });
});
