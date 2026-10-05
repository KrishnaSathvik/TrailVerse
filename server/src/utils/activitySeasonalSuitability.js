'use strict';

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

const SEASON_MONTHS = Object.freeze({
  winter: Object.freeze([12, 1, 2]),
  spring: Object.freeze([3, 4, 5]),
  summer: Object.freeze([6, 7, 8]),
  fall: Object.freeze([9, 10, 11]),
  autumn: Object.freeze([9, 10, 11]),
});

const MONTH_PATTERN = Object.keys(MONTHS).join('|');

function monthsBetween(start, end) {
  const output = [start];
  let month = start;
  while (month !== end && output.length < 12) {
    month = month === 12 ? 1 : month + 1;
    output.push(month);
  }
  return output;
}

function uniqueMonths(values = []) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 12))];
}

function monthsFromText(value) {
  const text = String(value || '').toLowerCase();
  const months = [];
  for (const [name, month] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) months.push(month);
  }
  const seasons = Object.entries(SEASON_MONTHS)
    .filter(([name]) => new RegExp(`\\b${name}\\b`, 'i').test(text))
    .flatMap(([, seasonMonths]) => seasonMonths);
  return uniqueMonths([...months, ...seasons]);
}

function requestedActivityMonths({ userRequest = '', requirements = [] } = {}) {
  const fromRequest = monthsFromText(userRequest);
  if (fromRequest.length) return fromRequest;

  const values = [];
  for (const requirement of requirements || []) {
    for (const field of ['validFrom', 'validThrough']) {
      const value = requirement?.temporalScope?.[field];
      if (!value) continue;
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) values.push(date.getUTCMonth() + 1);
    }
  }
  if (values.length === 2) return monthsBetween(values[0], values[1]);
  return uniqueMonths(values);
}

function explicitOperatingMonths(text) {
  const normalized = String(text || '').toLowerCase();
  const range = new RegExp(
    `\\b(?:open|operates?|available|offered|runs?|only|season(?:\\s+is|\\s+runs)?)\\b[^.]{0,80}?`
      + `\\b(${MONTH_PATTERN})\\b\\s*(?:through|to|until|-)\\s*\\b(${MONTH_PATTERN})\\b`,
    'i'
  ).exec(normalized);
  if (!range) return [];
  return monthsBetween(MONTHS[range[1].toLowerCase()], MONTHS[range[2].toLowerCase()]);
}

function classifyActivitySeasonality(candidate = {}) {
  const normalizedValue = candidate?.claim?.normalizedValue || {};
  const name = String(normalizedValue?.name || candidate?.source?.title || '').trim();
  const claimText = String(candidate?.claim?.text || '').trim();
  const types = Array.isArray(normalizedValue?.activityTypes)
    ? normalizedValue.activityTypes.map((value) => String(value).toLowerCase())
    : [];
  const status = String(normalizedValue?.seasonalStatus || '').toLowerCase();
  const haystack = `${name} ${claimText} ${types.join(' ')}`.toLowerCase();

  if (/\b(year[- ]round|all year|throughout the year|open year round)\b/i.test(haystack)
    || /year[_ -]?round/.test(status)) {
    return { kind: 'year_round', months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) };
  }

  const operatingMonths = explicitOperatingMonths(claimText);
  if (operatingMonths.length) return { kind: 'explicit_months', months: Object.freeze(operatingMonths) };

  if (/winter[_ -]?only/.test(status)
    || /\bwinter\s+(?:trail|route|meadow|drive|driving|forest|activity|activities)\b/i.test(name)
    || types.some((type) => /(?:cross-country )?skiing|snowshoe|snowmobil/.test(type))
    || /\b(?:skiing|snowshoeing|snowmobiling)\b/i.test(claimText)) {
    return { kind: 'winter_specific', months: SEASON_MONTHS.winter };
  }

  if (/summer[_ -]?only/.test(status)
    || /\b(?:summer only|only (?:open|available|offered) in summer)\b/i.test(claimText)) {
    return { kind: 'summer_specific', months: SEASON_MONTHS.summer };
  }

  if (/seasonal|season[_ -]?unknown/.test(status)
    || /\bseasonal(?:ly)?\b/i.test(haystack)) {
    return { kind: 'seasonally_uncertain', months: Object.freeze([]) };
  }

  return { kind: 'no_seasonal_restriction_stated', months: Object.freeze([]) };
}

function evaluateActivitySeasonalSuitability(candidate, context = {}) {
  if (candidate?.topic !== 'activities') return { status: 'not_applicable', seasonality: null };
  const requestedMonths = requestedActivityMonths(context);
  const seasonality = classifyActivitySeasonality(candidate);
  if (!requestedMonths.length) {
    const status = ['winter_specific', 'summer_specific', 'explicit_months', 'seasonally_uncertain']
      .includes(seasonality.kind) ? 'uncertain' : 'neutral';
    return { status, seasonality, requestedMonths };
  }
  if (seasonality.kind === 'year_round') return { status: 'compatible', seasonality, requestedMonths };
  if (seasonality.kind === 'seasonally_uncertain') return { status: 'uncertain', seasonality, requestedMonths };
  if (!seasonality.months.length) return { status: 'neutral', seasonality, requestedMonths };
  const overlaps = requestedMonths.some((month) => seasonality.months.includes(month));
  return { status: overlaps ? 'compatible' : 'mismatch', seasonality, requestedMonths };
}

module.exports = {
  MONTHS,
  SEASON_MONTHS,
  classifyActivitySeasonality,
  evaluateActivitySeasonalSuitability,
  requestedActivityMonths,
};
