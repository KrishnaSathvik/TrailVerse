# Trailie capabilities — public vs internal accuracy

**Purpose:** Keep marketing, demos, and agent handbooks aligned with what the codebase actually does.
**Related:** [trailie-web-search-product-policy.md](./trailie-web-search-product-policy.md) (web search gates in detail)

Last reviewed: 2026-10-17 (local candidate; not deployed)

Evidence: [release baseline](releases/trailie-release-preparation-2026-10-15.md). Captured examples establish observed behavior, not universal guarantees.

---

## Safe public one-liner

Use on `/plan-ai`, `/chatgpt`, press, App Directory:

> **Trailie** on TrailVerse is an **NPS-first U.S. outdoor travel companion** — deep live data for **470+ NPS parks and sites**, plus broader U.S. travel advice, recommendations, and day-by-day itineraries where grounding allows. Compare destinations, adjust plans, and factor in permits, closures, weather, and crowds when TrailVerse has them.

Shorter:

> **Trailie** — U.S. outdoor trip companion. NPS-first data; plan day by day; refine as dates, fitness, or lodging change.

---

## Internal one-liner (engineering / sales)

Trailie production chat defaults to **`model_first`**: a single OpenAI **`gpt-6.1-sol`** (low reasoning) loop with at most one `read_travel`, one `propose_trip_update`, and one correction. Canonical `TripPlan` persistence, evidence-grounded places/routes, and mutation guards are code-enforced. Ordinary Q&A does **not** require a trip artifact. Answer quality still depends on the model following policy.

Legacy Luna/Sol/Astra routing and intent classifiers remain in-repo for **rollback only** (`TRAILIE_RUNTIME=legacy`).

---

## Production runtime (current)

| Item | Current truth |
|------|----------------|
| Default runtime | `TRAILIE_RUNTIME` unset → `model_first` |
| Chat routes | `/api/ai/chat`, `/chat-stream`, `/chat-anonymous`, `/chat-anonymous-stream`, `/plan-itinerary` |
| Model | Fixed `openai` / `gpt-6.1-sol` / `reasoningEffort: 'low'` |
| Tools | `read_travel` (≤1), `propose_trip_update` (create or patch) |
| Caps | ≤3 model calls, ≤1 research, ≤1 correction per turn |
| Policy | `server/src/prompts/trailieModelFirstPolicy.js` |
| Guard | `server/src/services/trailieSimpleGuard.js` + `usPlanGeography.js` |

---

## Geographic scope

| Layer | Behavior |
|-------|----------|
| Product claim | U.S. travel companion (including U.S. territories in policy text) |
| Named-place grounding | Provider admits U.S. jurisdictions **US, PR, VI, GU, AS, MP** from structured country evidence; foreign candidates cannot become accepted domestic stops |
| Mutation guard | Rejects confirmed foreign stops; rejects plans with **no** U.S.-grounded stops **and** no U.S. `destination_identity` (closes experience-only international saves) |
| Conversation | May discuss international places for comparison/context; must not create or imply a supported non-U.S. trip artifact |
| Not guaranteed | Soft conversational refusals still depend on the model; two separate Tokyo refusals were recorded on 2026-10-14, plus the later polish smoke |

---

## NPS vs general U.S. places

| Surface | Strength |
|---------|----------|
| NPS parks/sites | Strong — catalog identity, activities, alerts, operational facts |
| Named U.S. places (cities, towns, attractions) | Supported via named-place / web topics when resolved; thinner than NPS |
| State parks / non-NPS outdoors | Possible when research resolves places; not a structured agency catalog |
| Pinless `experience` blocks | Allowed on U.S.-anchored trips; do not alone establish foreign geography |

---

## What the code guarantees vs what prompts ask for

| Layer | Guaranteed by code | Depends on LLM behavior |
|--------|-------------------|------------------------|
| Model-first route termination | Yes | — |
| Place grounding + closure hard-fails | Yes (when bound to evidence) | Model must request/propose places |
| U.S. geography mutation rule | Yes | Soft conversational refusal |
| Frozen-day patch preservation | Yes | Model must use `plan_patch` |
| `reservation_required` → `operationalCaveats` | Yes when facts are on bound evidence | Model prose may still omit permit wording |
| Answer-first / no forced itinerary | Policy + no classifier force | Model must not call `propose_trip_update` unsolicited |
| Booking / inventory refusal | Policy text only | Hotel-booking and restaurant-guarantee refusals captured separately; not an unconditional model guarantee |
| Weather/permits on every plan | No — optional `read_travel` topics | Model chooses topics |

**Do not claim:** “Trailie always returns X,” “always uses live web,” or “always refuses booking” without a live verification artifact.

---

## Account tiers (website `/plan-ai`)

