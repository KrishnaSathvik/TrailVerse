'use strict';

// A source document and the entity it describes have separate identities.
const clean = value => typeof value === 'string' ? value.trim() : '';
const operationalTitle = title => /\b(closures?|closed|restrictions?|permits?|hours|schedules?|accessibility|advisory|reservations?|construction)\b/i.test(title);
function entityEvidenceProvenance(record) {
  const value = record?.claim?.normalizedValue || {};
  const title = clean(value.evidenceDocumentTitle || value.title || value.name)
    || clean(record?.claim?.text).split(':')[0];
  const explicit = clean(value.canonicalEntityName || value.entityName || (value.name && value.title && value.name !== value.title ? value.name : null) || value.entity?.name
    || value.subjectEntity?.name || value.routeName || value.trailName);
  // These are source subject relationships, not arbitrary substring extraction
  // from model prose. Ambiguous notices remain documents, not place candidates.
  let subject = '';
  if (!explicit && operationalTitle(title)) {
    subject = title.match(/^(?:(?:large )?vehicle restrictions|road construction|closure notice|closures?|permit requirements|operating hours|hours|accessibility information|weather advisory|reservation requirements|ferry schedule)\s+(?:on|for|at|of)\s+(.+)$/i)?.[1]
      || title.match(/^(.+?)\s+(?:pilot permit program|permit requirements|operating hours|hours|ferry schedule|closure notice|closed)$/i)?.[1] || '';
  }
  const typedEntity = value.name && !value.title && !subject
    && ['museum', 'visitor_center', 'place', 'thingstodo', 'trail', 'walk', 'viewpoint'].includes(value.category || value.type)
    && !['alerts_closures', 'roads', 'permits'].includes(record?.topic);
  const document = operationalTitle(title) && !typedEntity;
  const name = explicit || clean(subject) || (!document ? clean(value.name || value.title) || title : '');
  return { canonicalEntityName: name, evidenceDocumentTitle: document || explicit && title !== explicit ? title : null,
    entityNameSource: explicit ? 'structured_entity' : subject ? 'document_subject' : 'source_entity' };
}
module.exports = { entityEvidenceProvenance, operationalTitle };
