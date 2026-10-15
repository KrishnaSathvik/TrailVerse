# Trailie — Final Conversational Travel Companion Audit

**Date:** 2026-10-14\
**Scope:** Local working tree (including uncommitted changes) as source of truth\
**Mode:** Read-only — no architecture rewrites, no feature implementation, no paid model calls authorized for this audit\
**Auditor focus:** Product experience as a U.S. travel companion, not itinerary-engine schema compliance alone

---

### A. Executive verdict

**Trailie is close to a credible U.S. travel companion on the model-first path, but not launch-complete as a general companion.**

The local implementation already does the most important thing this audit asked for: **it does not force every travel question into an itinerary.** Ordinary advice, discovery recommendations, and comparisons can complete as prose-only turns with no trip artifact. Live demo captures from 2026-10-11 show that pattern clearly (discovery and pushback turns answer first; itineraries appear only when the traveler asks to plan).

What still prevents a clean “natural companion” launch claim:

1. **Breadth beyond NPS-grade parks is thinner and largely runtime-unverified** for cities, beaches, food, and general U.S. travel (Chicago / Asheville / Florida beach town class).
2. **Trust boundaries for live/current claims, permits, booking, and international scope are soft** — mostly prompt judgment, not hard product gates.
3. **This audit did not re-run the 50 conversational scenarios live** (paid calls avoided by charter). Conversational quality for the Chicago-in-December class of question is **code- and fixture-supported, not freshly runtime-verified**.
4. **Planning latency** remains a traveler experience risk (~60–100s observed on multi-park planning turns in recent live readiness work).

**Bottom line:** Trailie already behaves more like a companion *architecturally* than like a disguised itinerary form. The remaining gap is **traveler-trust and breadth**, not “add another classifier.”

---

### B. Current architecture

#### Production default

| Item | Current local truth |
|------|---------------------|
| Runtime | `TRAILIE_RUNTIME` unset → **`model_first`** (`server/src/config/trailieRuntimeSelection.js`) |
| Chat routes | `/api/ai/chat`, `/chat-stream`, `/chat-anonymous`, `/chat-anonymous-stream`, `/plan-itinerary` all terminate in `modelFirstTrailie.handle` |
| Legacy stack | Still present in `ai.js` + `trailieIntentClassifier` / V2 execution — **rollback only** |
| Primary model | Fixed **`openai` / `gpt-6.1-sol` / `reasoningEffort: 'low'`** (`trailieSimpleModel.js`) |
| Luna/Sol/Astra router | Exists for legacy/helpers — **not wired into live model-first chat** |

#### Request lifecycle (verified)

```
TripPlannerChat (plan-ai)
  → aiService.chatStream / chatAnonymousStream (SSE)
  → createModelFirstRouter().handle
  → guest quota OR auth + token limit
  → createSimpleRuntime (≤3 model calls, ≤1 read_travel, ≤1 correction)
       ├─ answer prose (no tool)
       ├─ read_travel → evidence broker / providers
       └─ propose_trip_update → finalizeProposal → validateSimpleMutation → store.commit
  → TrailieResponse → TrailieMarkdown / TrailieRichTrip / TrailieComparison / logistics lists
  → full day/map UI only after Open trip → PlanWorkspace
```

#### Key source files

| Layer | Files |
|-------|-------|
| UI entry | `next-frontend/src/app/plan-ai/*`, `components/plan-ai/TripPlannerChat.jsx` |
| Client API | `next-frontend/src/services/aiService.js` |
| Route | `server/src/routes/modelFirstTrailie.js`, mount in `routes/ai.js` |
| Runtime | `server/src/services/trailieSimpleRuntime.js` |
| Policy | `server/src/prompts/trailieModelFirstPolicy.js` |
| Tools | `trailieTravelData.js` (`read_travel`), `trailieSimpleGuard.js` (`propose_trip_update`) |
| Persist | `trailieSimpleStore.js`, `trailieSimpleGuestStore.js`, `trailieCanonicalCommit.js` |
| Render | `TrailieResponse.jsx`, `trailieResponseModel.js`, `normalizeTrailiePresentation.js` |
| Voice (separate) | Realtime session in `ai.js` — **not** the model-first tool loop |
| MCP | `mcp-server` → `POST /api/ai/plan-itinerary` (same handle) |

