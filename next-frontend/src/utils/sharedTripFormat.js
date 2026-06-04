export function formatSharedTripDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatMetaLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatGroupSizeLabel(size) {
  const value = Number(size);
  if (!value || Number.isNaN(value)) return String(size);
  return value === 1 ? '1 traveler' : `${value} travelers`;
}

export function formatDurationMinutes(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hr`;
}

export function formatTime12(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function getSharedDayHeading(day, dayIndex) {
  const dayNumber = dayIndex + 1;
  const badge = `Day ${dayNumber}`;
  const label = (day.label || '').trim();

  if (!label) {
    return { badge, title: null };
  }

  const prefixPattern = new RegExp(`^day\\s*${dayNumber}\\s*(?:[—–\\-:|]\\s*)?`, 'i');
  const stripped = label.replace(prefixPattern, '').trim();
  const normalized = label.toLowerCase().replace(/\s+/g, ' ');
  const redundantLabels = new Set([
    badge.toLowerCase(),
    String(dayNumber),
    `day${dayNumber}`,
  ]);

  if (!stripped || redundantLabels.has(normalized) || redundantLabels.has(stripped.toLowerCase())) {
    return { badge, title: null };
  }

  return { badge, title: stripped };
}

export function buildSharedTripMetaLines(formData = {}, plan = {}, createdAt) {
  const schedule = [];

  if (formData.startDate || formData.endDate) {
    const start = formatSharedTripDate(formData.startDate);
    const end = formData.endDate ? formatSharedTripDate(formData.endDate) : null;
    schedule.push(end ? `${start} — ${end}` : start);
  }
  if (plan.totalDays) schedule.push(`${plan.totalDays} days`);

  const details = [];
  if (formData.groupSize) details.push(formatGroupSizeLabel(formData.groupSize));
  if (formData.budget) details.push(`${formatMetaLabel(formData.budget)} budget`);
  if (formData.fitnessLevel) details.push(`${formatMetaLabel(formData.fitnessLevel)} fitness`);
  if (formData.accommodation) details.push(formatMetaLabel(formData.accommodation));

  let sharedOn = null;
  if (createdAt) {
    try {
      sharedOn = `Shared ${new Date(createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } catch {
      sharedOn = null;
    }
  }

  return { schedule, details, sharedOn };
}
