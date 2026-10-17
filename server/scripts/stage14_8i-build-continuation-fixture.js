'use strict';

/**
 * Stage 14.8I §2 — the canonical H continuation fixture.
 *
 * Authenticated message 2 must NOT continue from the historically defective raw
 * H trip (`General Planning / null` plus a persisted welcome). It continues from
 * the post-fix captured-H replay state, which holds the same paid conversation
 * with the repaired persistence semantics.
 *
 *   captured_live_H → post-fix canonical continuation fixture
 *
 * This is derived state, not untouched historical live state, and it is labelled
 * as such everywhere. The historical H database is opened READ-ONLY, purely to
 * verify that the fixture still carries the paid response's identity, frozen
 * plan and content byte-for-byte.
 */

const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const HISTORICAL_URI = process.env.STAGE14_8I_HISTORICAL_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8_auth';
const SOURCE_URI = process.env.STAGE14_8I_SOURCE_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8h1_post_fix';
const TARGET_URI = process.env.STAGE14_8I_TARGET_URI
  || 'mongodb://127.0.0.1:27019/trailverse_internal_acceptance_stage14_8i';
const OUT_DIR = process.env.STAGE14_8I_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8I-authenticated-message-2');

const fs = require('fs');
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const frozenPlanHash = (plan) => sha(JSON.stringify((plan?.days || []).map((d) => ({
  dayNumber: d.dayNumber,
  stops: (d.stops || []).map((s) => s?.name ?? null),
}))));

const COLLECTIONS = ['users', 'tripplans'];

