const mongoose = require('mongoose');

const countsShape = {
  sessions: { type: Number, default: 0 },
  parkViewers: { type: Number, default: 0 },
  mapUsers: { type: Number, default: 0 },
  compareUsers: { type: Number, default: 0 },
  trailieUsers: { type: Number, default: 0 },
  voiceUsers: { type: Number, default: 0 },
  signups: { type: Number, default: 0 },
  tripPlanAuthors: { type: Number, default: 0 },
  crowdCalendarUsers: { type: Number, default: 0 },
  whereNextSubmissions: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
};

const analyticsSnapshotSchema = new mongoose.Schema({
  grain: {
    type: String,
    enum: ['day', 'month'],
    required: true,
  },
  periodKey: {
    type: String,
    required: true,
  },
  periodStart: {
    type: Date,
    required: true,
  },
  periodEnd: {
    type: Date,
    required: true,
  },
  human: countsShape,
  bots: {
    sessions: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
  },
  totals: {
    events: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

analyticsSnapshotSchema.index({ grain: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
