# WP10F-4 — Manual Browser Parity Smoke Runbook

**Purpose:** confirm a real browser turn behaves the same through *legacy wire → normalizer → UI* and *v2 wire → normalizer → same UI*. This covers only what automation cannot truly judge (image timing, finalizing UX, abort behavior, live network dialect). The objective parity (dual-gate matrix, parser/normalizer/callback UI-state equivalence) is already proven by automated tests — see "Automated coverage" at the bottom.

**Golden rule:** do not infer the dialect from the UI looking right — **inspect the actual network stream**.

**Cost/safety:** flipping `NEXT_PUBLIC_TRAILIE_TRANSPORT_V2` requires a **frontend dev-server restart** (the value is baked into the browser bundle). Real turns spend real API credits and write to the live DB. Both flags are OFF by default; leave them OFF when you finish.

---

## 0. Setup

Two flags gate v2. v2 happens **only when both are ON**.

| Location | Flag | File |
|---|---|---|
| Web (browser bundle) | `NEXT_PUBLIC_TRAILIE_TRANSPORT_V2` | `next-frontend/.env.local` |
| Server (kill switch) | `TRAILIE_TRANSPORT_V2` | `server/.env` |

Start backend + frontend:

```bash
# terminal 1 — backend (Express :5001)
cd server && npm run dev

# terminal 2 — frontend (Next :3000)
cd next-frontend && npm run dev
```

To change a flag cell:
- Set/clear `TRAILIE_TRANSPORT_V2=true` in `server/.env` → restart backend.
- Set/clear `NEXT_PUBLIC_TRAILIE_TRANSPORT_V2=true` in `next-frontend/.env.local` → **restart `next dev`** and hard-reload the browser.

### How to read the wire (DevTools)

1. DevTools → **Network** → filter `chat-stream` (or `chat-anonymous-stream`).
2. Send a turn. Click the request.
3. **Headers** tab → Request Headers: look for `x-trailie-transport: v2` (present only when the web flag is ON).
4. **Response / EventStream** tab → read the actual `data:` event `type`s:
   - **legacy:** `thinking`, `chunk`, `stream_end`, `done`
   - **v2:** `response_started`, `display_context`, `progress`, `evidence_ready`, `content_delta`, `response_finalized` (+ `itinerary_ready`/`prose_ready` on authenticated planning turns)

---

## 1. Dual-gate matrix (4 cells)

For each row: set flags, restart what's needed, send *"Tell me about Yosemite."*, inspect the request header **and** the event names.

| Web flag | Server flag | Req has `x-trailie-transport`? | Wire event names | Pass |
|---|---|---|---|---|
| OFF | OFF | no | legacy (`thinking`/`chunk`/`stream_end`/`done`) | ☐ |
| ON | OFF | **yes** | **legacy** (server ignores it) | ☐ |
| OFF | ON | no | legacy | ☐ |
| ON | ON | yes | **v2** (`response_started`…`response_finalized`) | ☐ |

Only the last row is v2. (This truth table is also asserted end-to-end against the real resolver in `trailieTransportDialect.test.js` → "WP10F-4 dual-gate matrix".)