#### Intent routing reality

**Model-first has no deterministic intent classifier.** The model chooses among: answer now / one `read_travel` / `propose_trip_update`, guided by `TRAILIE_TRAVEL_POLICY`.

Legacy classifier (`classifyTrailieIntent`) remains useful as a **diagnostic lens** and for tests/fixtures, but it is **not** what production chat executes when `model_first` is selected.

Policy excerpts that directly address the companion question:

- “Answer the actual question first…”
- “Ordinary recommendations and factual answers do not require a trip artifact.”
- “Be concise for simple questions… Stop when you have answered.”
- “Never invent a current opening, permit availability, safe condition, verified route or price.”

#### Guest vs authenticated

| | Guest | Authenticated |
|--|-------|---------------|
| Limit | **5** completed turns / 48h (`anonymousChatLimits.js`) | Token-limit middleware |
| Trip save | Guest ledger; no durable TripPlan ownership like auth | `TripPlan` CAS commit |
| Research depth | Same tool surface; product docs historically limited guest web — **verify claims against model-first**, older capability doc is dated 2026-08-27 and partially stale |

#### Geographic scope

- Soft: persona is “U.S. travel companion.”
- Hard for map pins: named-place provider rejects non-`US` (`country_mismatch`).
- **No hard chat refusal** for Tokyo-class asks on model-first (unlike legacy architect prompt’s strict refusal script).

---

### C. Capability matrix

Statuses: **Implemented** · **Partial** · **Missing** · **Unverified** (code exists but companion quality not runtime-proven in this audit)

| Question type | Status | Evidence |
|---------------|--------|----------|
| General travel knowledge | **Partial / Unverified** | Policy + classifier → `plain_answer`; no fresh live Q&A capture for Maine/Chicago winter class |
| Practical travel advice | **Partial** | Policy strong; demo pushback (“Can you? Yes. Would I recommend it? Not…”) shows judgment |
| Destination discovery | **Partial** | Demo discovery chose Shenandoah with tradeoffs; curated-card UI **missing** (`recommendation_list` not rendered) |
| Place-specific questions | **Partial** | NPS path strong; city/non-NPS thinner (`known_place` / web topics) |
| Comparisons | **Partial** | UI supports `TrailieComparison` + markdown tables; legacy classifier sometimes misses “A or B in October” as compare |
| Routes / road trips | **Partial** | Drive times tool-owned when verified; unverified legs allowed; `flight_strategy: []` empty |
| Itinerary planning | **Implemented** (NPS-strong) | Demo + Zion/Bryce live readiness: accepted grounded plans |
| Itinerary modifications | **Implemented** (scope-preserving) | Frozen untouched days; glacier Day-3-only edit in demo |
| Current conditions | **Partial** | Topics exist (`weather_*`, `alerts_closures`); weather **not** default in finalize research; answer-only factual errors possible |
| Follow-up conversation | **Partial** | History ≤40 msgs / ~24k; memory quotes traveler words; topic-switch (“forget the itinerary…”) relies on model, not a hard mode switch |
| Booking / guarantees | **Missing** (correctly) | No booking engine; model-first policy lacks an explicit “I can’t book / guarantee tables” line |
| International travel | **Partial / risk** | Soft deflection expected; classifier would mark Tokyo as itinerary-required on legacy; model-first not hard-gated |
| Maps in chat for non-itinerary | **Missing / by design** | Maps live in trip workspace after Open trip |
| Photos / place cards for discovery | **Partial** | RichTrip imagery for itineraries; discovery is mostly markdown |
| Source / freshness UI badges | **Missing** | Flags plumbed; intentionally not shown in typing/assistant UI |

---

### D. Conversational quality

#### Strengths (evidence-backed)

