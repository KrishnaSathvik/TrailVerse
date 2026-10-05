'use strict';

const {
  assertPublicEvidenceWrite,
  SHARED_EVIDENCE_PRIVATE_DATA,
} = require('../evidencePrivacy');

const publicItem = {
  evidenceId: 'ev:nps:yose:alert-1',
  privacyScope: 'public',
  entityId: 'park:nps:yose',
  topic: 'alerts',
  claim: 'Tioga Road is temporarily closed.',
  source: {
    provider: 'nps',
    url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm',
  },
};

describe('assertPublicEvidenceWrite', () => {
  test('accepts normalized public facts and returns the item unchanged', () => {
    expect(assertPublicEvidenceWrite({
      item: publicItem,
      sourceRequest: { privacyScope: 'public', provider: 'nps', entityId: 'park:nps:yose' },
    })).toBe(publicItem);
  });

  test.each([
    ['user identifier', { userId: '64f000000000000000000001' }],
    ['session identifier', { sessionId: 'session-private' }],
    ['trip state', { tripState: { budget: 2500 } }],
    ['raw query', { rawQuery: 'Plan from 123 Main St with my children' }],
    ['home address', { homeAddress: '123 Main St' }],
    ['personal accessibility needs', { accessibilityNeeds: 'My child uses a wheelchair' }],
    ['email nested in metadata', { metadata: { email: 'person@example.com' } }],
  ])('rejects %s anywhere in a shared item', (_label, privateFragment) => {
    expect(() => assertPublicEvidenceWrite({
      item: { ...publicItem, metadata: privateFragment },
      sourceRequest: { privacyScope: 'public', provider: 'nps' },
    })).toThrow(expect.objectContaining({ code: SHARED_EVIDENCE_PRIVATE_DATA }));
  });

  test('rejects private fields carried by the source request', () => {
    expect(() => assertPublicEvidenceWrite({
      item: publicItem,
      sourceRequest: {
        privacyScope: 'public',
        provider: 'nps',
        conversation: [{ role: 'user', content: 'private' }],
      },
    })).toThrow(expect.objectContaining({ code: SHARED_EVIDENCE_PRIVATE_DATA }));
  });

  test('rejects writes whose declared privacy scope is not public', () => {
    expect(() => assertPublicEvidenceWrite({
      item: { ...publicItem, privacyScope: 'user' },
      sourceRequest: { privacyScope: 'user', provider: 'nps' },
    })).toThrow(expect.objectContaining({ code: SHARED_EVIDENCE_PRIVATE_DATA }));
  });
});
