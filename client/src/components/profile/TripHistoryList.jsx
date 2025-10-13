import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle } from '@components/icons';
import tripService from '../../services/tripService';
import { useToast } from '../../context/ToastContext';
import TripSummaryCard from './TripSummaryCard';

const TripHistoryList = ({ userId }) => {
  const { showToast } = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const response = await tripService.getUserTrips(userId);
      const history = response.data || response || [];
      // Filter out temporary conversations - only show explicitly saved trips
      const savedTrips = history.filter(trip => trip.status !== 'temp');
      setTrips(savedTrips.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
    } catch (error) {
      console.error('Error loading trips:', error);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadTrips();
    }
  }, [userId, loadTrips]);

  const handleDelete = async (tripId) => {
    if (window.confirm('Delete this trip conversation? This cannot be undone.')) {
      try {
        await tripService.deleteTrip(tripId);
        await loadTrips();
        showToast('Trip deleted', 'success');
      } catch (error) {
        console.error('Error deleting trip:', error);
        showToast('Failed to delete trip', 'error');
      }
    }
  };

  const handleArchive = async (tripId) => {
    try {
      await tripService.archiveTrip(tripId);
      await loadTrips();
      showToast('Trip archived', 'success');
    } catch (error) {
      console.error('Error archiving trip:', error);
      showToast('Failed to archive trip', 'error');
    }
  };

  if (trips.length === 0) {
    return (
      <div className="text-center py-24">
        <MessageCircle className="h-16 w-16 mx-auto mb-4"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <p className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          No saved trips yet
        </p>
        <p className="text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Start planning your first adventure to see your trip summaries here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {trips.map(trip => (
        <TripSummaryCard
          key={trip.id}
          trip={trip}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
};

export default TripHistoryList;
