import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('root layout caching / theme bootstrap', () => {
  it('does not force the whole app dynamic via cookies or force-dynamic', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src/app/layout.js'),
      'utf8'
    );
    expect(layout).not.toMatch(/export const dynamic\s*=/);
    expect(layout).not.toMatch(/from ["']next\/headers["']/);
    expect(layout).not.toMatch(/await cookies\s*\(/);
    expect(layout).toMatch(/strategy=["']beforeInteractive["']/);
    expect(layout).toMatch(/\/theme-init\.js/);
  });

  it('ships a blocking theme-init script that sets light/dark classes', () => {
    const script = readFileSync(
      join(process.cwd(), 'public/theme-init.js'),
      'utf8'
    );
    expect(script).toMatch(/localStorage\.getItem/);
    expect(script).toMatch(/classList\.add\(mode\)/);
    expect(script).toMatch(/prefers-color-scheme:\s*dark/);
  });
});
