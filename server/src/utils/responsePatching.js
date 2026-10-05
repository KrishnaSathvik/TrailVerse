'use strict';

/**
 * Deterministic quote matching and patch application.
 *
 * Three strictly separated phases:
 *   1. resolveIssueMatch — locate a quote's original absolute span. Read-only.
 *   2. planPatches       — reconcile duplicates/conflicts/overlaps. Read-only.
 *   3. applyPatches      — mutate, highest offset first.
 *
 * Every match is resolved against the same unmodified response, so no earlier
 * replacement can shift a later match. All offsets are native UTF-16 indices.
 */

const { windowOwnsSpan } = require('./responseSections');

const MATCH_STATUS = {
  CANDIDATE: 'applied_candidate',
  NOT_FOUND: 'not_found',
  AMBIGUOUS: 'ambiguous',
  CROSS_BOUNDARY: 'cross_boundary',
  INVALID_QUOTE: 'invalid_quote',
  OUTSIDE_WINDOW: 'outside_window',
};

const PATCH_REJECTION = {
  CONFLICTING: 'conflicting_patch',
  OVERLAPPING: 'overlapping_patch',
  UNSAFE_DELETE: 'unsafe_delete',
  MISSING_REPLACEMENT: 'missing_replacement',
};

const MATCH_TIER = {
  EXACT: 'exact',
  NORMALIZED: 'normalized',
  NORMALIZED_CI: 'normalized_ci',
};

/** Typographic folds applied only to locate text — never to replacement text. */
const CHAR_FOLDS = new Map([
  ['‘', "'"], ['’', "'"], ['‚', "'"], ['‛', "'"],
  ['“', '"'], ['”', '"'], ['„', '"'], ['‟', '"'],
  ['–', '-'], ['—', '-'], ['‒', '-'], ['―', '-'], ['‑', '-'],
]);

const WHITESPACE_RE = /[\s    ]/;

/** Length-preserving lowercase — multi-char expansions (e.g. U+0130) are left alone. */
function foldCaseChar(ch) {
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower : ch;
}

/**
 * Normalized view of text plus a map back to original UTF-16 offsets.
 * Whitespace runs collapse to a single space whose original span covers the run,
 * so a normalized match always maps to an exact original half-open span.
 *
 * @returns {{normalizedText: string, originalStartByNormalizedIndex: number[], originalEndByNormalizedIndex: number[]}}
 */
function buildNormalizedIndex(text, { foldCase = false } = {}) {
  const source = String(text || '');
  const chars = [];
  const originalStartByNormalizedIndex = [];
  const originalEndByNormalizedIndex = [];

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (WHITESPACE_RE.test(ch)) {
      let j = i;
      while (j < source.length && WHITESPACE_RE.test(source[j])) j += 1;
      chars.push(' ');
      originalStartByNormalizedIndex.push(i);
      originalEndByNormalizedIndex.push(j);
      i = j;
      continue;
    }

    const folded = CHAR_FOLDS.get(ch) || ch;
    chars.push(foldCase ? foldCaseChar(folded) : folded);
    originalStartByNormalizedIndex.push(i);
    originalEndByNormalizedIndex.push(i + 1);
    i += 1;
  }

  return {
    normalizedText: chars.join(''),
    originalStartByNormalizedIndex,
    originalEndByNormalizedIndex,
  };
}

/** Normalize a needle the same way, then trim the folded edges. */
function normalizeNeedle(text, { foldCase = false } = {}) {
  return buildNormalizedIndex(text, { foldCase }).normalizedText.trim();
}

/** All original spans where `needle` occurs, restricted to a window. */
function findNormalizedSpans(index, needle, windowStart, windowEnd) {
  const spans = [];
  if (!needle) return spans;

  let from = 0;
  for (;;) {
    const at = index.normalizedText.indexOf(needle, from);
    if (at === -1) break;

    const absoluteStart = index.originalStartByNormalizedIndex[at];
    const absoluteEnd = index.originalEndByNormalizedIndex[at + needle.length - 1];

    if (absoluteStart >= windowStart && absoluteEnd <= windowEnd) {
      spans.push({ absoluteStart, absoluteEnd });
    }
    from = at + 1;
  }

  return spans;
}

/** All original spans of a raw substring, restricted to a window. */
function findExactSpans(content, needle, windowStart, windowEnd) {
  const spans = [];
  if (!needle) return spans;

  let from = windowStart;
  for (;;) {
    const at = content.indexOf(needle, from);
    if (at === -1 || at + needle.length > windowEnd) break;
    spans.push({ absoluteStart: at, absoluteEnd: at + needle.length });
    from = at + 1;
  }

  return spans;
}

/**
 * Locate one reviewer issue's quote in the original response.
 * Read-only: never mutates content and never consults previous matches.
 *
 * @returns {{status: string, absoluteStart: number|null, absoluteEnd: number|null, matchedText: string|null, matchTier: string|null, candidateCount: number}}
 */
