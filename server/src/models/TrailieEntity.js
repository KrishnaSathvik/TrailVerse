'use strict';

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: (value) => Array.isArray(value)
        && value.length === 2
        && value[0] >= -180 && value[0] <= 180
        && value[1] >= -90 && value[1] <= 90,
      message: 'location coordinates must be [longitude, latitude]',
    },
  },
}, { _id: false, strict: 'throw' });

const trailieEntitySchema = new mongoose.Schema({
  entityId: { type: String, required: true, immutable: true },
  entityType: { type: String, required: true },
  canonicalName: { type: String, required: true, trim: true },
  aliases: { type: [String], default: [] },
  aliasesNormalized: { type: [String], default: [], select: false },
  providerIds: {
    npsParkCode: { type: String, default: null },
    ridbRecAreaId: { type: String, default: null },
    googlePlaceId: { type: String, default: null },
    gtfsAgencyId: { type: String, default: null },
  },
  location: { type: locationSchema, default: null },
  parentEntityId: { type: String, default: null },
  stateCodes: { type: [String], default: [] },
  countryCode: { type: String, default: 'US' },
  status: {
    type: String,
    enum: ['active', 'inactive', 'merged', 'retired'],
    default: 'active',
    required: true,
  },
  schemaVersion: { type: Number, default: 1, immutable: true },
}, {
  timestamps: true,
  strict: 'throw',
  collection: 'trailie_entities',
});

trailieEntitySchema.pre('validate', function normalizeEntityLookup(next) {
  const normalized = [this.canonicalName, ...(this.aliases || [])]
    .map((value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean);
  this.aliasesNormalized = [...new Set(normalized)].sort();
  this.stateCodes = [...new Set((this.stateCodes || []).map((code) => String(code).trim().toUpperCase()))].sort();
  this.countryCode = String(this.countryCode || 'US').trim().toUpperCase();
  next();
});

trailieEntitySchema.index({ entityId: 1 }, { unique: true });
trailieEntitySchema.index({ aliases: 1, entityType: 1 });
trailieEntitySchema.index({ aliasesNormalized: 1, entityType: 1 });
trailieEntitySchema.index({ 'providerIds.npsParkCode': 1 }, { sparse: true });
trailieEntitySchema.index({ 'providerIds.ridbRecAreaId': 1 }, { sparse: true });
trailieEntitySchema.index({ 'providerIds.googlePlaceId': 1 }, { sparse: true });
trailieEntitySchema.index({ 'providerIds.gtfsAgencyId': 1 }, { sparse: true });
trailieEntitySchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = mongoose.models.TrailieEntity
  || mongoose.model('TrailieEntity', trailieEntitySchema);
