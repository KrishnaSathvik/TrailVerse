'use strict';

/**
 * Stage 14.7D2 §1/§8 — deterministic dependency adapters for the evaluation child.
 *
 * Every adapter returns recorded fixture data and performs no I/O. Installation
 * happens after the outbound-network guard is active, so a mistake surfaces as a
 * blocked attempt rather than a live call.
 *
 * Provider policy for a deterministic run:
 *   OpenAI  → constructor prohibited (a call fails the run)
 *   NPS     → live service replaced by a recorded adapter
 *   Others  → recorded fixture or explicitly disabled
 */

const NPS_FIXTURE = {
  park: {
    parkCode: 'shen',
    fullName: 'Shenandoah National Park',
    states: 'VA',
    entranceFees: [{ title: 'Standard Entrance - Private Vehicle', cost: '30.00' }]
  },
  alerts: [
    { id: 'eval-alert-1', title: 'Skyline Drive closed north of Thornton Gap', category: 'Road Closure' }
  ],
  campgrounds: [{ id: 'eval-cg-1', name: 'Big Meadows Campground' }],
  visitorCenters: [{ id: 'eval-vc-1', name: 'Byrd Visitor Center' }],
  events: []
};

/** Records every adapter invocation so a sweep can prove which seams were touched. */
function createRecorder() {
  const calls = [];
  return {
    calls,
    wrap(namespace, name, fn) {
      return (...args) => {
        calls.push({ namespace, method: name, argCount: args.length });
        return fn(...args);
      };
    }
  };
}

function buildNpsAdapter(recorder) {
  const w = (name, fn) => recorder.wrap('nps', name, fn);
  return {
    getParkByCode: w('getParkByCode', async () => ({ ...NPS_FIXTURE.park })),
    getParkAlerts: w('getParkAlerts', async () => NPS_FIXTURE.alerts.map((a) => ({ ...a }))),
    getParkCampgrounds: w('getParkCampgrounds', async () => NPS_FIXTURE.campgrounds.map((c) => ({ ...c }))),
    getParkVisitorCenters: w('getParkVisitorCenters', async () => NPS_FIXTURE.visitorCenters.map((v) => ({ ...v }))),
    getEventsByPark: w('getEventsByPark', async () => []),
    getAllParks: w('getAllParks', async () => [{ ...NPS_FIXTURE.park }]),
    getParkGalleryPhotos: w('getParkGalleryPhotos', async () => []),
    getParkImages: w('getParkImages', async () => [])
    // Deliberately partial: any other method must fail loudly rather than
    // reach the live service.
  };
}

/**
 * Installs all deterministic seams.
 * @returns {{recorder, installed: string[], disposition: object, uninstall: function}}
 */
function installDeterministicAdapters({ requireModule = require } = {}) {
  const recorder = createRecorder();
  const installed = [];
  const disposition = {};
  const uninstallers = [];

  // ── NPS: explicit adapter seam approved in Stage 14.7D1 ──
  const npsService = requireModule('../../services/npsService');
  const npsAdapter = buildNpsAdapter(recorder);
  npsService.setNpsAdapterForTests(npsAdapter);
  uninstallers.push(() => npsService.resetNpsServiceForTests());
  installed.push('nps');
  disposition.nps = 'recorded_adapter';

  // ── OpenAI: constructor prohibited. Any construction fails the run loudly. ──
  const openaiService = requireModule('../../services/openaiService');
  openaiService.__setOpenAIClientConstructorForTests(() => {
    const error = new Error('openai_constructor_prohibited_in_evaluation');
    error.code = 'openai_constructor_prohibited_in_evaluation';
    throw error;
  });
  uninstallers.push(() => openaiService.__setOpenAIClientConstructorForTests(null));
  installed.push('openai');
  disposition.openai = 'absent_and_prohibited';

  // ── Anthropic: a deterministic provider replaces the live SDK. Construction
  //    of a real client is prohibited; the stand-in returns recorded content. ──
  const claudeService = requireModule('../../services/claudeService');
  claudeService.__setAnthropicConstructorForTests(function DeterministicAnthropic() {
    return {
      messages: {
        create: recorder.wrap('anthropic', 'messages.create', async () => ({
          id: 'eval-msg-1',
          model: 'deterministic-eval',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Deterministic evaluation response.' }],
          usage: { input_tokens: 0, output_tokens: 0 }
        }))
      }
    };
  });
  uninstallers.push(() => claudeService.__setAnthropicConstructorForTests(null));
  installed.push('anthropic');
  disposition.anthropic = 'deterministic_provider';

  // ── RIDB / Recreation.gov permits ──
  // This one cannot be disabled by removing a key: _searchRecGovReservations
  // calls the PUBLIC https://www.recreation.gov/api/search endpoint, which needs
  // no credential. Stage 14.7E's outbound guard caught 6 live attempts per turn.
  // The single public entry point is replaced with a recorded fixture and
  // restored on uninstall.
  const ridbService = requireModule('../../services/ridbService');
  const originalGetPermits = ridbService.getPermitsForPark;
  ridbService.getPermitsForPark = recorder.wrap('ridb', 'getPermitsForPark', async () => []);
  uninstallers.push(() => { ridbService.getPermitsForPark = originalGetPermits; });
  installed.push('ridb');
  disposition.ridb = 'recorded_adapter';

  // ── Resend: email must never be sent from an evaluation run. ──
  const resendService = requireModule('../../services/resendEmailService');
  resendService.__setResendConstructorForTests(() => {
    const error = new Error('resend_constructor_prohibited_in_evaluation');
    error.code = 'resend_constructor_prohibited_in_evaluation';
    throw error;
  });
  uninstallers.push(() => resendService.__setResendConstructorForTests(null));
  installed.push('resend');
  disposition.resend = 'absent_and_prohibited';

  return {
    recorder,
    installed,
    disposition,
    adapters: { nps: npsAdapter },
    uninstall() {
      // Reverse order so each seam is restored by its own owner.
      for (const fn of uninstallers.reverse()) {
        try { fn(); } catch { /* restoration is best-effort and must not mask results */ }
      }
    }
  };
}

module.exports = {
  installDeterministicAdapters,
  buildNpsAdapter,
  createRecorder,
  NPS_FIXTURE
};
