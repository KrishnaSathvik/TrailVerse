import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { resolveTrailiePresentationSource } from '@/lib/trailieResponseModel';

const parser = unified().use(remarkParse).use(remarkGfm);
const stringifier = unified().use(remarkGfm).use(remarkStringify, { bullet: '-', fences: true });

function textOf(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  return (node.children || []).map(textOf).join(' ');
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function markdownFor(children) {
  if (!children?.length) return '';
  return stringifier.stringify({ type: 'root', children }).trim();
}

function planStops(plan) {
  return (plan?.days || []).flatMap((day) => day.stops || []);
}

function matchesDay(text, day, index) {
  const candidate = normalize(text);
  const labels = [day?.label, day?.title, `day ${day?.dayNumber || day?.day || index + 1}`]
    .map(normalize)
    .filter(Boolean);
  return labels.some((label) => candidate.includes(label) || label.includes(candidate));
}

function splitItineraryRestatement(root, plan) {
  const start = root.children.findIndex((node) => normalize(textOf(node)) === 'at a glance');
  if (start < 0) return null;

  const days = plan?.days || [];
  const stopNames = planStops(plan).map((stop) => normalize(stop.name)).filter(Boolean);
  const matchedStops = new Set();
  let matchedDays = 0;
  let end = start;
  let sawPlanNode = false;

  for (let index = start + 1; index < root.children.length; index += 1) {
    const node = root.children[index];
    const nodeText = normalize(textOf(node));
    const dayMatch = days.some((day, dayIndex) => matchesDay(nodeText, day, dayIndex));
    const stopMatches = stopNames.filter((name) => nodeText.includes(name));
    const isPlanNode = dayMatch || stopMatches.length > 0 || (sawPlanNode && node.type === 'list');

    if (!isPlanNode) break;
    sawPlanNode = true;
    if (dayMatch) matchedDays += 1;
    stopMatches.forEach((name) => matchedStops.add(name));
    end = index;
  }

  const stopThreshold = Math.max(1, Math.ceil(stopNames.length * 0.6));
  const confident = matchedDays >= Math.max(1, Math.ceil(days.length * 0.5))
    && matchedStops.size >= stopThreshold;
  if (!confident) return null;

  return {
    intro: markdownFor(root.children.slice(0, start)),
    context: markdownFor(root.children.slice(end + 1)),
  };
}

function alternativeKey(item) {
  return normalize(typeof item === 'string' ? item : item?.name);
}

function dayNumberOf(day, index) {
  const value = Number(day?.dayNumber ?? day?.day ?? day?.dayIndex);
  return Number.isInteger(value) && value > 0 ? value : index + 1;
}

function projectPlanAndAlternatives(plan, refinement = null) {
  if (!plan) return { plan: null, planB: null };
  const changedDayNumbers = refinement?.isRefinement
    && Array.isArray(refinement.changedDayNumbers)
    && refinement.changedDayNumbers.length > 0
    ? new Set(refinement.changedDayNumbers)
    : null;
  const presentedDays = changedDayNumbers
    ? (plan.days || []).filter((day, index) => changedDayNumbers.has(dayNumberOf(day, index)))
    : (plan.days || []);
  // Canonical narrative sections have no day-scope field. When a refinement
  // presents only a strict subset of the full plan, retaining those unscoped
  // sections can leak unchanged-day prose into the delta response. The
  // current turn's authored prose is separate (`response.content`) and is not
  // affected by this projection.
  const isPartialRefinement = Boolean(
    changedDayNumbers && presentedDays.length < (plan.days || []).length
  );
  const rawPlanLevel = (plan.alternatives || []).filter((item) => alternativeKey(item));
  const rawPlanKeys = rawPlanLevel.map(alternativeKey);
  const compositePlanLevel = rawPlanLevel.find((item, index) => {
    const key = rawPlanKeys[index];
    return rawPlanKeys.filter((_, otherIndex) => otherIndex !== index)
      .filter((otherKey) => key.includes(otherKey)).length >= 2;
  });
  const planLevel = rawPlanLevel.filter((item, index) => {
    const key = rawPlanKeys[index];
    return !rawPlanKeys.some((otherKey, otherIndex) => (
      otherIndex !== index && otherKey.length > key.length && otherKey.includes(key)
    ));
  });
  const planKeys = new Set(rawPlanKeys);
  const allKeys = new Set(planKeys);
  const uniqueStopAlternatives = [];

  const days = presentedDays.map((day) => ({
    ...day,
    stops: (day.stops || []).map((stop) => {
      const alternatives = (stop.alternatives || []).filter((item) => {
        const key = alternativeKey(item);
        if (!key || planKeys.has(key) || allKeys.has(key)) return false;
        allKeys.add(key);
        uniqueStopAlternatives.push({
          ...(typeof item === 'string' ? { name: item } : item),
          stopName: stop.name,
        });
        return true;
      });
      return { ...stop, alternatives };
    }),
  }));

  const planBItems = [...planLevel, ...uniqueStopAlternatives];
  const hasExplicitBackup = Boolean(compositePlanLevel?.when)
    || planBItems.some((item) => item && typeof item === 'object' && item.when);
  return {
    plan: {
      ...plan,
      days,
      alternatives: [],
      narrativeSections: isPartialRefinement ? [] : (plan.narrativeSections || []),
    },
    planB: hasExplicitBackup && planBItems.length ? {
      items: compositePlanLevel
        ? rawPlanLevel.filter((item) => item !== compositePlanLevel)
        : planBItems,
      condition: compositePlanLevel?.when
        || planBItems.find((item) => item && typeof item === 'object' && item.when)?.when
        || null,
    } : null,
  };
}

export function normalizeTrailiePresentation(response = {}) {
  const content = response.lifecycle?.showProse ? String(response.content || '').trim() : '';
  const manifest = response.presentation;
  const kind = manifest?.presentationKind || response.presentationKind || 'plain_answer';
  const primarySource = resolveTrailiePresentationSource(response, manifest?.primaryArtifact?.source);
  const plan = response.lifecycle?.showPlan && kind === 'itinerary' && response.artifactStatus?.status !== 'save_failed'
    ? primarySource || response.canonicalPlan
    : null;
  const projected = projectPlanAndAlternatives(plan, manifest?.refinement);
  const root = content ? parser.parse(content) : { type: 'root', children: [] };

  let intro = content;
  let context = '';
  let primaryArtifact = null;

  if (plan) {
    const split = splitItineraryRestatement(root, plan);
    if (split) {
      intro = split.intro;
      context = split.context;
    } else if (!intro && response.lifecycle?.showProse !== false) {
      intro = String(plan.intro || '').trim();
    }
    primaryArtifact = {
      kind: 'itinerary',
      source: manifest?.primaryArtifact?.source,
      plan: projected.plan,
    };
  } else if (kind === 'comparison') {
    primaryArtifact = null;
  } else if (kind !== 'plain_answer' && kind !== 'itinerary' && primarySource != null) {
    primaryArtifact = { kind, source: manifest?.primaryArtifact?.source, data: primarySource };
  }

  const supportingModules = (manifest?.supportingModules || []).flatMap((module) => {
    const data = resolveTrailiePresentationSource(response, module.source);
    return data == null ? [] : [{ ...module, data }];
  });

  return {
    kind,
    intro,
    primaryArtifact,
    supportingModules,
    context,
    narrativeSections: projected.plan?.narrativeSections || [],
    planB: projected.planB,
    caveat: null,
    beforeYouGo: null,
    followups: [],
    refinement: manifest?.refinement?.isRefinement ? manifest.refinement : null,
  };
}
