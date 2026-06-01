import { getApiBaseUrl } from './apiBase';

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Same default window as EventsPageClient (current calendar month). */
export function getDefaultEventMonthRange() {
  const baseDate = new Date();
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  return {
    dateStart: formatLocalDate(monthStart),
    dateEnd: formatLocalDate(monthEnd),
  };
}

export async function getEventsServer(params = {}) {
  try {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    const response = await fetch(`${getApiBaseUrl()}/events?${query.toString()}`, {
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return { data: [], count: 0, meta: {} };
    }

    return response.json();
  } catch {
    return { data: [], count: 0, meta: {} };
  }
}
