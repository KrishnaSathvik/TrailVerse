'use strict';

/**
 * Typed grounded traveler experiences — not POI-only.
 *
 * Identity resolution may bind stops to official evidence across these kinds.
 * No destination-specific aliases: kinds are inferred from type, name shape,
 * and evidence metadata (primaryActivityType / topic / scenicDriveSubject).
 */

const EXPERIENCE_KINDS = Object.freeze({
  PLACE: 'place',
  TRAIL: 'trail',
  VIEWPOINT: 'viewpoint',
  FACILITY: 'facility',
  SCENIC_DRIVE: 'scenic_drive',
  AREA: 'area',
  ROUTE: 'route',
  REGION: 'region',
  EXPERIENCE: 'experience',
  FERRY: 'ferry',
});

const TYPE_TO_KIND = Object.freeze({
  trail: EXPERIENCE_KINDS.TRAIL,
  hike: EXPERIENCE_KINDS.TRAIL,
  walk: EXPERIENCE_KINDS.TRAIL,
  viewpoint: EXPERIENCE_KINDS.VIEWPOINT,
  overlook: EXPERIENCE_KINDS.VIEWPOINT,
  landmark: EXPERIENCE_KINDS.PLACE,
  museum: EXPERIENCE_KINDS.FACILITY,
  visitor_center: EXPERIENCE_KINDS.FACILITY,
  scenic_drive: EXPERIENCE_KINDS.SCENIC_DRIVE,
  scenic: EXPERIENCE_KINDS.SCENIC_DRIVE,
  area: EXPERIENCE_KINDS.AREA,
  district: EXPERIENCE_KINDS.AREA,
  region: EXPERIENCE_KINDS.REGION,
  route: EXPERIENCE_KINDS.ROUTE,
  ferry: EXPERIENCE_KINDS.FERRY,
  boat: EXPERIENCE_KINDS.FERRY,
  wildlife: EXPERIENCE_KINDS.EXPERIENCE,
  photography: EXPERIENCE_KINDS.EXPERIENCE,
  activity: EXPERIENCE_KINDS.EXPERIENCE,
  ranger_program: EXPERIENCE_KINDS.EXPERIENCE,
});

const ROUTE_NAME =
  /\b(highway|parkway|byway|scenic (?:drive|road|route)|loop (?:road|drive)|auto[- ]tour|route\s*\d+)\b/i;
const AREA_NAME =
  /\b(canyons?|district|area|region|basin|valley|unit|section|neighborhood|quarter)\b/i;
const FERRY_NAME = /\b(ferry|boat (?:tour|ride|trip)|water taxi)\b/i;
const TRAIL_NAME = /\b(trail|hike|walk|boardwalk|path)\b/i;
const VIEW_NAME = /\b(viewpoint|overlook|lookout|vista|point)\b/i;

function inferExperienceKindFromName(name) {
  const text = String(name || '').trim();
  if (!text) return null;
  if (ROUTE_NAME.test(text)) return EXPERIENCE_KINDS.SCENIC_DRIVE;
  if (FERRY_NAME.test(text)) return EXPERIENCE_KINDS.FERRY;
  if (TRAIL_NAME.test(text)) return EXPERIENCE_KINDS.TRAIL;
  if (VIEW_NAME.test(text)) return EXPERIENCE_KINDS.VIEWPOINT;
  if (AREA_NAME.test(text)) return EXPERIENCE_KINDS.AREA;
  return null;
}

function inferExperienceKind({ type = null, name = null, primaryActivityType = null, topic = null } = {}) {
  const typed = String(type || primaryActivityType || '').toLowerCase().trim();
  if (TYPE_TO_KIND[typed]) return TYPE_TO_KIND[typed];
  if (topic === 'roads') return EXPERIENCE_KINDS.SCENIC_DRIVE;
  const fromName = inferExperienceKindFromName(name);
  if (fromName) return fromName;
  return EXPERIENCE_KINDS.PLACE;
}

function isGroundedTravelerExperience(kind) {
  return kind != null && kind !== 'logistics' && kind !== 'rest';
}

/**
 * True when this stop can anchor a sightseeing day: typed experience or an
 * identifiable named traveler experience (drive, area, ferry, trail, etc.).
 */
function isGroundedExperienceStop(stop) {
  const type = String(stop?.type || '').toLowerCase().trim();
  if (TYPE_TO_KIND[type]) return true;
  const kind = inferExperienceKind({ type, name: stop?.name });
  return [
    EXPERIENCE_KINDS.TRAIL,
    EXPERIENCE_KINDS.VIEWPOINT,
    EXPERIENCE_KINDS.SCENIC_DRIVE,
    EXPERIENCE_KINDS.AREA,
    EXPERIENCE_KINDS.ROUTE,
    EXPERIENCE_KINDS.REGION,
    EXPERIENCE_KINDS.EXPERIENCE,
    EXPERIENCE_KINDS.FERRY,
    EXPERIENCE_KINDS.PLACE,
    EXPERIENCE_KINDS.FACILITY,
  ].includes(kind);
}

module.exports = {
  EXPERIENCE_KINDS,
  inferExperienceKind,
  inferExperienceKindFromName,
  isGroundedTravelerExperience,
  isGroundedExperienceStop,
  ROUTE_NAME,
  AREA_NAME,
};