| Capability | Guest (anonymous) | Logged in |
|------------|-------------------|-----------|
| Chat with Trailie | Yes (**5** completed turns / **48h**) | Yes — no daily token or message cap. Fair use: 30 turns / 15 min burst window, one active reply per trip and two per account ([trailie-fair-use-safeguards.md](trailie-fair-use-safeguards.md)); app-level request rate limit and per-request guards still apply; spend/token alerts are observability only |
| NPS + weather / research topics | Yes (model-first `read_travel`) | Yes |
| Save durable TripPlan | Guest ledger / session — limited | Yes — Mongo `TripPlan` |
| Share / PDF / map workspace | Limited / gated | Yes after save |
| Voice (Talk to Trailie) | Separate Realtime path; session caps apply | Separate Realtime path |

Guests are unsuitable for long continuity smoke sequences (5-turn ceiling).

---

## Itinerary create and modify

- **Create:** `propose_trip_update` with `plan` when no accepted trip exists.
- **Modify:** `plan_patch` on accepted trips; untouched days frozen byte-for-byte.
- **Chat:** Explains shape; does not paste a second stop-by-day timeline.
- **Maps:** Full map UI after Open trip → workspace — not required on every Q&A bubble.

---

## Booking limitations

The local contextual-link extension supports optional exact resource research for hotels, campgrounds, permits, shuttles, rental cars, restaurants, attractions and tours. It reuses the existing bounded research phase; normal itineraries do not automatically trigger booking searches. Prefer provider-returned URLs, then successfully extracted pages matching the resource name and destination. RIDB fallback also checks the discovered Recreation.gov URL against the known resource ID and category; it never manufactures URLs from IDs.

Links remain in canonical narrative guidance and the existing Things to Know rendering, or in conversational booking-help replies. A listing page is distinct from a reservation page; neither establishes date-specific inventory. Extraction failures and identity mismatches remain unresolved. Offline evidence: [contextual travel links](audits/trailie-contextual-travel-links-2026-10-17.md). A subsequent [provider-only live check](audits/trailie-link-live-acceptance-2026-10-17.md) verified campground and one exact hotel link, but broad hotel discovery returned no usable results. No live model acceptance run was made for this extension.

Trailie **cannot** book, reserve, hold, purchase, or guarantee travel services, and **cannot** check live booking inventory unless a connected tool actually returns that data (none do for hotels/restaurants today).

Policy instructs plain refusal + pointer to official/booking sources **without inventing links**, and **not** to add booking disclaimers to unrelated answers.

Offline tests prove the instruction is present in the active prompt. Separate live captures show a hotel-booking refusal (2026-10-14) and restaurant-guarantee refusal (2026-10-15); neither created an itinerary or accepted a mutation. These are observed examples, not a guarantee for every wording.

---

## UI features (optional / removed)

| Feature | Status |
|---------|--------|
| Discovery “Want a day-by-day plan?” CTA (`showDayByDayPlanCta`) | **Removed** (unused on model-first; dead wiring cleared 2026-10-14) |
| Draft preview while generating | Optional / flag-gated (`TRAILIE_DRAFT_PREVIEW`) |
| Automatic follow-up chips | Intentionally not shown |
| Source/freshness badges in typing UI | Not shown |
| Recommendation card chrome | Presentation kinds exist; chat mainly renders markdown + itinerary RichTrip + comparison/logistics lists |

---

## Voice

**Talk to Trailie** uses OpenAI Realtime + separate voice tools. It is **not** the model-first `read_travel` / `propose_trip_update` loop. Do not equate voice capability claims with `/plan-ai` chat.

---

## Known limitations / unverified

1. Five three-turn demo conversations passed local capture; Tokyo and booking refusals have separate recordings. Production and streaming transport readiness are not established by the demo.
2. Planning latency can exceed 45–60s on multi-park turns (prior live readiness).
3. Answer-only factual claims are not guard-validated (no mutation → no geography/closure check).
4. Pace/fitness are memory fields, not hard itinerary quality gates.
5. Capability docs prior to 2026-10-14 described legacy stacks; treat this file as current.

---

## Marketing copy checklist

Before publishing capability claims, verify:

- [ ] Say **NPS-first U.S. companion** (not “worldwide travel agent”).
- [ ] Say **when live data is available** — not “always real-time”.
- [ ] Do **not** claim booking, reservations, or guaranteed availability.
- [ ] Do **not** claim international itinerary planning.
- [ ] ChatGPT/MCP apps share model-first `/plan-itinerary` / anonymous limits — not full logged-in workspace.
- [ ] Voice ≠ model-first chat.

---

## Demo prompts that match current code

Reliable demos (still LLM-dependent):

- Seasonal Q&A (“Is Yosemite good in October?”) — expect prose, no itinerary.
- Compare two NPS parks and pick one.
- 3–5 day NPS itinerary, then targeted day edit.
- Honest pushback on overpacked driving days.

Chicago city Q&A, a grounded car-free itinerary, and a scoped museum-day patch are captured in the current demo. Tokyo and booking/guarantee refusals are recorded separately in the release baseline; they are not among the five public demo conversations.
