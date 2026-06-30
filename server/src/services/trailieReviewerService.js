'use strict';

const { CLAUDE_REVIEWER_MODEL } = require('../config/aiModels');

const REVIEWER_SYSTEM_PROMPT = `You are Trailie's safety and consistency reviewer — NOT a travel writer.

Your job is to compare a Trailie response against:
- the structured itinerary JSON (if present)
- user constraints
- live NPS/weather/web data provided below

Rules:
- Treat live NPS data as authoritative for closures, alerts, and permits.
- Do NOT invent new park facts.
- Flag when visible prose recommends stops that contradict the itinerary JSON.
- Flag when prose recommends closed/unsafe stops that live data says to avoid.
- Flag unsupported live claims not grounded in the provided data.
- Flag when corrections were applied to the itinerary but prose still recommends removed stops.

Return ONLY valid JSON (no markdown) in this shape:
{
  "passed": true,
  "severity": "none" | "low" | "medium" | "high",
  "issues": [
    {
      "type": "prose_json_mismatch" | "closure_conflict" | "constraint_violation" | "unsupported_claim" | "missing_permit_warning" | "drive_time_issue",
      "severity": "low" | "medium" | "high",
      "message": "...",
      "suggestedFix": "..."
    }
  ]
}`;

const REPAIR_SYSTEM_PROMPT = `You are Trailie — TrailVerse AI's insider travel buddy. You are REPAIRING a response that failed consistency review.

Rules:
- Preserve Trailie voice: concise, insider, helpful — not a brochure.
- Make visible prose match the final itinerary JSON exactly.
- Do NOT recommend stops that were removed by constraint correction.
- Do NOT introduce facts not supported by the live data or itinerary provided.
- Do not add new trails, permits, closures, prices, dates, drive times, reservations, alerts, or safety claims unless they already appear in the provided itinerary, constraints, live data, reviewer issues, or original response.
- If corrections were applied, mention them naturally in one short paragraph.
- Keep the answer focused; do not regenerate unrelated content.

Return ONLY valid JSON (no markdown):
{
  "content": "repaired user-facing text (markdown ok)",
  "itineraryData": null
}

Set itineraryData only if you changed the structured itinerary; otherwise null.`;

