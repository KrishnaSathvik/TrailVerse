import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  assertReportSymbolsDeclared,
} = require('../../scripts/stage14_8-report-preflight.js');

/**
 * Stage 14.8E.1 §11 — the preflight must catch the exact harness defect that
 * cost Stage 14.8E its evidence: a report field referenced but never declared,
 * which only threw AFTER the paid turn had completed.
 */

const tmpFiles = [];
function writeDriver(source) {
  const file = path.join(os.tmpdir(), `stage14-preflight-${Date.now()}-${Math.random()}.mjs`);
  fs.writeFileSync(file, source);
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  while (tmpFiles.length) {
    try { fs.unlinkSync(tmpFiles.pop()); } catch { /* already gone */ }
  }
});

describe('Stage 14.8E.1 §11 — driver report preflight', () => {
  it('rejects a report that references an undeclared field', () => {
    const driver = writeDriver(`
      const terminalOutcome = 'done';
      write('send-report.json', {
        terminalOutcome,
        uiBoundary,
      });
    `);
    expect(() => assertReportSymbolsDeclared(driver))
      .toThrow(/referenced but never declared: uiBoundary/);
  });

  it('accepts a report whose fields are all declared', () => {
    const driver = writeDriver(`
      const terminalOutcome = 'done';
      const uiBoundary = { composerEnabledAfterFifth: false };
      write('send-report.json', {
        terminalOutcome,
        uiBoundary,
      });
    `);
    expect(assertReportSymbolsDeclared(driver)).toMatchObject({ missing: [] });
  });

  it('understands destructured and imported declarations', () => {
    const driver = writeDriver(`
      import { installSseTee } from './tee.js';
      const { MongoClient } = serverRequire('mongodb');
      const [first, second] = [1, 2];
      const { a: renamed } = source;
      write('send-report.json', { installSseTee, MongoClient, renamed });
    `);
    expect(assertReportSymbolsDeclared(driver).missing).toEqual([]);
  });

  it('reports every missing symbol at once', () => {
    const driver = writeDriver(`
      write('send-report.json', { alpha, beta, gamma });
    `);
    expect(() => assertReportSymbolsDeclared(driver))
      .toThrow(/alpha, beta, gamma/);
  });

  it('is a no-op for a driver with no send-report call', () => {
    const driver = writeDriver('const x = 1;');
    expect(assertReportSymbolsDeclared(driver)).toEqual({ referenced: 0, missing: [] });
  });
});

describe('Stage 14.8E.1 §11 — the real acceptance drivers pass preflight', () => {
  const DRIVERS = [
    'stage14_8a-guest-retest.mjs',
    'stage14_8b-guest-followup.mjs',
    'stage14_8c-guest-message-3.mjs',
    'stage14_8d-guest-message-4.mjs',
    'stage14_8e-guest-message-5.mjs',
  ];

  it.each(DRIVERS)('%s declares every field its report references', (name) => {
    const driver = path.resolve(process.cwd(), 'scripts', name);
    expect(assertReportSymbolsDeclared(driver).missing).toEqual([]);
  });
});
