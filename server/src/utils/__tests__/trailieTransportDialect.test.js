'use strict';

/**
 * WP10B — per-request transport dialect resolution.
 *
 * The server always emits canonical v2 events; this decides which dialect a given
 * connection is rendered in. It FAILS CLOSED to 'legacy': v2 is chosen only when
 * the server has v2 enabled AND the client explicitly signals it can parse v2.
 * Every existing client (which sends no signal) keeps working unchanged.
 */

const { resolveTrailieTransportDialect } = require('../trailieTransportDialect');

const on = { enabled: true };
const off = { enabled: false };

describe('resolveTrailieTransportDialect — fail closed to legacy', () => {
  it('returns legacy when req is missing entirely', () => {
    expect(resolveTrailieTransportDialect(undefined, on)).toBe('legacy');
  });

  it('server flag OFF ignores a v2-capable client (kill switch)', () => {
    const req = { headers: { 'x-trailie-transport': 'v2' } };
    expect(resolveTrailieTransportDialect(req, off)).toBe('legacy');
  });

  it('server flag ON but NO client signal stays legacy (existing clients)', () => {
    const req = { headers: {} };
    expect(resolveTrailieTransportDialect(req, on)).toBe('legacy');
  });

  it('server flag ON + explicit v2 header selects v2', () => {
    expect(resolveTrailieTransportDialect({ headers: { 'x-trailie-transport': 'v2' } }, on)).toBe('v2');
    expect(resolveTrailieTransportDialect({ headers: { 'x-trailie-transport': '2' } }, on)).toBe('v2');
  });

  it('the header signal is case-insensitive and trimmed', () => {
    expect(resolveTrailieTransportDialect({ headers: { 'x-trailie-transport': ' V2 ' } }, on)).toBe('v2');
  });

  it('accepts the signal from body metadata.transportVersion as a fallback', () => {
    expect(resolveTrailieTransportDialect({ headers: {}, body: { metadata: { transportVersion: 2 } } }, on)).toBe('v2');
    expect(resolveTrailieTransportDialect({ headers: {}, body: { metadata: { transportVersion: 'v2' } } }, on)).toBe('v2');
  });

  it('an unrecognized signal value stays legacy', () => {
    expect(resolveTrailieTransportDialect({ headers: { 'x-trailie-transport': 'v3' } }, on)).toBe('legacy');
    expect(resolveTrailieTransportDialect({ headers: { 'x-trailie-transport': 'legacy' } }, on)).toBe('legacy');
  });

  it('never throws on a malformed request', () => {
    expect(resolveTrailieTransportDialect({}, on)).toBe('legacy');
    expect(resolveTrailieTransportDialect({ headers: null, body: null }, on)).toBe('legacy');
  });

  it('supports Express req.get() when present', () => {
    const req = { get: (h) => (h.toLowerCase() === 'x-trailie-transport' ? 'v2' : undefined) };
    expect(resolveTrailieTransportDialect(req, on)).toBe('v2');
  });
});

// ── WP10F-4 — the full dual-gate matrix, end-to-end at the wire boundary ──────
// The web client (next-frontend/src/lib/trailieTransport.js →
// trailieV2NegotiationHeaders) emits EXACTLY `x-trailie-transport: v2` when, and
// only when, its own NEXT_PUBLIC_TRAILIE_TRANSPORT_V2 flag is on — independently
// proven by aiServiceNegotiation.test.js. This block feeds that exact wire header
// into the REAL server resolver across all four flag combinations, so the two
// halves of the dual gate compose to the intended truth table. v2 requires BOTH.
describe('WP10F-4 — dual-gate matrix (client header × server flag)', () => {
  // What the browser actually puts on the wire, per its own flag.
  const CLIENT_ON = { headers: { 'x-trailie-transport': 'v2' } }; // NEXT_PUBLIC flag ON
  const CLIENT_OFF = { headers: {} }; // NEXT_PUBLIC flag OFF → no negotiation header

  it.each([
    ['web OFF + server OFF', CLIENT_OFF, off, 'legacy'],
    ['web ON  + server OFF', CLIENT_ON, off, 'legacy'],
    ['web OFF + server ON ', CLIENT_OFF, on, 'legacy'],
    ['web ON  + server ON ', CLIENT_ON, on, 'v2'],
  ])('%s → %s', (_name, req, serverGate, expected) => {
    expect(resolveTrailieTransportDialect(req, serverGate)).toBe(expected);
  });

  it('ONLY true+true yields v2 — every other cell is legacy', () => {
    const cells = [
      resolveTrailieTransportDialect(CLIENT_OFF, off),
      resolveTrailieTransportDialect(CLIENT_ON, off),
      resolveTrailieTransportDialect(CLIENT_OFF, on),
      resolveTrailieTransportDialect(CLIENT_ON, on),
    ];
    expect(cells.filter((c) => c === 'v2')).toHaveLength(1);
    expect(cells).toEqual(['legacy', 'legacy', 'legacy', 'v2']);
  });
});
