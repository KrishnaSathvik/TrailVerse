import React from 'react';
import { ExternalLink, Ticket } from '@components/icons';
import ExpandableDescription from '@/components/discover/ExpandableDescription';
import { htmlToPlainText } from '@/utils/htmlUtils';
import ParkTabSpinner from './ParkTabSpinner';

const PERMIT_ACCENT = 'var(--accent-green)';
const PERMIT_BADGE_BG = 'rgba(16, 185, 129, 0.12)';

export default function ParkPermitsTab({ permits = [], loading = false }) {
  const count = permits?.length || 0;

  return (
    <div>
      <h2
        className="text-2xl font-bold mb-6 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <Ticket className="h-6 w-6" />
        Permits & Reservations
        {count > 0 && (
          <span className="text-base font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
            ({count})
          </span>
        )}
      </h2>

      {loading ? (
        <ParkTabSpinner />
      ) : count > 0 ? (
        <div className="space-y-4">
          {permits.map((permit) => (
            <div
              key={permit.id}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                borderLeftWidth: '4px',
                borderLeftColor: PERMIT_ACCENT,
              }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {permit.name}
                  </h3>
                  {permit.reservationUrl && (
                    <a
                      href={permit.reservationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                    >
                      Reserve <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 mb-4">
                  {permit.type && (
                    <span
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{
                        backgroundColor: PERMIT_BADGE_BG,
                        color: PERMIT_ACCENT,
                      }}
                    >
                      <Ticket className="h-3 w-3" />
                      {permit.type}
                    </span>
                  )}
                  {permit.facilityName && (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: 'var(--surface-elevated)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {permit.facilityName}
                    </span>
                  )}
                </div>

                {permit.description && (
                  <ExpandableDescription
                    text={htmlToPlainText(permit.description)}
                    collapsedChars={280}
                    className="text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>
          No permit information available for this park.
        </p>
      )}
    </div>
  );
}
