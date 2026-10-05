/**
 * Stage 14.8H.1 §2/§10/§11 — captured-transcript replay, zero provider.
 *
 * The Stage 14.8H generation was paid for and is valid; only the persistence
 * semantics around it were wrong. This replays that ALREADY-CAPTURED response
 * through the real client pipeline so the repair can be proven without spending
 * another cent:
 *
 *   captured artifact → real early-revision coordinator → real revision-1
 *   payload builder → real HTTP persistence → real revision-2 payload builder →
 *   real HTTP persistence → real restore read path
 *
 * It runs TWICE against separate isolated databases:
 *
 *   pre_fix  — welcome message unmarked and destination taken from component
 *              state, i.e. exactly what Stage 14.8H did. This must REPRODUCE
 *              the defect; a repair proven only against the fixed path proves
 *              nothing about what was broken.
 *   post_fix — declared ownership plus frozen-plan destination resolution.
 *
 * Replay timestamps are replay timestamps. Nothing here is presented as
 * historical live evidence.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { createEarlyRevisionCoordinator } from '../src/utils/earlyRevisionCoordinator.js';
import { buildResponseSavePayload } from '../src/utils/responseSavePayload.js';
import {
  createUiWelcomeMessage,
  selectCanonicalConversation,
  describeConversationOwnership,
} from '../src/lib/messageOwnership.js';
import { resolveTripDestination, assertTripDestinationCoherence } from '../src/lib/tripDestination.js';

const serverRequire = createRequire(path.resolve(process.cwd(), '..', 'server', 'package.json'));
const { MongoClient } = serverRequire('mongodb');

const BACKEND = process.env.STAGE14_8H1_BACKEND || 'http://127.0.0.1:5101';
const SOURCE_URI = process.env.STAGE14_8H1_SOURCE_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8_auth';
const REPLAY_BASE = process.env.STAGE14_8H1_REPLAY_BASE
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8h1';
const OUT_DIR = process.env.STAGE14_8H1_OUT_DIR
  || path.resolve(process.cwd(), '..', 'artifacts', 'stage14_8H1-auth-persistence-repair');
const EMAIL = process.env.STAGE14_8H1_EMAIL || 'replayfixture@trailverselocal.dev';
const PASSWORD_FILE = process.env.STAGE14_8H1_SECRET_FILE;

fs.mkdirSync(OUT_DIR, { recursive: true });

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

/**
 * The captured transcript. Reconstructed from the stored Stage 14.8H trip, which
 * is the durable record of what the provider actually produced: the full frozen
 * plan, the full prose, and the canonical identity.
 */
async function loadCapturedTranscript() {
  const client = new MongoClient(SOURCE_URI);
  await client.connect();
  try {
    const trip = await client.db().collection('tripplans').findOne({});
    if (!trip) throw new Error('captured Stage 14.8H trip not found');

    const conversation = trip.conversation || [];
    const userTurn = conversation.find((m) => m.role === 'user');
    const response = conversation
      .filter((m) => m.role === 'assistant' && m.responseId)
      .pop();
    if (!response) throw new Error('captured assistant response not found');

    return {
      source: 'stage14_8H stored trip',
      tripIdOfOriginal: String(trip._id),
      userPrompt: userTurn?.content ?? null,
      identity: {
        responseId: response.responseId,
        responseVersion: response.responseVersion,
        assistantMessageId: response.id,
        assistantMessageTimestamp: response.timestamp,
        itineraryHash: response.itineraryHash,
      },
      canonicalPlan: trip.plan,
      proseContent: response.content,
    };
  } finally {
    await client.close();
  }
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BACKEND}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

/** A fresh authenticated fixture in the replay database. */
async function ensureReplayUser(password) {
  await api('/api/auth/signup', {
    method: 'POST',
    body: { firstName: 'Replay', lastName: 'Fixture', email: EMAIL, password },
  });
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password } });
  if (!login.ok || !login.json?.token) throw new Error(`replay login failed: ${login.status}`);
  return { token: login.json.token, userId: login.json.data?._id || login.json.data?.id };
}

/**
 * The two message-state shapes under test. `pre_fix` is the Stage 14.8H shape:
 * the welcome seeded as an ordinary assistant message with no ownership marker.
 */
function buildInitialMessages(mode, welcomeContent) {
  if (mode === 'pre_fix') {
    return [{
      id: 1786226886570,
      role: 'assistant',
      content: welcomeContent,
      timestamp: new Date('2026-08-08T22:08:06.570Z'),
    }];
  }
  return [createUiWelcomeMessage({
    id: 1786226886570,
    content: welcomeContent,
    timestamp: new Date('2026-08-08T22:08:06.570Z'),
  })];
}

