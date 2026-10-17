'use strict';

const TrailieEntity = require('../../models/TrailieEntity');
const {
  normalizeEntityAlias,
  resolveEntity,
  upsertEntity,
} = require('../evidenceEntityService');

const yosemite = {
  entityId: 'nps:park:yose',
  entityType: 'national_park',
  canonicalName: 'Yosemite National Park',
  aliases: ['Yosemite', 'Yosemite NP'],
  providerIds: { npsParkCode: 'yose' },
  stateCodes: ['ca'],
};

describe('WP3 canonical entity resolution', () => {
  test('normalizes aliases deterministically', () => {
    expect(normalizeEntityAlias('  Yosemite   NP ')).toBe('yosemite np');
  });

  test('upserts one canonical entity and resolves all aliases', async () => {
    const first = await upsertEntity({ EntityModel: TrailieEntity, entity: yosemite });
    const second = await upsertEntity({ EntityModel: TrailieEntity, entity: yosemite });

    expect(first.entityId).toBe(yosemite.entityId);
    expect(second.entityId).toBe(yosemite.entityId);
    expect(await TrailieEntity.countDocuments({ entityId: yosemite.entityId })).toBe(1);
    await expect(resolveEntity({ EntityModel: TrailieEntity, alias: 'YOSEMITE NP' }))
      .resolves.toMatchObject({ entityId: yosemite.entityId });
  });

  test('provider-native IDs round-trip to the canonical entity', async () => {
    await upsertEntity({ EntityModel: TrailieEntity, entity: yosemite });
    await expect(resolveEntity({
      EntityModel: TrailieEntity,
      providerId: { provider: 'nps', value: 'YOSE' },
    })).resolves.toMatchObject({ entityId: yosemite.entityId });
  });

  test('rejects ambiguous alias matches instead of guessing', async () => {
    await TrailieEntity.create([
      yosemite,
      { ...yosemite, entityId: 'local:place:yosemite', entityType: 'place', providerIds: {} },
    ]);

    await expect(resolveEntity({ EntityModel: TrailieEntity, alias: 'Yosemite' }))
      .rejects.toMatchObject({ code: 'ambiguous_evidence_entity' });
  });
});
