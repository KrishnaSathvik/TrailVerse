import React, { useMemo } from 'react';
import { Navigation, ExternalLink, MapPin, AlertTriangle } from '@components/icons';
import {
  buildEntranceMapsUrl,
  buildNpsDirectionsUrl,
  getParkDirectionsText,
  parseDirectionsContent,
} from '@/utils/directionsUtils';

const GettingThereSection = ({ park, showMapLinks = true, className = '' }) => {
  const directionsText = getParkDirectionsText(park);

  const { overview, entrances, accessNotes } = useMemo(
    () => parseDirectionsContent(directionsText),
    [directionsText]
  );

  const parkName = park?.fullName || 'the park';
  const hasEntrances = (entrances?.length || 0) > 0;
  const hasAccessNotes = (accessNotes?.length || 0) > 0;
  const hasOverview = Boolean(overview?.trim());
  const hasBody =
    hasOverview || hasEntrances || hasAccessNotes || Boolean(directionsText?.trim());

  if (!hasBody) {
    return null;
  }

  const npsDirectionsUrl = buildNpsDirectionsUrl(park);

  const intro = hasEntrances
    ? hasOverview
      ? overview
      : `There ${entrances.length === 1 ? 'is' : 'are'} ${entrances.length} entrance${entrances.length === 1 ? '' : 's'} to ${parkName}. Use the addresses below for GPS navigation.`
    : overview || directionsText;

  return (
    <section className={className || 'mt-0'} id="getting-around">
      <h3
        className="text-xl font-semibold mb-3 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <Navigation className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
        Getting here
      </h3>

      {intro && (
        <p className="text-base leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
          {intro}
        </p>
      )}

      {hasAccessNotes && (
        <div
          className="mb-5 rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderWidth: '1px',
            borderColor: 'rgba(245, 158, 11, 0.25)',
          }}
        >
          <h4
            className="text-sm font-semibold mb-2 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
            Access notes
          </h4>
          <ul className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {accessNotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {hasEntrances && (
        <div className="mb-5">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Entrances &amp; addresses
          </h4>
          <div className="space-y-3">
            {entrances.map((entrance) => {
              const mapsUrl = showMapLinks ? buildEntranceMapsUrl(entrance.address) : null;
              return (
                <div
                  key={`${entrance.label}|${entrance.address}`}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {entrance.label}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {entrance.address}
                  </p>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold hover:underline"
                      style={{ color: 'var(--accent-blue, #3b82f6)' }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Open in Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showMapLinks && npsDirectionsUrl && (
        <div className="flex flex-wrap gap-2">
          <a
            href={npsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Official NPS directions
          </a>
        </div>
      )}
    </section>
  );
};

export default GettingThereSection;
