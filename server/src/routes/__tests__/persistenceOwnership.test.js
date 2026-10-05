'use strict';

/**
 * Stage 14.1 §1 — LOCK THE OWNERSHIP INVARIANT.
 *
 *   server builds canonical response data
 *   client is the sole persistence initiator
 *   tripController is the sole persistence execution path
 *
 * Stage 8 removed a server-side fire-and-forget plan write (F-PERSIST-1). Stage 14
 * introduces an EARLIER delivery point, which is exactly the kind of change that
 * tempts a server-side writer back in. These tests make that regression fail loudly:
 * the AI route and the turn-orchestration services must never import a trip model or
 * a persistence writer, and must never call a write method.
 */

const fs = require('fs');
const path = require('path');

const SERVER_SRC = path.resolve(__dirname, '..', '..');

// Modules that can WRITE trip/response state. None may be reachable from the
// request-path generation code.
const PERSISTENCE_WRITERS = [
  'models/TripPlan',
  'controllers/tripController',
  'models/AnonymousSession',
];

// Mongoose write methods that would indicate a direct write.
const WRITE_CALL_RE = /\b(?:TripPlan|AnonymousSession)\s*\.\s*(?:create|updateOne|updateMany|findByIdAndUpdate|findOneAndUpdate|insertMany|deleteOne|save)\s*\(/;

function read(file) {
  return fs.readFileSync(path.join(SERVER_SRC, file), 'utf8');
}

function importsAny(source, targets) {
  return targets.filter((t) => new RegExp(`require\\(\\s*['"][^'"]*${t.replace('/', '\\/')}['"]`).test(source));
}

describe('Stage 14.1 §1 — persistence ownership invariant', () => {
  describe('turn orchestration services never import a persistence writer', () => {
    const ORCHESTRATION = [
      'services/trailieExecutionService.js',
      'services/trailieRouteBridge.js',
      'services/structuredItineraryGenerator.js',
      'utils/finalizeItinerary.js',
      'utils/canonicalResponse.js',
      'utils/responseIdentity.js',
    ];

    it.each(ORCHESTRATION)('%s imports no trip writer', (file) => {
      expect(importsAny(read(file), PERSISTENCE_WRITERS)).toEqual([]);
    });

    it.each(ORCHESTRATION)('%s issues no direct model write', (file) => {
      expect(WRITE_CALL_RE.test(read(file))).toBe(false);
    });
  });

  describe('the AI route builds canonical data but never persists it', () => {
    const source = read('routes/ai.js');

    it('does not import tripController', () => {
      expect(importsAny(source, ['controllers/tripController'])).toEqual([]);
    });

    it('issues no TripPlan / AnonymousSession write call', () => {
      // AnonymousSession session bookkeeping is allowed via its own model methods;
      // what must never appear is a trip/plan/assistant-response write.
      expect(/\bTripPlan\s*\.\s*(?:create|updateOne|findByIdAndUpdate|findOneAndUpdate|insertMany)\s*\(/.test(source)).toBe(false);
    });

    // The route legitimately READS a trip to build active-trip context
    // (prepareChatContext → TripPlan.findById(...).select(...).lean()). The
    // invariant is that every TripPlan usage here is read-only.
    it('uses TripPlan only through read operations', () => {
      const usages = source.match(/TripPlan\s*\.\s*[A-Za-z]+\s*\(/g) || [];
      const READ_ONLY = new Set(['findById', 'findOne', 'find', 'countDocuments', 'aggregate', 'distinct']);
      const methods = usages.map((u) => u.replace(/TripPlan\s*\.\s*/, '').replace(/\s*\($/, ''));
      expect(methods.length).toBeGreaterThan(0); // guard: the regex still matches something
      expect(methods.filter((m) => !READ_ONLY.has(m))).toEqual([]);
    });

    it('never calls .save() on a loaded document', () => {
      expect(/savedTripPlan\s*\.\s*save\s*\(/.test(source)).toBe(false);
      expect(/\btrip\s*\.\s*save\s*\(/.test(source)).toBe(false);
    });

    it('still documents the single-writer rule at the canonical seam', () => {
      expect(source).toMatch(/frontend is the single persistence initiator|No server-side plan write/i);
    });
  });

  describe('the pure decision layer performs no I/O', () => {
    it.each(['utils/planPersistence.js', 'utils/canonicalPersistence.js'])('%s is pure', (file) => {
      const src = read(file);
      expect(importsAny(src, PERSISTENCE_WRITERS)).toEqual([]);
      expect(/require\(\s*['"]mongoose['"]/.test(src)).toBe(false);
      expect(/\bawait\b/.test(src)).toBe(false);
    });
  });

  it('tripController remains the sole execution path for canonical persistence', () => {
    const importers = [];
    for (const dir of ['routes', 'services', 'utils']) {
      const abs = path.join(SERVER_SRC, dir);
      for (const f of fs.readdirSync(abs)) {
        if (!f.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(abs, f), 'utf8');
        if (/require\(\s*['"][^'"]*controllers\/tripController['"]/.test(src)) {
          importers.push(`${dir}/${f}`);
        }
      }
    }
    // Only the trips route may mount the controller.
    expect(importers).toEqual(['routes/trips.js']);
  });
});
