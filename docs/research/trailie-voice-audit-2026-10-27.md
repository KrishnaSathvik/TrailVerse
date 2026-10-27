# Trailie Voice — Full Audit & Modernization Research

**Date:** October 27, 2026  
**Scope:** Read-only investigation. No code, prompts, models, UI, or config were changed.  
**Status:** Architecture/UI findings still valid. **Model + voice selection reopened** — see follow-up [trailie-voice-technology-audit-0b-2026-10-27.md](./trailie-voice-technology-audit-0b-2026-10-27.md). Do **not** implement the dock until Phase 0B listening tests and model choice are approved.

---

## Executive answers (the two architectural questions)

| Question | Answer | Implication |
|---|---|---|
| **Can Trailie Voice keep a conversation alive when the full-screen UI is minimized?** | **Not today.** Closing or unmounting `VoiceOverlay` always calls `disconnect()` and tears down WebRTC + mic tracks. There is no minimize mode. | A compact dock **is feasible without changing the OpenAI transport**, but requires a **frontend session/UI split** (lift `useRealtimeVoice` above the overlay). Backend already does not hold the live peer. |
| **Can Trailie speak naturally while its backend researches park information?** | **Not today (by design).** Prompt forbids filler before tools; client mutes mic and shows tool UI until `function_call_output` + `response.create`. | Natural “keep talking while looking things up” needs either **prompt/orchestration changes on Realtime**, or a **GPT-Live migration** with conversation/backend delegation. Do not migrate solely for the dock UI. |

**Recommended product direction (pending your approval):** Phase 1 = compact expandable dock + optional immersive view on the **existing Realtime WebRTC stack**. Defer GPT-Live until latency/cost/experience justify a separate migration spike.

---

## A. Current architecture

### Diagram

```
Visitor page (root layout)
  └── VoiceButton FAB (most routes)
        └── isOpen → VoiceOverlay (full-screen dialog)
              └── useRealtimeVoice()
                    1. POST /api/ai/realtime-session  (Express mints ephemeral secret)
                    2. getUserMedia + RTCPeerConnection
                    3. SDP POST https://api.openai.com/v1/realtime/calls
                    4. Data channel `oai-events` (transcripts, VAD, function_call)
                    5. On tool → POST /api/ai/voice-tool → function_call_output + response.create
              Close / Escape / unmount → disconnect() → peer + tracks destroyed
```

Express is a **mint + tool proxy**. It does **not** keep a live voice session. Session lifetime = browser `RTCPeerConnection`.

### Protocol & model (verified in code)

| Item | Value | Source |
|---|---|---|
| Architecture | OpenAI **Realtime API** (GA-style), browser WebRTC | `useRealtimeVoice.js`, `ai.js` |
| Mint | `POST /v1/realtime/client_secrets` | `server/src/routes/ai.js` ~4013 |
| SDP | `POST /v1/realtime/calls` | `useRealtimeVoice.js` |
| Model | `gpt-realtime` | `ai.js` ~4022 |
| Voice | `marin` | `ai.js` ~4034 |
| VAD | `semantic_vad` | `ai.js` ~4028 |
| Interrupt | `interrupt_response: false` | `ai.js` ~4029 |
| Auto-reply | `create_response: false` (client sends `response.create`) | `ai.js` ~4030 |
| Tools | `get_park_details`, `search_parks`, `compare_parks`, `find_events` | session mint + `/voice-tool` |

### Exact source files

| Path | Role |
|---|---|
| `next-frontend/src/app/layout.js` | Mounts `<VoiceButton />` |
| `next-frontend/src/components/voice/VoiceButton.jsx` | FAB, route gating, opens overlay |
| `next-frontend/src/components/voice/VoiceOverlay.jsx` | Full-screen UI; connect on mount / disconnect on unmount |
| `next-frontend/src/hooks/useRealtimeVoice.js` | WebRTC, events, tool loop, cleanup |
| `next-frontend/src/app/globals.css` (~946–1082) | FAB + orb animations |
| `server/src/routes/ai.js` (~3813–4271) | `realtime-session`, `voice-tool`, rate limits |
| `server/src/prompts/voicePrompt.js` | `TRAILIE_VOICE_INSTRUCTIONS` |
| `server/src/prompts/coreTrailiePolicy.js` | `ABOUT_TRAILIE_VOICE`, injection defense |
| `docs/voice-chat-feature.md` | Architecture doc (**partially stale**) |

