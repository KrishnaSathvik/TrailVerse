'use client';

import { useMemo } from 'react';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import TrailieMarkdown from './TrailieMarkdown';
import TrailieItinerary from './TrailieItinerary';
import TrailieTripCard from './TrailieTripCard';
import TrailieRankedList from './TrailieRankedList';
import { normalizeTrailiePresentation } from '@/lib/normalizeTrailiePresentation';
import { travelLogisticsBelongsToTurn } from '@/lib/trailieEnhancementOwnership';
import { selectCurrentDerived } from '@/lib/planDerivedPublication';
import { normalizeDisplayText } from '@/components/itinerary/ItineraryPresentationPrimitives';

function Header({ example = false }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <TrailieAvatar className="!h-8 !w-8 shrink-0" />
      <div className="min-w-0">
        <p
          className="text-sm font-semibold leading-none"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Trailie
        </p>
        {example ? (
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Sample conversation</p>
        ) : null}
      </div>
    </div>
  );
}

function NarrativeSections({ sections, placement, parkImages }) {
  const items = (sections || []).filter((section) => section?.placement === placement && section?.markdown);
  if (!items.length) return null;
  return items.map((section, index) => (
    <section key={`${placement}-${index}`} className="max-w-[48rem]">
      {section.heading ? (
        <h3
          className="mb-2 text-[15px] font-semibold leading-snug sm:text-base"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        >
          {section.heading}
        </h3>
      ) : null}
      <TrailieMarkdown text={section.markdown} parkImages={parkImages} />
    </section>
  ));
}

function PlanB({ planB }) {
  if (!planB?.items?.length) return null;
  return (
    <section role="region" aria-label="Plan B" className="pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent-green-dark)' }}>
        If that does not work
      </p>
      {planB.condition ? (
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{planB.condition}</p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {planB.items.map((item, index) => {
          const value = typeof item === 'string' ? { name: item } : item;
          return (
            <li key={`${value.name}-${index}`} className="text-sm leading-6" style={{ color: 'var(--text-primary)' }}>
              <span className="font-semibold">{value.name}</span>
              {value.when && normalizeDisplayText(value.when) !== normalizeDisplayText(planB.condition) ? (
                <span style={{ color: 'var(--text-secondary)' }}> — {value.when}</span>
              ) : null}
              {value.note ? <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>{value.note}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function airportRows(airports) {
  return (Array.isArray(airports) ? airports : []).map((airport, index) => ({
    id: airport.entityId || airport.airportCode || index,
    title: airport.name,
    code: airport.airportCode,
    kicker: index === 0 ? 'Best overall' : null,
    detail: airport.groundTransfer?.destinationLabel
      ? `Ground access toward ${airport.groundTransfer.destinationLabel}`
      : null,
  }));
}

function stayRows(stays) {
  const inside = (stays?.insidePark?.properties || []).map((property) => ({
    ...property,
    kicker: 'Inside park',
  }));
  const gateway = (stays?.gateway?.properties || []).map((property) => ({
    ...property,
    kicker: stays?.gateway?.areaLabel ? `Near ${stays.gateway.areaLabel}` : 'Gateway',
  }));
  return [...inside, ...gateway].map((property, index) => ({
    id: property.propertyId || property.placeId || property.name || index,
    title: property.name,
    kicker: property.kicker,
    detail: property.address || property.note || null,
  }));
}

function campgroundRows(campgrounds) {
  return (campgrounds?.properties || []).map((property, index) => ({
    id: property.propertyId || property.name || index,
    title: property.name,
    kicker: property.rvSuitable === true ? 'RV suitable' : null,
    detail: property.address || property.note || null,
  }));
}

function formatMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function routeRows(legs) {
  return (Array.isArray(legs) ? legs : []).map((leg, index) => ({
    id: leg.legId || index,
    title: [leg.originLabel, leg.destinationLabel].filter(Boolean).join(' → ') || `Leg ${index + 1}`,
    detail: formatMinutes(leg.durationMinutes),
  }));
}

export default function TrailieResponse({
  response,
  example = false,
  onFollowup,
  hideActions = false,
  utilityActions = null,
  afterContent = null,
  tone = 'default',
  artifactAccess = null,
  onOpenArtifact = null,
}) {
  const presentation = useMemo(() => normalizeTrailiePresentation(response), [response]);
  const artifact = presentation.primaryArtifact;
  const ownedLogistics = travelLogisticsBelongsToTurn(response.travelLogistics, response)
    ? response.travelLogistics
    : null;
  const planHash = response.itineraryHash || response.canonicalPlan?.itineraryHash || artifact?.plan?.itineraryHash || null;
  const publishedLogistics = selectCurrentDerived(ownedLogistics, planHash).value;
  const showAirports = artifact?.kind === 'flight_planning' && publishedLogistics?.transport?.airports?.length;
  const showStays = artifact?.kind === 'stay_options' && stayRows(publishedLogistics?.stays).length;
  const showCampgrounds = artifact?.kind === 'campground_options'
    && campgroundRows(publishedLogistics?.stays?.campgrounds).length;
  const showRoute = artifact?.kind === 'route_plan' && publishedLogistics?.transport?.routeLegs?.length;
  void onFollowup;

  return (
    <article
      className={`trailie-response trailie-response--${tone} w-full min-w-0 max-w-[68rem]`}
      aria-label="Assistant message"
    >
      <Header example={example} />
      <div
        className={`space-y-5 sm:space-y-6 ${tone === 'failure' ? 'border-l-2 pl-4 sm:pl-5' : ''}`}
        style={tone === 'failure' ? { borderColor: 'color-mix(in srgb, #b7791f 55%, var(--border))' } : undefined}
      >
        {presentation.intro ? (
          <TrailieMarkdown
            text={presentation.intro}
            parkImages={response.parkImages}
            isStreaming={response.lifecycle?.isStreaming}
            isFinalizing={response.lifecycle?.isFinalizing}
          />
        ) : null}

        <NarrativeSections
          sections={presentation.narrativeSections}
          placement="before_plan"
          parkImages={response.parkImages}
        />

        {artifact?.kind === 'itinerary' ? (
          artifactAccess && onOpenArtifact
            ? <TrailieTripCard plan={artifact.plan} locked={artifactAccess === 'guest'} onOpen={onOpenArtifact} />
            : <TrailieItinerary plan={artifact.plan} pendingLabel={response.lifecycle?.pendingLabel} />
        ) : null}

        <NarrativeSections
          sections={presentation.narrativeSections}
          placement="after_plan"
          parkImages={response.parkImages}
        />

        {showAirports ? (
          <TrailieRankedList
            ariaLabel="Airport options"
            items={airportRows(publishedLogistics.transport.airports)}
          />
        ) : null}
        {showStays ? (
          <TrailieRankedList
            ariaLabel="Stay options"
            items={stayRows(publishedLogistics.stays)}
          />
        ) : null}
        {showCampgrounds ? (
          <TrailieRankedList
            ariaLabel="Campground options"
            items={campgroundRows(publishedLogistics.stays.campgrounds)}
          />
        ) : null}
        {showRoute ? (
          <TrailieRankedList
            ariaLabel="Route"
            items={routeRows(publishedLogistics.transport.routeLegs)}
          />
        ) : null}

        {presentation.context ? (
          <TrailieMarkdown text={presentation.context} parkImages={response.parkImages} />
        ) : null}

        <PlanB planB={presentation.planB} />

        {afterContent}
        {!hideActions && utilityActions ? (
          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>{utilityActions}</div>
        ) : null}
      </div>
    </article>
  );
}
