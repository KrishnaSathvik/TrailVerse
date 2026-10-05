'use strict';

/**
 * Response sectioning for reviewer coverage.
 *
 * Two distinct concepts:
 *  - Canonical sections partition the response exactly (no gaps, no overlap).
 *    They are the authoritative target for patch application.
 *  - Review windows may include neighbouring context so a claim near a boundary
 *    is still reviewable in context, but each window owns only its canonical
 *    range. A finding is patchable only when its span begins inside that range.
 *
 * All offsets are native JavaScript UTF-16 string indices. Never mix these with
 * code-point or byte offsets.
 */

/** Default context bleed on each side of a review window, in UTF-16 units. */
const DEFAULT_CONTEXT_CHARS = 400;

/** Markdown ATX heading carrying actual label text. */
const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+\S/;

/**
 * Structural day header — requires a delimiter after the number so ordinary
 * prose ("Day 1 was long", "on Day 1 we drive") is never a boundary.
 */
const DAY_HEADER_RE = /^[ \t]{0,3}(?:[-*+][ \t]+)?(?:\*\*|__)?Day[ \t]+\d+[ \t]*(?:[—–:.)\-]|\*\*|__)/;

/** Opening or closing line of a fenced code block. */
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/**
 * Walk lines while tracking native UTF-16 offsets. `\n` is the only separator
 * consumed, so CRLF input keeps its `\r` inside the line and offsets stay exact.
 * @param {string} content
 * @param {(line: string, startOffset: number) => void} visit
 */
function forEachLine(content, visit) {
  let offset = 0;
  for (const line of content.split('\n')) {
    visit(line, offset);
    offset += line.length + 1; // +1 for the consumed '\n'
  }
}

/**
 * Offset ranges covered by fenced code blocks, which must never be split.
 * @returns {{ranges: Array<{start:number,end:number}>, unterminated: boolean}}
 */
function findFencedRanges(content) {
  const ranges = [];
  let open = null;

  forEachLine(content, (line, start) => {
    const match = line.match(FENCE_RE);
    if (!match) return;

    if (open === null) {
      open = { start, marker: match[1][0] };
    } else if (match[1][0] === open.marker) {
      ranges.push({ start: open.start, end: start + line.length });
      open = null;
    }
  });

  // An unterminated fence swallows the remainder of the response. This is not a
  // sectioning failure, but it suppresses every boundary after it, so surface it.
  const unterminated = open !== null;
  if (unterminated) ranges.push({ start: open.start, end: content.length });

  return { ranges, unterminated };
}

function isInsideRanges(offset, ranges) {
  return ranges.some((r) => offset >= r.start && offset < r.end);
}

function slugifyLabel(text) {
  const slug = String(text || '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/, '')
    .replace(/\*\*|__/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'section';
}

/** First line of a section, used for its human-readable label. */
function firstLineOf(text) {
  const nl = text.indexOf('\n');
  return (nl === -1 ? text : text.slice(0, nl)).replace(/\r$/, '').trim();
}

/**
 * Split content into canonical, non-overlapping sections covering every character.
 *
 * Invariants (see validateSectionPartition):
 *   sections[0].startOffset === 0
 *   sections.at(-1).endOffset === content.length
 *   sections[i].endOffset === sections[i + 1].startOffset
 *   sections.map(s => s.text).join('') === content
 *
 * @param {string} content
 * @returns {Array<Object>} canonical sections
 */
function splitIntoSections(content) {
  if (typeof content !== 'string' || content.length === 0) return [];

  const { ranges: fenced } = findFencedRanges(content);
  const boundaries = [];

  forEachLine(content, (line, start) => {
    if (start === 0) return; // never split before the first character
    if (isInsideRanges(start, fenced)) return;
    if (HEADING_RE.test(line) || DAY_HEADER_RE.test(line)) boundaries.push(start);
  });

  const starts = [0, ...new Set(boundaries)];
  const sections = [];

  for (let i = 0; i < starts.length; i += 1) {
    const startOffset = starts[i];
    const endOffset = i + 1 < starts.length ? starts[i + 1] : content.length;
    if (endOffset <= startOffset) continue;

    const text = content.slice(startOffset, endOffset);
    const label = firstLineOf(text);

    sections.push({
      // Index prefix keeps ids unique when headings repeat verbatim.
      sectionId: `${sections.length}:${slugifyLabel(label)}`,
      index: sections.length,
      label,
      startOffset,
      endOffset,
      text,
    });
  }

  return sections;
}

/**
 * Verify a section list partitions content exactly.
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSectionPartition(content, sections) {
  const errors = [];

  if (!sections.length) {
    if (content && content.length > 0) errors.push('no sections for non-empty content');
    return { valid: errors.length === 0, errors };
  }

  if (sections[0].startOffset !== 0) errors.push('first section does not start at 0');
  if (sections[sections.length - 1].endOffset !== content.length) {
    errors.push('last section does not end at content.length');
  }
  for (let i = 0; i < sections.length - 1; i += 1) {
    if (sections[i].endOffset !== sections[i + 1].startOffset) {
      errors.push(`gap or overlap between section ${i} and ${i + 1}`);
    }
  }
  if (sections.map((s) => s.text).join('') !== content) {
    errors.push('section text does not reconstruct content');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build review windows carrying neighbouring context around each canonical
 * section. The owned range is the canonical section; context is read-only.
 */
function buildReviewWindows(content, sections, { contextChars = DEFAULT_CONTEXT_CHARS } = {}) {
  return sections.map((section) => {
    const reviewStartOffset = Math.max(0, section.startOffset - contextChars);
    const reviewEndOffset = Math.min(content.length, section.endOffset + contextChars);

    return {
      sectionId: section.sectionId,
      index: section.index,
      label: section.label,
      reviewStartOffset,
      reviewEndOffset,
      reviewText: content.slice(reviewStartOffset, reviewEndOffset),
      ownedStartOffset: section.startOffset,
      ownedEndOffset: section.endOffset,
    };
  });
}

/**
 * A finding is patchable by a window only when its ENTIRE half-open span
 * [absoluteStart, absoluteEnd) lies inside that window's owned range. Checking
 * only the start would let a quote that begins just before the boundary run on
 * and rewrite text owned by the next section. Context-only overlap never qualifies.
 */
function windowOwnsSpan(window, absoluteStart, absoluteEnd) {
  return (
    absoluteStart >= window.ownedStartOffset &&
    absoluteEnd <= window.ownedEndOffset
  );
}

/**
 * Sectioning plus diagnostics worth surfacing in reviewer metadata.
 * @returns {{sections: Array<Object>, unterminatedFence: boolean, sectionCount: number}}
 */
function describeSectioning(content) {
  const { unterminated } = findFencedRanges(String(content || ''));
  const sections = splitIntoSections(content);
  return { sections, unterminatedFence: unterminated, sectionCount: sections.length };
}

/** The single canonical section owning an absolute offset, or null. */
function sectionForOffset(sections, absoluteStart) {
  return sections.find(
    (s) => absoluteStart >= s.startOffset && absoluteStart < s.endOffset
  ) || null;
}

module.exports = {
  DEFAULT_CONTEXT_CHARS,
  forEachLine,
  findFencedRanges,
  splitIntoSections,
  describeSectioning,
  validateSectionPartition,
  buildReviewWindows,
  windowOwnsSpan,
  sectionForOffset,
};
