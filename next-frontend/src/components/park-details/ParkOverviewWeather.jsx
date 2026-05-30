import React from 'react';
import { Cloud, Sun, Snowflake, Sunrise, Wind } from '@components/icons';
import { parseParkWeatherInfo } from '@/utils/parkWeatherInfoUtils';

const SEASON_ICONS = {
  spring: Sunrise,
  summer: Sun,
  fall: Wind,
  winter: Snowflake,
};

function SectionHeading({ children }) {
  return (
    <h3
      className="text-xl font-semibold mb-3 flex items-center gap-2"
      style={{ color: 'var(--text-primary)' }}
    >
      <Cloud className="h-5 w-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
      {children}
    </h3>
  );
}

function SeasonWeatherTable({ seasons }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <ul className="m-0 p-0 list-none">
        {seasons.map((season, index) => {
          const Icon = SEASON_ICONS[season.key] || Cloud;
          return (
            <li
              key={season.key}
              className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:gap-4"
              style={{
                borderTop: index > 0 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div className="flex items-center gap-2 w-24 sm:w-28 shrink-0 pt-0.5 sm:pt-0">
                <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {season.label}
                </span>
              </div>
              <p
                className="flex-1 text-sm font-medium leading-relaxed m-0 tabular-nums"
                style={{ color: 'var(--text-secondary)' }}
              >
                {season.summary}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ParkOverviewWeather({ weatherInfo }) {
  if (!weatherInfo) return null;

  const parsed = parseParkWeatherInfo(weatherInfo);
  const hasContent =
    Boolean(parsed.intro) || parsed.seasons.length > 0 || Boolean(parsed.footer);
  if (!hasContent) return null;

  if (!parsed.useStructured) {
    return (
      <div className="not-prose mt-8">
        <SectionHeading>Weather Information</SectionHeading>
        <p className="text-base leading-relaxed m-0" style={{ color: 'var(--text-secondary)' }}>
          {parsed.intro}
        </p>
      </div>
    );
  }

  return (
    <div className="not-prose mt-8">
      <SectionHeading>Weather Information</SectionHeading>

      {parsed.intro ? (
        <p className="text-base leading-relaxed mb-4 m-0" style={{ color: 'var(--text-secondary)' }}>
          {parsed.intro}
        </p>
      ) : null}

      <SeasonWeatherTable seasons={parsed.seasons} />

      {parsed.footer ? (
        <p className="text-sm leading-relaxed mt-4 m-0" style={{ color: 'var(--text-secondary)' }}>
          {parsed.footer}
        </p>
      ) : null}
    </div>
  );
}
