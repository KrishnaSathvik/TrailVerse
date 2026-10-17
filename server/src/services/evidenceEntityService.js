'use strict';

const PROVIDER_FIELDS = Object.freeze({
  nps: 'providerIds.npsParkCode',
  ridb: 'providerIds.ridbRecAreaId',
  google: 'providerIds.googlePlaceId',
  gtfs: 'providerIds.gtfsAgencyId',
});

const normalizeEntityAlias = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const normalizeProviderValue = (provider, value) => {
  const compact = String(value || '').trim();
  return provider === 'nps' ? compact.toLowerCase() : compact;
};

function entityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function resolveEntity({ EntityModel, entityId, alias, providerId, entityType } = {}) {
  if (!EntityModel) throw new TypeError('EntityModel is required');
  const query = {};
  if (entityId) {
    query.entityId = String(entityId).trim().toLowerCase();
  } else if (alias) {
    query.aliasesNormalized = normalizeEntityAlias(alias);
  } else if (providerId?.provider && providerId?.value != null) {
    const provider = String(providerId.provider).trim().toLowerCase();
    const field = PROVIDER_FIELDS[provider];
    if (!field) throw entityError('unknown_evidence_entity_provider', `Unknown entity provider: ${provider}`);
    query[field] = normalizeProviderValue(provider, providerId.value);
  } else {
    throw entityError('missing_evidence_entity_lookup', 'Entity lookup requires entityId, alias, or providerId');
  }
  if (entityType) query.entityType = entityType;

  const matches = await EntityModel.find(query).limit(2).lean();
  if (matches.length > 1) {
    throw entityError('ambiguous_evidence_entity', 'Entity lookup matched more than one canonical entity');
  }
  return matches[0] || null;
}

async function upsertEntity({ EntityModel, entity } = {}) {
  if (!EntityModel || !entity?.entityId) throw new TypeError('EntityModel and entity.entityId are required');
  const aliases = [...new Set((entity.aliases || []).map((value) => String(value).trim()).filter(Boolean))];
  const aliasesNormalized = [...new Set([entity.canonicalName, ...aliases]
    .map(normalizeEntityAlias)
    .filter(Boolean))].sort();
  const providerIds = { ...(entity.providerIds || {}) };
  if (providerIds.npsParkCode) providerIds.npsParkCode = normalizeProviderValue('nps', providerIds.npsParkCode);

  return EntityModel.findOneAndUpdate(
    { entityId: String(entity.entityId).trim().toLowerCase() },
    {
      $set: {
        ...entity,
        entityId: String(entity.entityId).trim().toLowerCase(),
        aliases,
        aliasesNormalized,
        providerIds,
        stateCodes: [...new Set((entity.stateCodes || []).map((code) => String(code).trim().toUpperCase()))].sort(),
        countryCode: String(entity.countryCode || 'US').trim().toUpperCase(),
      },
      $setOnInsert: { schemaVersion: 1 },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  normalizeEntityAlias,
  resolveEntity,
  upsertEntity,
};
