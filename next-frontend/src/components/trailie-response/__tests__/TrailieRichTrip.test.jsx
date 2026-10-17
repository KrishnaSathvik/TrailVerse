import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrailieResponse from '../TrailieResponse';
import { toLiveTrailieResponseModel } from '@/lib/trailieResponseModel';
import { composeRichTrip, groundedTripGuidance } from '@/lib/trailieRichPresentation';
import AdjustTrip, { ADJUST_SUGGESTIONS } from '../AdjustTrip';
vi.mock('@/components/itinerary/ItineraryMapView', () => ({ default: () => <div>Canonical map</div>, ITINERARY_MAP_PATH_MODE: { NONE: 'none' } }));
// Imagery is an optional enhancement; tests stay offline and deterministic.
vi.mock('@/hooks/useTripImagery', () => ({ default: () => [] }));
afterEach(cleanup);
const plan = { parkName: 'Glacier', responseVersion: 1, days: Array.from({ length: 5 }, (_, i) => ({ dayNumber: i + 1, label: `Lake day ${i + 1}`, dayStructure: { type: 'sightseeing', summary: `Focus on Lake ${i + 1} and recovery.`, startPeriod: 'morning', endPeriod: 'evening', blocks: [] }, stops: [{ name: `Lake ${i + 1}`, type: 'lake' }], overnightLocation: 'West Glacier' })) };
const manifest = { schemaVersion: 1, presentationKind: 'itinerary', prosePolicy: 'full', primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' }, supportingModules: [], refinement: { isRefinement: false, changes: [] }, ending: { caveat: null, beforeYouGo: null, followups: [] } };
function show(extra = {}, props = {}) { const response = toLiveTrailieResponseModel({ message: { content: 'Here is your trip.', canonicalPlan: plan, presentation: manifest, ...extra } }); return render(<TrailieResponse response={response} artifactAccess="account" onOpenArtifact={vi.fn()} {...props} />); }
it('keeps simple answers conversational with a plan in context', () => {
  show({ content: 'October can work.', presentation: null, presentationKind: 'plain_answer' });
  expect(screen.getByText('October can work.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Trip created')).not.toBeInTheDocument();
});
it('shows day purposes without a second stop list, and one workspace action', () => {
  const open = vi.fn(); show({}, { onOpenArtifact: open });
  expect(screen.getByLabelText('Trip shape')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Focus on Lake 5 and recovery.')).toBeInTheDocument();
  expect(screen.queryByText('Lake 5')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Trip map preview')).not.toBeInTheDocument();
  expect(screen.queryByText('Canonical map')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open trip' }));
  expect(open).toHaveBeenCalledWith('itinerary');
});
it('gives guests the same rich trip; Open trip goes through the chat’s account gate', () => {
  const open = vi.fn();
  show({}, { artifactAccess: 'guest', onOpenArtifact: open, onFollowup: vi.fn(), personalizationCurrent: true });
  expect(screen.getByText('Focus on Lake 5 and recovery.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Adjust your trip' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open trip' }));
  expect(open).toHaveBeenCalledWith('itinerary');
});
it('never offers the sample-style "Make this trip yours" form on a live trip', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: true });
  expect(screen.queryByRole('region', { name: 'Make this trip yours' })).not.toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Make this trip yours' })).not.toBeInTheDocument();
  expect(screen.queryByText('When')).not.toBeInTheDocument();
  expect(screen.getByText('Want to adjust anything?')).toBeInTheDocument();
});
it('orders things to know, refinement, then the single Open trip action', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: true });
  const adjust = screen.getByRole('region', { name: 'Adjust your trip' });
  const open = screen.getByRole('button', { name: 'Open trip' });
  expect(adjust.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: /view itinerary|view map/i })).not.toBeInTheDocument();
});
it('offers refinement only on the latest trip', () => {
  show({}, { onFollowup: vi.fn(), personalizationCurrent: false });
  expect(screen.queryByRole('region', { name: 'Adjust your trip' })).not.toBeInTheDocument();
});
it('routes an exhausted guest to sign-in instead of silently submitting', () => {
  const submit = vi.fn(); const gate = vi.fn();
  render(<AdjustTrip onSubmit={submit} current disabled guestExhausted onRequireAccount={gate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Make it more relaxed' }));
  expect(gate).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});
it('keeps refinement prose and workspace access without repeating the updated trip', () => {
  show({ presentation: { ...manifest, refinement: { isRefinement: true, changes: ['trip_updated'], changedDayNumbers: [3] } } });
  expect(screen.queryByText('Trip updated')).not.toBeInTheDocument();
  expect(screen.queryByText('Focus on Lake 3 and recovery.')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Glacier' })).not.toBeInTheDocument();
  expect(screen.getByText('Here is your trip.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open trip' })).toBeInTheDocument();
  expect(screen.queryByText('Focus on Lake 1 and recovery.')).not.toBeInTheDocument();
  expect(screen.queryByText('Lake 3')).not.toBeInTheDocument();
});
it('preserves prose and omits trip claims after failed save', () => {
  show({ artifactStatus: { status: 'save_failed' } });
  expect(screen.getByText('Here is your trip.')).toBeInTheDocument();
  expect(screen.queryByText('Trip created')).not.toBeInTheDocument();
});
it('submits a suggestion as a normal user turn and waits for persisted acceptance', async () => {
  let resolve; const submit = vi.fn(() => new Promise(r => { resolve = r; }));
  render(<AdjustTrip onSubmit={submit} current />);
  fireEvent.click(screen.getByRole('button', { name: 'Make it more relaxed' }));
  expect(submit).toHaveBeenCalledWith(ADJUST_SUGGESTIONS[0][1]);
  expect(screen.getByRole('button', { name: 'Reduce hiking' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Updating your trip…');
  resolve({ persisted: true, canonicalPlan: plan, presentation: { refinement: { isRefinement: true } } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Trip updated'));
});
it('does not label prose-only refinements as success', async () => {
  render(<AdjustTrip onSubmit={vi.fn().mockResolvedValue({ persisted: true })} current />);
  fireEvent.click(screen.getByRole('button', { name: 'Reduce hiking' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Couldn’t update the trip. Your saved trip is unchanged.'));
  expect(screen.getByRole('button', { name: 'Reduce hiking' })).toBeEnabled();
});
it('prepares an editable refinement without claiming the trip was updated', async () => {
  const prepare = vi.fn().mockResolvedValue({ drafted: true });
  render(<AdjustTrip onSubmit={prepare} current />);
  fireEvent.click(screen.getByRole('button', { name: 'Reduce hiking' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added to your message.'));
  expect(screen.queryByText('Trip updated')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reduce hiking' })).toBeEnabled();
});
it('locks suggestions on older revisions', () => {
  const submit = vi.fn();
  render(<AdjustTrip onSubmit={submit} current={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Make it more relaxed' }));
  expect(screen.getByRole('button', { name: 'Make it more relaxed' })).toBeDisabled();
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

it('omits images and notes when no eligible data exists, and never mounts a chat map', () => {
  const model = composeRichTrip({ canonicalPlan: plan, parkImages: [] });
  expect(model.images).toEqual([]);
  expect(model.map).toBeNull();
  expect(model.dayPurposes).toHaveLength(5);
  expect(model.blocks).toEqual(['trip_overview', 'day_purposes', 'trip_artifact']);
});
it('keeps official imagery from the park record, capped at three', () => {
  const imagery = Array.from({ length: 5 }, (_, i) => ({ url: `https://www.nps.gov/glac/${i}.jpg` }));
  expect(composeRichTrip({ canonicalPlan: plan }, null, { imagery }).images).toHaveLength(3);
});
it('keeps the chat card map-free; workspace owns map authority', () => {
  const located = (name, lat) => ({ id: name, name, type: 'viewpoint', location: { lat, lon: -113.7, status: 'resolved', authority: 'official_owner', source: 'resolved_metadata', sourceRef: 'nps:ref' } });
  const mapped = { ...plan, days: [{ dayNumber: 1, label: 'Sun Road', dayStructure: { summary: 'Logan Pass morning.' }, stops: [located('Logan Pass', 48.69), { id: 'x', name: 'Unknown overlook', type: 'viewpoint' }] }] };
  const model = composeRichTrip({ canonicalPlan: mapped });
  expect(model.map).toBeNull();
  expect(model.unmappedCount).toBe(0);
  expect(model.dayPurposes[0].purpose).toBe('Logan Pass morning.');
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
it('renders one Things to Know section that keeps narrative and grounded links', () => {
  const shuttle = 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm';
  const tripGuidance = [{ text: 'During the shuttle season, private vehicles aren’t allowed on Zion Canyon Scenic Drive.', applicability: 'date_dependent', source: shuttle }];
  const narrativeSections = [{ placement: 'after_plan', heading: 'Things to know', markdown: `Confirm the timetable: [NPS shuttle information](${shuttle}).` }];
  show({ canonicalPlan: { ...plan, tripGuidance, narrativeSections } });
  expect(screen.getAllByText(/^Things to know$/i)).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'NPS shuttle information' })).toHaveAttribute('href', shuttle);
  expect(screen.getByText(/private vehicles aren’t allowed/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', shuttle);
});
it('keeps the standalone Things to Know section when the narrative has none', () => {
  const tripGuidance = [{ text: 'Shuttle only in season.', applicability: 'applies', source: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm' }];
  show({ canonicalPlan: { ...plan, tripGuidance } });
  expect(screen.getAllByText(/^Things to know$/i)).toHaveLength(1);
  expect(screen.getByText('Shuttle only in season.')).toBeInTheDocument();
});
