# Trailie Architecture (locked)

**Status:** constitution — review Trailie changes against this document.  
**Related contracts:** [trailie-day-shape-contract.md](./trailie-day-shape-contract.md), audit [`artifacts/trailie-architecture-lock-2026-10-11/REPORT.md`](../artifacts/trailie-architecture-lock-2026-10-11/REPORT.md).

No future bug fix should violate the governing statements below just to make a test, Demo, Sample, or MCP host pass.

---

## Governing statements

1. **Trailie thinks and talks like a knowledgeable travel companion. Deterministic systems own truth, state, safety, provenance, and spatial precision.**

2. **The map is a verified spatial projection of the trip — not the trip itself.**

Only one component in the product makes travel judgments: **Trailie**. Everything else retrieves evidence, verifies truth, stores state, or renders what Trailie decided.

---

## One brain, many projections

```text
                    TRAILIE
                 one travel brain
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
    Web Chat          Voice           MCP
       │               │               │
       └───────────────┴───────────────┘
                       │
               Canonical TripPlan
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
     Itinerary        Map            PDF
                       │
              public-safe export
                       │
              ┌────────┴────────┐
              ▼                 ▼
             Demo             Samples
```

Plan AI, guest, authenticated, MCP, Demo, Sample Itineraries, PDF, and maps are **presentations** of the same Trailie output. They do not reinterpret travel reasoning.

---

## Model owns judgment; system owns truth

### Model owns

Meaning, preferences, travel judgment, itinerary composition, recommendations, alternatives, tradeoffs, natural language, when to ask vs assume, when research is needed, what to keep as a pinless experience.

### System owns

Canonical identity, coordinates, source provenance, current factual evidence, route evidence, operational access, state persistence, mutation integrity, security/auth, quotas, schema validation, memory admission authority.

There is no destination hardcoding for travel judgment (`if park == Zion …`). Destination-specific facts belong in **data/evidence**, not application logic. Fine-tuning is not required; keep the core policy short and push construction doctrine into tools and guard failure meanings over time.

---

## Experiences and maps (narrow trust boundary)

Do **not** require every experience to prove an `experience ↔ mapAnchor` relationship. That recreates a brittle bot.

| Claim | Requirement |
|---|---|
| Experience with no spatial claim | May remain pinless; model judgment is enough |
| Grounded place | May have canonical coordinates / map pin |
| Experience explicitly represented **by** a different map anchor | Relationship must be supported by evidence |
| Current operational claim (closure, permit, timed entry, …) | Authoritative / current evidence required |

Legal:

> Afternoon — easy riverside time around Oconaluftee  
> (no pin)

Requires evidence:

> 90-minute Oconaluftee River Trail walk  
> 📍 Oconaluftee River Trailhead

Flexible activities without pins are honest. The map need not show every itinerary block.

**Invariant:** A non-spatial experience may exist without canonical place evidence. A mapped spatial representation must either be the canonical identity being described or be connected to that experience by trusted relationship evidence.

The deterministic validator owns only that evidence check. It does not decide whether a walk is good, how long it should be, or how many attractions a day needs. Similar names, proximity, same park, same coordinates, substring match, and bare model assertion cannot establish the relationship.

---

## Information levels

| Level | Example | Bar |
|---|---|---|
| Conversational knowledge | “That side of the park is usually quieter.” | Model judgment / research when useful |
| Canonical spatial truth | Named stop + map pin + route ends | Grounded place identity |
| Current operational truth | “This road is closed today.” | Current authoritative evidence |

Trailie may speak naturally without grounding every sentence. It must not pretend uncertain operational or spatial facts are verified.

---

## Canonical TripPlan

One authoritative trip state. Chat, map, itinerary, PDF, MCP, Demo, and Samples read it; they do not invent a second plan.

Implemented day-shape block kinds (see day-shape contract):

```text
outing | experience | meal | downtime | arrival | departure | transfer | outside_trip
```

Spatial outings may carry canonical place, coordinates, provenance, and operational access. Flexible experiences may be daypart + title + description (+ optional duration) with **no** fake coordinates.

Dayparts (`morning` / `midday` / `afternoon` / `evening`) are the default vocabulary. Exact clock times only when the clock matters (sunrise, reservation, ferry, timed entry, …). Never invent `3:30 PM` to satisfy a schema.

Routing applies only between grounded spatial entities. Traveler transportation facts ≠ provider route evidence ≠ operational access.

Every accepted plan should carry an explicit **`tripSchemaVersion`** from `shared/tripSchemaVersion.cjs` (currently `1`). Stamp at the model-first accept / `buildPlanDocument` boundary. Legacy saved plans without the field remain readable as the current contract; unsupported future versions fail closed (`unsupported_trip_schema_version`) and are never silently downgraded.