function resolveIssueMatch({ content, section, reviewWindow, issue }) {
  const fail = (status, extra = {}) => ({
    status,
    absoluteStart: null,
    absoluteEnd: null,
    matchedText: null,
    matchTier: null,
    candidateCount: 0,
    ...extra,
  });

  const quote = issue?.exactQuote;
  if (typeof quote !== 'string' || quote.trim() === '') {
    return fail(MATCH_STATUS.INVALID_QUOTE);
  }

  const windowStart = reviewWindow.reviewStartOffset;
  const windowEnd = reviewWindow.reviewEndOffset;

  const tiers = [
    { tier: MATCH_TIER.EXACT, spans: () => findExactSpans(content, quote, windowStart, windowEnd) },
    {
      tier: MATCH_TIER.NORMALIZED,
      spans: () => {
        const index = buildNormalizedIndex(content);
        return findNormalizedSpans(index, normalizeNeedle(quote), windowStart, windowEnd);
      },
    },
    {
      tier: MATCH_TIER.NORMALIZED_CI,
      spans: () => {
        const index = buildNormalizedIndex(content, { foldCase: true });
        return findNormalizedSpans(
          index,
          normalizeNeedle(quote, { foldCase: true }),
          windowStart,
          windowEnd
        );
      },
    },
  ];

  for (const { tier, spans: getSpans } of tiers) {
    const spans = getSpans();
    if (spans.length === 0) continue;

    // A tier is usable only when it is unambiguous. Looser tiers can only be
    // more ambiguous, so stop rather than falling through.
    if (spans.length > 1) {
      return fail(MATCH_STATUS.AMBIGUOUS, { matchTier: tier, candidateCount: spans.length });
    }

    const { absoluteStart, absoluteEnd } = spans[0];
    const base = {
      absoluteStart,
      absoluteEnd,
      matchedText: content.slice(absoluteStart, absoluteEnd),
      matchTier: tier,
      candidateCount: 1,
    };

    if (windowOwnsSpan(reviewWindow, absoluteStart, absoluteEnd)) {
      return { status: MATCH_STATUS.CANDIDATE, ...base };
    }

    // Begins inside the owned range but runs past it — one section must never
    // rewrite another's text, so this is never auto-patched.
    const startsInside =
      absoluteStart >= reviewWindow.ownedStartOffset &&
      absoluteStart < reviewWindow.ownedEndOffset;

    return { status: startsInside ? MATCH_STATUS.CROSS_BOUNDARY : MATCH_STATUS.OUTSIDE_WINDOW, ...base };
  }

  return fail(MATCH_STATUS.NOT_FOUND);
}

function spanKey(patch) {
  return `${patch.absoluteStart}:${patch.absoluteEnd}`;
}

function sameMutation(a, b) {
  return a.action === b.action && (a.replacementText || '') === (b.replacementText || '');
}

/**
 * Reconcile resolved matches into a non-overlapping patch plan.
 * Ambiguity is always rejected rather than guessed — model severity never breaks a tie.
 *
 * @returns {{accepted: Array<Object>, rejected: Array<Object>}}
 */
function planPatches(resolvedIssues = []) {
  const accepted = [];
  const rejected = [];

  const candidates = [];
  for (const item of resolvedIssues) {
    if (item.match?.status !== MATCH_STATUS.CANDIDATE) {
      rejected.push({ ...item, rejection: item.match?.status || MATCH_STATUS.NOT_FOUND });
      continue;
    }
    if (item.issue.action === 'replace' && !String(item.issue.replacementText || '').length) {
      rejected.push({ ...item, rejection: PATCH_REJECTION.MISSING_REPLACEMENT });
      continue;
    }
    candidates.push({
      ...item,
      absoluteStart: item.match.absoluteStart,
      absoluteEnd: item.match.absoluteEnd,
      action: item.issue.action,
      replacementText: item.issue.replacementText,
    });
  }

  // Identical spans: dedupe when the mutation matches, reject the whole group otherwise.
  const bySpan = new Map();
  for (const candidate of candidates) {
    const key = spanKey(candidate);
    if (!bySpan.has(key)) bySpan.set(key, []);
    bySpan.get(key).push(candidate);
  }

  const deduped = [];
  for (const group of bySpan.values()) {
    const consistent = group.every((g) => sameMutation(g, group[0]));
    if (!consistent) {
      for (const g of group) rejected.push({ ...g, rejection: PATCH_REJECTION.CONFLICTING });
      continue;
    }
    deduped.push({ ...group[0], duplicateCount: group.length });
  }

  // Any span overlap at all — partial or contained — rejects every patch involved.
  deduped.sort((a, b) => a.absoluteStart - b.absoluteStart || a.absoluteEnd - b.absoluteEnd);
  const overlapping = new Set();
  for (let i = 0; i < deduped.length; i += 1) {
    for (let j = i + 1; j < deduped.length; j += 1) {
      if (deduped[j].absoluteStart >= deduped[i].absoluteEnd) break;
      overlapping.add(i);
      overlapping.add(j);
    }
  }

  deduped.forEach((patch, i) => {
    if (overlapping.has(i)) {
      rejected.push({ ...patch, rejection: PATCH_REJECTION.OVERLAPPING });
    } else {
      accepted.push(patch);
    }
  });

  return { accepted, rejected };
}

