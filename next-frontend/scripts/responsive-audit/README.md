# Responsive audit tools

Run from `next-frontend/`. Evidence is written to `../artifacts/trailverse-responsive-audit/`.

- `inventory.mjs`: discovers App Router templates and public reports/magazine. **Run only when starting a new baseline**; it writes baseline hashes and the initial report. Do not rerun over a completed audit.
- `fixture-server.mjs`: read-only adapter on 127.0.0.1:5002. Supplies populated editorial/activity/shared-trip samples, forwards other GETs to the existing API on 5001, rejects writes and AI endpoints.
- `capture.mjs before|after [route-filter] [force]`: captures eight widths per runtime route and checkpoints results. `force` replaces matching rows. Empty filter plus `force` recaptures all routes. Browser fixtures suppress writes/generation and use synthetic accounts.
- `states.mjs [state-filter]`: checks rich layouts, preference handoff, sample workspaces/maps, guest auth gate, article tables and mobile/desktop tab composition. Filtered runs preserve other state results.
- `check.mjs`: lightweight acceptance assertions over completed measurements, including overflow, widths/alignment, table containment, button targets and the frozen fixture hash.
- `report.mjs`: writes REPORT.md from inventory/measurements and appends IMPLEMENTATION.md when present. The original Phase 1 report remains preserved.

Start the adapter and frontend in separate terminals. For populated SSR samples, use process-only environment variables:

```sh
node scripts/responsive-audit/fixture-server.mjs
```

```sh
API_URL=http://127.0.0.1:5002/api NEXT_PUBLIC_API_URL=http://127.0.0.1:5002/api NEXT_ACCEPTANCE_BACKEND_ORIGIN=http://127.0.0.1:5002 npm run dev -- --hostname 127.0.0.1
```

```sh
node scripts/responsive-audit/capture.mjs after
node scripts/responsive-audit/states.mjs
node scripts/responsive-audit/check.mjs
node scripts/responsive-audit/report.mjs
```

Chromium/local port access may require environment approval. Stop only audit-owned processes and restore the ordinary preview afterwards. No tools push, deploy, regenerate demo captures, send email or call paid AI providers.