Do not confuse with document envelope `version`, `responseVersion`, `presentation.schemaVersion`, or Demo `PLAYBACK_SCHEMA_VERSION`. Derived surfaces declare which contract they contain. Incompatible fixtures fail CI rather than silently degrading (see One-Brain CI).

---

## Runtime: model-first is Trailie

```text
TRAILIE_RUNTIME=model_first   ← default; intended production runtime
TRAILIE_RUNTIME=legacy        ← explicit emergency rollback only
```

One kill switch. No request dynamically bounces between brains. Legacy remains in the repository as a **rollback implementation**, not an alternative semantic owner.

### Server-side write path

```text
conversation → Trailie model → proposed canonical change → trust boundary → store.commit()
```

- Guest → `AnonymousSession` / guest trip storage (`createSimpleGuestStore`)  
- Authenticated → owned `TripPlan` (`createSimpleTripStore`)  

Both stores call shared `prepareCanonicalStoreCommit` (write-candidate + response-identity) before durable persistence. Ownership/CAS/ledger differ; mutation trust and commit validation do not. Streaming, non-streaming, and `/plan-itinerary` share one `handle` → `createSimpleRuntime` → `store.commit`. The client must not become a second authority when `persisted: true`.

Owner structural edits (PlanWorkspace) use a separate typed path that shares the same write-candidate + CAS fence, not AI chat-turn persistence:

```text
POST /api/trips/:tripId/manual-mutations
  → applyManualMutation → validateManualPlanIntegrity
  → prepareManualPlanCommit (rehash itineraryHash; no fabricated chat turns)
  → validateTripWriteCandidate → CAS write
```

AI still owns travel judgment. Manual ops: `remove_stop`, `move_stop`, `add_day`, `remove_day`, `add_place`. `add_place` uses the same `named_place` identity stack (query-only client input; `place_ambiguous` / `place_unresolved`; no client-authored pins). Plan-only `PUT /api/trips/:id` is rejected (`manual_mutation_required`); conversation+plan response saves remain on PUT. See `docs/audits/manual-add-place-phase2-2026-10-11.md`.

### Legacy judgment stays off the live path

Model-first must not call:

- intent regex / traveler-job classifiers that own meaning  
- sufficiency engines that decide “ready to plan” for the model  
- 90-minute coverage floors, minimum-stop / family stop quotas  
- deterministic attraction selection  
- pre-model evidence planners that decide conversation intent  
- multi-stage travel-content repair that substitutes judgment  

Those modules may remain for rollback. They must not secretly run after the model on the live path.

**Gate:** `scripts/trace-model-first-legacy-reachability.js` (require-time) and `modelFirstCutover.test.js` (throw-on-invoke during guest/auth/stream/`plan-itinerary`). See `artifacts/trailie-architecture-lock-2026-10-11/STEP-4-LEGACY-ISOLATION.md`.

### Trust boundary (deterministic)

Owns: schema validity, canonical identity, coordinate validity, source provenance, experience↔anchor truth **when claimed**, route-edge integrity, operational-access evidence, memory authority, mutation scope, hash/state consistency, persistence/security.

Does **not** own: how many attractions make a good day, whether lunch must exist, which attraction replaces another, destination stop lists, family stop quotas.

### Research is model-demanded

```text
User asks → Trailie understands → does exact/current info matter?
  ├─ no  → reason naturally
  └─ yes → evidence tool → Trailie still decides
```

Tools return structured evidence, not travel recommendations. Do not replace the legacy evidence planner with another deterministic intent→fetch engine.

### Chat and TripPlan are one experience

Refinements load the existing TripPlan, propose a change, validate, and mutate. Untouched days stay stable unless the request genuinely requires broader change. Reply status ≠ artifact status: conversation can succeed when a save cannot.

Memory stores stable traveler facts from **traveler evidence** only. Assistant text never creates traveler memory. Memory never becomes a second planner.

---

## Presentation surfaces

### MCP

Adapter: call Trailie backend → return the same canonical TripPlan. Format for widgets/text; do not replan, invent dayparts, drive times, restaurants, or travel assumptions.

Host prompt (`mcp-server/server/host_instructions.py`): Trailie is the authoritative travel planner. For trip planning or refinement, call `plan_trip` and faithfully present Trailie's response and returned canonical TripPlan. Do not add, remove, reschedule, reroute, or reinterpret itinerary content. Do not invent times, drive durations, restaurants, reservations, costs, access rules, or stops. Canonical structured data is authoritative over presentation prose. If Trailie reports a save or grounding limitation, preserve that limitation. General informational tools may still converse normally.

Authenticated MCP ↔ website TripPlan continuity is a later product capability, not a prerequisite for one-brain semantics.

### Public export

One shared boundary: **`shared/publicPlanExport.cjs` → `exportPublicPlan()`** (also exposed as `projectPublicPlan()` for null-safe share/API callers).

