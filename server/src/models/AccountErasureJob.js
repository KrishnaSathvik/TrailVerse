'use strict';

const mongoose = require('mongoose');

const collectionResultSchema = new mongoose.Schema(
  {
    collection: { type: String, required: true },
    action: { type: String, required: true },
    matched: { type: Number, default: 0 },
    deleted: { type: Number, default: 0 },
    anonymized: { type: Number, default: 0 },
    errorCode: { type: String, default: null },
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const accountErasureJobSchema = new mongoose.Schema(
  {
    erasureId: { type: String, required: true, unique: true },
    principalIdHash: { type: String, required: true, index: true },
    requestedByHash: { type: String, default: null },
    requestType: { type: String, enum: ['self', 'admin', 'system'], required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'running', 'complete', 'partial', 'failed'],
      default: 'pending',
      index: true,
    },
    collectionResults: { type: [collectionResultSchema], default: [] },
    attempts: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    auditExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

accountErasureJobSchema.index({ auditExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.AccountErasureJob ||
  mongoose.model('AccountErasureJob', accountErasureJobSchema);
