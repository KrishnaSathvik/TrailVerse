import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrailieResponse from '../TrailieResponse';
import { toLiveTrailieResponseModel } from '@/lib/trailieResponseModel';
import { composeRichTrip, PERSONALIZATION, groundedTripGuidance, personalizationDimensions, personalizationMessage } from '@/lib/trailieRichPresentation';
import PersonalizeTrip from '../PersonalizeTrip';
vi.mock('@/components/itinerary/ItineraryMapView', () => ({ default: () => <div>Canonical map</div>, ITINERARY_MAP_PATH_MODE: { NONE: 'none' } }));
// Imagery is an optional enhancement; tests stay offline and deterministic.
vi.mock('@/hooks/useTripImagery', () => ({ default: () => [] }));
afterEach(cleanup);
const plan = { parkName: 'Glacier', responseVersion: 1, days: Array.from({ length: 5 }, (_, i) => ({ dayNumber: i + 1, label: `Lake day ${i + 1}`, stops: [{ name: `Lake ${i + 1}`, type: 'lake' }], overnightLocation: 'West Glacier' })) };
const manifest = { schemaVersion: 1, presentationKind: 'itinerary', prosePolicy: 'full', primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' }, supportingModules: [], refinement: { isRefinement: false, changes: [] }, ending: { caveat: null, beforeYouGo: null, followups: [] } };
function show(extra = {}, props = {}) { const response = toLiveTrailieResponseModel({ message: { content: 'Here is your trip.', canonicalPlan: plan, presentation: manifest, ...extra } }); return render(<TrailieResponse response={response} artifactAccess="account" onOpenArtifact={vi.fn()} {...props} />); }
it('keeps simple answers conversational with a plan in context', () => {
  show({ content: 'October can work.', presentation: null, presentationKind: 'plain_answer' });
  expect(screen.getByText('October can work.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Trip created')).not.toBeInTheDocument();
});
it('shows every compact day, canonical stops and one workspace action', () => {
  const open = vi.fn(); show({}, { onOpenArtifact: open });
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Lake 5')).toBeInTheDocument();
  expect(screen.queryByLabelText('Trip map preview')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open trip' }));
  expect(open).toHaveBeenCalledWith('itinerary');
});
it('gives guests the same rich trip; Open trip goes through the chat’s account gate', () => {
  const open = vi.fn();
  show({}, { artifactAccess: 'guest', onOpenArtifact: open, onFollowup: vi.fn(), personalizationCurrent: true });
  expect(screen.getByText('Lake 5')).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Make this trip yours' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open trip' }));
  expect(open).toHaveBeenCalledWith('itinerary');
});
it('orders things to know, personalization, then the single Open trip action', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: true });
  const form = screen.getByRole('form', { name: 'Make this trip yours' });
  const open = screen.getByRole('button', { name: 'Open trip' });
  expect(form.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: /view itinerary|view map/i })).not.toBeInTheDocument();
});
it('offers personalization only on the latest trip and never on an update', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: false });
  expect(screen.queryByRole('form', { name: 'Make this trip yours' })).not.toBeInTheDocument();
  cleanup();
  show({ presentation: { ...manifest, refinement: { isRefinement: true, changes: ['trip_updated'], changedDayNumbers: [2] } } }, { onFollowup: vi.fn(), personalizationCurrent: true });
  expect(screen.queryByRole('form', { name: 'Make this trip yours' })).not.toBeInTheDocument();
});
it('does not re-ask what traveler memory already knows', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: true, planningState: { travelers: { adults: 2, children: 2 }, dates: { startDate: '2026-10-01' } } });
  expect(screen.queryByRole('group', { name: 'Who’s coming?' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'When are you going?' })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Travel style' })).toBeInTheDocument();
});
it('routes an exhausted guest to sign-in instead of silently submitting', () => {
  const submit = vi.fn(); const gate = vi.fn();
  render(<PersonalizeTrip dimensions={PERSONALIZATION} onSubmit={submit} current disabled guestExhausted onRequireAccount={gate} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Fall' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to customize →' }));
  expect(gate).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});
