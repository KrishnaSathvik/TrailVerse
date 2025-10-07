import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MessageCircle, Trash2, ArchiveRestore } from 'lucide-react';
import { tripHistoryService } from '../../services/tripHistoryService';
import { useToast } from '../../context/ToastContext';

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
          No trip history yet
        </p>
        <p className="text-sm mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          Start planning your first trip with AI!
        </p>
        <Link
          to="/plan-ai"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-500 hover:bg-purple-600 text-white font-semibold transition"
        >
          <Calendar className="h-5 w-5" />
          Plan a Trip
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trips.map(trip => (
        <div
          key={trip.id}
          className="rounded-2xl p-6 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h4 className="text-xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {trip.parkName}
              </h4>
              <div className="flex flex-wrap items-center gap-3 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(trip.formData.startDate).toLocaleDateString()} - {new Date(trip.formData.endDate).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  {trip.messages.length} messages
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/plan-ai/${trip.id}`}
                className="px-4 py-2 rounded-xl font-medium transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Continue
              </Link>
              <button
                onClick={() => handleArchive(trip.id)}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                style={{ color: 'var(--text-tertiary)' }}
                title="Archive"
              >
                <ArchiveRestore className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(trip.id)}
                className="p-2 rounded-lg hover:bg-red-500/10 transition"
                style={{ color: 'var(--text-tertiary)' }}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Duration', value: `${Math.ceil((new Date(trip.formData.endDate) - new Date(trip.formData.startDate)) / (1000 * 60 * 60 * 24))} days` },
              { label: 'Group', value: `${trip.formData.groupSize} people` },
              { label: 'Budget', value: trip.formData.budget },
              { label: 'Updated', value: new Date(trip.updatedAt).toLocaleDateString() }
            ].map((stat, i) => (
              <div key={i} className="text-center p-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="text-xs mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {stat.label}
                </div>
                <div className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TripHistoryList;
