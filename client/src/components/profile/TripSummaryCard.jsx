import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Calendar, 
  Users, 
  MessageCircle, 
  Clock, 
  Tag,
  ArrowRight,
  FileText,
  ArchiveRestore,
  Trash2,
  Bot,
  CheckCircle
} from '@components/icons';

const TripSummaryCard = ({ trip, onArchive, onDelete, onRestore, isDeleting = false, isRestoring = false }) => {
  const tripId = trip._id || trip.id;
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const calculateDuration = () => {
    if (!trip.formData?.startDate || !trip.formData?.endDate) return 'N/A';
    const start = new Date(trip.formData.startDate);
    const end = new Date(trip.formData.endDate);
    const ms = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-500';
      case 'archived': return 'text-yellow-500';
      case 'deleted': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="rounded-2xl p-4 sm:p-6 backdrop-blur hover:shadow-lg transition-all duration-200 relative"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        opacity: (isDeleting || isRestoring) ? 0.5 : 1,
        pointerEvents: (isDeleting || isRestoring) ? 'none' : 'auto'
      }}
    >
      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-lg sm:text-xl font-bold flex-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {trip.parkName || trip.title}
            </h4>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium w-fit ${getStatusColor(trip.status)}`}
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                {trip.status || 'active'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete && onDelete();
                }}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition"
                style={{ color: 'var(--text-tertiary)' }}
                title="Delete trip"
                disabled={isDeleting || isRestoring}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          {/* Trip Details - Better mobile layout */}
          {trip.formData && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {trip.formData.startDate && trip.formData.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{formatDate(trip.formData.startDate)} - {formatDate(trip.formData.endDate)}</span>
                </span>
              )}
              {trip.formData.groupSize && (
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4 flex-shrink-0" />
                  {trip.formData.groupSize} {trip.formData.groupSize === 1 ? 'person' : 'people'}
                </span>
              )}
              {trip.formData.startDate && trip.formData.endDate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  {calculateDuration()} days
                </span>
              )}
              <span className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4 flex-shrink-0" />
                {trip.conversation?.length || trip.summary?.totalMessages || 0} messages
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons - Better mobile layout */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {trip.status === 'archived' ? (
            <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition text-sm flex-1"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-secondary)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <CheckCircle className="h-4 w-4" />
              <span>Archived</span>
            </div>
          ) : (
            <Link
              to={`/plan-ai/${tripId}?chat=true`}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition text-sm flex-1"
              style={{
                backgroundColor: 'var(--accent-green)',
                color: 'white'
              }}
            >
              <MessageCircle className="h-4 w-4" />
              <span>Continue Chat</span>
            </Link>
          )}
          
          {trip.status === 'archived' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore && onRestore();
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition text-sm border"
              style={{
                backgroundColor: 'var(--accent-green)/10',
                color: 'var(--accent-green)',
                borderColor: 'var(--accent-green)/20'
              }}
              title="Restore trip"
              disabled={isRestoring}
            >
              <ArchiveRestore className="h-4 w-4" />
              <span className="hidden sm:inline">{isRestoring ? 'Restoring...' : 'Restore'}</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive && onArchive();
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition text-sm border"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border)'
              }}
              title="Archive trip"
            >
              <ArchiveRestore className="h-4 w-4" />
              <span className="hidden sm:inline">Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Trip Summary */}
      {trip.summary && (
        <div className="mt-4 pt-4 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Key Topics - Better mobile layout */}
          {trip.summary.keyTopics && trip.summary.keyTopics.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Topics Discussed
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {trip.summary.keyTopics.slice(0, 3).map((topic, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Plan Status */}
          {trip.plan && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--accent-green)/10' }}
            >
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--accent-green)' }}>
                Trip plan created
              </span>
            </div>
          )}

          {/* User Questions Preview */}
          {trip.summary.userQuestions && trip.summary.userQuestions.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Planning Focus
              </h5>
              <div className="space-y-1">
                {trip.summary.userQuestions.slice(0, 1).map((question, index) => (
                  <p key={index} className="text-sm leading-relaxed line-clamp-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {question}
                  </p>
                ))}
                {trip.summary.userQuestions.length > 1 && (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    +{trip.summary.userQuestions.length - 1} more question{trip.summary.userQuestions.length > 2 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Message count already shown in trip details above - no need to duplicate */}

      {/* Trip Stats - Better mobile layout */}
      {trip.formData && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {[
            { label: 'Budget', value: trip.formData.budget },
            { label: 'Fitness', value: trip.formData.fitnessLevel },
            { label: 'Accommodation', value: trip.formData.accommodation },
            { label: 'Updated', value: formatDate(trip.updatedAt) }
          ].filter(stat => stat.value).map((stat, i) => (
            <div key={i} className="text-center p-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-xs mb-1 truncate"
                style={{ color: 'var(--text-tertiary)' }}
                title={stat.label}
              >
                {stat.label}
              </div>
              <div className="text-xs font-semibold truncate capitalize"
                style={{ color: 'var(--text-primary)' }}
                title={stat.value}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TripSummaryCard;
