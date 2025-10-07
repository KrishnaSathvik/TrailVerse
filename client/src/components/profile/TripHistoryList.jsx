import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { tripHistoryService } from '../../services/tripHistoryService';
import { useToast } from '../../context/ToastContext';
import TripSummaryCard from './TripSummaryCard';

const TripHistoryList = ({ userId }) => {
  const { showToast } = useToast();
  const [trips, setTrips] = useState([]);

  const loadTrips = useCallback(() => {
    const history = tripHistoryService.getTripHistory(userId);
    setTrips(history.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadTrips();
    }
  }, [userId, loadTrips]);

  const handleDelete = (tripId) => {
    if (window.confirm('Delete this trip conversation? This cannot be undone.')) {
      tripHistoryService.deleteTrip(tripId);
      loadTrips();
      showToast('Trip deleted', 'success');
    }
  };

  const handleArchive = (tripId) => {
    tripHistoryService.archiveTrip(tripId);
    loadTrips();
    showToast('Trip archived', 'success');
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
