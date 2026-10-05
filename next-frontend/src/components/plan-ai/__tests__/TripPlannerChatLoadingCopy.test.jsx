import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Phase 6A — TripPlannerChat.jsx is too large/stateful to mount in isolation
// (see the existing bare-import smoke test in this same directory), so this
// pins the loading-copy contract at the source-text level, the same
// structural-test convention already used elsewhere in this codebase for a
// component that cannot be unit-rendered directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../TripPlannerChat.jsx'), 'utf8');

describe('TripPlannerChat.jsx loading copy — Phase 6A', () => {
  it('the pre-first-stage default is the neutral "Working on that…", not "Thinking..."', () => {
    expect(SOURCE).toMatch(/useState\('Working on that…'\)/);
    expect(SOURCE).toMatch(/setThinkingMessage\('Working on that…'\)/);
    expect(SOURCE).not.toMatch(/'Thinking\.\.\.'/);
    expect(SOURCE).not.toMatch(/AI is thinking/i);
  });

  it('the pre-first-stage default is a static string, not a new client-side classification authority', () => {
    // Guards the coordinator's explicit instruction: this must stay a plain
    // string swap. It must not gain a TravelerJob/intent import or call
    // anywhere near the thinkingMessage initialization.
    const initLine = SOURCE.split('\n').find((l) => l.includes("useState('Working on that…')"));
    expect(initLine).toBeTruthy();
    expect(initLine).not.toMatch(/travelerJob|TravelerJob|classifyTrailieIntent|resolveTravelerJob/i);
  });

  it('the real server-stage-driven copy path is completely unchanged: still imported and still the ONLY place stage copy is resolved', () => {
    expect(SOURCE).toMatch(/import \{ resolveThinkingStageCopy \} from '@\/utils\/thinkingStageCopy';/);
    expect(SOURCE).toMatch(/resolveThinkingStageCopy\(stage, refinementTarget\)/);
  });

  it('the new classification seam is imported for display use, not for choosing loading text', () => {
    expect(SOURCE).toMatch(/from '@\/utils\/trailieTurnOutcome';/);
    expect(SOURCE).toMatch(/classifyTrailieTurnOutcome/);
    // Never referenced anywhere near thinkingMessage/thinkingStage — i.e. it
    // is not being used to pick loading copy.
    expect(SOURCE).not.toMatch(/classifyTrailieTurnOutcome[^\n]*thinkingMessage/);
    expect(SOURCE).not.toMatch(/setThinkingMessage\([^)]*outcomeClass/);
  });

  it('Phase 6C — the finalizing-stage copy no longer implies completion is imminent', () => {
    // "Finishing your response..." fires both on a genuine stream end AND on
    // a guessed idle timeout (see markStreamFinalizing) — the old copy was a
    // false completion claim in the guess case. Must be gone, and the single
    // call site must use truthful, still-working copy instead.
    expect(SOURCE).not.toMatch(/setThinkingMessage\('Finishing your response/);
    const finalizingBlock = SOURCE.slice(
      SOURCE.indexOf('const markStreamFinalizing ='),
      SOURCE.indexOf('const markStreamFinalizing =') + 1200
    );
    expect(finalizingBlock).toMatch(/setThinkingMessage\('Still working on that…'\)/);
  });

  it('Phase 6C — no automatic hard timeout was introduced alongside the copy fix', () => {
    // Guards the coordinator's explicit "do not add a generic timeout/retry
    // system" / "no automatic hard timeout" instruction.
    expect(SOURCE).not.toMatch(/setTimeout\([^,]*,\s*STREAM_IDLE_MS\s*\*\s*\d/);
    expect(SOURCE).not.toMatch(/abortController\.abort\(\)[^\n]*timeout/i);
    expect(SOURCE).not.toMatch(/HARD_TIMEOUT|hardTimeout|forceAbortAfter/);
  });
});