function truncateBlock(text, maxLen = 4000) {
  if (!text || typeof text !== 'string') return '';
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}\n...[truncated]`;
}

function parseReviewerJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeReviewResult(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      passed: true,
      severity: 'none',
      issues: [],
      repairedContent: null,
      repairedItineraryData: null,
    };
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const severity = parsed.severity || (issues.length === 0 ? 'none' : 'low');

  return {
    passed: parsed.passed !== false && !['medium', 'high'].includes(severity),
    severity,
    issues,
    repairedContent: null,
    repairedItineraryData: null,
  };
}

function shouldRunReviewer({
  userRequestedItinerary,
  itineraryData,
  constraintIssues,
  correctionsApplied,
  trailieContext,
}) {
  if (userRequestedItinerary) return true;
  if (itineraryData) return true;
  if (constraintIssues?.length > 0) return true;
  if (correctionsApplied?.length > 0) return true;

  const riskFlags = trailieContext?.validation?.riskFlags || [];
  if (riskFlags.some((f) => f.severity === 'high' || f.severity === 'medium')) {
    return true;
  }

  return false;
}

function buildReviewerUserPayload({
  responseContent,
  itineraryData,
  constraints,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  astroFacts,
  feeFreeFacts,
  trailieContext,
  userMessage,
  correctionsApplied,
  constraintIssues,
}) {
  return JSON.stringify(
    {
      userMessage: userMessage?.slice(0, 500) || null,
      visibleResponse: truncateBlock(responseContent, 6000),
      itineraryJson: itineraryData || null,
      constraints: constraints?.hasConstraints
        ? {
            fitnessLevel: constraints.fitnessLevel,
            hasChildren: constraints.hasChildren,
            dates: constraints.dates,
            accommodation: constraints.accommodation,
            budget: constraints.budget,
          }
        : null,
      correctionsApplied: correctionsApplied || [],
      constraintIssues: (constraintIssues || []).map((i) => i.details || i.message || i),
      liveData: {
        nps: truncateBlock(npsFacts, 3000) || null,
        weather: truncateBlock(weatherFacts, 1500) || null,
        webSearch: truncateBlock(webSearchFacts, 2000) || null,
        astro: truncateBlock(astroFacts, 1000) || null,
        feeFree: feeFreeFacts ? JSON.stringify(feeFreeFacts).slice(0, 800) : null,
      },
      riskFlags: trailieContext?.validation?.riskFlags || [],
      providerMode: trailieContext?.providerMode || null,
    },
    null,
    2
  );
}

async function reviewTrailieResponse({
  anthropic,
  responseContent,
  itineraryData,
  constraints,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  astroFacts,
  feeFreeFacts,
  trailieContext,
  userMessage,
  responseMode,
  provider,
  model,
  correctionsApplied,
  constraintIssues,
  logPrefix = '[Trailie Reviewer]',
}) {
  if (!anthropic) {
    return normalizeReviewResult({ passed: true, severity: 'none', issues: [] });
  }

  const userPayload = buildReviewerUserPayload({
    responseContent,
    itineraryData,
    constraints,
    npsFacts,
    weatherFacts,
    webSearchFacts,
    astroFacts,
    feeFreeFacts,
    trailieContext,
    userMessage,
    correctionsApplied,
    constraintIssues,
  });

  try {
    const result = await anthropic.messages.create({
      model: model || CLAUDE_REVIEWER_MODEL,
      max_tokens: 2048,
      temperature: 0.1,
      system: REVIEWER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPayload }],
    });

    const raw = (result.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const parsed = parseReviewerJson(raw);
    const normalized = normalizeReviewResult(parsed);

    console.log(`${logPrefix} Review complete:`, {
      passed: normalized.passed,
      severity: normalized.severity,
      issueCount: normalized.issues.length,
      responseMode,
      provider,
    });

    return normalized;
  } catch (err) {
    console.error(`${logPrefix} Review failed:`, err.message);
    return normalizeReviewResult({ passed: true, severity: 'none', issues: [] });
  }
}

async function repairTrailieResponse({
  anthropic,
  responseContent,
  itineraryData,
  reviewResult,
  constraints,
  npsFacts,
  weatherFacts,
  correctionsApplied,
  trailieContext,
  userMessage,
  model,
  logPrefix = '[Trailie Repair]',
}) {
  if (!anthropic || !reviewResult?.issues?.length) {
    return { content: responseContent, itineraryData };
  }

  const repairPayload = JSON.stringify(
    {
      userMessage: userMessage?.slice(0, 500) || null,
      originalResponse: truncateBlock(responseContent, 5000),
      itineraryJson: itineraryData || null,
      reviewIssues: reviewResult.issues,
      correctionsApplied: correctionsApplied || [],
      constraints: constraints?.hasConstraints
        ? {
            fitnessLevel: constraints.fitnessLevel,
            hasChildren: constraints.hasChildren,
          }
        : null,
      liveDataSummary: {
        npsAvailable: !!npsFacts,
        weatherAvailable: !!weatherFacts,
      },
      riskFlags: trailieContext?.validation?.riskFlags || [],
    },
    null,
    2
  );

  try {
    const result = await anthropic.messages.create({
      model: model || CLAUDE_REVIEWER_MODEL,
      max_tokens: 4096,
      temperature: 0.3,
      system: REPAIR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: repairPayload }],
    });

    const raw = (result.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const parsed = parseReviewerJson(raw);
    if (parsed?.content) {
      console.log(`${logPrefix} Repair applied`);
      return {
        content: parsed.content,
        itineraryData:
          parsed.itineraryData && Array.isArray(parsed.itineraryData.days)
            ? parsed.itineraryData
            : itineraryData,
      };
    }
  } catch (err) {
    console.error(`${logPrefix} Repair failed:`, err.message);
  }

  return { content: responseContent, itineraryData };
}

/**
 * Run review and optional repair pass. Returns merged metadata for downstream save/display.
 */
async function runReviewAndRepair(params) {
  const {
    anthropic,
    responseContent,
    itineraryData,
    constraints,
    npsFacts,
    weatherFacts,
    webSearchFacts,
    astroFacts,
    feeFreeFacts,
    trailieContext,
    userMessage,
    responseMode,
    provider,
    userRequestedItinerary,
    correctionsApplied,
    constraintIssues,
    logPrefix = '[Trailie Reviewer]',
  } = params;

  if (
    !shouldRunReviewer({
      userRequestedItinerary,
      itineraryData,
      constraintIssues,
      correctionsApplied,
      trailieContext,
    })
  ) {
    return {
      content: responseContent,
      itineraryData,
      reviewMeta: {
        reviewerRan: false,
        reviewerModel: null,
        reviewerPassed: true,
        reviewerSeverity: 'none',
        reviewerIssueTypes: [],
        repaired: false,
      },
    };
  }

  const reviewResult = await reviewTrailieResponse({
    anthropic,
    responseContent,
    itineraryData,
    constraints,
    npsFacts,
    weatherFacts,
    webSearchFacts,
    astroFacts,
    feeFreeFacts,
    trailieContext,
    userMessage,
    responseMode,
    provider,
    correctionsApplied,
    constraintIssues,
    logPrefix,
  });

  let finalContent = responseContent;
  let finalItinerary = itineraryData;
  let repaired = false;

  if (
    !reviewResult.passed &&
    (reviewResult.severity === 'high' || reviewResult.severity === 'medium')
  ) {
    const repairedResult = await repairTrailieResponse({
      anthropic,
      responseContent,
      itineraryData,
      reviewResult,
      constraints,
      npsFacts,
      weatherFacts,
      correctionsApplied,
      trailieContext,
      userMessage,
      logPrefix: `${logPrefix} Repair`,
    });

    if (repairedResult.content !== responseContent || repairedResult.itineraryData !== itineraryData) {
      finalContent = repairedResult.content;
      finalItinerary = repairedResult.itineraryData;
      repaired = true;
    }
  }

  return {
    content: finalContent,
    itineraryData: finalItinerary,
    reviewMeta: {
      reviewerRan: true,
      reviewerModel: CLAUDE_REVIEWER_MODEL,
      reviewerPassed: reviewResult.passed && !repaired,
      reviewerSeverity: reviewResult.severity,
      reviewerIssueTypes: reviewResult.issues.map((i) => i.type).filter(Boolean),
      repaired,
    },
  };
}

module.exports = {
  shouldRunReviewer,
  reviewTrailieResponse,
  repairTrailieResponse,
  runReviewAndRepair,
};
