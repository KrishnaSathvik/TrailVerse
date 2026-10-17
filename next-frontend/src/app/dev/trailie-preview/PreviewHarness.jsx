'use client';
import { useEffect, useRef, useState } from 'react';
import TrailieDraftPreview from '@/components/itinerary/TrailieDraftPreview';
import TripWorkspaceView from '@/components/itinerary/TripWorkspaceView';
import { reduceDraftPreview } from '@/lib/trailieDraftPreview';
import { consumeAiSseStream } from '@/services/aiService';

// Offline transport fixture. Never calls an API, model, storage or persistence service.
const days = ['Zion arrival', 'Riverside Walk', 'A quieter canyon day', 'Bryce overlooks', 'Return to Las Vegas'].map((label,index) => ({
  index,dayNumber:index+1,label,summary:'A relaxed day with time for travel and recovery.',
  activities:[{name:index===0?'Pa’rus Trail':label,note:'Illustrative replay content. Conditions and logistics have not been validated.'}],
}));
const accepted = {parkName:'Offline replay trip',intro:'Accepted fixture for testing replacement only.',days:days.map(d=>({id:`d${d.index}`,dayNumber:d.dayNumber,label:d.label,stops:[],dayStructure:{type:'rest',startPeriod:'morning',endPeriod:'afternoon',summary:d.summary,blocks:[{kind:'downtime',periods:['morning','afternoon'],label:'Relaxed time',note:'Offline accepted fixture.',stopIds:[]}]}}))};
export default function PreviewHarness() {
  const [view,setView]=useState({draft:null,plan:null,status:'Idle'}),active=useRef(null);
  useEffect(()=>()=>{active.current?.abort();active.current=null;},[]);
  async function replay(mode) {
    active.current?.abort();const control=new AbortController();active.current=control;
    setView({draft:null,plan:null,status:'Replaying'});
    const responseId=crypto.randomUUID();
    const events=[{type:'draft_started',responseId,sequence:1},...days.map((day,i)=>({type:'draft_day',responseId,sequence:i+2,day}))];
    if(mode==='Rejected')events.push({type:'draft_withdrawn',responseId,sequence:7},{type:'error',message:'Offline validation rejected the draft.',retryable:false});
    else if(mode!=='Disconnected')events.push({type:'done',responseId,persisted:true,canonicalPlan:accepted});
    if(mode==='Stale')events.splice(2,0,{type:'draft_day',responseId:'old-response',sequence:3,day:{...days[1],label:'STALE MUST NOT APPEAR'}});
    if(mode==='Out of order')events[2].sequence=99;
    const body=new ReadableStream({async start(controller){
      for(const event of events){
        await new Promise(resolve=>setTimeout(resolve,650));
        if(control.signal.aborted){controller.error(new DOMException('Cancelled','AbortError'));return;}
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }});
    try {
      await consumeAiSseStream(new Response(body,{headers:{'x-trailie-runtime':'model_first'}}),{
        onDraftEvent:event=>{if(active.current===control&&!control.signal.aborted)setView(v=>({...v,draft:reduceDraftPreview(v.draft,event)}));},
        onDone:result=>{if(active.current===control&&!control.signal.aborted&&result.persisted&&result.canonicalPlan)
          setView({draft:null,plan:result.canonicalPlan,status:'Accepted fixture — no write performed'});},
      });
    } catch { if(active.current===control)setView(v=>({...v,draft:reduceDraftPreview(v.draft,{type:'draft_closed'}),status:'Preview withdrawn'})); }
  }
  const cancel=()=>{active.current?.abort();setView(v=>({...v,draft:reduceDraftPreview(v.draft,{type:'draft_closed'}),status:'Cancelled'}));};
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-4 py-8">
    <h1 className="text-2xl font-semibold">Progressive itinerary preview — local prototype</h1>
    <p>Offline fixtures only. No model calls, saved trips or public activation.</p>
    <div className="flex flex-wrap gap-2">{['Accepted','Rejected','Disconnected','Stale','Out of order'].map(mode=><button key={mode} className="rounded border px-3 py-2" onClick={()=>replay(mode)}>Replay {mode.toLowerCase()}</button>)}<button className="rounded border px-3 py-2" onClick={cancel}>Cancel replay</button></div>
    <p role="status">{view.status}</p>
    <TrailieDraftPreview preview={view.draft} onCancel={cancel}/>
    {view.plan&&<section aria-label="Accepted itinerary"><TripWorkspaceView plan={view.plan}/></section>}
  </main>;
}
