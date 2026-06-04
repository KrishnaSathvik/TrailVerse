import React from 'react';
import { Clock, DollarSign, Shield } from '@components/icons';
import {
  buildStandardHoursRows,
  formatParkFeeCost,
  plainDescription,
  shouldShowOperatingHoursLocationName,
  sortEntranceFeesForDisplay,
} from '@/utils/parkVisitInfoUtils';

function SectionHeading({ id, icon: Icon, children }) {
  return (
    <h3
      id={id}
      className="text-xl font-semibold mb-3 flex items-center gap-2"
      style={{ color: 'var(--text-primary)' }}
    >
      <Icon className="h-5 w-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
      {children}
    </h3>
  );
}

function HoursList({ standardHours }) {
  const rows = buildStandardHoursRows(standardHours);
  if (rows.length === 0) return null;

  return (
    <ul className="mt-3 space-y-0">
      {rows.map((row) => (
        <li
          key={row.day}
          className="flex items-baseline justify-between gap-4 py-2 text-sm border-t first:border-t-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="w-24 shrink-0 font-medium" style={{ color: 'var(--text-secondary)' }}>
            {row.label}
          </span>
          <span
            className="text-right font-medium"
            style={{
              color: row.value === 'Closed' ? 'var(--text-tertiary)' : 'var(--text-primary)',
            }}
          >
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FeePassCard({ title, cost, description }) {
  const price = formatParkFeeCost(cost);
  const isFree = price === 'Free';

  return (
    <article
      className="flex h-full flex-col rounded-xl p-4 sm:p-5"
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <header
        className="flex items-baseline justify-between gap-4 pb-3 mb-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <p
          className="min-w-0 flex-1 text-sm font-semibold leading-snug m-0"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </p>
        {price ? (
          <span
            className="shrink-0 text-base font-bold tabular-nums leading-none m-0 whitespace-nowrap"
            style={{ color: isFree ? 'var(--accent-green)' : 'var(--text-primary)' }}
          >
            {price}
          </span>
        ) : (
          <span className="shrink-0 text-sm m-0" style={{ color: 'var(--text-tertiary)' }}>
            —
          </span>
        )}
      </header>
      {description ? (
        <p className="text-sm leading-relaxed m-0 flex-1" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      ) : (
        <div className="flex-1" aria-hidden />
      )}
    </article>
  );
}

export default function ParkOverviewVisitInfo({ park }) {
  const entranceFees = sortEntranceFeesForDisplay(park?.entranceFees || []);
  const operatingHours = park?.operatingHours || [];
  const entrancePasses = park?.entrancePasses || [];

  if (
    entranceFees.length === 0 &&
    operatingHours.length === 0 &&
    entrancePasses.length === 0
  ) {
    return null;
  }

  return (
    <div className="not-prose">
      {entranceFees.length > 0 && (
        <div id="entrance-fees" className="mt-8">
          <SectionHeading icon={DollarSign}>Entrance Fees</SectionHeading>
          <div
            className={`grid gap-3 items-stretch ${
              entranceFees.length === 1 || entranceFees.length > 4
                ? 'grid-cols-1'
                : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {entranceFees.map((fee, index) => (
              <FeePassCard
                key={`${fee.title}-${index}`}
                title={fee.title}
                cost={fee.cost}
                description={plainDescription(fee.description)}
              />
            ))}
          </div>
        </div>
      )}

      {operatingHours.length > 0 && (
        <div id="operating-hours" className="mt-8">
          <SectionHeading icon={Clock}>Operating Hours</SectionHeading>
          <div className="space-y-3">
            {operatingHours.map((hours, index) => {
              const description = plainDescription(hours.description);
              const hasSchedule = buildStandardHoursRows(hours.standardHours).length > 0;
              const showLocationName = shouldShowOperatingHoursLocationName(
                hours.name,
                park?.fullName
              );

              return (
                <div
                  key={`${hours.name}-${index}`}
                  className="rounded-xl p-4 sm:p-5"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  {showLocationName ? (
                    <p
                      className="text-sm font-semibold mb-2 m-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {hours.name}
                    </p>
                  ) : null}
                  {description ? (
                    <p
                      className={`text-sm leading-relaxed m-0 ${hasSchedule ? 'mb-1' : ''}`}
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {description}
                    </p>
                  ) : null}
                  <HoursList standardHours={hours.standardHours} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {entrancePasses.length > 0 && (
        <div id="entrance-passes" className="mt-8">
          <SectionHeading icon={Shield}>Entrance Passes</SectionHeading>
          <div
            className={`grid gap-3 items-stretch ${
              entrancePasses.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {entrancePasses.map((pass, index) => (
              <FeePassCard
                key={`${pass.title}-${index}`}
                title={pass.title}
                cost={pass.cost}
                description={plainDescription(pass.description)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