it('renders only changed days after accepted refinement', () => {
  show({ presentation: { ...manifest, refinement: { isRefinement: true, changes: ['trip_updated'], changedDayNumbers: [3] } } });
  expect(screen.getByText('Trip updated')).toBeInTheDocument();
  expect(screen.getByText('Lake 3')).toBeInTheDocument();
  expect(screen.queryByText('Lake 1')).not.toBeInTheDocument();
});
it('preserves prose and omits trip claims after failed save', () => {
  show({ artifactStatus: { status: 'save_failed' } });
  expect(screen.getByText('Here is your trip.')).toBeInTheDocument();
  expect(screen.queryByText('Trip created')).not.toBeInTheDocument();
});
it('submits a normal user turn and waits for persisted acceptance', async () => {
  let resolve; const submit = vi.fn(() => new Promise(r => { resolve = r; }));
  render(<PersonalizeTrip dimensions={PERSONALIZATION} onSubmit={submit} current />);
  for (const name of ['Fall', 'Family with kids', 'Scenic + relaxed']) fireEvent.click(screen.getByRole('radio', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Customize my trip →' }));
  expect(submit).toHaveBeenCalledWith('Update this trip for fall. I’m traveling with family and kids. I want it scenic and relaxed.');
  expect(screen.getByRole('button', { name: 'Updating your trip…' })).toBeDisabled();
  resolve({ persisted: true, canonicalPlan: plan, presentation: { refinement: { isRefinement: true } } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Trip updated'));
});
it('does not label prose-only refinements as success', async () => {
  render(<PersonalizeTrip dimensions={PERSONALIZATION} onSubmit={vi.fn().mockResolvedValue({ persisted: true })} current />);
  fireEvent.click(screen.getByRole('radio', { name: 'Fall' }));
  fireEvent.click(screen.getByRole('button', { name: 'Customize my trip →' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Couldn’t update the trip. Your saved trip is unchanged.'));
  expect(screen.getByRole('button', { name: 'Customize my trip →' })).toBeEnabled();
});
it('disables old revisions and demo controls', () => {
  const submit = vi.fn(); const view = render(<PersonalizeTrip dimensions={PERSONALIZATION} onSubmit={submit} current={false} />);
  expect(screen.getByRole('radio', { name: 'Fall' })).toBeDisabled();
  view.rerender(<PersonalizeTrip dimensions={PERSONALIZATION} onSubmit={submit} example />);
  expect(screen.getByRole('radio', { name: 'Fall' })).toBeDisabled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});
it('allows only approved imagery and never mutates the plan', () => {
  const before = JSON.stringify(plan);
  const model = composeRichTrip({ canonicalPlan: plan, parkImages: [{ url: 'https://evil.test/i.jpg' }, { url: 'https://www.nps.gov/glac/i.jpg' }] });
  expect(model.images).toEqual([{ url: 'https://www.nps.gov/glac/i.jpg' }]);
  expect(model.guidance).toEqual([]);
  expect(JSON.stringify(plan)).toBe(before);
});
it('requires sourced structured access data for things to know', () => {
  const edge = { sourceStopId: 'a', targetStopId: 'b', operationalAccess: { status: 'required_alternative', requiredMode: 'shuttle', sources: [] } };
  const trip = { days: [{ stops: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], travelEdges: [edge] }] };
  expect(groundedTripGuidance(trip)).toEqual([]);
  edge.operationalAccess.sources = ['https://www.nps.gov/access'];
  expect(groundedTripGuidance(trip)[0].text).toBe('Use shuttle between A and B.');
});
it('renders structured comparisons without trip controls', () => {
  show({ canonicalPlan: null, presentation: { ...manifest, presentationKind: 'comparison', primaryArtifact: { kind: 'comparison', source: 'responseArtifacts.comparison' } }, responseArtifacts: { comparison: { columns: ['Zion', 'Bryce'], rows: [{ label: 'Scenery', values: ['Canyon', 'Hoodoos'] }] } } });
  expect(screen.getByLabelText('Destination comparison')).toBeInTheDocument();
  expect(screen.queryByLabelText('Trip created')).not.toBeInTheDocument();
});

it('builds the visible personalization turn from every chosen dimension', () => {
  expect(personalizationMessage({ party: 'solo', hiking: 'easy' })).toBe('Update this trip. I’m traveling solo. I prefer easy hikes.');
  expect(personalizationMessage({})).toBe('');
});
it('omits images, map and notes when no eligible data exists', () => {
  const model = composeRichTrip({ canonicalPlan: plan, parkImages: [] });
  expect(model.images).toEqual([]);
  expect(model.map).toBeNull();
  expect(model.blocks).toEqual(['trip_overview', 'compact_days', 'trip_artifact']);
});
it('keeps official imagery from the park record, capped at three', () => {
  const imagery = Array.from({ length: 5 }, (_, i) => ({ url: `https://www.nps.gov/glac/${i}.jpg` }));
  expect(composeRichTrip({ canonicalPlan: plan }, null, { imagery }).images).toHaveLength(3);
});
it('shows the map only from authoritative canonical coordinates and counts unmapped stops', () => {
  const located = (name, lat) => ({ id: name, name, type: 'viewpoint', location: { lat, lon: -113.7, status: 'resolved', authority: 'official_owner', source: 'resolved_metadata', sourceRef: 'nps:ref' } });
  const mapped = { ...plan, days: [{ dayNumber: 1, label: 'Sun Road', stops: [located('Logan Pass', 48.69), { id: 'x', name: 'Unknown overlook', type: 'viewpoint' }] }] };
  const model = composeRichTrip({ canonicalPlan: mapped });
  expect(model.map?.mappedCount).toBe(1);
  expect(model.unmappedCount).toBe(1);
});
it('limits personalization to a few open choices and skips it when little is unknown', () => {
  expect(personalizationDimensions(plan, null)).toHaveLength(3);
  expect(personalizationDimensions(plan, { travelers: { adults: 2 }, dates: { startDate: '2026-07-01' }, preferences: { pace: 'relaxed' } })).toEqual([]);
});
it('never re-asks a travel month or hiking preference the traveler already stated', () => {
  const keys = personalizationDimensions(plan, { dates: { travelMonth: 'October' }, preferences: { fitness: 'easy hikes' } }).map(d => d.key);
  expect(keys).not.toContain('season');
  expect(keys).not.toContain('hiking');
});

it('shows official park-wide guidance first and never a rule that does not apply', () => {
  const tripGuidance = [
    { text: 'During the shuttle season, private vehicles aren’t allowed on Zion Canyon Scenic Drive. Check the current shuttle schedule once your travel dates are set.', applicability: 'date_dependent', source: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm' },
    { text: 'Not active', applicability: 'not_applicable', source: 'https://www.nps.gov/x.htm' },
    { text: 'Unsourced', applicability: 'applies', source: null },
  ];
  const items = groundedTripGuidance({ ...plan, tripGuidance });
  expect(items[0]).toEqual({ text: tripGuidance[0].text, source: tripGuidance[0].source });
  expect(items.map(i => i.text)).not.toContain('Not active');
  expect(items.map(i => i.text)).not.toContain('Unsourced');
});
