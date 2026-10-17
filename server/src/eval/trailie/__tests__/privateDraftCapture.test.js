'use strict';

/**
 * Stage 13.7 §1 — private draft-capture safety controls.
 *
 * Capture is OFF by default, gated behind an explicit flag + evaluation env +
 * live runner + synthetic scenario + gitignored destination, whitelists what it
 * writes, and is UNREACHABLE from production route/service modules.
 */

const fs = require('fs');
const path = require('path');
const {
  PRIVATE_DIR,
  isPrivateCaptureEnabled,
  isDestinationGitignored,
  pickVerifierResult,
  makeDraftCapturer,
} = require('../privateDraftCapture');

const FLAG = 'TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS';

describe('private draft capture — default off', () => {
  const saved = { flag: process.env[FLAG], node: process.env.NODE_ENV };
  afterEach(() => {
    if (saved.flag === undefined) delete process.env[FLAG]; else process.env[FLAG] = saved.flag;
    if (saved.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.node;
  });

  it('is disabled when the flag is unset', () => {
    delete process.env[FLAG];
    expect(isPrivateCaptureEnabled()).toBe(false);
    const c = makeDraftCapturer({ runId: 'r', scenarioId: 's', providerMode: 'live', isSyntheticScenario: true });
    expect(c.active).toBe(false);
    expect(c.capture).toBeNull();
  });

  it('is disabled in production even with the flag on', () => {
    process.env[FLAG] = 'true';
    process.env.NODE_ENV = 'production';
    expect(isPrivateCaptureEnabled()).toBe(false);
  });
});

describe('private draft capture — gates', () => {
  const saved = { flag: process.env[FLAG], node: process.env.NODE_ENV };
  beforeEach(() => { process.env[FLAG] = 'true'; process.env.NODE_ENV = 'test'; });
  afterEach(() => {
    if (saved.flag === undefined) delete process.env[FLAG]; else process.env[FLAG] = saved.flag;
    if (saved.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.node;
  });

  it('refuses without a live-evaluation runner (no providerMode)', () => {
    const c = makeDraftCapturer({ runId: 'r', scenarioId: 's', isSyntheticScenario: true });
    expect(c.capture).toBeNull();
    expect(c.reasons.join(' ')).toMatch(/live-evaluation runner/);
  });

  it('refuses a non-synthetic scenario', () => {
    const c = makeDraftCapturer({ runId: 'r', scenarioId: 's', providerMode: 'live', isSyntheticScenario: false });
    expect(c.capture).toBeNull();
    expect(c.reasons.join(' ')).toMatch(/synthetic/);
  });

  it('confirms the destination is gitignored', () => {
    expect(isDestinationGitignored()).toBe(true);
  });
});

describe('private draft capture — writes only whitelisted synthetic content', () => {
  const saved = { flag: process.env[FLAG], node: process.env.NODE_ENV };
  const written = [];
  beforeEach(() => { process.env[FLAG] = 'true'; process.env.NODE_ENV = 'test'; });
  afterEach(() => {
    if (saved.flag === undefined) delete process.env[FLAG]; else process.env[FLAG] = saved.flag;
    if (saved.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.node;
    for (const f of written.splice(0)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  });

  it('pickVerifierResult keeps only the allowed fields', () => {
    const picked = pickVerifierResult({
      issueCodes: ['conflicting_difficulty'],
      conflictingDurations: [{ stopId: 'stop-1' }],
      conflictingDifficulty: [{ stopId: 'stop-1' }],
      sanitizedProse: 'SHOULD NOT APPEAR',
      apiKey: 'sk-should-not-appear',
    });
    expect(picked.conflictingDuration).toEqual([{ stopId: 'stop-1' }]);
    expect(Object.keys(picked)).not.toContain('sanitizedProse');
    expect(Object.keys(picked)).not.toContain('apiKey');
    expect(JSON.stringify(picked)).not.toMatch(/should-not-appear/i);
  });

  it('writes a per-attempt file with no secrets', () => {
    const c = makeDraftCapturer({ runId: 'basic-02|claude|x', scenarioId: 'basic-02', providerMode: 'live', isSyntheticScenario: true });
    expect(c.active).toBe(true);
    c.capture({
      attempt: 1,
      markerBearingDraft: '<!--TRAILIE_DAY:day-1--> ok',
      verifierResult: { issueCodes: [], conflictingDurations: [], apiKey: 'sk-secret' },
      manifest: { manifestVersion: 'v1', days: [] },
    });
    const files = fs.readdirSync(PRIVATE_DIR).filter((f) => f.startsWith('basic-02_claude_x__attempt-1'));
    expect(files.length).toBe(1);
    const full = path.join(PRIVATE_DIR, files[0]);
    written.push(full);
    const body = fs.readFileSync(full, 'utf8');
    expect(body).toMatch(/markerBearingDraft/);
    expect(body).not.toMatch(/sk-secret/);
    expect(body).not.toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe('private draft capture — structural: unreachable from production', () => {
  const SELF = 'privateDraftCapture';

  function scanDir(dir) {
    const offenders = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      if (new RegExp(`require\\([^)]*${SELF}`).test(src)) offenders.push(f);
    }
    return offenders;
  }

  it('no production route module imports the capture writer', () => {
    const routesDir = path.resolve(__dirname, '..', '..', '..', 'routes');
    expect(scanDir(routesDir)).toEqual([]);
  });

  it('no production service module (incl. the shared seam) imports the capture writer', () => {
    const servicesDir = path.resolve(__dirname, '..', '..', '..', 'services');
    expect(scanDir(servicesDir)).toEqual([]);
  });

  it('only the eval runner imports it', () => {
    const evalDir = path.resolve(__dirname, '..');
    const importers = scanDir(evalDir).filter((f) => f !== 'privateDraftCapture.js');
    // WP12 Phase 4 retired Stage 13 pipeline index.js; capture remains eval-only
    // via run-stage13_9-two-scenario.js (outside this directory scan).
    expect(importers).toEqual([]);
  });
});
