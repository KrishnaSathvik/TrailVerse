const mongoose = require('mongoose');

const parkSnapshotSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  parks: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  parkCount: {
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

module.exports = mongoose.model('ParkSnapshot', parkSnapshotSchema);
