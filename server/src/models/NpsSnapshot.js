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
}, {
  timestamps: true,
});

module.exports = mongoose.model('NpsSnapshot', npsSnapshotSchema);
