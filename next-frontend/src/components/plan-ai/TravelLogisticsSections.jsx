'use client';

import React from 'react';
import { AlertTriangle, Bed, Car, MapPin, Route, Tent } from '@/components/icons';

const STATUS_COPY = {
  provider_unavailable: {
    airports: 'Airport information is temporarily unavailable. Verify airport and transfer details before booking.',
    routeLegs: 'Route information is temporarily unavailable. Check current directions before driving.',
    gateway: 'Gateway lodging information is temporarily unavailable. Check lodging sources directly.',
    campgrounds: 'Campground information is temporarily unavailable. Check the NPS or Recreation.gov directly.',
  },
  no_results: {
    airports: 'No airport options were found for this plan. Check nearby airports and transfer times directly.',
    routeLegs: 'No verified driving route was found for this plan.',
    gateway: 'No gateway lodging options were found for this plan.',
    campgrounds: 'No campground options were found for this plan.',
  },
  not_verified: {
    insidePark: 'Inside-park lodging has not been verified for this plan. Check the park’s official lodging guidance.',
    gateway: 'Gateway lodging has not been verified for this plan.',
    campgrounds: 'Campground details have not been verified for this plan.',
  },
  verified_none: {
    insidePark: 'No inside-park lodging is listed in the verified park catalog.',
  },
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

const COMMERCIAL_KEYS = new Set([
  'price', 'priceAmount', 'fare', 'currentFare', 'availability', 'available',
  'roomsAvailable', 'sitesAvailable', 'inventoryCount', 'bookingUrl', 'bookNowUrl',
  'departureTime', 'arrivalTime', 'flightNumber',
]);

function commercialRows(value, rows = []) {
  if (!value || typeof value !== 'object') return rows;
  if (Array.isArray(value)) {
    value.forEach((item) => commercialRows(item, rows));
    return rows;
  }
  if (Object.keys(value).some((key) => COMMERCIAL_KEYS.has(key) && value[key] != null)) rows.push(value);
  Object.values(value).forEach((child) => commercialRows(child, rows));
  return rows;
}

export function isSafeCommercialLogistics(logistics) {
  const rows = commercialRows(logistics);
  if (!rows.length) return true;
  if (logistics?.inventoryMode !== 'live') return false;
  return rows.every((row) => (
    row.provenance?.sourceType === 'live_inventory'
    && typeof row.provenance?.provider === 'string'
    && Number.isFinite(Date.parse(row.provenance?.fetchedAt))
  ));
}

function sourceLabel(provenance) {
  switch (provenance?.sourceType) {
    case 'official':
    case 'curated_catalog':
      return 'Official';
    case 'nps':
      return 'NPS';
    case 'google_places':
      return 'Google Places';
    case 'google_maps':
      return 'Maps';
    default:
      return null;
  }
}

function SourceCue({ provenance }) {
  const label = sourceLabel(provenance);
  if (!label) return null;

  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: 'var(--surface-hover)',
        border: '1px solid var(--border)',
        color: 'var(--text-tertiary)',
      }}
    >
      {label}
    </span>
  );
}

const EVIDENCE_COPY = {
  confirmed_current: 'Confirmed current',
  official_guidance: 'Official guidance',
  estimated: 'Estimated',
  not_verified: 'Not verified',
};

function EvidenceCue({ status }) {
  const label = EVIDENCE_COPY[status];
  if (!label) return null;
  return (
    <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
      {label}
    </span>
  );
}

function formatMiles(value) {
  const miles = Number(value);
  if (!Number.isFinite(miles)) return null;
  return `${Math.round(miles).toLocaleString()} miles`;
}

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function metricLine(distanceMiles, durationMinutes) {
  return [formatMiles(distanceMiles), formatDuration(durationMinutes)].filter(Boolean).join(' · ');
}

function EmptyState({ status, kind }) {
  const copy = STATUS_COPY[status]?.[kind];
  if (!copy) return null;
  return (
    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {copy}
    </p>
  );
}

