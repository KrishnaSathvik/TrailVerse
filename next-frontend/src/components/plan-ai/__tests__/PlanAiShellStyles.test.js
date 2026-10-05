import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8');

describe('Plan AI shell styles — Phase 7B', () => {
  it('gives the unified composer an explicit visible focus-within treatment', () => {
    expect(CSS).toMatch(/\.trailie-composer__surface:focus-within\s*\{/);
    expect(CSS).toMatch(/\.trailie-composer__surface:focus-within[\s\S]{0,400}box-shadow:/);
  });

  it('keeps the disabled composer explanation readable', () => {
    expect(CSS).toMatch(/\.trailie-composer textarea:disabled::placeholder\s*\{/);
    expect(CSS).toMatch(/\.trailie-composer textarea:disabled::placeholder[\s\S]{0,200}opacity:\s*1/);
  });
});
