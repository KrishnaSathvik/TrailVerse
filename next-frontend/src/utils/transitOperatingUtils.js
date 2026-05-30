export function shouldHideRouteSchedules(serviceStatus) {
  return (
    serviceStatus === 'season_ended' ||
    serviceStatus === 'season_not_started' ||
    serviceStatus === 'schedule_unavailable'
  );
}

/** Today's headway / weekday / schedule date — only when shuttles may actually run today. */
export function shouldShowTodayTransitDetails(serviceStatus) {
  return (
    serviceStatus === 'running_today' ||
    serviceStatus === 'not_running_today' ||
    serviceStatus === 'scheduled_check_nps'
  );
}

/** NPS bullet schedule lines — only when they add detail beyond the status card. */
export function shouldShowNpsScheduleLines(serviceStatus) {
  return shouldShowTodayTransitDetails(serviceStatus);
}

export function shouldShowOperatingDaysLabel(operatingDaysLabel, detail, scheduleLines = []) {
  if (!operatingDaysLabel) return false;
  const corpus = [detail, ...(scheduleLines || [])].join(' ').toLowerCase();
  const label = String(operatingDaysLabel).toLowerCase();
  if (label === 'daily' && /daily|7 days a week|7 days\/week|every day/.test(corpus)) return false;
  if (corpus.includes(label)) return false;
  return true;
}

export function shouldShowCatalogNotes(notes, serviceStatus) {
  const text = String(notes || '').trim();
  if (!text) return false;
  if (/concluded|ended|closed|not operating|suspended|off season/i.test(text)) {
    return serviceStatus === 'season_ended' || serviceStatus === 'schedule_unavailable';
  }
  return true;
}

export function getTransitOperatingStyles(serviceStatus) {
  switch (serviceStatus) {
    case 'running_today':
    case 'scheduled_check_nps':
      return {
        badgeBg: 'var(--accent-green-light)',
        badgeColor: 'var(--accent-green)',
      };
    case 'season_ended':
    case 'not_running_today':
    case 'season_not_started':
    case 'schedule_unavailable':
      return {
        badgeBg: 'rgba(239, 68, 68, 0.14)',
        badgeColor: 'var(--error-red)',
      };
    default:
      return {
        badgeBg: 'var(--surface)',
        badgeColor: 'var(--text-secondary)',
      };
  }
}
