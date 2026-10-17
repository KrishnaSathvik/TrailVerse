import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail for Vercel Function cost: /plan-ai and /map must not await
 * searchParams in page-level generateMetadata (layout metadata is static).
 */
describe('plan-ai and map page metadata stay static', () => {
  it('plan-ai/page.jsx does not export generateMetadata or await searchParams', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/plan-ai/page.jsx'),
      'utf8'
    );
    expect(source).not.toMatch(/generateMetadata/);
    expect(source).not.toMatch(/await\s+searchParams/);
    expect(source).not.toMatch(/canonicalPageMetadata/);
    expect(source).not.toMatch(/\{\s*searchParams\s*\}/);
  });

  it('map/page.jsx does not export generateMetadata or await searchParams', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/map/page.jsx'),
      'utf8'
    );
    expect(source).not.toMatch(/generateMetadata/);
    expect(source).not.toMatch(/await\s+searchParams/);
    expect(source).not.toMatch(/canonicalPageMetadata/);
    expect(source).not.toMatch(/\{\s*searchParams\s*\}/);
  });

  it('plan-ai and map layouts still provide static canonical metadata', () => {
    const planLayout = readFileSync(
      join(process.cwd(), 'src/app/plan-ai/layout.jsx'),
      'utf8'
    );
    const mapLayout = readFileSync(
      join(process.cwd(), 'src/app/map/layout.jsx'),
      'utf8'
    );

    expect(planLayout).toMatch(/export const metadata/);
    expect(planLayout).toMatch(/\/plan-ai/);
    expect(mapLayout).toMatch(/export const metadata/);
    expect(mapLayout).toMatch(/\/map/);
  });
});
