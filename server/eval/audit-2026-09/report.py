"""Render measured tables; never equate completed generation with product success."""
import collections
import csv
import json
import math
import pathlib
import statistics

OUT = pathlib.Path(__file__).resolve().parents[3] / 'docs/eval/trailie-audit-2026-09-23'
rows = json.loads((OUT / 'normalized-analysis.json').read_text())
full = [r for r in rows if r['phase'] == 'full']
e2e = [json.loads(s) for s in (OUT / 'e2e-raw.jsonl').read_text().splitlines()]
qualified = [r for r in e2e if r.get('execution_id') == '2750c1e7-5fd7-446f-9e84-193e23860e44']
turns = [r for r in qualified if r['type'] == 'turn']
models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra']
def mean(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return statistics.mean(xs) if xs else None
def quant(xs, p):
    xs = sorted(x for x in xs if isinstance(x, (int, float)))
    return xs[min(len(xs)-1, math.ceil(len(xs)*p)-1)] if xs else None
def fmt(x, digits=2):
    return 'N/M' if x is None else f'{x:.{digits}f}'
def dollars(r):
    u = r.get('usage') or {}
    if not u or r.get('model') not in models:
        return None
    prices = dict(zip(models, [(0.2,0.02,1.2),(2,0.2,12),(4,0.4,20),(0.1,0.01,0.5),(2,0.2,10),(10,1,50)]))
    a,b,c = prices[r['model']]
    inp,out = u.get('input_tokens'),u.get('output_tokens')
    if inp is None or out is None:
        return None
    detail = u.get('input_tokens_details') or {}
    cached,write = detail.get('cached_tokens',0),detail.get('cache_write_tokens',0)
    return ((inp-cached-write)*a+cached*b+write*a*1.25+out*c)/1e6
lines = ['# Trailie model benchmark — measured results', '',
'Audit: 2026-09-23. Current uncommitted working tree; no model defaults, production prompts, routing thresholds or application source changed. **Migration is blocked by architecture failures. No model winner is established.**', '',
'## Coverage and interpretation', '',
f"The manifest contains 76 cases across A–L. Controlled generation executed **{len(rows)} calls**, including {len(full)} expanded-suite calls across {len(set(r['scenario_id'] for r in full))} scenarios and a separate 36-call smoke sample. Five models receive three repetitions of every expanded case; Astra receives three hard/diagnostic cases × three repetitions, plus the smoke sample. This unequal Astra sample must not be compared as an overall cohort average.", '',
'Controlled mode uses the current prompt builder, Responses adapter, tool schema and output budgets, frozen empty evidence, null initial trip state and identical per-case requests except model. It deliberately bypasses retrieval, runtime adaptive contract selection, canonical persistence and repair. A manually selected current contract is shared by all models. It is **not** the actual routed product baseline. The smoke route label used the wrong classifier argument; expanded labels were corrected without changing prompts or model inputs. Hashes preserve exact inputs.', '',
'Real pipeline mode exercises Express HTTP, classification, real external retrieval, router, model, validators and disposable Mongo persistence. The database starts empty, without a copy of production park/evidence records. It uses child-process-only v2 enablement because the local environment leaves v2 disabled. Production dashboard configuration and deployment parity were not available. Guest non-streaming behavior is measured; browser rendering, iOS, authenticated success and streamed races are not claimed. Google Places rejected this machine’s IP; therefore retrieval conditions are degraded and cannot represent production availability or production failure rates.', '',
'F is a seven-turn Zion sequence repeated three times; G/H/J have targeted helper/regression coverage but not a complete repeated live matrix. K continuity cases in controlled mode have null history and therefore measure response handling, not actual continuity. Human review remains pending. Missing measurements are N/M, never zero.', '',
'## Controlled cohort measurements', '',
'Expanded suite only. TTFT is first text **or tool-argument delta**, not necessarily first visible UI text. Completed means API completion, not useful or validated travel outcome.', '',
'| Model | n | Completed | TTFT p50 / p95 s | Total p50 / p95 s | Mean input / output tokens | Model cost USD | Bound-schema valid / tool outputs |',
'|---|---:|---:|---:|---:|---:|---:|---:|']
for m in models:
    g=[r for r in full if r['model']==m]
    lines.append(f"| {m} | {len(g)} | {sum(not r.get('error') and r.get('completion_status')=='completed' for r in g)} | {fmt(quant([r['time_to_first_token']/1000 if r['time_to_first_token'] is not None else None for r in g],.5))} / {fmt(quant([r['time_to_first_token']/1000 if r['time_to_first_token'] is not None else None for r in g],.95))} | {fmt(quant([r['total_latency']/1000 for r in g],.5))} / {fmt(quant([r['total_latency']/1000 for r in g],.95))} | {fmt(mean([r['input_tokens'] for r in g]),0)} / {fmt(mean([r['output_tokens'] for r in g]),0)} | {sum(r.get('estimated_model_cost') or 0 for r in g):.6f} | {sum(r['bound_schema_valid'] is True for r in g)} / {sum(r.get('structured_plan') is not None for r in g)} |")
lines += ['', 'The raw schema flag checks the reduced generation payload against the full itinerary schema. The bound-schema metric above first runs the existing production contract binder. It is still only shape validation: tool omission can be legitimate pushback, and schema success does not establish geography, feasibility, saved-plan acceptance or map completeness. Controlled retries and repairs are disabled (zero by design), so they provide no evidence that a candidate reduces product repair.', '', '## Requested per-task comparison', '', 'Baseline here means the real router, not a renamed Terra cohort. It is N/M for controlled tasks. Hard state invariants, full-runtime validation, unnecessary-refusal rate and cost per successful outcome cannot be inferred from these model-only calls. The CSV also includes both GPT-5.6 Luna and Sol.', '']
manifest=json.loads((OUT/'TRAILIE_MODEL_EVAL_CASES.json').read_text())['cases']
for task in sorted(set(r['task_class'] for r in full)):
    family=next(c['family'] for c in manifest if c['task_class']==task)
    gs=[[r for r in full if r['task_class']==task and r['model']==m] for m in [models[1],models[3],models[4],models[5]]]
    lines += [f'### {task}. {family}', '', '| Metric | Routed baseline | 5.6 Terra | 6 Luna | 6 Sol | 6 Astra |','|---|---:|---:|---:|---:|---:|']
    metrics=[('Sample size',lambda g:str(len(g))),('Hard invariant pass rate',lambda g:'N/M'),('Companion score',lambda g:'N/M'),('Directness',lambda g:'N/M'),('Judgment',lambda g:'N/M'),('Realism',lambda g:'N/M'),('Constraint adherence',lambda g:'N/M'),('Adaptive depth',lambda g:'N/M'),('Structured success (shape / emitted)',lambda g:f"{sum(r['bound_schema_valid'] is True for r in g)}/{sum(r.get('structured_plan') is not None for r in g)}" if g else 'N/M'),('Unnecessary refusal rate',lambda g:'N/M'),('Retry rate (disabled)',lambda g:'0' if g else 'N/M'),('Repair rate (disabled)',lambda g:'0' if g else 'N/M'),('TTFT p50 s',lambda g:fmt(quant([r['time_to_first_token']/1000 if r['time_to_first_token'] is not None else None for r in g],.5))),('Total latency p50 s',lambda g:fmt(quant([r['total_latency']/1000 for r in g],.5))),('Mean input tokens',lambda g:fmt(mean([r['input_tokens'] for r in g]),0)),('Mean output tokens',lambda g:fmt(mean([r['output_tokens'] for r in g]),0)),('Cost / successful turn',lambda g:'N/M')]
    for label,fn in metrics:
        lines.append('| '+label+' | N/M | '+' | '.join(fn(g) for g in gs)+' |')
    lines.append('')
lines += ['## Real HTTP baseline', '', f'Qualified execution: `2750c1e7-5fd7-446f-9e84-193e23860e44`. Observed **{len(turns)} turns**; status counts: `{dict(collections.Counter(r["response"].get("trailieV2",{}).get("status","admission/error") for r in turns))}`. HTTP 200 alone is not a pass.', '', '| Turn | Status | Model | Attempts | Total s | First validator | Terminal reason |', '|---|---|---|---:|---:|---|---|']
turn_metrics=[]
for r in turns:
    b=r['response'];v=b.get('trailieV2') or {};a=v.get('attempts') or []
    saved=(r.get('saved_state') or {}).get('messages') or []
    saved_plan=next((x['canonicalPlan'] for x in reversed(saved) if x.get('canonicalPlan')),None)
    stages=v.get('latencyBreakdown',{}).get('stages',[])
    t={'run_id':r['run_id'],'status':v.get('status'),'http_status':r['http_status'],'latency_ms':r['total_latency'],'attempt_count':len(a),'first_validator_pass':a[0].get('validationStatus')=='pass' if a else None,'validator_failure_count':sum(x.get('validationStatus')=='fail' for x in a),'escalation':any(x.get('model')=='gpt-5.6-sol' for x in a),'repair_attempt_count':max(0,len(a)-1),'model_cost_usd':sum(((x.get('usage',{}).get('inputTokens',0)-x.get('usage',{}).get('cachedTokens',0))*({'gpt-5.6-terra':2,'gpt-5.6-sol':4,'gpt-5.6-luna':.2}.get(x.get('model'),0))+x.get('usage',{}).get('cachedTokens',0)*({'gpt-5.6-terra':.2,'gpt-5.6-sol':.4,'gpt-5.6-luna':.02}.get(x.get('model'),0))+x.get('usage',{}).get('outputTokens',0)*({'gpt-5.6-terra':12,'gpt-5.6-sol':20,'gpt-5.6-luna':1.2}.get(x.get('model'),0)))/1e6 for x in a),'retrieval_ms':next((s['totalMs'] for s in stages if s['stage']=='evidence_resolution'),None),'saved_plan_days':len(saved_plan.get('days',[])) if saved_plan else None,'response_hash':b.get('itineraryHash'),'photography':(r.get('saved_state') or {}).get('planningState',{}).get('activityPreferences',{}).get('photographyTiming'),'validation_codes':[code for x in a for code in x.get('validationReasonCodes',[])]}
    # Requests are sequential: provider completions since the previous turn
    # belong to this logical turn. Prefer SDK usage over normalized telemetry.
    position=qualified.index(r)
    prior_position=max((i for i,x in enumerate(qualified[:position]) if x['type']=='turn'),default=-1)
    provider_rows=[x for x in qualified[prior_position+1:position] if x['type']=='provider_complete']
    priced=[dollars(x) for x in provider_rows]
    t['model_cost_usd']=sum(priced) if priced and all(x is not None for x in priced) else None
    t['provider_usage_call_count']=len(provider_rows)
    turn_metrics.append(t)
    lines.append(f"| {r['run_id']} | {v.get('status',r['http_status'])} | {v.get('model','—')} | {len(a)} | {r['total_latency']/1000:.2f} | {a[0].get('validationStatus') if a else '—'} | {v.get('terminalReason') or '—'} |")
(OUT/'e2e-analysis.json').write_text(json.dumps(turn_metrics,indent=2))
lines += ['',f"Total-turn p50/p95: {fmt(quant([r['total_latency']/1000 for r in turns],.5))}/{fmt(quant([r['total_latency']/1000 for r in turns],.95))} s. Retrieval-resolution p50: {fmt(quant([r['retrieval_ms']/1000 if r['retrieval_ms'] is not None else None for r in turn_metrics],.5))} s. {sum(r['attempt_count']>1 for r in turn_metrics)}/{len(turn_metrics)} turns used more than one generation; {sum(r['first_validator_pass'] is True for r in turn_metrics)}/{sum(r['first_validator_pass'] is not None for r in turn_metrics)} passed the first validator. {sum(r['escalation'] for r in turn_metrics)} reached Sol. Provider fallback was not configured.", '',
'The guest sunrise preference survived a failed answer in the qualified sequence. A separate authenticated `/api/ai/chat` probe with an injected provider failure returned a failed response and reloaded **null** photography timing from the saved trip. This reproduces C1 at the real HTTP/database boundary. Failure responses correctly avoid claiming a patch was applied; that safeguard does not make the requested update succeed.', '',
'The scenario uses September 12–17 against a September 23 audit clock. Therefore F07 “Make tomorrow easier” must not silently target that historical trip. The first two replays rejected it and preserved the plan, but spent three generation attempts each before terminal failure. A deterministic unresolved-target clarification is a future opportunity to avoid needless model work; it was not implemented during this audit.', '',
'Earlier E2E records are retained for auditability, excluded from these pass counts: bootstrap Babel failure; missing User-Agent causing session validation errors; and an initial browser-header run whose conservative reservations were not released after successful usage, triggering premature budget refusal. Its first four completed turns and paid calls are real, but the run is not a qualified repeated benchmark. Unknown usage is reserved conservatively, never priced as zero.', '',
'## Blinded companion and response-shape review', '',
'`BLINDED_REVIEW_PACKET.json` contains 12 outputs, four models × three scenarios, one repetition each. Model names were hidden during primary-agent scoring; the key was opened afterward. This is **not independent human evaluation**. Human scoring remains pending; latency/cost are in the separate key so they cannot reveal the expensive cohort before quality scoring.', '',
'The sample had **8 pass, 3 partial, 1 fail** behavioral verdicts. It cannot establish a population quality ranking. Short factual answers generally stayed short and unrealistic four-park/five-day requests received useful pushback. Seattle exposed clarification-first behavior: Terra asked for dates/interests without a plan; Sol offered only an outline; Astra withheld a plan behind several questions; Luna gave a useful three-day tool artifact. Thus higher price did not consistently improve helpfulness.', '',
'GPT-6 Luna falsely said travelers can drive to Brooks Camp in two of its three smoke repetitions. Expanded repetition 3 instead says “You can drive to King Salmon” without disclosing its isolation from the Alaska highway system. The [NPS Katmai FAQ](https://www.nps.gov/katm/faqs.htm) explains the lack of road connections from Anchorage/the Alaska highway system. Two other expanded Luna repetitions correctly explain air/boat access. A current-access caveat does not cure false road guidance. This is a specific observed regression and consistency concern, not an estimated overall factual error rate.', '',
'`BLINDED_REVIEW_SCORES.json` records ten 1–5 dimensions and `adaptive_response_shape_score` per reviewed output. Continuity/constraints are null where absent. No composite score is computed for unreviewed cohorts. Common generic behavior is withholding useful provisional guidance until more preferences arrive and repeatedly appending live-data caveats, not merely using headings. Keyword phrase/heading counts in the CSV are descriptive, not quality scores.', '',
'## Refusal analysis', '',
f"Provider-level refusals: **{sum(bool(r.get('refusal')) for r in rows)}/{len(rows)}**. `refusal-review.json` contains lexical candidates for review, including factual ‘cannot drive’ answers that are not refusals. It must not be interpreted as a refusal rate.", '',
'Observed unnecessary-withholding examples: 5.6 Terra B02 run 1 asks for dates/priorities before making any Joshua Tree/Death Valley comparison; 6 Luna B01 runs 2/3 withholds a stable Acadia/Shenandoah comparison pending dates/current foliage. Both can offer useful conditional advice without a live forecast. Both Sol cohorts A04 repeatedly decline a drive estimate because no live route evidence is available; distinguish justified refusal to invent a verified duration from the missed chance to explain the route and uncertainty. These are prompt/evidence interactions as well as model differences. In wildfire I04, refusing to declare the route safe while offering immediate precautions and official verification is appropriate.', '',
'A complete blind, per-output refusal adjudication and rates by task/model remain unmeasured. Real pipeline terminal failures and admission failures are separately recorded, not conflated with model safety refusal. Stable provisional advice is possible for some failed discovery turns; committing an unvalidated patch is not an acceptable fallback.', '',
'## Cost and successful-outcome accounting', '',
f"Controlled model cost, including smoke: **${sum(r.get('estimated_model_cost') or 0 for r in rows):.6f}**, with {sum(r.get('estimated_model_cost') is None for r in rows)} unpriced calls. E2E provider calls with returned usage, including qualification runs: **${sum(dollars(r) or 0 for r in e2e if r['type']=='provider_complete'):.6f}**; {sum(dollars(r) is None for r in e2e if r['type']=='provider_complete')} completed provider calls lack a supported usage price. This excludes search/maps/tool-provider charges, which were not returned by their providers. It is an estimate from official list prices, not an invoice.", '',
'Smoke preceded expanded execution and verified streaming/token instrumentation. The full controlled run has a $22 cap and E2E a cumulative $3 cap, both enforced by pre-dispatch reservations; Astra was limited to a small diagnostic subset. Preflight artifacts preserve estimated upper bounds. Concurrent calls count against reservations. Official cache-read and cache-write rates are applied; reasoning tokens are already included in output tokens.', '',
'Per-call cost is recorded in raw JSONL; per-logical-turn model cost and retry counts are in `e2e-analysis.json`, recalculated independently of stale application pricing. Search and tools, repair cost attribution by substage, cost per human-usable itinerary, successful patch and completed trip remain N/M. Dividing spend by HTTP 200 or tool-schema success would misstate the requested cost per successful Trailie outcome. A per-1,000-turn projection requires a stated production task mix and measured success/retry rates; none was supplied, so no synthetic product-cost estimate is presented.', '',
'## Test evidence and remaining qualification', '',
'Backend: 487 passing suites, three suites failing to load email JSX, one skipped; 7,460 passing tests and 22 skipped. Frontend: 20 focused publication/response-model tests pass. Audit harness: four budget/comparison tests pass. Architecture probes: 15 pass, 16 fail across 31 adversarial helper cases. These denominators are distinct from conversations.', '',
'Before model selection: fix the proven durability, temporal and derived-provenance blockers; execute authenticated/guest and stream/non-stream parity; frozen nonempty evidence and populated canonical-state candidate runs; all downstream failure classes; browser/iOS publication races; complete G/H/J live coverage; and human review of factuality, refusals, companion quality and adaptive shape. This audit establishes blockers and measured generation tradeoffs, not completion of every proposed qualification gate.']
state_file=OUT/'e2e-state-comparisons.json'
if state_file.exists():
    states=json.loads(state_file.read_text())
    lines += ['', '## Saved-plan and geographic completeness observations', '',
    'These compare persisted canonical objects and returned artifacts, not rendered browser maps. Coordinate availability is affected by the empty local database and provider restrictions. Explicit status counts check the requested `locationStatus` vocabulary; provenance fields alone do not provide the four-state contract.', '',
    '| Turn returning an itinerary | Stops | Coordinates | Explicit location status | Drive minutes / eligible legs | Empty days | Response/saved hash match |',
    '|---|---:|---:|---:|---:|---:|---|']
    for s in states:
        if s['has_returned_itinerary']:
            lines.append(f"| {s['run_id']} | {s['returned_stop_count']} | {s['returned_coordinate_count']} | {s['returned_explicit_location_status_count']} | {s['populated_drive_minutes_count']}/{s['eligible_drive_leg_count']} | {s['returned_empty_day_count']} | {s['response_saved_hash_match']} |")
    checked=[s for s in states if s['failed_turn_preserved_canonical_plan'] is not None]
    lines += ['',f"Failed-turn preservation: {sum(s['failed_turn_preserved_canonical_plan'] for s in checked)}/{len(checked)} retained the prior canonical plan exactly. This is a working safeguard, separate from fulfilling the requested edit. The first successful closure adaptation changed all four days; its allowed impact scope was not independently adjudicated, so unauthorized mutation remains N/M. Full state comparisons are in `e2e-state-comparisons.json`."]
(OUT/'TRAILIE_MODEL_BENCHMARK_RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'controlled_calls':len(rows),'qualified_turns':len(turns),'controlled_cost':sum(r.get('estimated_model_cost') or 0 for r in rows),'e2e_known_model_cost':sum(dollars(r) or 0 for r in e2e if r['type']=='provider_complete')}))