function LogisticsRegion({ label, icon: Icon, children, className = '' }) {
  return (
    <section
      aria-label={label}
      className={`rounded-xl px-3 py-3 ${className}`}
      style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
    >
      <h3
        className="mb-2 flex items-center gap-2 text-xs font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </h3>
      {children}
    </section>
  );
}

function AirportList({ airports }) {
  return (
    <ul className="space-y-2">
      {airports.map((airport, index) => {
        const transfer = airport?.groundTransfer || {};
        const metrics = metricLine(transfer.distanceMiles, transfer.durationMinutes);
        return (
          <li
            key={airport?.entityId || airport?.airportCode || index}
            className="flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                >
                  {airport.airportCode}
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {airport.name}
                </span>
              </div>
              {metrics ? (
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Ground transfer: {metrics}
                  {transfer.destinationLabel ? ` to ${transfer.destinationLabel}` : ''}
                </p>
              ) : null}
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <SourceCue provenance={airport.provenance} />
              <EvidenceCue status={airport.evidenceStatus || transfer.evidenceStatus} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RouteLegList({ routeLegs }) {
  return (
    <ul className="space-y-2">
      {routeLegs.map((leg, index) => {
        const metrics = metricLine(leg?.distanceMiles, leg?.durationMinutes);
        const cap = leg?.feasibility?.maxDailyDriveMinutes;
        return (
          <li key={leg?.legId || index}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {leg.originLabel || 'Origin'} → {leg.destinationLabel || 'Destination'}
                </p>
                {metrics ? (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {metrics}
                  </p>
                ) : null}
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <SourceCue provenance={leg.provenance} />
                <EvidenceCue status={leg.evidenceStatus} />
              </span>
            </div>
            {leg?.feasibility?.exceedsDailyDriveCap ? (
              <p
                className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This leg exceeds your {formatDuration(cap) || 'daily'} daily drive limit. Consider an
                overnight stop or a shorter route.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function StayList({ properties }) {
  return (
    <ul className="space-y-2">
      {properties.map((property, index) => (
        <li
          key={property?.propertyId || index}
          className="flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {property.name}
            </p>
            {property.address ? (
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {property.address}
              </p>
            ) : null}
            {property.rvSuitable === true ? (
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                RV suitable
              </p>
            ) : null}
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <SourceCue provenance={property.provenance} />
            <EvidenceCue status={property.evidenceStatus} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function shouldShowList(status, items) {
  return status !== 'not_requested' && (
    items.length > 0
    || status === 'provider_unavailable'
    || status === 'not_verified'
    || status === 'no_results'
    || status === 'verified_none'
  );
}

function TravelLogisticsSections({ logistics, selectedModules = null }) {
  if (!logistics || logistics.schemaVersion !== 1 || !isSafeCommercialLogistics(logistics)) return null;

  const transport = logistics.transport || {};
  const stays = logistics.stays || {};
  const selected = Array.isArray(selectedModules);
  const moduleFor = (...kinds) => selectedModules?.find((module) => kinds.includes(module.kind));
  const airportModule = moduleFor('getting_there', 'flight_planning');
  const routeModule = moduleFor('route_plan');
  const stayModule = moduleFor('stay_options');
  const campgroundModule = moduleFor('campground_options');
  const selectedStayData = stayModule?.source === 'travelLogistics.stays' ? stayModule.data : null;
  const insideData = selectedStayData?.insidePark
    || (stayModule?.source === 'travelLogistics.stays.insidePark' ? stayModule.data : null);
  const gatewayData = selectedStayData?.gateway
    || (stayModule?.source === 'travelLogistics.stays.gateway' ? stayModule.data : null);
  const campgroundData = campgroundModule?.data
    || selectedStayData?.campgrounds
    || (stayModule?.source === 'travelLogistics.stays.campgrounds' ? stayModule.data : null);
  const rentalData = selectedStayData?.vacationRentalHint
    || (stayModule?.source === 'travelLogistics.stays.vacationRentalHint' ? stayModule.data : null);

  const airports = list(selected
    ? airportModule?.data?.airports || airportModule?.data
    : transport.airports);
  const routeLegs = list(selected
    ? routeModule?.data?.routeLegs || routeModule?.data
    : transport.routeLegs);
  const inside = selected ? insideData : stays.insidePark;
  const gateway = selected ? gatewayData : stays.gateway;
  const campgrounds = selected ? campgroundData : stays.campgrounds;
  const insideProperties = list(inside?.properties);
  const gatewayProperties = list(gateway?.properties);
  const campgroundProperties = list(campgrounds?.properties);

  const showAirports = selected ? Boolean(airportModule) : shouldShowList(transport.airportsStatus, airports);
  const showRoutes = selected ? Boolean(routeModule) : shouldShowList(transport.routeLegsStatus, routeLegs);
  const showInside = selected ? Boolean(inside) : shouldShowList(stays.insidePark?.status, insideProperties);
  const showGateway = selected ? Boolean(gateway) : shouldShowList(stays.gateway?.status, gatewayProperties);
  const showCampgrounds = selected ? Boolean(campgrounds) : shouldShowList(stays.campgrounds?.status, campgroundProperties);
  const rentalHint = selected ? rentalData : stays.vacationRentalHint;
  const showRentalHint = rentalHint?.status !== 'not_requested'
    && Boolean(String(rentalHint?.externalSearchHint || '').trim());
  const showStays = showInside || showGateway || showCampgrounds || showRentalHint;

  if (!showAirports && !showRoutes && !showStays) return null;

  return (
    <section
      aria-label="Travel and stay logistics"
      className="mt-3 space-y-3 rounded-2xl p-3"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {showAirports ? (
        <LogisticsRegion label="Getting there" icon={MapPin}>
          {airports.length > 0
            ? <AirportList airports={airports} />
            : <EmptyState status={transport.airportsStatus || airportModule?.status} kind="airports" />}
        </LogisticsRegion>
      ) : null}

      {showRoutes ? (
        <LogisticsRegion label="Ground logistics" icon={Route}>
          {routeLegs.length > 0
            ? <RouteLegList routeLegs={routeLegs} />
            : <EmptyState status={transport.routeLegsStatus || routeModule?.status} kind="routeLegs" />}
        </LogisticsRegion>
      ) : null}

      {showStays ? (
        <section aria-label="Where to stay" className="space-y-2">
          <h2
            className="flex items-center gap-2 px-1 text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            <Bed className="h-4 w-4" />
            Where to stay
          </h2>

          {showInside ? (
            <LogisticsRegion label="Inside park" icon={Bed}>
              {insideProperties.length > 0
                ? <StayList properties={insideProperties} />
                : <EmptyState status={inside?.status} kind="insidePark" />}
            </LogisticsRegion>
          ) : null}

          {showGateway ? (
            <LogisticsRegion label="Gateway" icon={Car}>
              {gateway?.areaLabel ? (
                <p className="mb-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Near {gateway.areaLabel}
                </p>
              ) : null}
              {gatewayProperties.length > 0
                ? <StayList properties={gatewayProperties} />
                : <EmptyState status={gateway?.status} kind="gateway" />}
            </LogisticsRegion>
          ) : null}

          {showCampgrounds ? (
            <LogisticsRegion label="Camping" icon={Tent}>
              {campgroundProperties.length > 0
                ? <StayList properties={campgroundProperties} />
                : <EmptyState status={campgrounds?.status} kind="campgrounds" />}
            </LogisticsRegion>
          ) : null}

          {showRentalHint ? (
            <p
              className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Vacation rentals:
              </span>{' '}
              {rentalHint.externalSearchHint}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export default React.memo(TravelLogisticsSections);
