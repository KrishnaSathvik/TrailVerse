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
  Trash2
} from 'lucide-react';

const TripSummaryCard = ({ trip, onArchive, onDelete }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const calculateDuration = () => {
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
    <div className="rounded-2xl p-6 backdrop-blur hover:shadow-lg transition-all duration-200"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {trip.parkName}
            </h4>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(trip.status)}`}
              style={{ backgroundColor: 'var(--surface-hover)' }}
            >
              {trip.status}
            </span>
          </div>
          
          {/* Trip Details */}
          <div className="flex flex-wrap items-center gap-3 text-sm mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(trip.formData.startDate)} - {formatDate(trip.formData.endDate)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {trip.formData.groupSize} {trip.formData.groupSize === 1 ? 'person' : 'people'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {calculateDuration()} days
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              {trip.summary?.totalMessages || 0} messages
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            to={`/plan-ai/${trip.id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white'
            }}
          >
            <ArrowRight className="h-4 w-4" />
            Continue Planning
          </Link>
          
          <button
            onClick={() => onArchive(trip.id)}
            className="p-2 rounded-lg hover:bg-white/5 transition"
            style={{ color: 'var(--text-tertiary)' }}
            title="Archive"
          >
            <ArchiveRestore className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => onDelete(trip.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 transition"
            style={{ color: 'var(--text-tertiary)' }}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Trip Summary */}
      {trip.summary && (
        <div className="mb-4">
          {/* Key Topics */}
          {trip.summary.keyTopics && trip.summary.keyTopics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {trip.summary.keyTopics.map((topic, index) => (
                <span
                  key={index}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <Tag className="h-3 w-3" />
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Plan Status */}
          {trip.summary.hasPlan && (
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-500">
                Trip plan generated
              </span>
            </div>
          )}

          {/* User Questions Preview */}
          {trip.summary.userQuestions && trip.summary.userQuestions.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Planning Focus:
              </h5>
              <div className="space-y-1">
                {trip.summary.userQuestions.slice(0, 2).map((question, index) => (
                  <p key={index} className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    • {question.length > 80 ? `${question.substring(0, 80)}...` : question}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Plan Preview */}
          {trip.summary.planPreview && (
            <div className="mb-3">
              <h5 className="text-sm font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Plan Preview:
              </h5>
              <p className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {trip.summary.planPreview}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trip Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        {[
          { label: 'Budget', value: trip.formData.budget },
          { label: 'Fitness', value: trip.formData.fitnessLevel },
          { label: 'Accommodation', value: trip.formData.accommodation },
          { label: 'Updated', value: formatDate(trip.updatedAt) }
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
  );
};

export default TripSummaryCard;
