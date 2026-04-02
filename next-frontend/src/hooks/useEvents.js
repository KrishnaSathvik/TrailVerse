import { useState, useEffect } from 'react';
import eventService from '../services/eventService';

export const useEvents = (parkCode = null) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const options = typeof parkCode === 'object' && parkCode !== null
    ? parkCode
    : { parkCode };
  const normalizedParkCode = options.parkCode ?? null;
  const normalizedStateCode = options.stateCode ?? null;
  const normalizedDateStart = options.dateStart ?? null;
  const normalizedDateEnd = options.dateEnd ?? null;
  const normalizedQuery = options.q ?? null;
  const normalizedUpcoming = options.upcoming ?? 'true';
  const normalizedLimit = options.limit ?? null;

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await eventService.getEvents({
          ...(normalizedParkCode && { parkCode: normalizedParkCode }),
          ...(normalizedStateCode && { stateCode: normalizedStateCode }),
          ...(normalizedDateStart && { dateStart: normalizedDateStart }),
          ...(normalizedDateEnd && { dateEnd: normalizedDateEnd }),
          ...(normalizedQuery && { q: normalizedQuery }),
          ...(normalizedLimit && { limit: normalizedLimit }),
          upcoming: normalizedUpcoming
        });
        setData(response.data || []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err.message);
        setData([]); // Set empty array on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [normalizedParkCode, normalizedStateCode, normalizedDateStart, normalizedDateEnd, normalizedQuery, normalizedUpcoming, normalizedLimit]);

  return { data, isLoading, error };
};

export const useEventSummary = (options = {}) => {
  const [data, setData] = useState({ count: 0, meta: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizedDateStart = options.dateStart ?? null;
  const normalizedDateEnd = options.dateEnd ?? null;
  const normalizedUpcoming = options.upcoming ?? 'true';

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await eventService.getEvents({
          summary: 'true',
          ...(normalizedDateStart && { dateStart: normalizedDateStart }),
          ...(normalizedDateEnd && { dateEnd: normalizedDateEnd }),
          upcoming: normalizedUpcoming,
        });
        setData({
          count: response.count || 0,
          meta: response.meta || {}
        });
      } catch (err) {
        console.error('Error fetching event summary:', err);
        setError(err.message);
        setData({ count: 0, meta: {} });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [normalizedDateStart, normalizedDateEnd, normalizedUpcoming]);

  return { data, isLoading, error };
};