1. **Answer-first policy is real, not aspirational.** Model-first instructions and demo captures both show short advisory turns without inventing a trip.
2. **Opinionated companion voice works when it works.** Discovery demo: “I’d go to Shenandoah… ideally midweek in mid-October.” Realistic demo: honest pushback on packing too much driving into three days.
3. **Anti-upsell / anti-footer language is encoded.** Policies ban generic “want me to dig deeper?” endings and marketing fluff (`trailieModelFirstPolicy.js`, legacy `coreTrailiePolicy.js` / V2 contracts).
4. **Length adaptation is instructed.** Simple vs planning length rules exist in both model-first and V2 buddy contracts.
5. **Itinerary chat prose is deliberately slim.** After a successful plan, policy tells the model to confirm day purposes — not paste a second stop-by-stop itinerary into chat.

#### Weaknesses / risks

1. **Companion quality is LLM-dependent with one correction only.** There is no separate buddy/compare/architect mode on the live path — one Sol model + tools.
2. **Legacy intent classifier is a poor mirror of production** and has odd failures if used as a product oracle (e.g. “Plan Chicago without a car” → `transport`; “Book the hotel” → `permit_camping`; “Acadia or Shenandoah in October” → `general_qa` not `compare`). **Do not add a new classifier call** to “fix” this — production already abandoned that approach for good reasons.
3. **Discovery UI under-delivers vs backend presentation model.** `recommendation_list` / supporting modules exist in the presentation schema but are not rendered; travelers get markdown walls for “best places…” asks.
4. **Answer-only factual drift** is a documented live failure mode (Zion/Bryce readiness: wrong winter time-zone qualification in prose with no `read_travel` and no mutation for the guard to catch).
5. **Ambiguous / slangy follow-ups** (“thinking about Maine idk”, “what about the other one?”) are entirely model-judgment + history; no dedicated continuity harness for those 50 cases was executed here.

#### The flagship test (Chicago in December)

| Layer | Result |
|-------|--------|
| Legacy classifier | `general_qa` / `plain_answer` / `structurePolicy: optional` |
| Model-first policy | Ordinary Q&A → **no trip artifact required** |
| Expected UX | Short seasonal advice in `TrailieMarkdown` — **not** RichTrip itinerary chrome |
| Runtime verified this audit? | **No** (no paid call) — **code-inspected, not runtime-verified** |

Confidence that the *system will not force an itinerary* is **high**. Confidence that the *answer will be excellent* is **medium** pending a cheap live smoke.

---

### E. UI and rendering audit

Screenshots: **not captured in this pass** (frontend not confirmed listening on :3000; Pass 3B offline screenshots are private under `artifacts/private/`). UI conclusions are from source + prior harness docs.

| Response type | What the user actually sees |
|---------------|-----------------------------|
| Simple advice / Q&A | `TrailieResponse` → markdown prose. No itinerary card. |
| Discovery | Markdown prose. Optional “Want a day-by-day plan?” CTA is **frontend-ready**, but **`showDayByDayPlanCta` is not set anywhere under `server/`** — likely inactive on model-first. |
| Comparison | Structured `TrailieComparison` **if** presentation kind/artifacts set; else GFM table in markdown. |
| Itinerary | Chat: slim `TrailieRichTrip` (“Trip created/updated”, day purposes, Open trip). Full stops/map: workspace after Open trip. |
| Streaming | Content after commit on model-first; optional draft preview behind flag; typing indicator without source badges. |
| Errors | Failure/uncertain tones; Retry when allowed; save_failed banner; trip unchanged messaging. |
| Follow-up chips | Automatic followups **explicitly stripped** in normalize (`followups: []`). Adjust chips only for current trip personalization. |

**Mismatch summary:** Backend presentation kinds exceed what chat renders. That is fine for itineraries (workspace owns depth); it hurts discovery/place recommendation UX relative to ChatGPT Intelligent UI style curated blocks.

**Mobile:** Chat is single-column; comparison stacks on small screens; day map sidebar is desktop-oriented in workspace.

---

### F. Itinerary quality

#### What validation actually guarantees

