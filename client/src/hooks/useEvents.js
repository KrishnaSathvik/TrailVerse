import { useState, useEffect } from 'react';
import eventService from '../services/eventService';

export const useEvents = (parkCode = null) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await eventService.getEvents({ 
          ...(parkCode && { parkCode }),
          upcoming: 'true'
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
  }, [parkCode]);

  return { data, isLoading, error };
};