**Run the remaining checks (2–8) in the ON/ON cell, comparing against an OFF/* legacy run.**

---

## 2. Authenticated streaming parity (`/chat-stream`)

Prompt: *"Tell me about Yosemite and what I should prioritize on a first visit."* Run once legacy, once v2. Compare:

- ☐ first loading state appears
- ☐ progress / thinking copy shows (e.g. "Checking park info…")
- ☐ source indicators (NPS/weather/web) where applicable
- ☐ text streams in smoothly — **no duplicated text, no disappearing text**
- ☐ transition into a **finalizing** state
- ☐ final answer renders
- ☐ loading spinner clears; input re-enables
- ☐ **no new console errors**

Answer text need not be identical (real model runs twice) — lifecycle/UI parity is what matters.

---

## 3. Park imagery parity — **the key `display_context` check**

Prompt something that resolves a park with images, e.g. *"What are the best things to do in Zion?"*

- ☐ **legacy:** image(s) render (fed from `thinking` display) — note *when* in the turn they appear
- ☐ **v2:** image(s) render from `display_context` — appear at the **same stage**
- ☐ correct park name
- ☐ multiple images if currently supported
- ☐ a later display update does **not** wipe previously received images
- ☐ **`evidence_ready` alone never drives imagery** (watch the v2 stream: an `evidence_ready` with no `display_context` must not produce images)
- ☐ no duplicate image rendering (images come from the display path only, not evidence)

---

## 4. Source / progress parity

Prompt exercising >1 info class, e.g. *"What's the weather like in Zion right now and what should I know before visiting?"*

- ☐ v2 `progress` + `evidence_ready` produce the **same UI copy** as legacy `thinking`
- ☐ **regression watch:** when `display_context` arrives, the source copy must **not** disappear/reset (e.g. "Checking NPS + weather…" must survive an incoming `display_context`). This is the sources-reset bug the parser split was designed to avoid.

---

## 5. Authenticated itinerary / early revision succession

Prompt: *"Plan a 3-day Yosemite trip."* (v2). In the stream, confirm the order: `itinerary_ready` … `content_delta`* … `prose_ready` … `response_finalized`.

- ☐ early itinerary card appears when expected
- ☐ final prose continues streaming after it
- ☐ finalizing transition works
- ☐ final response does **not** duplicate the itinerary
- ☐ itinerary does not disappear/reappear
- ☐ **no revision/hash error** in console or network
- ☐ the final canonical plan is the **same plan** delivered early

---

## 6. Anonymous streaming (`/chat-anonymous-stream`, incognito)

Clean/incognito window (web flag ON, server flag ON).

- Simple: *"What should I see at Zion?"*
- Planning: *"Give me a simple 2-day Zion plan."*

- ☐ v2 stream has `display_context`, `progress`, `evidence_ready`, `content_delta`, `response_finalized`
- ☐ **no** `itinerary_ready`/`prose_ready` durable revision behavior, **no** recovery, **no** auth persistence
- ☐ guest quota/lifecycle behaves exactly as before (counter decrements as usual)

---

## 7. Finalizing lifecycle (watch closely)

Legacy drives finalizing from `stream_end`; v2 synthesizes the same client concept at `prose_ready`/`response_finalized`.

- ☐ you see: **streaming → finalizing/checking → completed**
- ☐ NOT "streaming → suddenly done", and NOT "finalizing forever"
- ☐ the finalizing transition fires **once**

---

## 8. Abort / cancel sanity

Start a longer streamed turn, then interrupt as a user would (navigate away, or start another turn if supported).

- ☐ no continued text after abort
- ☐ no late `done`/`response_finalized` applied
- ☐ no console error storm
- ☐ no stuck loading state

---

## Success gate

```
Dual-gate matrix              ☐ 4/4 correct
Auth legacy stream            ☐
Auth v2 stream                ☐
Anon legacy stream            ☐
Anon v2 stream                ☐
Park imagery parity           ☐
Source/progress parity        ☐
Early itinerary succession    ☐
Finalizing lifecycle          ☐
Abort/disconnect sanity       ☐
Console                       ☐ no new errors
Network                       ☐ correct dialects
Production behavior           ☐ unchanged (both flags OFF by default)
```

If a cell fails: fix the **smallest parity defect only**, rerun the affected case + the automated suites, and re-smoke. When all pass → **WP10F web v2 compatibility = FREEZE**; next is WP10G (iOS).

**Reset when done:** clear both flags (or set to `false`) and restart both dev servers so local returns to legacy.

---

## Automated coverage already proving the objective half (run any time)

```bash
# server (from server/)
npx jest src/utils/__tests__/trailieTransportDialect.test.js \
         src/utils/__tests__/trailieTransportAdapter.test.js \
         src/routes/__tests__/earlyEventRouteScope.test.js

# frontend (from next-frontend/)
npx vitest run src/utils/__tests__/transportEventNormalizer.test.js \
               src/services/__tests__/consumeAiSseStreamParity.test.js \
               src/services/__tests__/aiServiceNegotiation.test.js \
               src/services/__tests__/aiSseEvents.test.js
```

- **Dual-gate matrix (4/4)** — `trailieTransportDialect.test.js` → "WP10F-4 dual-gate matrix", real resolver × the exact client wire header.
- **Client sends the signal only when its flag is on; request otherwise unchanged** — `aiServiceNegotiation.test.js`.
- **Both dialects → one normalizer → equivalent UI state** (text, sources, progress copy, `stream_finished` once, terminal seal, early-event forwarding) — `consumeAiSseStreamParity.test.js`.
- **`display_context` parity; `evidence_ready` never sets imagery; incremental display merge** — `transportEventNormalizer.test.js` + `consumeAiSseStreamParity.test.js`.
- **Server adapter v2 `display_context` promotion; legacy byte-unchanged** — `trailieTransportAdapter.test.js`.