`validateSimpleMutation` catches meaningful **structural and evidence-bound** problems: schema, frozen-day preservation, stop↔evidence binding, official closures on bound stops, model-authored drive minutes, daily drive caps when set, day-type block requirements, clock overlap with verified transfers.

#### What it does **not** guarantee

- Enjoyable pacing / “relaxed” trips (soft fitness/pace gates **explicitly removed**)
- Permit disclosure as a hard reject (permits become caveats; closures reject)
- Weather-aware redesign (weather topics optional; finalize auto-research is `activities` + `alerts_closures` only)
- That unverified long transfers are traveler-realistic
- City itinerary “soul” equivalent to NPS outing inventories

#### Observed plan quality (prior live/demo evidence, not re-run)

| Evidence | Outcome |
|----------|---------|
| Demo recapture 2026-10-11 | Five stories accepted; grounded stops; targeted refinements preserved other days |
| Zion+Bryce live readiness 2026-10-13 | Materially better multi-park shape; **Hold** on release due to latency + one factual prose error + no browser visual gate |

**Revisions:** Scope preservation is a genuine strength when patches are used; UI `editScope` can further constrain. Without edit scope, the model can still name any days — mechanical freeze applies to untouched days only.

---

### G. Test evidence (50-scenario suite)

**Method this audit:**

1. Code path inspection of model-first runtime/policy/UI\
2. Offline legacy `classifyTrailieIntent({ userPrompt })` diagnostic for each prompt\
3. Reuse of demo captures + recent readiness audits\
4. **No new paid Sol calls**

Stage 13 synthetic pipeline that once executed 50 scenarios is **retired**. Offline harnesses cover disconnect, quota, draft preview plumbing, and intent gating — not companion answer quality.

#### Results table

Legend: **CI** = code-inspected · **FX** = fixture/demo evidence · **LV** = prior live capture · **NT** = not tested live this audit

