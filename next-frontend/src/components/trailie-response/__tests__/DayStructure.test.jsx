import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TrailieItinerary from '../TrailieItinerary';
import { exportPublicPlan } from '@/lib/publicItineraryExport.mjs';
vi.mock('@/components/trip-map/TripMapSheet', () => ({ default: () => null }));
afterEach(cleanup);
const day = {dayNumber:1,label:'Lake walk and recovery',overnightLocation:'West-side base',stops:[{id:'walk',name:'Lake walk',duration:240,startTime:'',timeWindow:'Morning',note:'One continuous round trip.'}],dayStructure:{type:'rest',summary:'Protect the afternoon for recovery.',blocks:[{kind:'outing',periods:['morning'],label:'A lake outing',note:'Pack a snack.',stopIds:['walk']},{kind:'downtime',periods:['afternoon','evening'],label:'Lunch and a relaxed afternoon',note:'Return to the base for lunch, rest and dinner.',stopIds:[]}]}};
it('renders complete day structure in sequence and exports it without private fields', () => {
 const exported=exportPublicPlan({days:[{...day,dayStructure:{...day.dayStructure,privateToken:'secret'}}]});
 expect(JSON.stringify(exported)).not.toContain('secret');
 render(<TrailieItinerary plan={exported} showMapActions={false}/>);
 expect(screen.getByText(/Relaxed day/)).toBeInTheDocument();
 expect(screen.getByText('Lunch and a relaxed afternoon')).toBeInTheDocument();
 expect(screen.getAllByText('Lake walk')).toHaveLength(1);
 expect(screen.getByText('West-side base')).toBeInTheDocument();
 expect(screen.getByText('Lake walk').compareDocumentPosition(screen.getByText('Lunch and a relaxed afternoon')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('shows transfer days without fabricating stops or an empty-day warning', () => {
 render(<TrailieItinerary showMapActions={false} plan={{days:[{dayNumber:1,label:'Moving base',stops:[],dayStructure:{type:'transfer',summary:'Keep the day for travel.',blocks:[{kind:'transfer',periods:['morning','afternoon'],label:'Travel to the next base',note:'Allow breaks and an unhurried lunch; duration is not confirmed.',stopIds:[]},{kind:'downtime',periods:['evening'],label:'Settle in',note:'Dinner and rest.',stopIds:[]}]}}]}}/>);
 expect(screen.getByText(/Transfer day/)).toBeInTheDocument();
 expect(screen.getByText('Travel to the next base')).toBeInTheDocument();
 expect(screen.queryByText('No stops yet')).not.toBeInTheDocument();
});
it('shows meaningful clock precision and its reason together', () => {
 render(<TrailieItinerary showMapActions={false} plan={{days:[{...day,stops:[{...day.stops[0],startTime:'08:00',timingReason:'Meet your booked guide.'}]}]}}/>);
 expect(screen.getByText(/Morning · 8:00 AM/)).toBeInTheDocument();
 expect(screen.getByText('Meet your booked guide.')).toBeInTheDocument();
});
it('labels flexible experiences without manufacturing map stops or map errors', async () => {
 const { buildTripMapModel }=await import('@/lib/itineraryMapStops');
 const p=exportPublicPlan({days:[{...day,stops:[],dayStructure:{...day.dayStructure,blocks:[{kind:'experience',periods:['afternoon'],label:'Easy riverside time',note:'Explore the area at your own pace.',stopIds:[]}]}}]});
 render(<TrailieItinerary plan={p}/>);
 expect(screen.getByText('Flexible experience · not mapped')).toBeInTheDocument();
 expect(screen.getByText('Easy riverside time')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/trip map/i})).not.toBeInTheDocument();
 expect(screen.queryByText('No stops yet')).not.toBeInTheDocument();
 expect(buildTripMapModel(p).hasAnyMappedStop).toBe(false);
 expect(p.days[0].dayStructure.blocks[0].duration).toBeUndefined();
});
