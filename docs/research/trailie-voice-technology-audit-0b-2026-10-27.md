# Trailie Voice — Technology & Voice Selection Audit (Phase 0B)

**Verification date:** October 27, 2026  
**Status:** Research + comparison plan only. **No paid listening tests executed. No implementation, model switch, voice creation, commits, or deploys.**  
**Supersedes (for model/voice decisions):** the Phase 0 recommendation to “keep `gpt-realtime` + `marin` and defer GPT-Live.” UI dock direction remains preferred but **not approved for build** until this comparison completes.

**Evidence labels used throughout**

| Tag | Meaning |
|---|---|
| **DOC** | Verified in official OpenAI documentation on 2026-10-27 |
| **CODE** | Verified in TrailVerse source |
| **MEASURED** | From controlled experiments (none in this phase) |
| **HYP** | Untested hypothesis / planning assumption |

---

## Correction to Phase 0

Phase 0 correctly mapped TrailVerse’s WebRTC mint → `/realtime/calls` path and UI/session coupling. It was incomplete on:

1. Current Realtime model family (`1.5`, `2`, `2.1`, `2.1-mini`) and **deprecation of `gpt-realtime`**.
2. GPT-Live developer API depth (delegation, duration billing, voice catalog).
3. Built-in voice inventories (Realtime 10 vs Live 31).
4. **Prompt-to-voice GA** (Oct 2026 changelog) — GPT-Live only.
5. Recording-based custom voices and API compatibility.
6. Any experimental A/B evidence (none collected).

**UI vs engine:** Prefer compact expandable dock as a *design concept*. Do **not** treat that as locking Realtime, `marin`, or GPT-Live.

---

## 1. Current OpenAI voice landscape

### 1.1 ChatGPT product (not TrailVerse-selectable unless documented on API)