async function main() {
  const historical = new MongoClient(HISTORICAL_URI);
  const source = new MongoClient(SOURCE_URI);
  const target = new MongoClient(TARGET_URI);
  await Promise.all([historical.connect(), source.connect(), target.connect()]);

  try {
    // ── the paid evidence, read-only ──
    const historicalTrip = await historical.db().collection('tripplans').findOne({});
    const historicalResponse = (historicalTrip?.conversation || [])
      .filter((m) => m.role === 'assistant' && m.responseId).pop();
    const historicalUser = (historicalTrip?.conversation || []).find((m) => m.role === 'user');

    // ── build the fixture from the PAID document, with the proven repairs ──
    //
    // An earlier attempt cloned the post-fix replay database instead. That state
    // is logically correct but not byte-faithful: the replay reconstructed the
    // assistant slot and so omitted fields the real client sends
    // (`hasItinerary`, `model`, `contentHash`), and without `hasItinerary` the
    // restored UI renders no itinerary card. Deriving from the paid document and
    // applying exactly the two repairs the replay PROVED is both faithful and
    // repaired.
    await target.db().dropDatabase();
    const copied = {};

    const historicalUsers = await historical.db().collection('users').find({}).toArray();
    if (historicalUsers.length) await target.db().collection('users').insertMany(historicalUsers);
    copied.users = historicalUsers.length;

    /** Repair 1 — the read-side ownership rule, applied once, structurally. */
    const selectCanonical = (conversation) => {
      const firstUserIndex = conversation.findIndex((m) => m.role === 'user');
      return conversation.filter((message, index) => {
        if (message.role !== 'assistant') return true;
        const hasOwnership = Boolean(
          message.responseId || message.responseVersion != null
          || message.responseRevision != null || message.lifecycleStatus
        );
        if (hasOwnership) return true;
        return !(firstUserIndex === -1 || index < firstUserIndex);
      });
    };

    const repairedTrip = { ...historicalTrip };
    const originalConversation = historicalTrip.conversation || [];
    repairedTrip.conversation = selectCanonical(originalConversation);

    // Repair 2 — trip metadata owned by the validated frozen plan.
    const planParkName = historicalTrip.plan?.parkName || null;
    const planParkCode = historicalTrip.plan?.parkCode
      ? String(historicalTrip.plan.parkCode).toLowerCase() : null;
    repairedTrip.parkName = planParkName || historicalTrip.parkName;
    repairedTrip.parkCode = planParkCode || historicalTrip.parkCode;
    repairedTrip.title = planParkName ? `${planParkName} Trip Plan` : historicalTrip.title;

    await target.db().collection('tripplans').insertOne(repairedTrip);
    copied.tripplans = 1;
    copied.welcomeMessagesRemoved = originalConversation.length - repairedTrip.conversation.length;

    const trip = await target.db().collection('tripplans').findOne({});
    const conversation = trip?.conversation || [];
    const response = conversation.filter((m) => m.role === 'assistant' && m.responseId).pop();
    const userTurn = conversation.find((m) => m.role === 'user');

    const startingState = {
      users: await target.db().collection('users').countDocuments(),
      tripPlanCount: await target.db().collection('tripplans').countDocuments(),
      canonicalUserTurns: conversation.filter((m) => m.role === 'user').length,
      canonicalAssistantTurns: conversation.filter((m) => m.role === 'assistant').length,
      uiWelcomePersisted: conversation.some(
        (m) => m.role === 'assistant' && !m.responseId
      ),
      tripParkName: trip?.parkName ?? null,
      tripParkCode: trip?.parkCode ?? null,
      firstResponseVersion: response?.responseVersion ?? null,
      firstResponseRevisionFinal: response?.responseRevision ?? null,
      firstPlanPresent: Boolean(trip?.plan?.days?.length),
      firstProsePresent: (response?.content || '').length > 0,
    };

    // ── fidelity to the paid response ──
    const fidelity = {
      responseIdMatchesPaidH: response?.responseId === historicalResponse?.responseId,
      responseVersionMatchesPaidH: response?.responseVersion === historicalResponse?.responseVersion,
      assistantMessageIdMatchesPaidH: response?.id === historicalResponse?.id,
      assistantTimestampMatchesPaidH:
        new Date(response?.timestamp).toISOString() === new Date(historicalResponse?.timestamp).toISOString(),
      itineraryHashMatchesPaidH: trip?.plan?.itineraryHash === historicalTrip?.plan?.itineraryHash,
      frozenPlanHashMatchesPaidH: frozenPlanHash(trip?.plan) === frozenPlanHash(historicalTrip?.plan),
      assistantContentHashMatchesPaidH: sha(response?.content || '') === sha(historicalResponse?.content || ''),
      userPromptHashMatchesPaidH: sha(userTurn?.content || '') === sha(historicalUser?.content || ''),
      dayCountMatchesPaidH: (trip?.plan?.days || []).length === (historicalTrip?.plan?.days || []).length,
    };

    const repairedRelativeToHistorical = {
      welcomePersisted: {
        historical: (historicalTrip?.conversation || []).some((m) => m.role === 'assistant' && !m.responseId),
        fixture: startingState.uiWelcomePersisted,
      },
      tripDestination: {
        historical: { parkName: historicalTrip?.parkName ?? null, parkCode: historicalTrip?.parkCode ?? null },
        fixture: { parkName: startingState.tripParkName, parkCode: startingState.tripParkCode },
      },
    };

    const evidence = {
      testId: 'stage14_8I-authenticated-message-2',
      step: 'continuation-fixture',
      generatedAt: new Date().toISOString(),
      derivation: 'captured_live_H → post-fix canonical continuation fixture',
      presentedAsUntouchedHistoricalLiveState: false,
      historicalDatabaseOpenedReadOnly: HISTORICAL_URI,
      historicalDatabaseMutated: false,
      derivedFrom: 'historical paid H document (read-only) with the two repairs proven by the post-fix replay',
      postFixReplayThatProvedTheRepairs: SOURCE_URI,
      targetDatabase: TARGET_URI,
      documentsCopied: copied,
      tripId: String(trip?._id),
      turn1Identity: {
        responseId: response?.responseId ?? null,
        responseVersion: response?.responseVersion ?? null,
        assistantMessageId: response?.id ?? null,
        assistantMessageIdType: typeof response?.id,
        assistantTimestamp: response?.timestamp ?? null,
        responseFinalRevision: response?.responseRevision ?? null,
        itineraryHash: trip?.plan?.itineraryHash ?? null,
        frozenPlanHash: frozenPlanHash(trip?.plan),
        contentHash: sha(response?.content || ''),
      },
      startingState,
      fidelityToPaidH: fidelity,
      fidelityHolds: Object.values(fidelity).every(Boolean),
      repairedRelativeToHistorical,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, 'continuation-fixture.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
    console.log(JSON.stringify({
      tripId: evidence.tripId,
      startingState,
      fidelityHolds: evidence.fidelityHolds,
      fidelity,
    }, null, 2));

    if (!evidence.fidelityHolds) process.exitCode = 2;
  } finally {
    await Promise.all([historical.close(), source.close(), target.close()]);
  }
}

main().catch((error) => {
  console.error('[stage14_8I] fixture build failed:', error.message);
  process.exitCode = 1;
});