/** Leading markdown list/heading/ordered markers, used to detect dangling markers. */
const LEADING_MARKER_RE = /^[ \t]*(?:[-*+][ \t]+|#{1,6}[ \t]+|\d+\.[ \t]+|>[ \t]?)?/;

function isMarkdownSafeToRemove(fragment) {
  const brackets = (fragment.match(/\[/g) || []).length - (fragment.match(/\]/g) || []).length;
  const parens = (fragment.match(/\(/g) || []).length - (fragment.match(/\)/g) || []).length;
  const bold = (fragment.match(/\*\*/g) || []).length;
  const underscoreBold = (fragment.match(/__/g) || []).length;
  const backticks = (fragment.match(/`/g) || []).length;

  return (
    brackets === 0 && parens === 0 && bold % 2 === 0 && underscoreBold % 2 === 0 && backticks % 2 === 0
  );
}

/**
 * Conservative deletion. Removes a whole line only when the match is that line's
 * entire content (ignoring a leading list/heading marker); otherwise removes just
 * the span. Returns null when no safe deletion can be determined.
 */
function planDeletion(content, absoluteStart, absoluteEnd) {
  const fragment = content.slice(absoluteStart, absoluteEnd);
  if (!isMarkdownSafeToRemove(fragment)) return null;

  const lineStart = content.lastIndexOf('\n', absoluteStart - 1) + 1;
  const nextNewline = content.indexOf('\n', absoluteEnd);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;

  const before = content.slice(lineStart, absoluteStart);
  const after = content.slice(absoluteEnd, lineEnd);
  const remainder = (before + after).replace(LEADING_MARKER_RE, '').trim();

  if (remainder === '') {
    // Whole line is the match — take the line and one adjacent newline.
    const cutEnd = nextNewline === -1 ? content.length : nextNewline + 1;
    const cutStart =
      nextNewline === -1 && lineStart > 0 ? lineStart - 1 : lineStart;
    return { cutStart, cutEnd, mode: 'line' };
  }

  return { cutStart: absoluteStart, cutEnd: absoluteEnd, mode: 'span' };
}

/**
 * Apply an accepted patch plan, highest offset first so earlier spans never shift.
 * `replacementText` is inserted verbatim — no trimming, smartening, or reformatting.
 *
 * @returns {{content: string, applied: Array<Object>, unapplied: Array<Object>, deltas: Array<Object>}}
 */
function applyPatches(originalContent, acceptedPatches = []) {
  const applied = [];
  const unapplied = [];
  const deltas = [];

  const ordered = [...acceptedPatches].sort((a, b) => b.absoluteStart - a.absoluteStart);
  let content = originalContent;

  for (const patch of ordered) {
    const { absoluteStart, absoluteEnd, action } = patch;

    if (action === 'delete') {
      const plan = planDeletion(originalContent, absoluteStart, absoluteEnd);
      if (!plan) {
        unapplied.push({ ...patch, rejection: PATCH_REJECTION.UNSAFE_DELETE });
        continue;
      }
      const originalLength = plan.cutEnd - plan.cutStart;
      content = content.slice(0, plan.cutStart) + content.slice(plan.cutEnd);
      applied.push({ ...patch, deletionMode: plan.mode });
      deltas.push({
        absoluteStart: plan.cutStart,
        absoluteEnd: plan.cutEnd,
        originalLength,
        replacementLength: 0,
        lengthChange: -originalLength,
      });
      continue;
    }

    const replacement = String(patch.replacementText);
    const originalLength = absoluteEnd - absoluteStart;
    content = content.slice(0, absoluteStart) + replacement + content.slice(absoluteEnd);
    applied.push({ ...patch });
    deltas.push({
      absoluteStart,
      absoluteEnd,
      originalLength,
      replacementLength: replacement.length,
      lengthChange: replacement.length - originalLength,
    });
  }

  return { content, applied, unapplied, deltas };
}

module.exports = {
  MATCH_STATUS,
  MATCH_TIER,
  PATCH_REJECTION,
  buildNormalizedIndex,
  normalizeNeedle,
  findExactSpans,
  findNormalizedSpans,
  resolveIssueMatch,
  planPatches,
  planDeletion,
  applyPatches,
};
