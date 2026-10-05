"""Saved-state comparisons for the qualified HTTP sequence, without UI claims."""
import json
import pathlib
OUT=pathlib.Path(__file__).resolve().parents[3]/'docs/eval/trailie-audit-2026-09-23'
raw=[json.loads(x) for x in (OUT/'e2e-raw.jsonl').read_text().splitlines()]
turns=[r for r in raw if r.get('execution_id')=='2750c1e7-5fd7-446f-9e84-193e23860e44' and r['type']=='turn']
previous=None
rows=[]
for r in turns:
    if r['scenario_id']=='F01':
        previous=None
    body=r['response'];state=r.get('saved_state') or {};messages=state.get('messages') or []
    saved=next((m['canonicalPlan'] for m in reversed(messages) if m.get('canonicalPlan')),None)
    plan=body.get('itinerary') or None
    stops=[s for d in (plan or {}).get('days',[]) for s in d.get('stops',[])]
    drives=[s for d in (plan or {}).get('days',[]) for s in d.get('stops',[])[1:]]
    changed=[]
    if saved and previous:
        for i in range(max(len(saved['days']),len(previous['days']))):
            a=saved['days'][i] if i<len(saved['days']) else None
            b=previous['days'][i] if i<len(previous['days']) else None
            if a!=b:
                changed.append(i+1)
    v=body.get('trailieV2') or {}
    rows.append({'run_id':r['run_id'],'status':v.get('status'),'has_returned_itinerary':bool(plan),'saved_days':len(saved.get('days',[])) if saved else None,'changed_days_since_prior_turn':changed if previous else None,'failed_turn_preserved_canonical_plan':saved==previous if previous and v.get('status')=='failed' else None,'response_saved_hash_match':body.get('itineraryHash')==saved.get('itineraryHash') if saved and body.get('itineraryHash') else None,'returned_stop_count':len(stops) if plan else None,'returned_coordinate_count':sum(isinstance(s.get('latitude'),(int,float)) and isinstance(s.get('longitude'),(int,float)) for s in stops) if plan else None,'returned_explicit_location_status_count':sum(s.get('locationStatus') in ['resolved','ambiguous','unresolved','not_applicable','not applicable'] for s in stops) if plan else None,'returned_empty_day_count':sum(not d.get('stops') for d in plan['days']) if plan else None,'eligible_drive_leg_count':len(drives) if plan else None,'populated_drive_minutes_count':sum(isinstance(s.get('drivingTimeFromPreviousMin'),(int,float)) for s in drives) if plan else None,'travel_logistics_hash':(body.get('travelLogistics') or {}).get('planHash'),'map_rendered_completeness':None,'route_geometry_hash_match':None,'unauthorized_mutation_count':None})
    previous=saved
(OUT/'e2e-state-comparisons.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'turns':len(rows),'returned_itineraries':sum(r['has_returned_itinerary'] for r in rows),'failed_plan_preservation_checks':sum(r['failed_turn_preserved_canonical_plan'] is not None for r in rows),'failed_plan_preservation_failures':sum(r['failed_turn_preserved_canonical_plan'] is False for r in rows),'response_saved_hash_failures':sum(r['response_saved_hash_match'] is False for r in rows)}))
