"""Check audit integrity and redact local secret values without printing them."""
import collections
import csv
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/eval/trailie-audit-2026-09-23'
secrets = []
for line in (ROOT/'server/.env').read_text().splitlines():
    match = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)',line)
    if match and re.search(r'KEY|TOKEN|SECRET|PASSWORD|MONGODB_URI',match[1]):
        value=match[2].strip().strip('"\'')
        if len(value)>8:
            secrets.append(value)
redacted_files=[]
for p in OUT.iterdir():
    if not p.is_file():
        continue
    try:
        text=p.read_text()
    except UnicodeDecodeError:
        continue
    original=text
    for value in secrets:
        text=text.replace(value,'[REDACTED_LOCAL_SECRET]')
    if text!=original:
        p.write_text(text)
        redacted_files.append(p.name)
rows=[json.loads(x) for x in (OUT/'TRAILIE_MODEL_BENCHMARK_RAW.jsonl').read_text().splitlines()]
groups=collections.defaultdict(list)
for r in rows:
    groups[(r['phase'],r['scenario_id'])].append(r)
hash_mismatches=[list(k) for k,v in groups.items() if len(set(r['comparison_input_hash'] for r in v))!=1]
duplicates=[k for k,v in collections.Counter(r['run_id'] for r in rows).items() if v>1]
snapshot=json.loads((OUT/'repository-snapshot.json').read_text())
changed=[f for f,h in snapshot['source_sha256'].items() if not (ROOT/f).exists() or hashlib.sha256((ROOT/f).read_bytes()).hexdigest()!=h]
e2e=[json.loads(x) for x in (OUT/'e2e-raw.jsonl').read_text().splitlines()]
turns=[r for r in e2e if r.get('execution_id')=='2750c1e7-5fd7-446f-9e84-193e23860e44' and r['type']=='turn']
cases=json.loads((OUT/'TRAILIE_MODEL_EVAL_CASES.json').read_text())['cases']
with (OUT/'scenario-coverage.csv').open('w') as f:
    w=csv.writer(f);w.writerow(['scenario_id','family','controlled_full_calls','controlled_models','qualified_http_turns','coverage_limit'])
    for c in cases:
        rs=groups.get(('full',c['scenario_id']),[])
        w.writerow([c['scenario_id'],c['family'],len(rs),';'.join(sorted(set(r['model'] for r in rs))),sum(r['scenario_id']==c['scenario_id'] for r in turns),'No saved state in controlled mode' if rs else 'HTTP baseline only' if c['task_class']=='F' else 'Helper/regression coverage only; repeated live candidate matrix not run'])
result={'source_files_checked':len(snapshot['source_sha256']),'changed_source_files':changed,'controlled_calls':len(rows),'duplicate_run_ids':duplicates,'comparison_hash_mismatches':hash_mismatches,'redacted_files':redacted_files,'qualified_http_turns':len(turns),'required_report_files_present':all((OUT/f).exists() for f in ['TRAILIE_RUNTIME_AUDIT.md','TRAILIE_ARCHITECTURE_INVARIANT_AUDIT.md','TRAILIE_MODEL_COMPATIBILITY_2026-09.md','TRAILIE_MODEL_EVAL_CASES.json','TRAILIE_MODEL_BENCHMARK_RAW.jsonl','TRAILIE_MODEL_BENCHMARK_SUMMARY.csv','TRAILIE_MODEL_BENCHMARK_RESULTS.md','TRAILIE_MODEL_MIGRATION_RECOMMENDATION.md'])}
(OUT/'audit-integrity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
if changed or duplicates or hash_mismatches or not result['required_report_files_present']:
    raise SystemExit(1)