### End-to-end session lifecycle

1. Page load → FAB on most routes (hidden on `/plan-ai`, `/blog`, `/map`, legal, FAQ, etc.).
2. Click FAB → `sessionKey++`, mount overlay, analytics `voice_started`.
3. Overlay mount → `connect(parkCode)` → optional geolocation → mint → mic permission → WebRTC.
4. Data channel open → status `connected` / UI “Listening”.
5. User speech → VAD `speech_started` / commit → client `response.create` if speech >500ms.
6. Model speaks → mic tracks disabled (echo prevention); captions stream.
7. Tool call → mic muted, tool UI, Express `/voice-tool`, then speak from results.
8. After `response.done` → 1.2s cooldown → mic re-enabled.
9. Close/Escape/unmount/nav to gated route → full cleanup. **No minimize.**

### Limits & auth

- Anonymous: **3 free sessions / 24h / IP**, then signup gate.
- Everyone: **10 sessions / hour** (in-memory Map; not multi-instance safe).
- `/voice-tool` is **unauthenticated** (public tool fan-out risk).
- Server holds `OPENAI_API_KEY`; browser receives ephemeral secret only.

---

## B. Conversation behavior

### Instruction hierarchy

1. `TRAILIE_VOICE_INSTRUCTIONS` (`voicePrompt.js`) — startup silence, short answers, silent tool calls.
2. `ABOUT_TRAILIE_VOICE` + `PROMPT_INJECTION_DEFENSE`.
3. Runtime appendages at mint: live park block (if on park page), **“Today is … (season)”**, nearest parks from lat/lng, anon signup nudge.

### Greeting finding (“Hey there… fall weather”)

| Claim | Finding |
|---|---|
| Hardcoded in frontend? | **No** |
| Hardcoded spoken script in prompt? | **No** — opposite: **STARTUP RULE — ABSOLUTE silence** until user speaks |
| Season injected? | **Yes** as date context (`Today is … (fall)` for months 8–10) — can bias answers, not a greeting script |
| Likely cause of the screenshot greeting | **Model drift / policy violation**, possibly encouraged by season context |

**Product note:** Current policy already matches your preference to open ready-to-listen without an automatic weather greeting. Enforcement may need stronger prompting or post-start guardrails if drift continues; do not “add” silence — it is already required.

### What works

- Short spoken answers; tool routing for live NPS/weather/events/search/compare.
- Park-page context preloaded at mint (faster first answers).
- Echo mitigation via mic mute while speaking.
- Guest session caps funnel signups.

### Gaps / contradictions

| Issue | Severity |
|---|---|
| Docs claim barge-in (`interrupt_response: true`); code has `false` + mic mute while speaking | High (docs) / product |
| Marketing (“while you browse”) vs full-screen takeover that blocks the page | Medium |
| Voice lacks text Trailie travel/booking/saved-trip policy | Medium (accuracy) |
| `plan_trip` labels in overlay UI without registered tool | Low |
| Stale model names in some docs (`gpt-4o-realtime`) | Low |
| Features copy overclaims browse-while-talking | Medium |

### Interruptions & pauses

- True barge-in **off**.
- User cannot interrupt mid-answer without ending the call.
- Long pauses: semantic VAD + client-gated `response.create`; thinking pauses generally wait for next commit.
- Background noise: browser AEC/NS/AGC on `getUserMedia`; no advanced noise UX.

---

## C. OpenAI research (verified ~Oct 27, 2026)

### Product vs developer API

