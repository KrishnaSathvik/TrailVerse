const mongoose = require('mongoose');

const npsSnapshotSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  itemCount: {
    type: Number,
    default: 0,
  },
  fetchedAt: {
    type: Date,
    default: Date.now,
  },
  // Fix Pass #3E — ingestion completeness (source guarantees, not popularity).
  schemaVersion: {
    type: String,
    default: null,
  },
  reportedTotal: {
    type: Number,
    default: null,
  },
  recordsFetched: {
    type: Number,
    default: null,
  },
  pageCountFetched: {
    type: Number,
    default: null,
  },
  paginationComplete: {
    type: Boolean,
    default: false,
  },
  generationComplete: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('NpsSnapshot', npsSnapshotSchema);