| # | Prompt (abbrev.) | Legacy intent (diagnostic) | Model-first expected route | UI expected | Verdict |
|---|------------------|----------------------------|----------------------------|-------------|---------|
| 1 | October Maine? | general_qa | prose ± weather research | markdown | **Partial / NT** |
| 2 | NP vs state park | general_qa | prose | markdown | **Partial / NT** |
| 3 | Car in Chicago? | general_qa | prose ± transit topics | markdown | **Partial / NT** |
| 4 | Rent RV? | transport | prose | markdown | **Partial / NT** |
| 5 | Book campsites early? | permit_camping | prose ± permits | markdown | **Partial / NT** |
| 6 | Peaceful weekend | general_qa | discovery prose (policy) | markdown | **Partial / NT** |
| 7 | Stargazing US | general_qa | discovery prose ± astronomy | markdown | **Partial / NT** |
| 8 | Fall colors quiet | general_qa | discovery prose | markdown | **Partial / NT** |
| 9 | Florida beach town | general_qa | city prose (thin grounding) | markdown | **Partial / NT** |
| 10 | ≤3h from Chicago | general_qa | discovery prose | markdown | **Partial / NT** |
| 11 | Seattle rain day | place_discovery | place prose | markdown | **Partial / NT** |
| 12 | SF stay no car | lodging_strategy | lodging prose | markdown / ranked if logistics | **Partial / NT** |
| 13 | Boston kids | place_discovery | place prose | markdown | **Partial / NT** |
| 14 | Sedona beyond famous | general_qa | place prose ± NPS/web | markdown | **Partial / NT** |
| 15 | DC afternoon | general_qa | place prose | markdown | **Partial / NT** |
| 16 | Acadia or Shenandoah Oct | general_qa (!compare) | compare prose (policy “when asked to choose, choose”) | markdown / comparison | **Partial / NT** |
| 17 | SD vs Santa Barbara | general_qa | compare prose | markdown | **Partial / NT** |
| 18 | NOLA 2 vs 3 days | general_qa (duration_advice) | duration advice | markdown | **Partial / NT** |
| 19 | Fly vs drive CHI→BNA | transport | transport prose | markdown | **Partial / NT** |
| 20 | Yellowstone vs Glacier | compare | compare | comparison possible | **Partial / FX** (park compare familiar) |
| 21 | Plan 3-day Chicago no car | transport (!itinerary) | likely propose_trip_update if model treats as plan | RichTrip if accepted | **Partial / NT** — city depth risk |
| 22 | 5-day CA coast | full_trip | propose_trip_update | RichTrip + workspace | **Partial / NT** |
| 23 | Weekend Asheville | general_qa (ambiguous) | model may clarify or plan | markdown or RichTrip | **Partial / NT** |
| 24 | 4 days DC elderly | full_trip | propose_trip_update | RichTrip | **Partial / NT** |
| 25 | 6 days Arizona mix | full_trip | propose_trip_update | RichTrip | **Partial / NT** |
| 26 | Day 2 less exhausting | trip_refinement | plan_patch | RichTrip updated | **Pass / LV** (glacier-like) |
| 27 | If it rains afternoon | general_qa | prose advice; may patch | markdown | **Partial / NT** |
| 28 | Avoid expensive restaurants | trip_refinement | plan_patch / memory | RichTrip | **Partial / NT** |
| 29 | Bringing a dog | general_qa | memory + pet_policy research | markdown or patch | **Partial / NT** |
| 30 | What for last day? | general_qa | prose from saved trip | markdown | **Partial / NT** |
| 31 | Skip if late | trip_refinement | advice or patch | markdown / RichTrip | **Partial / NT** |
| 32 | Forget itinerary — night driving safe? | transport | prose (topic switch) | markdown | **Partial / NT** — continuity key |
| 33 | Change hotel area | trip_refinement | plan_patch | RichTrip | **Partial / NT** |
| 34–40 | Ambiguous slang | mostly general_qa | model + history | markdown | **Unverified / NT** |
| 41 | Weekend Kansas City | simple_itinerary | propose_trip_update | RichTrip | **Partial / NT** — city |
| 42 | Rural Missouri | place_discovery | prose | markdown | **Partial / NT** |
| 43 | Interesting Nebraska? | general_qa | prose | markdown | **Partial / NT** |
| 44 | Plan Tokyo | simple_itinerary | **soft US policy**; may still attempt | risk | **Fail risk / CI** — no hard US gate |
| 45 | TX→CO road trip | transport | prose or plan | markdown / RichTrip | **Partial / NT** |
| 46 | Acadia weather now | general_qa + live | should `read_travel` weather | markdown | **Partial / CI** |
| 47 | Road currently closed? | live_in_trip_assistance | should research alerts/roads | markdown | **Partial / CI** |
| 48 | Guarantee restaurant tables | local_business_food | should refuse guarantee | markdown | **Partial / CI** — policy soft |
| 49 | Exact trip cost | general_qa | uncertainty | markdown | **Partial / CI** |
| 50 | Book the hotel | permit_camping (wrong class) | should refuse booking | markdown | **Partial / CI** — explicit refusal not in model-first policy |

**Counts:** Pass (prior live) ≈ 1–3 · Partial/code-inspected ≈ 40+ · Fail-risk ≈ 1–2 (Tokyo scope, booking/guarantee honesty) · Runtime-verified this audit ≈ 0 new paid turns.

---

### H. Competitor comparison

#### ChatGPT (documented / secondary sources — **not directly tested in this session**)