/**
 * Mirrors the component's own sanitizer. `pre_fix` keeps the Stage 14.8H
 * behaviour (stream flags only); `post_fix` also drops declared UI chrome.
 */
function sanitize(mode, messages) {
  const withoutStreamFlags = messages
    .filter((m) => !m.isStreaming && !m.isFinalizing)
    .map(({ isStreaming, isFinalizing, ...m }) => m);

  if (mode === 'pre_fix') return withoutStreamFlags;

  return selectCanonicalConversation(withoutStreamFlags)
    .map(({ persistenceScope, includedInCanonicalConversation, ...m }) => m);
}

/** Mirrors the component's create-branch destination choice. */
function destinationFor(mode, plan) {
  if (mode === 'pre_fix') {
    // Component state: a free-text chat resolved no park.
    return { parkName: 'General Planning', parkCode: null, title: 'General Planning Session' };
  }
  return resolveTripDestination({ plan, contextParkName: null, contextParkCode: null });
}

async function runReplay({ mode, transcript, password }) {
  const dbName = `${REPLAY_BASE}_${mode}`;
  const mongo = new MongoClient(dbName);
  await mongo.connect();
  await mongo.db().dropDatabase();
  await mongo.close();

  // The backend is pointed at the replay database by the caller; the user is
  // created through the real signup route.
  const { token } = await ensureReplayUser(password);

  const welcomeContent = "Hey Replay, I'm **Trailie**. I help you choose where to go outdoors — national parks, state parks, or anywhere you're thinking — and plan a trip that fits your time, season, group, and travel style.\n\nTell me a destination or describe the kind of trip you want.";

  const messages = buildInitialMessages(mode, welcomeContent);
  const userMessage = {
    id: 1786226900000,
    role: 'user',
    content: transcript.userPrompt,
    timestamp: new Date('2026-08-08T22:08:20.000Z'),
  };

  const baseConversation = [...messages, userMessage];
  let persistedConversation = baseConversation;
  let tripId = null;
  const writes = [];
  const persistErrors = [];
  let rev1Snapshot = null;

  const assistantTurn = (revision, lifecycleStatus, content) => ({
    id: transcript.identity.assistantMessageId,
    role: 'assistant',
    content,
    timestamp: transcript.identity.assistantMessageTimestamp,
    responseId: transcript.identity.responseId,
    responseVersion: transcript.identity.responseVersion,
    responseRevision: revision,
    lifecycleStatus,
    itineraryHash: transcript.identity.itineraryHash,
    itineraryPlan: transcript.canonicalPlan,
  });

  const writeCanonicalRevision = async ({ conversation, plan, expectedPreviousRevision, revision }) => {
    const persisted = sanitize(mode, conversation);
    const startedAt = Date.now();

    if (tripId) {
      const res = await api(`/api/trips/${tripId}`, {
        method: 'PUT',
        token,
        body: buildResponseSavePayload({
          conversation: persisted,
          summary: { totalMessages: persisted.length },
          plan,
          expectedPreviousRevision,
        }),
      });
      writes.push({
        revision, method: 'PUT', status: res.status, acceptedAtMs: Date.now() - startedAt,
        outcome: res.json?.planPersistence?.outcome ?? null,
        persistedRoleSequence: persisted.map((m) => m.role),
        persistedAssistantTurns: persisted.filter((m) => m.role === 'assistant').length,
      });
      return { ok: res.ok, tripId };
    }

    const destination = destinationFor(mode, plan);
    const res = await api('/api/trips', {
      method: 'POST',
      token,
      body: {
        parkName: destination.parkName,
        parkCode: destination.parkCode,
        title: destination.title,
        formData: {},
        conversation: persisted,
        summary: { totalMessages: persisted.length },
        plan,
        provider: 'auto',
        status: 'active',
      },
    });
    tripId = res.json?.data?._id || res.json?.data?.id || null;
    writes.push({
      revision, method: 'POST', status: res.status, acceptedAtMs: Date.now() - startedAt,
      requestedParkName: destination.parkName,
      requestedParkCode: destination.parkCode,
      persistedRoleSequence: persisted.map((m) => m.role),
      persistedAssistantTurns: persisted.filter((m) => m.role === 'assistant').length,
    });
    return { ok: res.ok, tripId };
  };

  // ── the real coordinator ──
  const coordinator = createEarlyRevisionCoordinator({
    initialTripId: null,
    persistRevision1: async (effect) => {
      try {
      persistedConversation = [...baseConversation, assistantTurn(1, 'itinerary_ready', '')];
      const result = await writeCanonicalRevision({
        conversation: persistedConversation, plan: effect.canonicalPlan, revision: 1,
      });

      // §11 — direct DB read AFTER revision 1 and BEFORE revision 2.
      const client = new MongoClient(dbName);
      await client.connect();
      const trip = await client.db().collection('tripplans').findOne({});
      const conv = trip?.conversation || [];
      const stored = conv.filter((m) => m.role === 'assistant').pop();
      rev1Snapshot = {
        label: 'mechanism_replay_evidence',
        notHistoricalLiveState: true,
        responseRevision: stored?.responseRevision ?? null,
        lifecycleState: stored?.lifecycleStatus ?? null,
        userTurns: conv.filter((m) => m.role === 'user').length,
        assistantTurns: conv.filter((m) => m.role === 'assistant').length,
        welcomePersisted: conv.some(
          (m) => m.role === 'assistant' && !m.responseId && String(m.content || '').includes("I'm **Trailie**")
        ),
        itineraryPresent: Boolean(trip?.plan?.days?.length),
        proseComplete: (stored?.content || '').length > 0,
        tripDestinationName: trip?.parkName ?? null,
        tripDestinationParkCode: trip?.parkCode ?? null,
      };
      await client.close();

      return result;
      } catch (error) {
        persistErrors.push({ revision: 1, message: String(error.message) });
        throw error;
      }
    },
    persistRevision2: async (effect) => {
      try {
      persistedConversation = [
        ...baseConversation,
        assistantTurn(2, 'prose_ready', transcript.proseContent),
      ];
      return await writeCanonicalRevision({
        conversation: persistedConversation,
        plan: effect.canonicalPlan,
        expectedPreviousRevision: effect.expectedPreviousRevision,
        revision: 2,
      });
      } catch (error) {
        persistErrors.push({ revision: 2, message: String(error.message) });
        throw error;
      }
    },
    persistTerminal: async () => ({ ok: true, tripId }),
  });

  // Shapes taken from the real validators (validateItineraryReadyEvent /
  // validateProseReadyEvent) rather than guessed, so the replay passes the same
  // contract checks the live turn did.
  const planWithIdentity = (revision, lifecycleStatus) => ({
    ...transcript.canonicalPlan,
    responseId: transcript.identity.responseId,
    itineraryHash: transcript.identity.itineraryHash,
    responseRevision: revision,
    lifecycleStatus,
  });

  const response = {
    responseId: transcript.identity.responseId,
    responseVersion: transcript.identity.responseVersion,
    responseRevision: 1,
    lifecycleStatus: 'itinerary_ready',
    itineraryHash: transcript.identity.itineraryHash,
    content: '',
  };

  // The real coordinator API: one event in, then drain in-flight persistence.
  coordinator.handleEvent({ type: 'response_started', responseId: response.responseId });
  coordinator.handleEvent({
    type: 'itinerary_ready',
    response,
    canonicalPlan: planWithIdentity(1, 'itinerary_ready'),
  });
  await coordinator.drain();

  coordinator.handleEvent({ type: 'prose_generation_started', responseId: response.responseId });
  coordinator.handleEvent({
    type: 'prose_ready',
    response: {
      ...response,
      responseRevision: 2,
      previousRevision: 1,
      lifecycleStatus: 'prose_ready',
      content: transcript.proseContent,
    },
    canonicalPlan: planWithIdentity(2, 'prose_ready'),
    expectedPreviousRevision: 1,
    content: transcript.proseContent,
  });
  await coordinator.drain();

  coordinator.handleEvent({ type: 'done', responseId: response.responseId });
  await coordinator.drain();

  const coordinatorState = coordinator.getState();
  const coordinatorMetrics = coordinator.getMetrics();

  // ── restore through the real read path ──
  const restored = await api(`/api/trips/${tripId}`, { token });
  const storedTrip = restored.json?.data || restored.json;
  const storedConversation = storedTrip?.conversation || [];
  const restoredCanonical = selectCanonicalConversation(storedConversation, {
    includeLegacyRecognition: mode !== 'pre_fix',
  });

  const client = new MongoClient(dbName);
  await client.connect();
  const finalTrips = await client.db().collection('tripplans').find({}).toArray();
  await client.close();

  const coherence = assertTripDestinationCoherence({ trip: storedTrip || {}, plan: storedTrip?.plan });

  return {
    mode,
    database: dbName,
    tripPlanCount: finalTrips.length,
    writes,
    acceptedRevisionWrites: writes.filter((w) => w.status >= 200 && w.status < 300).length,
    revision1Writes: writes.filter((w) => w.revision === 1).length,
    revision2Writes: writes.filter((w) => w.revision === 2).length,
    doneWrites: 0,

    storedRoleSequence: storedConversation.map((m) => m.role),
    storedUserTurns: storedConversation.filter((m) => m.role === 'user').length,
    storedAssistantTurns: storedConversation.filter((m) => m.role === 'assistant').length,
    welcomePersisted: storedConversation.some(
      (m) => m.role === 'assistant' && !m.responseId && String(m.content || '').includes("I'm **Trailie**")
    ),

    restoreUserTurns: restoredCanonical.filter((m) => m.role === 'user').length,
    restoreAssistantTurns: restoredCanonical.filter((m) => m.role === 'assistant').length,
    restoreOwnership: describeConversationOwnership(storedConversation),

    duplicateAssistantSlots:
      storedConversation.filter((m) => m.role === 'assistant' && m.responseId).length > 1
        ? storedConversation.filter((m) => m.role === 'assistant' && m.responseId).length - 1
        : 0,
    duplicatePlans: finalTrips.length - 1,

    tripParkName: storedTrip?.parkName ?? null,
    tripParkCode: storedTrip?.parkCode ?? null,
    destinationCoherence: coherence,

    identity: {
      tripIdStable: finalTrips.length === 1 && String(finalTrips[0]._id) === tripId,
      responseIdStable: storedConversation
        .filter((m) => m.responseId)
        .every((m) => m.responseId === transcript.identity.responseId),
      responseVersionStable: storedConversation
        .filter((m) => m.responseVersion != null)
        .every((m) => m.responseVersion === transcript.identity.responseVersion),
      assistantMessageIdStable: storedConversation
        .filter((m) => m.responseId)
        .every((m) => m.id === transcript.identity.assistantMessageId),
      assistantMessageTimestampStable: storedConversation
        .filter((m) => m.responseId)
        .every((m) => new Date(m.timestamp).toISOString()
          === new Date(transcript.identity.assistantMessageTimestamp).toISOString()),
      assistantSlotStable:
        storedConversation.filter((m) => m.role === 'assistant' && m.responseId).length === 1,
      itineraryHashStable: storedTrip?.plan?.itineraryHash === transcript.identity.itineraryHash,
      frozenPlanHashStable:
        crypto.createHash('sha256')
          .update(JSON.stringify((storedTrip?.plan?.days || []).map((d) => ({
            dayNumber: d.dayNumber, stops: (d.stops || []).map((s) => s.name),
          }))))
          .digest('hex')
        === crypto.createHash('sha256')
          .update(JSON.stringify((transcript.canonicalPlan?.days || []).map((d) => ({
            dayNumber: d.dayNumber, stops: (d.stops || []).map((s) => s.name),
          }))))
          .digest('hex'),
      destinationStable: storedTrip?.plan?.parkCode === transcript.canonicalPlan?.parkCode,
      dayCountStable: (storedTrip?.plan?.days || []).length === (transcript.canonicalPlan?.days || []).length,
      stopOrderStable:
        JSON.stringify((storedTrip?.plan?.days || []).map((d) => (d.stops || []).map((s) => s.name)))
        === JSON.stringify((transcript.canonicalPlan?.days || []).map((d) => (d.stops || []).map((s) => s.name))),
    },

    rev1Snapshot,
    persistErrors,
    coordinatorStatus: coordinatorState?.status ?? null,
    coordinatorPersistenceWrites: coordinatorMetrics?.persistenceWrites ?? null,
  };
}

