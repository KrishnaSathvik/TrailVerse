'use strict';

const TrailieEvidenceRefreshEvent = require('../models/TrailieEvidenceRefreshEvent');

async function recordEvidenceRefreshEvent({
  RefreshEventModel = TrailieEvidenceRefreshEvent,
  event,
} = {}) {
  if (!event) throw new TypeError('Evidence refresh event is required');
  return RefreshEventModel.create(event);
}

module.exports = { recordEvidenceRefreshEvent };