Consumers: Sample Itineraries, Trailie Demo capture, shared-trip API, owner PDF plan body, static/public itinerary pages. Deep nested allowlists preserve days, dayStructure, pinless experiences, timingReason, travelEdges, experience/mapAnchor, and coordinates while omitting private/internal fields.

`projectPublicPlan` must not grow a second schema — it wraps the same function. MCP host delivery stays adapter-lossless (full canonical TripPlan for the authenticated host session); public export is the privacy boundary for public surfaces, not a second planner.

Demo playback may omit `feasibilityIssues` after export (owner diagnostics, not Demo travel advice). Save/mutation state lives on the response envelope, not inside the exported plan body.

### Demo

Frozen real Trailie conversations and accepted TripPlans → same Trip Workspace. No Demo planner, no Demo-specific canonical conversion, no reconstructing missing semantics. **Recapture Demo last**, after the live brain is finished. Demo failures are evidence about Trailie, not a reason for Demo-only logic.

### Samples

Reviewed Trailie exports. After cutover, verify schema/parity. Regenerate only if the canonical contract is incompatible. Do not spend model calls for ceremony when current exports remain valid.

### Maps / PDF / chat UI

Chat may summarize; itinerary shows day shape; map shows grounded pins only; PDF projects the same TripPlan. No UI invents missing travel semantics.

---

## One-Brain CI (mandatory)

Workflow: `.github/workflows/trailie-one-brain.yml`  
Local runner: `scripts/trailie-one-brain/run-local.sh`

Same accepted canonical TripPlan through MCP full/slim, public export, share export, Demo/Sample fixtures, and PDF view model. Assert semantic survival (destinations, day purpose/blocks, experiences, canonical places, overnights, route/access, guidance) — not pixel equality and not private-field identity. Provider-disabled only.

Jobs: `runtime-isolation` → `canonical-commit` → `truth-boundary` → `mcp-parity` → `public-export-parity` → `schema-version` → `sample-verification` → `demo-contract` → required check **Trailie One-Brain — PASS**.

Demo currency: `shared/demoCurrentContract.cjs` — currently `DEMO_CURRENT_CONTRACT=true` after the 2026-10-11 recapture. Exporter/renderer contracts stay mandatory. Set the flag back to `false` only if Demo content is intentionally frozen against an older contract again.

When `tripSchemaVersion` advances, old Demo/Sample fixtures fail CI until deliberately migrated or regenerated.

---

## Cutover order (product)

1. Freeze this architecture (this document).  
2. Make model-first the actual Trailie runtime (kill switch; legacy = rollback).  
3. One server-side write path for guest and authenticated.  
4. Ensure legacy judgment modules are not called on the model-first path.  
5. Keep the trust boundary narrow (including experience↔anchor **when claimed**).  
6. Canonical TripPlan continues to support places and experiences.  
7. Research remains model-demanded.  
8. Fix MCP host prompt + keep adapter boring.  
9. One public exporter.  
10. Add `tripSchemaVersion` + fixture gates.  
11. One-Brain CI in Actions. ✅ `.github/workflows/trailie-one-brain.yml`  
12. Final local qualification. ✅ `artifacts/trailie-final-local-qualification-2026-10-11/REPORT.md` → **READY_FOR_DEMO_RECAPTURE**  
13. Demo recapture last. ✅ `artifacts/trailie-demo-recapture-2026-10-11/REPORT.md` → `DEMO_CURRENT_CONTRACT=true`  
14. Samples: verify continuously in CI; regenerate only if needed.  
15. Production cutover qualification (separate).  
16. MCP account continuity later.

---

## Local provenance (artifacts/)

`artifacts/` is gitignored locally. Prefer these folders when looking for current evidence; everything else under `artifacts/` is historical:

| Folder | What it is |
|---|---|
| `artifacts/trailie-architecture-lock-2026-10-11/` | Architecture lock steps and proof |
| `artifacts/trailie-final-local-qualification-2026-10-11/` | One-Brain local qualification |
| `artifacts/trailie-demo-recapture-2026-10-11/` | Demo recapture that set `DEMO_CURRENT_CONTRACT=true` |
| `artifacts/repo-hygiene-audit-2026-10-11/` | Naming / ownership / dead-code audit (no renames applied) |

---

## Anti-patterns

- Treating Demo, Discovery, Yosemite, MCP, or Samples as separate products to “fix” with special logic  
- Growing the system prompt for every edge case  
- Destination-specific judgment branches  
- Requiring a pin for every experience  
- Inventing exact times, routes, or restaurants in MCP/host/UI when Trailie did not return them  
- Forcing an itinerary when the traveler asked a discovery or factual question  
- Fine-tuning as a substitute for clear contracts and tools  
