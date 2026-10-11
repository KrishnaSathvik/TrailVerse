'use strict';
const { tripRefinement } = require('../utils/tripRefinement');

const { randomUUID } = require('crypto');
const { buildCanonicalTrailieResponse } = require('../utils/canonicalResponse');
const { PROPOSE_TOOL, validateSimpleMutation } = require('./trailieSimpleGuard');
const { memoryAdmission } = require('./trailieMemoryAuthority');
const { explainMutationIssues } = require('../utils/mutationIssueMeanings');
const { withTripIdentity } = require('../utils/tripIdentity');
const { tripGuidanceFromRules } = require('../utils/parkWideAccess');
const { transferDates } = require('../utils/transferOperationalAccess');
const { buildPlaceRecovery, requiredPlaceRecoveryIssues } = require('./trailiePlaceRecovery');

const { TRAILIE_TRAVEL_POLICY: INSTRUCTIONS } = require('../prompts/trailieModelFirstPolicy');

function createSimpleRuntime({ model, travelTools, verifyMemory = null, store = null, observe = () => {}, now = () => new Date(), parkCatalog = null,
  maxModelCalls = 3, maxToolCalls = 1, maxCorrections = 1 } = {}) {
  if (typeof model !== 'function' || typeof travelTools?.execute !== 'function') throw new TypeError('Explicit model and travel tools required');
  if (!Number.isInteger(maxModelCalls) || maxModelCalls < 2 || maxModelCalls > 3
    || !Number.isInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls > 1
    || !Number.isInteger(maxCorrections) || maxCorrections < 0 || maxCorrections > 1) throw new TypeError('Invalid resource limits');
  return async function run({ message, history = [], snapshot: supplied = null, userId = null, tripId = null,
    scope = null, signal = null, responseId = randomUUID(), requestContext = null, onProgress = () => false } = {}) {
    if (typeof message !== 'string' || !message.trim() || message.length > 30000) throw new TypeError('Traveler message required');
    const started = Date.now();
    // With persistence enabled, a caller-supplied snapshot is never authoritative.
    const snapshot = structuredClone(store ? await store.load({ userId, tripId }) : supplied || {});
    const telemetry = { runtime: 'model_first', responseId, modelCalls: 0, toolCalls: 0, corrections: 0,
      mutationProposed: false, mutationAccepted: false, mutationIssues: [], mutationRounds: [],
      canonicalBefore: snapshot.plan?.itineraryHash || null, canonicalAfter: snapshot.plan?.itineraryHash || null,
      memoryBefore: snapshot.planningState || null, memoryAfter: snapshot.planningState || null,
      contract: 'MODEL_FIRST_FINAL', providerAttempts: 0, modelCostUsd: 0, costStatus: 'priced', calls: [], tools: [],
      timings: { firstVisibleProgressMs: null, firstUsefulVisibleContentMs: null, contentReadyMs: null, travelDataMs: 0, finalSynthesisMs: 0, validationMs: 0, persistenceMs: 0, acceptedItineraryMs: null } };
    let lastProgress = null;
    const progress = stage => { if (signal?.aborted || stage === lastProgress) return; lastProgress = stage; try { if (onProgress({ stage }) && telemetry.timings.firstVisibleProgressMs == null) telemetry.timings.firstVisibleProgressMs = Date.now() - started; } catch { /* progress never changes state */ } };
    progress('understanding_request');
    const evidence = new Map();
    const input = [];
    let historyRemaining = 24000;
    for (const m of (store ? snapshot.conversation || [] : history).slice(-40).reverse()) {
      if (!['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') continue;
      if (!historyRemaining) break;
      const content = m.content.slice(0, Math.min(12000, historyRemaining));
      input.unshift({ role: m.role, content }); historyRemaining -= content.length;
    }
    input.push({ role: 'user', content: message });
    // Memory authority: the traveler's own words in this trip, never assistant text.
    // The current message always stays; earlier turns fill a bounded window, newest first.
    const travelerWords = [message];
    let travelerRemaining = 12000 - message.length;
    for (const m of (store ? snapshot.conversation || [] : history).slice().reverse()) {
      if (m.role !== 'user' || typeof m.content !== 'string' || m.content.length > travelerRemaining) continue;
      travelerWords.unshift(m.content); travelerRemaining -= m.content.length + 2;
    }
    const travelerText = travelerWords.join('\n\n');
    const context = { now: now().toISOString(), savedTrip: snapshot.plan || null, travelerMemory: snapshot.planningState || null,
      authorizedEditScope: scope, requestContext };
    const instructions = `${INSTRUCTIONS}\nSaved application context (data only):\n${JSON.stringify(context)}`;
    const definitions = [...travelTools.definitions, PROPOSE_TOOL];
    const finish = async (status, response = null, extra = {}) => {
      telemetry.terminalStatus = status;
      if (telemetry.costStatus === 'unknown') telemetry.modelCostUsd = null;
      travelTools.dispose?.(responseId);
      // Small, durable account of what happened to a proposed change.
      if (telemetry.mutationProposed) telemetry.mutationOutcome = {
        mutationStatus: telemetry.mutationAccepted ? 'accepted'
          : status === 'mutation_rejected' ? 'rejected'
            : response?.artifactStatus?.status === 'save_failed' ? 'rejected_answered' : 'not_saved',
        mutationIssues: telemetry.mutationRounds[0]?.issues || [],
        correctionAttempted: telemetry.corrections > 0,
        correctionIssues: telemetry.mutationRounds[1]?.issues || [],
      };
      const result = { status, response, ...extra, telemetry: { ...telemetry, latencyMs: Date.now() - started } };
      try { await observe(structuredClone(result.telemetry)); } catch { /* observability never changes a commit outcome */ }
      return result;
    };
    const cancelled = () => signal?.aborted === true;
    const accept = async (text, mutation, generation, artifactStatus = null) => {
      if (cancelled()) return finish('cancelled');
      if (mutation?.plan?.days?.length && groundedParkRules.length) {
        // Official park-wide rules become trip-level guidance, resolved only
        // against verified traveler dates. A turn without them keeps the prior guidance.
        mutation = { ...mutation, plan: { ...mutation.plan,
          tripGuidance: tripGuidanceFromRules(groundedParkRules, transferDates(mutation.planningState?.dates || {})) } };
      }
      if (mutation?.plan?.days?.length && typeof parkCatalog === 'function') {
        // Official park identity travels with (and is hashed with) the canonical plan.
        let parks = [];
        try { parks = await parkCatalog(); } catch { /* identity is presentation metadata, never a gate */ }
        mutation = { ...mutation, plan: withTripIdentity(mutation.plan, Array.isArray(parks) ? parks : []) };
      }
      const version = Math.max(snapshot.plan?.responseVersion || 0,
        ...(snapshot.conversation || []).map(m => m.responseVersion || 0)) + 1;
      const response = buildCanonicalTrailieResponse({ responseId, responseVersion: version,
        processedContent: text, itineraryData: mutation?.plan || null,
        provider: generation.provider || 'openai', model: generation.model || null });
      if (artifactStatus) response.artifactStatus = artifactStatus;
      if (mutation?.plan?.days?.length) {
        response.presentation = {
          schemaVersion: 1, presentationKind: 'itinerary',
          primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
          refinement: tripRefinement(snapshot.plan, mutation.plan), supportingModules: [],
          prosePolicy: 'full', ending: { caveat: null, beforeYouGo: null, followups: [] },
        };
      }
      const planningState = mutation?.planningState || snapshot.planningState || null;
      const accepted = () => {
        telemetry.mutationAccepted = Boolean(mutation);
        telemetry.canonicalAfter = response.itineraryHash || telemetry.canonicalBefore;
        telemetry.memoryAfter = planningState;
      };
      if (!store) { telemetry.timings.contentReadyMs = Date.now() - started; accepted(); return finish('complete', response, { persisted: false, mutation: mutation || null, planningState }); }
      let saved;
      progress('saving_response');
      const persistenceStarted = Date.now();
      try { saved = await store.commit({ userId, tripId, snapshot, response, message, mutation, signal }); }
      catch { return finish('persistence_failed'); }
      if (!saved?.ok) return finish(saved?.status === 409 ? 'conflict' : 'persistence_failed', null,
        { httpStatus: saved?.status || 500, persisted: false });
      telemetry.timings.persistenceMs += Date.now() - persistenceStarted;
      telemetry.timings.contentReadyMs = Date.now() - started;
      if (mutation?.plan) telemetry.timings.acceptedItineraryMs = Date.now() - started;
      accepted();
      return finish('complete', response, { persisted: true, tripId: saved.tripId || tripId, planningState,
        canonicalPlan: saved.canonicalPlan || response.itineraryData,
        ...(saved.quota ? { quota: saved.quota } : {}) });
    };
    let researched = false, correcting = false, memoryOnlyRejection = false, placeRecovery = null;
    let groundedParkRules = [];
    let memoryAuthority = null, memoryVerificationAttempted = false;
    const mutationFailure = explanation => finish('mutation_rejected', null, { persisted: false,
      failureContent: explanation?.trim() || (snapshot.plan
        ? 'I couldn’t safely apply that change, so your saved trip is unchanged.'
        : 'I couldn’t finish building the trip because I couldn’t reliably verify some of the places yet. I haven’t saved an incomplete itinerary.') });
    while (telemetry.modelCalls < maxModelCalls) {
      if (cancelled()) return finish('cancelled');
      let generation;
      telemetry.modelCalls += 1;
      const attemptStarted = Date.now();
      const roundInstructions = correcting
        ? 'Correct the rejected mutation once using the hard failures below, preserving scope. You may instead explain why it cannot be changed; never claim success. No research.'
        : researched ? 'Answer now with the available facts and useful conditional advice for unknowns. You may propose a memory or canonical trip update. No more research.'
          : 'Answer directly, propose a grounded update, or make one coherent travel-data request.';
      progress(researched || correcting ? 'writing_response' : 'understanding_request');
      try { generation = await model({ input: structuredClone(input), instructions: `${instructions}\n${roundInstructions}`,
        tools: researched || correcting || maxToolCalls === 0 ? [PROPOSE_TOOL] : definitions, toolChoice: 'auto', signal }); }
      catch (error) {
        telemetry.calls.push({ attemptNumber: telemetry.modelCalls,
          requestStartedAt: new Date(attemptStarted).toISOString(), failedAt: new Date().toISOString(),
          latencyMs: Date.now() - attemptStarted, status: 'failure', usage: null, costUsd: null,
          errorCode: error.code || 'model_failed', ...error.modelAttempt });
        telemetry.costStatus = 'unknown';
        telemetry.failure = { stage: 'model', code: error.code || 'model_failed' };
        return finish(cancelled() ? 'cancelled' : 'model_failed');
      }
      if (cancelled()) return finish('cancelled');
      if (!generation) return finish('model_incomplete');
      if (researched || correcting) telemetry.timings.finalSynthesisMs += Date.now() - attemptStarted;
      telemetry.calls.push({ attemptNumber: telemetry.modelCalls, status: 'success',
        ...generation.modelAttempt, model: generation.model || generation.modelAttempt?.model || null, latencyMs: generation.latencyMs ?? null,
        usage: generation.usage || null, costUsd: generation.costUsd ?? null, reasoningEffort: generation.modelAttempt?.reasoningEffort || 'low',
        toolRequests: (generation.toolCalls || []).map(c => ({ name: c.name, id: c.id })), result: generation.completionStatus });
      if (generation.costStatus === 'priced' && Number.isFinite(generation.costUsd)) telemetry.modelCostUsd += generation.costUsd;
      else telemetry.costStatus = 'unknown';
      if (generation.refusal || generation.completionStatus !== 'completed') return finish('model_incomplete');
      const calls = generation.toolCalls || [];
      if (!calls.length) {
        if (!generation.outputText?.trim()) return finish('model_incomplete');
        if (correcting && !memoryOnlyRejection) {
          return accept(generation.outputText, null, generation, {
            status: 'save_failed', code: 'mutation_rejected', phase: 'trip_save', responseId,
            notice: snapshot.plan
              ? 'I answered your request, but couldn’t save the trip update. Your saved trip is unchanged.'
              : 'I answered your request, but couldn’t save the trip. I didn’t save an incomplete trip.',
          });
        }
        return accept(generation.outputText, null, generation);
      }
      // Never execute a mutation alongside another action or accept partial prose
      // accompanying a tool call as the final, saved answer.
      if (calls.some(c => c.name === PROPOSE_TOOL.name) && calls.length !== 1) return finish('invalid_tool_batch');
      if (calls.some(c => !c.id) || new Set(calls.map(c => c.id)).size !== calls.length) return finish('invalid_tool_calls');
      input.push(...(generation.outputItems?.length ? generation.outputItems : calls.map(c => ({
        type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.input),
      }))));
      const mutationCall = calls.find(call => call.name === PROPOSE_TOOL.name);
      if (mutationCall) {
        telemetry.mutationProposed = true;
        if (travelTools.finalizeProposal) {
          const dataStarted = Date.now();
          // Correction may repair specific new/changed place identities only.
          try { const grounded = await travelTools.finalizeProposal(mutationCall.input, { requestId: responseId, signal, userMessage: message, snapshot, requestContext, onProgress: progress, evidence: [...evidence.values()], narrow: correcting });
            for (const row of grounded.evidence || []) if (row.evidenceId) evidence.set(row.evidenceId, row);
            if (Array.isArray(grounded.parkRules)) groundedParkRules = grounded.parkRules;
            telemetry.finalization = { namedPlaceDiagnostics: grounded.namedPlaceDiagnostics || [], providerOutcomes: grounded.providerOutcomes || [], unresolved: grounded.unresolved || [] };
            if (Number.isFinite(grounded.providerAttemptCount)) telemetry.providerAttempts = grounded.providerAttemptCount;
          } catch { /* hard validation must still reject missing identity */ }
          telemetry.timings.travelDataMs += Date.now() - dataStarted;
        }
        progress('validating_trip');
        const validationStarted = Date.now();
        let verdict;
        try { verdict = validateSimpleMutation({ proposal: mutationCall.input, snapshot, message: travelerText,
          evidence: [...evidence.values()], scope, now: now(), memoryAuthority }); }
        catch { verdict = { ok: false, issues: ['mutation_schema_invalid'] }; }
        if (!memoryVerificationAttempted && typeof verifyMemory === 'function'
          && verdict.issues?.includes('memory_authority_unverified')
          && !verdict.issues.some(code => ['mutation_schema_invalid', 'memory_schema_invalid', 'memory_source_missing'].includes(code))) {
          memoryVerificationAttempted = true;
          let verification;
          try { verification = await verifyMemory({ message: travelerText, updates: structuredClone(mutationCall.input.memory_updates), signal }); }
          catch { verification = { status: 'unavailable', receipt: null }; }
          memoryAuthority = verification.receipt || null;
          telemetry.memoryVerification = { status: verification.status, attempts: 1,
            acceptedFacts: verification.acceptedFacts || 0, rejectedFacts: verification.rejectedFacts || 0 };
          const verifiedGeneration = verification.generation;
          if (verifiedGeneration || verification.modelAttempt) {
            const attempt = verifiedGeneration?.modelAttempt || verification.modelAttempt;
            telemetry.calls.push({ ...attempt, purpose: 'memory_verification',
              usage: verifiedGeneration?.usage || null, costUsd: verifiedGeneration?.costUsd ?? null });
            if (verifiedGeneration?.costStatus === 'priced' && Number.isFinite(verifiedGeneration.costUsd)) telemetry.modelCostUsd += verifiedGeneration.costUsd;
            else telemetry.costStatus = 'unknown';
          }
          if (cancelled()) return finish('cancelled');
          try { verdict = validateSimpleMutation({ proposal: mutationCall.input, snapshot, message: travelerText,
            evidence: [...evidence.values()], scope, now: now(), memoryAuthority }); }
          catch { verdict = { ok: false, issues: ['mutation_schema_invalid'] }; }
        }
        if (!verdict.ok && !correcting && (mutationCall.input.plan || mutationCall.input.plan_patch) && verdict.issues?.length
          && verdict.issues.every(code => code.startsWith('memory_authority_'))) {
          // A rejected memory fact is simply not saved. Keep the verified facts, re-validate
          // the trip without the rest (so nothing rejected can shape it), and never spend a
          // correction round on memory alone.
          const updates = mutationCall.input.memory_updates || [];
          const kept = updates.filter(u => memoryAdmission(memoryAuthority, travelerText, u) === 'explicit');
          let retained;
          try { retained = validateSimpleMutation({ proposal: { ...mutationCall.input, memory_updates: kept }, snapshot,
            message: travelerText, evidence: [...evidence.values()], scope, now: now(), memoryAuthority }); }
          catch { retained = { ok: false }; }
          if (retained.ok) {
            telemetry.timings.validationMs += Date.now() - validationStarted;
            telemetry.mutationIssues = verdict.issues;
            telemetry.mutationRounds.push({ issues: [...verdict.issues] });
            telemetry.memoryFactsDropped = updates.length - kept.length;
            return accept(mutationCall.input.response, retained, generation);
          }
        }
        if (correcting && verdict.ok) {
          const recoveryIssues = requiredPlaceRecoveryIssues(placeRecovery, verdict.plan);
          if (recoveryIssues.length) verdict = { ...verdict, ok: false, issues: recoveryIssues };
        }
        telemetry.timings.validationMs += Date.now() - validationStarted;
        telemetry.mutationIssues = verdict.issues || [];
        telemetry.mutationRounds.push({ issues: [...telemetry.mutationIssues] });
        if (verdict.ok) return accept(mutationCall.input.response, verdict, generation);
        memoryOnlyRejection = !mutationCall.input.plan && !mutationCall.input.plan_patch
          && verdict.issues.length > 0 && verdict.issues.every(code => code.startsWith('memory_authority_'));
        if (telemetry.corrections >= maxCorrections || telemetry.modelCalls >= maxModelCalls) {
          if (memoryOnlyRejection) return accept('I’ll keep that detail unconfirmed for now.', null, generation);
          return mutationFailure();
        }
        telemetry.corrections += 1; correcting = true;
        placeRecovery = buildPlaceRecovery({
          unresolved: [...telemetry.tools.flatMap(tool => tool.unresolved || []), ...(telemetry.finalization?.unresolved || [])],
          diagnostics: telemetry.finalization?.namedPlaceDiagnostics || [],
          evidence: [...evidence.values()], travelerText, now: now(),
        });
        telemetry.placeRecovery = placeRecovery;
        input.push({ type: 'function_call_output', call_id: mutationCall.id,
          output: JSON.stringify({ accepted: false, issues: verdict.issues, issueMeanings: explainMutationIssues(verdict.issues),
            placeRecovery,
            originalProposal: mutationCall.input, existingCanonicalPlan: snapshot.plan || null,
            groundedPlaces: [...evidence.values()].filter(e => e.claim?.normalizedValue?.name).map(e => ({ evidenceRef:e.evidenceId, name:e.claim.normalizedValue.name, value:e.claim.normalizedValue })),
            unresolvedPlaces: telemetry.finalization?.unresolved || [],
            correctionPurpose: 'Correct the proposed trip using available grounded information. Rejected memory was NOT saved: omit unsupported facts and never claim they were remembered. No further semantic verification call is available after the first; only already verified identical facts can be reused. For a memory-only rejection you may answer normally without a mutation, asking clarification only if needed. If no valid trip can be produced, explain why without claiming success, using only the issueMeanings above in plain traveler language. Never invent a reason such as locked, protected, frozen or not allowed unless that exact condition appears in issueMeanings. Unchanged existing stops keep their accepted identity; only new or renamed places need grounding. The traveler never saw the rejected proposal: write the response as your first answer, never as a revision, and never mention drafts, corrections or validation. No more research.',
            correctionOpportunitiesRemaining: 1 }) });
        continue;
      }
      // Exactly one backend-managed research phase; synthesis keeps the write tool.
      if (researched || correcting || calls.length !== 1 || calls[0].name !== 'read_travel' || maxToolCalls === 0) {
        return accept('I could not confirm more details for this request. Your saved trip is unchanged; I can still help compare the available options.', null, generation);
      }
      const call = calls[0], dataStarted = Date.now();
      progress('checking_park_information');
      telemetry.toolCalls++;
      let result;
      try { result = await travelTools.execute(call.name, call.input, { requestId: responseId, signal, userMessage: message, onProgress: progress }); }
      catch { result = { status: 'unavailable', evidence: [], unresolved: [{ reason: 'Travel information could not be retrieved.' }] }; }
      if (cancelled()) return finish('cancelled');
      researched = true;
      telemetry.timings.travelDataMs += Date.now() - dataStarted;
      telemetry.providerAttempts += result.providerAttemptCount || 0;
      telemetry.tools.push({ name: call.name, requestedTopics: call.input?.topics || null, constraints: call.input?.constraints || null, requestedGoal: call.input?.question || null, namedEntities: [call.input?.destination, ...(call.input?.places || [])].filter(Boolean),
        dates: call.input?.dates || null, scope: call.input?.context || null, status: result.status,
        providerOutcomes: result.providerOutcomes || [], namedPlaceResolutions: result.namedPlaceResolutions || [], fulfilledFacts: (result.evidence || []).map(e => ({ evidenceId: e.evidenceId, topic: e.topic })),
        namedPlaceDiagnostics: result.namedPlaceDiagnostics || [], unresolved: result.unresolved || [], durationMs: Date.now() - dataStarted });
      for (const row of result.evidence || []) if (row.evidenceId) evidence.set(row.evidenceId, structuredClone(row));
      input.push({ type: 'function_call_output', call_id: call.id, output: JSON.stringify(result.modelContext || result) });
    }
    return finish('model_incomplete', null, { failureContent: 'I could not finish this answer. Your saved trip is unchanged.' });
  };
}

module.exports = { createSimpleRuntime, INSTRUCTIONS };