async function main() {
  if (!PASSWORD_FILE) throw new Error('STAGE14_8H1_SECRET_FILE is required');
  const password = fs.readFileSync(PASSWORD_FILE, 'utf8');
  const mode = process.argv.includes('--pre-fix') ? 'pre_fix' : 'post_fix';

  const transcript = await loadCapturedTranscript();
  const result = await runReplay({ mode, transcript, password });

  write(`replay-${mode}.json`, {
    testId: 'stage14_8H1-auth-persistence-repair',
    step: `captured-transcript-replay-${mode}`,
    generatedAt: new Date().toISOString(),
    providerCalls: 0,
    evidenceClass: 'mechanism_replay_evidence',
    notHistoricalLiveEvidence: true,
    transcriptSource: transcript.source,
    capturedIdentity: transcript.identity,
    result,
  });

  console.log(JSON.stringify({
    mode,
    storedUserTurns: result.storedUserTurns,
    storedAssistantTurns: result.storedAssistantTurns,
    welcomePersisted: result.welcomePersisted,
    restoreAssistantTurns: result.restoreAssistantTurns,
    tripParkName: result.tripParkName,
    tripParkCode: result.tripParkCode,
    destinationMatches: result.destinationCoherence.tripDestinationMatchesFrozenPlan,
    acceptedWrites: result.acceptedRevisionWrites,
    tripPlanCount: result.tripPlanCount,
    rev1Snapshot: result.rev1Snapshot,
  }, null, 2));
}

main().catch((error) => {
  console.error('[stage14_8H1] replay failed:', error.message);
  write('replay-error.json', { message: String(error.message), stack: String(error.stack).slice(0, 800) });
  process.exitCode = 1;
});
