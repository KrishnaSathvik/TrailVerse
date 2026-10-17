'use strict';

const mongoose = require('mongoose');

const TRAVEL_WINDOWS = [
  'fall_2026',
  'winter_2026_27',
  'spring_2027',
  'summer_2027',
  'someday',
];

const destinationPickSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 64,
      unique: true,
      index: true,
    },
    rawInput: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    normalizedText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    parkCode: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      index: true,
    },
    canonicalType: {
      type: String,
      enum: ['nps'],
      default: null,
    },
    canonicalName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    travelWindow: {
      type: String,
      enum: TRAVEL_WINDOWS,
      default: null,
    },
    source: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

destinationPickSchema.index({ parkCode: 1, updatedAt: -1 });

module.exports = mongoose.model('DestinationPick', destinationPickSchema);
module.exports.TRAVEL_WINDOWS = TRAVEL_WINDOWS;
