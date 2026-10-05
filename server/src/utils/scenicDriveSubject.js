'use strict';

// Identify the subject of an official record, not activities encountered along it.
// No destination names or road aliases belong here.
const text = (value) => String(value || '').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const labels = (values) => (Array.isArray(values) ? values : [])
  .map((v) => text(typeof v === 'string' ? v : v?.name)).join(' ');
const DRIVE_TAG = /\bscenic[-_ ]driv(?:e|es|ing)\b|\bauto[- ]tours?\b|self-guided tours? - auto/i;
const SUPPORT_TITLE = /\b(overlook|viewpoint|pull[- ]?out|turnout|trailhead|picnic|toilet|restroom|visitor cent(?:er|re)|entrance station|kiosk|wayside|exhibit|orientation|junior ranger|bike|biking|hike|hiking|walk|walking)\b/i;
const GUIDANCE = /\b(winter driving|driving (?:tips|safety|conditions|rules)|road conditions|safety|guidelines|reservations?|timed entry)\b/i;

function isScenicDriveSubject(item = {}) {
  const title = text(item.title || item.name);
  if (!title || /^(?:scenic driving|scenic drive|auto tours?|driving tours?)$/i.test(title)) return false;
  if (SUPPORT_TITLE.test(title) || GUIDANCE.test(title)) return false;
  const lead = text(item.shortDescription || item.listingDescription || item.description
    || item.longDescription || item.bodyText).slice(0, 650);
  const tags = labels(item.tags);
  const activities = labels(item.activities || item.activityTags);
  // Metadata may describe the road a wayside is ON, rather than its own subject.
  if (/\b(wayside exhibit|orientation panels?|this spot|this (?:overlook|pullout)|learn about (?:winter )?driving)\b/i.test(lead)
    || /\bwayside exhibit\b/i.test(tags)) return false;
  const titleDrive = /^(?:(?:enjoy|take|explore) (?:a |the )?(?:scenic )?)?drive\b/i.test(title)
    || /\bscenic (?:drive|road|route|highway)\b|\bauto[- ]tour\b/i.test(title);
  if (titleDrive) return true;
  const roadTitle = /\b(road|drive|parkway|highway|byway|route)\b/i.test(title);
  // Require a definition of this road, not directions to another experience.
  const definesRoad = /\b(?:is|offers|provides|follows|winds|runs|climbs|connects)\b[^.!?]{0,160}\b(?:scenic|road|drive|views|route)\b/i.test(lead);
  const invitesDrive = /^(?:enjoy|take|explore|travel|drive)\b[^.!?]{0,160}\b(?:drive|road|parkway|route)\b/i.test(lead);
  return roadTitle && (DRIVE_TAG.test(activities) || definesRoad || invitesDrive)
    && (DRIVE_TAG.test(`${activities} ${tags}`) || /\bscenic|views|driv(?:e|ing)\b/i.test(lead));
}

function isTaxonomyCandidate(candidate) {
  return ['taxonomy', 'activity_taxonomy'].includes(candidate?.claim?.normalizedValue?.category)
    || (candidate?.claim?.qualifiers || []).includes('activity_taxonomy');
}

module.exports = { isScenicDriveSubject, isTaxonomyCandidate };