| Dimension | ChatGPT (documented) | Trailie (local code + captures) | Confidence |
|-----------|----------------------|---------------------------------|------------|
| Natural conversation | Strong general LLM; Intelligent UI adds interactive blocks (maps, charts) per Oct 2026 reporting | Strong policy for answer-first; UI mostly markdown + trip chrome | Med (ChatGPT docs) / High (Trailie code) |
| Response length adaptation | Generally good | Instructed; demo shows concise advisory turns | Med / High |
| Destination recommendations | Broad world knowledge + optional apps | U.S. companion; NPS-deep; cities thinner | High gap on breadth |
| Travel data grounding | Web search + apps; variable accuracy | Evidence broker + guard on mutations; answer-only prose can drift | High for Trailie mutation path |
| Maps / visuals | Intelligent UI can embed maps in-chat | Maps in workspace after save; chat itinerary is summary card | High |
| Itinerary usefulness | Often text itineraries; editing varies | Canonical TripPlan + patch + map/PDF/share | High Trailie advantage for **saved** trips |
| Iterative editing | Conversational rewrite | Targeted `plan_patch` with frozen days | High Trailie advantage |
| Memory | Chat history | Trip + planningState memory with quote authority | High |
| Booking | Expanding app integrations (reported) | Explicitly not a booking engine | High |
| Speed | Often faster for simple Q&A | Simple Q&A should be 1 model call; planning can be 60–100s+ | High latency concern for Trailie planning |

**Useful lesson (agree with brief):** different questions deserve different response shapes — Trailie’s **backend** already mostly agrees; Trailie’s **chat UI** still under-specializes discovery/compare vs itinerary.

#### Previ

**Not identifiable** in this repository (no product references). Public web search for “Previ” as a travel companion did not surface a clear comparable product with confidence. Treat Previ comparison as **unavailable / unverified** — do not invent parity claims.

---

### I. Findings

#### P0 — launch blockers (for “general U.S. travel companion” claim)

| ID | Finding | Evidence | Impact | Direction (do not implement here) |
|----|---------|----------|--------|-----------------------------------|
| P0-1 | **International / non-US scope is soft** | Policy persona only; no guard refuse; Tokyo classifies as itinerary on legacy | Traveler may get an unsupported plan attempt | Hard product boundary: refuse international planning naturally; allow brief “out of scope” |
| P0-2 | **Answer-only factual claims bypass the guard** | Zion readiness: wrong TZ prose, no research, no mutation | Trust damage on “current / practical” advice | Bound high-risk factual claims to research or explicit uncertainty templates |
| P0-3 | **Companion breadth for cities unverified** | City path uses thinner providers; 50-suite not live-run | Risk of launching as “U.S. companion” while still NPS-first in practice | Cheap live smoke: Chicago Q&A + Chicago 3-day + beach town; gate on usefulness |

*Note: If product claim is narrowed to “NPS-first outdoor trip companion,” P0-3 demotes to P1 and P0-1 remains.*

#### P1 — important improvements

| ID | Finding | Evidence | Impact | Direction |
|----|---------|----------|--------|-----------|
| P1-1 | Planning latency (often >45–60s, multi-park ~100s) | Zion readiness timing tables | Feels broken even when quality is good | Latency budget + progressive draft only if it doesn’t imply acceptance |
| P1-2 | Weather/permits not defaulted on finalize research | `finalizeProposal` topics `activities`,`alerts_closures` only | Seasonal/permit trips can accept without conditions | Topic defaults for date-sensitive parks — carefully, cost-aware |
| P1-3 | Discovery/recommendation UI under-renders | `recommendation_list` unused; Discovery CTA flag unset in server | Companion feels like a blog when recommending places | Render a **small** curated list when backend already has structure — not ChatGPT parity |
| P1-4 | Explicit booking / guarantee refusal missing in model-first policy | Policy never invents price; no “I can’t book” line | Overclaim risk on “book/guarantee” prompts | One policy sentence + eval fixture |
| P1-5 | Unverified drive legs silently OK | Guard allows unverified edges without daily cap | Unrealistic road trips | Surface uncertainty in traveler prose / soft checks |
| P1-6 | Stale capability docs | `TRAILIE-CAPABILITIES-ACCURACY.md` dated 2026-08-27, pre–model-first defaults | Marketing/agent drift | Refresh against model-first before launch copy |

#### P2 — post-launch

| ID | Finding | Direction |
|----|---------|-----------|
| P2-1 | Source/freshness badges removed from UI | Optional subtle “based on park alerts” when live topics used |
| P2-2 | Voice path separate from model-first tools | Unify later if voice is a launch surface |
| P2-3 | Legacy classifier oddities | Leave dormant; do not revive as a paid routing hop |
| P2-4 | Automatic follow-up chips disabled | Keep off unless highly contextual |
| P2-5 | Rebuild Stage 13 offline conversational harness | For regression without Sol spend |

