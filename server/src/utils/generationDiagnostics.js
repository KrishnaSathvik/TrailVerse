'use strict';

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;
const SAFE_STATUS = /^[a-z0-9_]{1,64}$/;
const MAX_ERRORS = 8;
const MAX_DAY_DIAGNOSTICS = 12;
const MAX_PATH_CHARS = 160;
const MAX_MESSAGE_CHARS = 200;
const MAX_IDENTITY_CHARS = 120;

function boundedString(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

function safeCode(value) {
  const text = boundedString(value, 64);
  return text && SAFE_CODE.test(text) ? text : null;
}

function safeStatus(value) {
  const text = boundedString(value, 64);
  return text && SAFE_STATUS.test(text) ? text : null;
}

function boundedNumberList(value, max = 12) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(Number)
    .filter((number) => Number.isFinite(number) && number > 0))]
    .slice(0, max);
}

function boundedStructuralError(error) {
  const code = safeCode(error?.code);
  if (!code) return null;
  return Object.freeze({
    code,
    path: boundedString(error?.path, MAX_PATH_CHARS),
    message: boundedString(error?.message, MAX_MESSAGE_CHARS),
  });
}

function boundedDuplicateConflict(conflict) {
  const dayNumbers = boundedNumberList(conflict?.dayNumbers);
  const touchedDayNumbers = boundedNumberList(conflict?.touchedDayNumbers);
  const conflictType = ['touched_vs_untouched', 'touched_vs_touched']
    .includes(conflict?.conflictType)
    ? conflict.conflictType
    : null;
  if (dayNumbers.length === 0 || !conflictType) return null;
  return Object.freeze({
    dayNumbers,
    touchedDayNumbers,
    conflictType,
    experienceIdentity: boundedString(conflict?.experienceIdentity, MAX_IDENTITY_CHARS),
  });
}

function boundedDayDiagnostic(diagnostic) {
  const dayNumber = Number(diagnostic?.dayNumber);
  if (!Number.isFinite(dayNumber) || dayNumber <= 0) return null;
  const codes = [...new Set((Array.isArray(diagnostic?.codes) ? diagnostic.codes : [])
    .map(safeCode).filter(Boolean))].slice(0, MAX_ERRORS);
  const duplicateExperienceConflicts = (Array.isArray(diagnostic?.duplicateExperienceConflicts)
    ? diagnostic.duplicateExperienceConflicts : [])
    .map(boundedDuplicateConflict).filter(Boolean).slice(0, MAX_ERRORS);
  return Object.freeze({
    dayNumber,
    codes,
    ...(duplicateExperienceConflicts.length > 0 ? { duplicateExperienceConflicts } : {}),
  });
}

/**
 * One allowlisted diagnostic envelope for internal attempt records. Unknown
 * fields are discarded, so raw provider/tool payloads have no route through it.
 */
function boundedValidationDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  if (diagnostics.kind === 'structured_output') {
    const structuralErrors = (Array.isArray(diagnostics.structuralErrors)
      ? diagnostics.structuralErrors : [])
      .map(boundedStructuralError).filter(Boolean).slice(0, MAX_ERRORS);
    return Object.freeze({
      kind: 'structured_output',
      structuredStatus: safeStatus(diagnostics.structuredStatus),
      structuralErrors,
      toolCallId: boundedString(diagnostics.toolCallId, MAX_IDENTITY_CHARS),
      normalizationFailureCode: safeCode(diagnostics.normalizationFailureCode),
    });
  }
  if (diagnostics.kind === 'semantic_validation') {
    const dayDiagnostics = (Array.isArray(diagnostics.dayDiagnostics)
      ? diagnostics.dayDiagnostics : [])
      .map(boundedDayDiagnostic).filter(Boolean).slice(0, MAX_DAY_DIAGNOSTICS);
    return Object.freeze({ kind: 'semantic_validation', dayDiagnostics });
  }
  return null;
}

function structuralDiagnosticsFromNormalized(normalized) {
  const issues = Array.isArray(normalized?.validationIssues)
    ? normalized.validationIssues
    : [];
  const detailedCodes = new Set(issues.map((issue) => issue?.code).filter(Boolean));
  const structuralErrors = [
    ...issues,
    ...(Array.isArray(normalized?.validationErrors) ? normalized.validationErrors : [])
      .filter((code) => !detailedCodes.has(code))
      .filter((code) => !(issues.length > 0 && code === 'invalid_itinerary_shape'))
      .map((code) => ({ code, path: null, message: null })),
  ];
  return boundedValidationDiagnostics({
    kind: 'structured_output',
    structuredStatus: normalized?.status,
    structuralErrors,
    toolCallId: normalized?.toolCallId,
    normalizationFailureCode: normalized?.normalizationFailureCode,
  });
}

function structuredOutputRepairInstructions(diagnostics, { toolName = 'create_itinerary' } = {}) {
  const safe = boundedValidationDiagnostics(diagnostics);
  if (!safe || safe.kind !== 'structured_output') return '';
  if (safe.structuredStatus === 'missing_tool') {
    return `Call the required ${toolName} tool exactly once and return the complete itinerary through it.`;
  }

  const lines = safe.structuralErrors.map((error) => {
    if (error.path && error.message) return `- ${error.path}: ${error.message}.`;
    const messages = {
      unknown_tool: `Call only the required ${toolName} tool.`,
      unparseable_tool_arguments: 'Return syntactically valid JSON tool arguments.',
      ambiguous_tool_calls: `Return exactly one distinct ${toolName} tool call.`,
      incomplete_tool_arguments: 'Complete the tool arguments before ending the response.',
      truncated_tool_arguments: 'Return complete itinerary tool arguments within the response limit.',
      no_tool_before_truncation: `Call ${toolName} before the response limit and keep the tool payload concise.`,
      invalid_itinerary_shape: 'Return the required itinerary shape with a non-empty days array and a stops array for every day.',
      invalid_plan_patch_shape: 'Return a valid non-empty itinerary patch with supported operations and positive day numbers.',
      tool_payload_too_large: 'Return a smaller tool payload within the declared output contract.',
    };
    return `- ${messages[error.code] || error.code}`;
  });
  if (lines.length === 0 && safe.structuredStatus === 'malformed_tool') {
    lines.push(`- Return one valid ${toolName} tool call that matches its declared shape.`);
  }
  return lines.length > 0 ? `Repair the structured tool output:\n${lines.join('\n')}` : '';
}

module.exports = {
  MAX_ERRORS,
  MAX_DAY_DIAGNOSTICS,
  MAX_PATH_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_IDENTITY_CHARS,
  boundedValidationDiagnostics,
  structuralDiagnosticsFromNormalized,
  structuredOutputRepairInstructions,
};