| Offering | What docs say | API selectable? | Evidence |
|---|---|---|---|
| **Live** powered by **GPT-Live-1.1** / **GPT-Live-1.1 Quip** (plan-dependent) | Full-duplex; search/memory/widgets/plugins; listen+speak overlap | **Not established** as developer model IDs | **DOC** — [ChatGPT Voice Help](https://help.openai.com/en/articles/20001274-chatgpt-voice) (page updated ~hours before verification) |
| Advanced / Standard ChatGPT Voice modes | Prior realtime / turn-by-turn | N/A product modes | **DOC** same |
| ChatGPT voice presets (Arbor, Cove, Ember, … + regional) | Consumer Settings → Voice | **Different catalog** from API names | **DOC** same |

Do **not** assume GPT-Live-1.1 or Quip can be set in TrailVerse sessions until a developers.openai.com model page lists them.

### 1.2 Developer speech-to-speech models (API)

| Model ID | Family | Status (model page) | Role | Pricing shape | Evidence |
|---|---|---|---|---|---|
| `gpt-realtime` | Realtime | **Deprecated** | TrailVerse **current** mint model | Token (audio ~$32 / $64 per 1M in/out) | **DOC** model page; **CODE** `ai.js` ~4022 |
| `gpt-realtime-1.5` | Realtime | Listed / production | Speech-to-speech flagship (pre-2.x reasoning line) | Token; audio same $32/$64 band; text $4/$16 | **DOC** |
| `gpt-realtime-2` | Realtime | Listed | Reasoning + stronger tools/instruction following | Token; text out $24; audio $32/$64 | **DOC** |
| `gpt-realtime-2.1` | Realtime | Listed / strong candidate | Improves alphanumeric, silence/noise, interruptions vs 2 | Same pricing band as 2 | **DOC** |
| `gpt-realtime-2.1-mini` | Realtime | Listed / cost candidate | Distilled; faster/cheaper; WebRTC/WS/SIP | Audio ~$10 / $20 per 1M; text $0.60 / $2.40 | **DOC** |
| `gpt-live-1` | Live | GA (API changelog ~Sep 2026) | Full-duplex conversation + **backend delegation** | **$0.05/min** billed per second + backend separately | **DOC** |

Related deprecated audio/TTS paths (not Trailie’s primary stack): `tts-1`, `tts-1-hd`, dated `gpt-4o-mini-tts` snapshots — deprecations page points replacements toward realtime mini family (**DOC**).

### 1.3 Architectures

| Architecture | How it works | Trailie fit | Evidence |
|---|---|---|---|
| **Realtime S2S** | One model session: listen, speak, reason, tools | Current Trailie | **DOC** Realtime guides; **CODE** |
| **GPT-Live + delegation** | Live handles conversation; Responses or client backend does research/tools; can keep talking during backend work | Strong alternative for “browse while tools run” | **DOC** [Live](https://developers.openai.com/api/docs/guides/live), [Delegation](https://developers.openai.com/api/docs/guides/live-delegation) |
| **Chained** STT → LLM → TTS | Separate stages; more control; higher latency | Not current; optional fallback | **DOC** voice-agents overview (when available) |

### 1.4 Official sources (verification 2026-10-27)

- [Models](https://developers.openai.com/api/docs/models)
- [Pricing](https://developers.openai.com/api/docs/pricing)
- [Changelog](https://developers.openai.com/api/docs/changelog) — Oct 2026: prompt-to-voice GA; nine Live voices (Nuri, Juni, Flitz, Brise, Sillage, Nira, Harema, Shida, Noeul)
- [Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)
- [Live](https://developers.openai.com/api/docs/guides/live), [Live prompting](https://developers.openai.com/api/docs/guides/live-prompting), [Live conversations](https://developers.openai.com/api/docs/guides/live-conversations), [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation)
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations), [Voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting), [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)
- [ChatGPT Voice Help](https://help.openai.com/en/articles/20001274-chatgpt-voice)
- Model pages: `gpt-realtime`, `gpt-realtime-1.5`, `gpt-realtime-2`, `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-live-1`

---

## 2. Voice inventory & selection research

### 2.1 Realtime built-in voices (**DOC** — Realtime conversations / API reference)

Exactly **10**:

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`

OpenAI recommends **`marin` or `cedar`** for best quality. Voice cannot change after first audio in a session.

**Trailie today:** `marin` (**CODE**).

### 2.2 GPT-Live built-in voices (**DOC** — Live create-session enum + Live conversations table)

**31** names in API enum (includes Realtime overlap + Live-only):

`alloy`, `ash`, `ballad`, `beacon`, `bossa`, `brise`, `cedar`, `cinder`, `coral`, `delta`, `echo`, `flitz`, `gleam`, `harema`, `juni`, `marin`, `meridian`, `nira`, `noeul`, `nuri`, `quartz`, `ripple`, `sage`, `shida`, `shimmer`, `sillage`, `stone`, `tempo`, `verse`, `vesper`, `willow`

Default: **`marin`**. Cannot change after startup.

Live docs “additional” English/regional shortlist (audition-relevant for US parks):

| API name | Language / regional influence | Notes |
|---|---|---|
| `gleam` | English · North American · Feminine · Natural | Candidate |
| `meridian` | English · North American · Masculine · Natural | Candidate |
| `stone` | English · Irish · Masculine · Natural | Candidate |
| `vesper` | English · British · Masculine · Natural | Candidate |
| `willow` | English · Irish · Feminine · Natural | Optional |
| `quartz` / `ripple` | Australian | Optional |
| `delta` / `cinder` | Southern U.S. · Generated | Optional |
| Oct 16 multilingual add | `nuri`/`juni`/`flitz` (DE), `brise`/`sillage` (FR), `nira` (HI), `harema`/`shida` (JA), `noeul` (KO) | Lower priority for US NPS default |

### 2.3 Prompt-to-voice (Oct 2026) — **DOC**

| Fact | Detail |
|---|---|
| Status | Generally available to all API customers (changelog Oct 2026) |
| Create | `POST /v1/audio/voices` with `type: "prompt"` — **free** |
| Use | **GPT-Live only** — **not** Realtime, TTS, or Chat Completions |
| Limit | Up to **100** prompt voices / org |
| Billing | Speech billed at normal GPT-Live session rates |
| Guidance | Keep original description in Live `instructions`; choose voice at session start |
| ZDR | Voice **creation** not ZDR-compatible; Live speech may be ZDR-eligible separately |

**Implication for Trailie:** A distinctive prompt-generated “Trailie voice” **requires GPT-Live** (or a recording-based custom voice if sales-enabled). It cannot be bolted onto today’s Realtime mint without migrating the session API. (**DOC** + **HYP** product impact)

### 2.4 Recording-based custom voices — **DOC**

| Fact | Detail |
|---|---|
| Eligibility | **Sales / eligible customers only** |
| Inputs | Consent phrase recording + reference sample (same speaker) |
| APIs | GPT-Live, **Realtime**, TTS, Chat Completions audio |
| Caps | ≤20 recording voices / org; samples ≤60s |
| Realtime example | Docs show `gpt-realtime-2.1-mini` + `{ id: "voice_…" }` |

**TrailVerse today:** No evidence of sales custom-voice enablement (**CODE** / ops — treat as **HYP** until confirmed with OpenAI account).

### 2.5 Compatibility matrix

| Voice type | Realtime API | GPT-Live | Notes |
|---|---|---|---|
| Built-in Realtime 10 | Yes | Yes (subset of Live 31) | `marin`/`cedar` recommended |
| Live-only presets (`gleam`, `meridian`, …) | **No** (**DOC**/enum) | Yes | Need Live to audition natively |
| Prompt-to-voice custom | **No** | Yes | Free create; Live usage billing |
| Recording custom | Yes (if eligible) | Yes | Sales gate |

### 2.6 Trailie personality audition criteria (planning — **HYP** until heard)

Target: natural, warm-not-giddy, clear, sustainable for multi-minute talks, strong US park/geo pronunciation, calm on closures/safety, distinctive not cartoonish.

**One default vs multi-voice:** Prefer **one excellent default** for brand trust (**HYP**). Optional later: user preference among 2–3 presets if tests show large taste split — not required for MVP dock.

### 2.7 Recommended listening shortlist (not ranked)

| # | Voice | API | Why shortlisted |
|---|---|---|---|
| 1 | `marin` | Realtime + Live | Current Trailie baseline |
| 2 | `cedar` | Realtime + Live | Official “best quality” peer |
| 3 | `gleam` | Live | NA English · natural |
| 4 | `meridian` | Live | NA English · natural |
| 5 | `stone` | Live | Contrast accent/timbre |
| 6 | `vesper` | Live | Contrast accent/timbre |
| 7 | Prompt-to-voice “Trailie” | Live only | Brand distinctiveness test |
| 8 | Recording custom | If eligible | Only if sales access + brand talent available |

---

## 3. Model decision matrix (documented capabilities vs unmeasured)

| Criterion | Current `gpt-realtime` + tools | `gpt-realtime-2.1` | `gpt-realtime-2.1-mini` | `gpt-live-1` + client/Responses delegation |
|---|---|---|---|---|
| Speech naturalness | Untested vs peers (**MEASURED** pending) | Docs claim improved expressivity lineage (**DOC**) | Docs: distilled / still S2S (**DOC**) | Docs: full-duplex naturalness (**DOC**) |
| Time to first audio | Working baseline (**CODE**) | Untested | Likely better (**HYP**) | Untested; WebRTC init bills 15s credited (**DOC**) |
| Turn-taking / pauses | semantic_vad; client `response.create` (**CODE**) | Docs: better silence/noise (**DOC**) | Untested | Continuous interaction model (**DOC**) |
| Interruptions | **Disabled** (`interrupt_response: false`) + mic mute (**CODE**) | Docs improve interrupt behavior (**DOC**) — still need product config | Same | Native listen-while-speak (**DOC**) |
| Noise robustness | Browser AEC/NS (**CODE**); model untested | Explicitly improved (**DOC**) | Improved alphanumeric vs 2 (**DOC**) | Product claims noise handling (**DOC** ChatGPT); API unmeasured |
| Park-name ASR | Untested | Alphanumeric improvement may help codes (**DOC**/HYP) | Similar claim (**DOC**) | Untested |
| Tool accuracy | 4 Express tools via DC (**CODE**) | Stronger tool use claimed for 2.x (**DOC**) | Distilled — measure carefully | Delegation: tools on backend; Live keeps talking (**DOC**) |
| Speak during research | **Blocked by design** (**CODE**/prompt) | Possible with prompt/orchestration change (**HYP**) | Same | **Designed for this** (**DOC**) |
| Multi-turn continuity | Browser peer only (**CODE**) | Same transport family | Same | Session APIs + history fields (**DOC**) |
| Browser WebRTC | Yes (**CODE**) | Yes (**DOC**) | Yes (**DOC**) | Yes (`/v1/live/sessions`) (**DOC**) |
| Implementation complexity | Already shipped | **Low** — model string (+ prompt tune) | Low | **High** — new mint/SDP, events, delegation, prompt split |
| Cost shape | Token audio $32/$64 (**DOC**); model deprecated | Same audio band; text out higher than 1.5 | ~⅓ audio rates (**DOC**) | $0.05/min + backend (**DOC**) |
| Deprecation risk | **High** — page marked Deprecated (**DOC**) | Current line (**DOC**) | Current line (**DOC**) | Current Live line; **not** ChatGPT-1.1 (**DOC**) |

**Do not declare a winner from this table alone.** Rows tagged untested need the Section 4 plan.

---

## 4. Controlled evaluation plan (not executed)

### 4.1 Budget gate — estimate before spending

Assumptions labeled **HYP** (token burn varies with how much each side talks):

| Scenario | Rough cost basis | Estimate |
|---|---|---|
| GPT-Live voice preview | $0.05/min × ~2–3 min × 6 presets | **~$1–2** (+ free prompt-voice create) |
| Realtime active talk | ~$0.15–$0.40/min (**HYP** from audio token rates) | — |
| Mini active talk | ~$0.05–$0.15/min (**HYP**) | — |
| Live + light tools | $0.05/min + Responses tokens (**DOC** + **HYP**) | — |

**Proposed staged spend (approve before run):**

| Stage | Scope | Suggested budget cap |
|---|---|---|
| **A — Voice personality** | 6 presets + 1 prompt-Trailie on Live; same 60s script × 3 park sentences | **$5** |
| **B — Model bakeoff (narrow)** | Baseline vs `2.1` vs `2.1-mini` vs Live on **5** core scenarios | **$25** |
| **C — Full 15-scenario** | Winner(s) from B only | **+$40** |
| **Total authorization ask** | A+B+C contingency | **$50–75** |

**Stop rule:** No Stage B/C without written budget approval. No production key soak. Store only scrubbed scoresheets (no raw audio in git; no PII).

### 4.2 Standard script pack (identical text prompts / spoken intents)

Use same Trailie voice instructions where the stack allows; for Live, split conversation vs backend instructions per Live prompting guide (**DOC**).

**15 interactions**

1. Basic discovery: “Quiet parks near Seattle for a weekend.”
2. Compare: Yosemite vs Yellowstone for first-timers, 4 days.
3. Closures: “Any road closures in Glacier right now?”
4. Weather/season: “Is Zion brutal in July?”
5. Mispronunciation: “Yo-sem-it-ee” / “Why-oming parks”
6. Long pause: start a question, pause 8–12s, finish.
7. Interrupt mid-answer.
8. Follow-up: “What about camping?”
9. Multi-step: 3-day Zion without hard hikes.
10. Slow tool: force `get_park_details` on a park not in preload.
11. Background noise: TV/cafe bed (**lab**).
12. Unclear / mumbled speech.
13. Relative date: “this Saturday” / “next Memorial Day.”
14. Unsupported: “Plan a week in Banff” (geography honesty).
15. Error recovery: kill network mid-tool; reconnect expectations.

### 4.3 Scoring

**Subjective (1–5):** naturalness, warmth, fatigue, park-name pronunciation, safety tone, “sounds like Trailie.”

**Objective:** TTFB audio (ms), interrupt stop latency, tool chosen (Y/N/correct), factual check vs NPS for alerts, session failure, approximate $ from usage dashboard.

**Blind:** Prefer two listeners; hide model/voice labels on scorecards.

### 4.4 Stack harness notes

| Stack | Harness | Risk |
|---|---|---|
| Current | Staging TrailVerse voice | Contaminated by current prompt/VAD flags |
| Realtime 2.1 / mini | Temporary mint model override on staging only | Must not ship without approval |
| Live | Separate prototype page or OpenAI Playground + mirrored park tools | Event/schema ≠ Trailie production |

---

## 5. Revisited architecture questions

| # | Question | Answer now | Evidence |
|---|---|---|---|
| 1 | Can expandable dock run on existing Realtime? | **Yes** — UI/session split only | **CODE** Phase 0 |
| 2 | Is current voice model still the right choice? | **Probably not as a long-term lock** — `gpt-realtime` is **Deprecated** on the model page; keep as baseline for tests only | **DOC** + **CODE** |
| 3 | Would 2.1 or Mini improve experience/economics? | **Plausible**; 2.1 for quality/interrupt/noise; Mini for cost — **unproven without Stage B** | **DOC** / **HYP** |
| 4 | Would GPT-Live be materially better conversationally? | **Documented advantage** on full-duplex + speak-during-delegation; **material for Trailie TBD** until measured | **DOC** / untested |
| 5 | Is a custom Trailie voice valuable? | **Worth Stage A**; prompt-to-voice is free to create but **forces Live** for use; recording custom needs sales access | **DOC** / **HYP** brand |
| 6 | Best fit for browse-while-talk? | **Dock UI** on any live peer; **conversational** fit may favor Live if tools are slow — don’t conflate | **CODE** + **DOC** |
| 7 | Migration loss / rebuild | Live: new session create, events, prompt split, tool delegation, analytics, rate limits, widgets/copy; Realtime 2.1: mostly model (+ prompts) | **DOC** + **CODE** |
| 8 | Monthly cost (illustrative **HYP**) | See below | **HYP** |

### Illustrative monthly cost (**HYP** — not measured)

Assume: 2,000 voice sessions/month; avg **3 minutes** connected; 50% of time Trailie speaking.

| Stack | Voice line | Tools/backend | Rough order |
|---|---|---|---|
| Realtime 2.1 | 6,000 min × ~$0.20 ≈ **$1,200** | Included in session tokens | High variance |
| Realtime 2.1-mini | 6,000 × ~$0.08 ≈ **$480** | Included | Lower |
| GPT-Live | 6,000 × $0.05 = **$300** | + Responses/NPS tool tokens (could be $100–$800+) | Voice floor clear; backend dominates if chatty tools |
| Dock idle listening | Increases minutes on all stacks | — | Need idle timeout regardless |

Use dashboard telemetry after Stage B to replace these guesses.

---

## 6. Evidence-backed recommendation (decision framework — no engine locked)

### Separate decisions

1. **UI:** Compact expandable dock + optional immersive remains the preferred *design* (**product preference**; Phase 0 UX). **Do not implement yet.**
2. **Model:** Reopened. Baseline for tests = current deprecated `gpt-realtime`. Leading **candidates** = `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-live-1`.
3. **Voice preset:** Reopened. Baseline `marin`; shortlist cedar + Live NA/contrast + optional prompt-Trailie.

### Recommended sequence (still research/ops, not product ship)

1. Approve **Stage A budget ($5)** → listen shortlist; decide if prompt-Trailie is worth pursuing (implies Live path for brand voice).
2. Approve **Stage B ($25)** → bakeoff 2.1 / mini / Live vs baseline on 5 scenarios with current Trailie tools mirrored.
3. Only then choose:  
   - **Retain Realtime family** (likely 2.1 or mini) → dock can proceed on Realtime; custom prompt voice deferred or recording path if eligible.  
   - **Migrate to Live** → plan dock + Live mint together; enable prompt-to-voice brand; redesign tool loop for delegation.
4. Update Phase 0 docs that “defer Live forever” — replace with “defer until Stage B.”

### What not to do now

- Do not implement the dock.
- Do not switch production `model` / `voice`.
- Do not create prompt voices in prod org without retention/ZDR review.
- Do not treat ChatGPT Live-1.1 as an API option.
- Do not rank voices by name without listening.

### Remaining uncertainties / blockers

| Item | Blocker? |
|---|---|
| No MEASURED quality/cost data | **Yes** — blocks final model/voice choice |
| Sales eligibility for recording voices | Unknown |
| Exact Realtime $/min under Trailie prompts | Unknown |
| Live client-delegation effort vs Responses delegation | Design spike needed if Live wins |
| Whether enabling Realtime `interrupt_response` alone closes most of the “naturalness” gap | Untested |
| Org ZDR vs voice creation | Policy check |

---

## 7. Deliverables checklist

| Deliverable | Location |
|---|---|
| Voice-model inventory | §1 |
| Supported voice inventory | §2 |
| Compatibility matrix | §2.5 |
| Pricing comparison | §1.2, §3, §5 Q8 |
| Listening shortlist | §2.7 |
| A/B evaluation plan + cost estimate | §4 |
| Architecture revisit | §5 |
| Recommendation framework | §6 |
| Uncertainties | §6 |

---

## Appendix — TrailVerse baseline (CODE)

| Setting | Value |
|---|---|
| Model | `gpt-realtime` (deprecated on OpenAI model page as of verification) |
| Voice | `marin` |
| Mint | `POST /v1/realtime/client_secrets` |
| SDP | `POST /v1/realtime/calls` |
| VAD | `semantic_vad`, `interrupt_response: false`, `create_response: false` |
| Tools | `get_park_details`, `search_parks`, `compare_parks`, `find_events` via `/api/ai/voice-tool` |

---

**Stop point:** Research and comparison plan complete. Await budget approval for Stage A/B listening tests and explicit choice of model + voice before any UI implementation.