---

### J. What should remain unchanged

1. **Model-first single-loop design** (answer / one research / propose) — correct for companion behavior; do not reintroduce mandatory intent classifiers on the hot path.\
2. **Canonical TripPlan ownership** of day timelines — chat explains; artifact saves.\
3. **Frozen-day / patch revision model** — genuine companion editing strength.\
4. **Place grounding + closure hard fails** — trust backbone for parks.\
5. **Anti-itinerary-forcing policies** and discard of unsolicited itinerary JSON on legacy.\
6. **Opinionated “choose when asked to choose”** voice.\
7. **Guest 5/48h funnel** as product strategy (operational, not a quality bug).\
8. **Workspace maps after Open trip** rather than forcing maps into every Q&A.\
9. **Fixed Sol 6.1 low for chat** pending a measured deficiency — recent cost audits already argued against stack sprawl.

---

### K. Final recommendation

## **2. Ready after targeted fixes**

Not “ready to launch” as a **general U.S. travel companion** without a short verification + trust pass.\
Not “needs substantial work” — the companion-vs-itinerary-engine architectural question is largely **already answered correctly** in local model-first code.

### Minimum path to launch

**Decide the launch claim first:**

- **Claim A — NPS-first outdoor companion with city Q&A:** smaller gate.\
- **Claim B — general U.S. travel companion:** requires city/beach/food smokes.

**Then do only this:**

1. **Cheap live smoke (≤10 paid turns):**\
   - “Is Chicago worth visiting in December?”\
   - “Should I visit Acadia or Shenandoah in October?”\
   - “Plan a three-day Chicago trip without a car.”\
   - “Help me plan a trip to Tokyo.”\
   - “Book the hotel for me.” / “Can you guarantee tables tonight?”\
   - One ambiguous continuity chain after a saved plan (items 32–33).\
2. **Ship only if:** no forced itinerary on Q&A; Tokyo refused cleanly; booking/guarantee refused cleanly; Chicago plan is usable or honestly limited.\
3. **Fix only failures from that smoke** (likely: US-scope refusal wording, booking refusal sentence, any itinerary-force regression).\
4. **Do not** rebuild routers, add a classifier hop, or chase ChatGPT Intelligent UI parity before launch.\
5. Treat **planning latency** as a known P1 with transparent progress UX, not a reason to redesign the brain.

### Weighted scorecard (qualitative — this audit’s judgment, not a measured rubric)

| Dimension | Weight | Score (0–5) | Notes |
|-----------|--------|-------------|-------|
| Natural conversation | 25% | **3.5** | Architecture yes; breadth/runtime unverified |
| Travel accuracy / usefulness | 25% | **3.0** | Strong on NPS mutations; answer-only & cities weaker |
| Itinerary quality | 20% | **3.5** | Schema+grounding good; pacing enjoyment soft |
| UI / interaction | 15% | **3.0** | Excellent trip workspace; thin discovery chrome |
| Context / follow-ups | 10% | **3.5** | Patch memory strong; slang continuity untested |
| Reliability | 5% | **3.0** | Disconnect/quota solid; latency hurts |

**Weighted ≈ 3.3 / 5** → aligns with **ready after targeted fixes**, not ship-as-general-companion today.

---

### Appendix — Audit constraints honored

- Read-only; no application code changes as part of the audit deliverable\
- Local working tree inspected (including uncommitted model-first / pricing / preview work)\
- No fabricated competitor tests; Previ unavailable\
- No park-only bias in the scenario matrix (cities, beaches, road trips, Tokyo included)\
- Schema validity not treated as travel enjoyment\
- Paid model calls avoided; outcomes labeled **code-inspected / fixture / prior-live** accordingly\

**Primary deliverable path:** `docs/audits/TRAILIE_FINAL_TRAVEL_COMPANION_AUDIT.md`