| Surface | What it is | Available to TrailVerse? |
|---|---|---|
| **ChatGPT Voice** | Consumer UX (integrated answers, GPT-Live in product) | **No** — proprietary UI/config |
| **Realtime API** | Speech-to-speech WebRTC/WebSocket; tools in-session | **Yes — what Trailie uses today** |
| **GPT-Live API** | Full-duplex conversation model + **delegated backend** for research/tools; can keep talking during backend work | **Yes (developer docs live)** — different session API (`/v1/live/sessions`), duration billing |

Sources (official):

- [Realtime getting started](https://developers.openai.com/api/docs/guides/realtime) — recommends Agents SDK; notes GPT-Live for full-duplex + delegated backend.
- [WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc) — current browser examples emphasize GPT-Live `live.create` / `/v1/live/sessions`.
- [GPT-Live getting started](https://developers.openai.com/api/docs/guides/live) — duration billing; conversation vs backend split.
- [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation) — speak while backend works; track audio/transcripts separately from backend tasks.
- [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad) — `server_vad` / `semantic_vad`; `interrupt_response` / `create_response`.
- [Introducing GPT-Live](https://openai.com/index/introducing-gpt-live/) (Jul 8, 2026) — product announcement; API later rolled out (developer guides now present).
- Model pages: [gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1), [gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1).

### Pricing snapshot (list prices; confirm in dashboard before decisions)

| Stack | Billing shape | List rates (docs) |
|---|---|---|
| **Realtime `gpt-realtime-2.1`** | Token-based (audio + text) | Audio ~$32 / 1M input tokens, ~$64 / 1M output tokens; text separate |
| **GPT-Live `gpt-live-1`** | **Duration** | **$0.05 / minute**, billed per second; **backend model + tools billed separately** |
| WebRTC Live init | Session start | Docs note **15 seconds** of voice duration billed at init and credited once running |

**Cost implication for TrailVerse:** A dock that keeps the mic session open while users browse maps/parks increases **session duration**. On Realtime that means more audio tokens while connected; on GPT-Live it means explicit per-second burn even during idle listening. Idle-dock cost controls (timeouts, mute-stops-billing if supported, end-vs-minimize education) matter either way.

### Compatibility with Trailie

| Capability | Today (Realtime) | GPT-Live | Needed for dock UI? |
|---|---|---|---|
| Browser WebRTC | Yes | Yes (different mint/SDP path) | No change required for dock |
| Minimize without ending | Frontend-only gap | Same | **Frontend refactor** |
| Speak during park research | Blocked by prompt + tool loop | Designed for this via delegation | **Only if product wants it** |
| Interrupt / barge-in | Disabled intentionally | Native full-duplex | Optional Realtime flag first |
| Park tools on Express | `/voice-tool` client loop | Client or Responses delegation | Larger rewrite for Live |

**Migration recommendation:** Do **not** migrate to GPT-Live as a prerequisite for the compact dock. Consider a **time-boxed spike** later if you want continuous conversation during tool latency, then compare cost of a 3–5 minute browsing-with-dock session under both billers.

Trailie already uses GA Realtime shapes (`client_secrets` + `/realtime/calls`). A smaller optional upgrade is evaluating alias `gpt-realtime` → `gpt-realtime-2.1` after a latency/quality A/B — not required for UI redesign.

---

## D. Visual UX report

### Current behavior (intentional immersive “call”)

- FAB: large green circle, bottom-right, z-index 9998; scroll-hides; route-gated.
- Active UI: **full-screen** `fixed inset-0` dialog — intentional, not a layout bug.
- States: Connecting / Listening / You're speaking / Tool calling / Trailie speaking / Error / Auth gate.
- Animations: CSS state classes — **decorative, not audio-reactive**.
- Controls: **Close only** (= end session). No mute, minimize, expand, retry.
- Suggested prompts: decorative spans (not tappable).
- Captions: assistant only; user transcript stored but not shown.

### Overlay / a11y findings

| Finding | Severity |
|---|---|
| FAB z-9998 above overlay z-100; open FAB can remount session | High |
| CSS `pointer-events: auto !important` may keep scrolled-away FAB clickable | High |
| No focus trap / initial focus / restore; no `aria-live` on status | High |
| Close control 36px; no safe-area insets | Medium |
| Voice animations ignore `prefers-reduced-motion` | Medium |
| No Retry on mic/network errors | Medium |

### Three design directions (wireframe-level; not implemented)

**Direction A — Compact launcher**  
Idle pill: mic + “Talk to Trailie”. No auto capture. Replaces oversized permanent FAB (or adds dismissible discovery label).

**Direction B — Expandable dock (recommended default active chrome)**  
After permission: floating card / bottom sheet with Listening|Speaking|Thinking, waveform (ideally audio-reactive), Mute, Minimize, Expand, End. Page remains usable. Minimized = active status pill (never silent mic).

**Direction C — Optional immersive**  
Keep today’s full-screen as Expand mode for focused conversation; Minimize returns to B without ending.

**Desktop:** bottom-right floating card. **Mobile:** bottom sheet + safe-area; minimize to dock.

Aligns with your preferred final experience: companion while exploring, immersive optional.

---

## E. Prioritized recommendation

### Keep unchanged (for now)

- Realtime WebRTC transport + Express mint/tool proxy.
- Four park tools + short spoken answer style.
- Startup silence policy (fix drift; don’t invent a new greeting).
- Guest 3/24h + hourly caps (review numbers vs docs).

### Small improvements (Phase 1 — UI + session chrome)

1. Compact launcher + expandable dock; immersive optional.
2. Lift session owner so **minimize ≠ disconnect**; **End ≠ Minimize**.
3. Persistent mic-active indicator whenever capture is live.
4. Fix FAB/overlay z-index and pointer-events.
5. A11y: focus trap, `aria-live`, reduced-motion, safe-area, ≥44px controls.
6. Clear permission/error Retry UX.
7. Soften/remove seasonal context from mint if it fuels weather greetings; keep calendar date if useful.
8. Refresh stale voice docs (`interrupt_response`, rate limits, model names).
9. Align Features/FAQ copy with real browse-while-talk behavior **after** dock ships.

### Significant upgrades (Phase 2 — evaluate)

- Enable Realtime barge-in (`interrupt_response: true`) carefully vs echo.
- Audio-reactive waveform (`AnalyserNode`) with reduced-motion fallback.
- Align voice policy with critical text-Trailie constraints (geography, booking honesty).
- Auth/bind `/voice-tool` to mint session.
- Optional model bump to `gpt-realtime-2.1` after quality/cost check.
- Survive soft navigation with clear route policy (end vs continue on `/plan-ai`).

### Optional future

- GPT-Live + client/Responses delegation so Trailie can talk during park lookups.
- Park cards / map highlights driven by voice tool results while docked.
- Draggable edge-snapping dock (after stable non-draggable dock).
- Voice ↔ `/plan-ai` handoff for saved trips (today intentionally separate).

### Avoid

- Copying ChatGPT’s proprietary UI, voices, or internal instructions.
- Migrating to GPT-Live **only** to get a compact dock.
- Hidden background listening without a clear persistent indicator.
- Automatic spoken weather/location greetings without evidence.
- Leaving duration-billed sessions open indefinitely while users browse.

---

## F. Proposed implementation plan (no work started)

### Recommended sequence

1. **Product lock:** Dock as default; immersive optional; End vs Minimize semantics; route policy.
2. **Session refactor:** `VoiceSessionProvider` (or lift hook to `VoiceButton`) with UI modes `closed | docked | immersive`.
3. **UI:** Compact launcher → dock card/sheet → expand immersive; status + End/Mute/Minimize/Expand.
4. **Hardening:** z-index, a11y, reduced-motion, safe-area, idle timeout while docked.
5. **Prompt/docs hygiene:** greeting drift, stale docs, marketing accuracy.
6. **Eval suite** (below) on Chrome/Safari desktop + iOS Safari/Android Chrome.
7. **Optional spike:** GPT-Live cost/latency vs Realtime for “speak during tools.”

### Files likely to change (when implementation is approved)

- `VoiceButton.jsx`, `VoiceOverlay.jsx`, new dock component(s), possibly `VoiceSessionContext`
- `useRealtimeVoice.js` (export status; optional analyser; do not couple to chrome)
- `globals.css` voice section
- Later: `ai.js` VAD flags / model string; `voicePrompt.js`; docs

### Test strategy

| Scenario | Pass criteria |
|---|---|
| Open dock, browse park page | Session stays up; page interactive |
| Minimize / Expand | Peer survives; End kills tracks |
| Mic denied | Clear copy + no silent retry loop |
| Interrupt mid-speak (if enabled) | Audio stops; new turn starts |
| Tool call (alerts/weather) | Correct tool; spoken answer after data |
| Nav to `/plan-ai` | Documented end or migrate |
| Multi-tab open | Rate limits; no zombie peers after End |
| Reduced motion | No pulsing orbs |
| Cost sanity | Approx $/min under Realtime for 3- and 5-min dock sessions |

Avoid costly production soak without authorization; use staging keys.

### Risks & rollback

| Risk | Mitigation |
|---|---|
| Hidden listening | Always-visible dock status; End distinct |
| Higher OpenAI spend from longer dock sessions | Idle timeout; analytics duration; anon caps |
| Echo if barge-in enabled | Keep mute lifecycle; staged flag |
| GPT-Live rewrite cost | Keep Realtime for Phase 1 |
| Rollback | Feature-flag dock; keep immersive path |

---

## Evidence table

| Finding | Evidence | Severity | Proposed action |
|---|---|---|---|
| Close/unmount ends WebRTC | `VoiceOverlay.jsx` connect effect + `handleClose` | Blocker for dock | Lift session; UI modes |
| No minimize today | Voice components (no minimize state) | High | Direction B |
| Full-screen intentional | `fixed inset-0` dialog | Info | Keep as Expand |
| Greeting not hardcoded; silence required | `voicePrompt.js` STARTUP RULE | Medium (drift) | Monitor; reduce season bias |
| Season string injected | `ai.js` today/season append | Low–Med | Soften |
| Barge-in off | `interrupt_response: false` + mic mute | Medium | Phase 2 flag |
| Tools block speech | `voicePrompt.js` + tool UI in hook | Medium | Keep for Phase 1; Live later |
| Docs stale on interrupt/rate | `docs/voice-chat-feature.md` vs code | Medium | Doc fix |
| FAB above overlay / pointer-events | `VoiceButton` z-9998; `globals.css` | High | Fix with dock |
| A11y gaps | No focus trap / aria-live / reduced-motion | High | Phase 1 |
| `/voice-tool` unauthenticated | `ai.js` route | Medium | Bind to session |
| GPT-Live available; duration $0.05/min | OpenAI Live model docs (2026-10-27) | Info | Spike later |
| Realtime still valid for agents | Realtime + VAD guides | Info | Keep for redesign |
| Marketing overclaims browse-while-talk | Features page vs fullscreen | Medium | Update after dock |

---

## Evaluation suite (defined; not executed in this phase)

Simple Q&A · location recommendations · alerts/closures · seasonal · multi-turn itinerary · long pauses · interrupt while speaking · interrupt during slow tool · noise · mic deny · network drop · navigate mid-call · minimize/restore · end + cleanup · Mobile Safari/Chrome · Desktop Chrome/Safari.

Measure when authorized: TTFB mic ready, time to first audio, interrupt latency, park-name ASR, tool correctness, playback failures, reconnect, cleanup, approx $/conversation, a11y.

---

## Bottom line

Trailie Voice is a **working Realtime WebRTC companion** with an **intentional full-screen call UI** tightly coupled to session teardown. Your preferred **compact expandable dock** does **not** require a GPT-Live rewrite — it requires **decoupling UI chrome from the peer connection**, plus trust/a11y fixes for minimized listening. **Speaking during park research** is a separate capability decision; today’s stack blocks it on purpose, while GPT-Live is the documented architecture for conversation/backend split — evaluate only after Phase 1 UI lands and cost is understood.

**Next step:** Review this report, lock Direction B (+ optional C), then authorize an implementation phase.
