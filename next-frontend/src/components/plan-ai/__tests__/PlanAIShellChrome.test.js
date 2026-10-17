import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../PlanAIShell.jsx'), 'utf8');

describe('PlanAIShell — Phase 10B chrome', () => {
  it('lets the page scroll instead of nesting a fixed-height scroller', () => {
    expect(SOURCE).toMatch(/plan-ai-shell min-h-dvh flex flex-col"/);
    expect(SOURCE).not.toMatch(/h-dvh flex flex-col overflow-hidden/);
    expect(SOURCE).not.toMatch(/overflow-hidden/);
  });

  it('tightens mobile subhead padding without removing the active-trip heading', () => {
    expect(SOURCE).toMatch(/border-b py-2 sm:py-4/);
    expect(SOURCE).toMatch(/truncate text-lg font-semibold leading-tight sm:text-xl/);
    expect(SOURCE).not.toMatch(/border-b px-3 py-3 sm:px-5 sm:py-4/);
  });
});
