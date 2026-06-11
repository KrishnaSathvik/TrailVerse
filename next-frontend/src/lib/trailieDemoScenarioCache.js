/** Persist completed Trailie demo transcripts across page refreshes. */

export const TRAILIE_DEMO_CACHE_KEY = 'trailie_demo_scenario_cache';

function emptyCache() {
  return { scenarios: new Map(), lastActiveIndex: 0 };
}

export function readTrailieDemoCache(demoVersion) {
  if (typeof window === 'undefined') return emptyCache();

  try {
    const raw = localStorage.getItem(TRAILIE_DEMO_CACHE_KEY);
    if (!raw) return emptyCache();

    const parsed = JSON.parse(raw);
    if (parsed.v !== demoVersion) return emptyCache();

    const scenarios = new Map();
    const entries = parsed.scenarios && typeof parsed.scenarios === 'object' ? parsed.scenarios : {};
    for (const [id, turns] of Object.entries(entries)) {
      if (Array.isArray(turns) && turns.length > 0) {
        scenarios.set(id, turns);
      }
    }

    const lastActiveIndex =
      typeof parsed.lastActiveIndex === 'number' && Number.isFinite(parsed.lastActiveIndex)
        ? parsed.lastActiveIndex
        : 0;

    return { scenarios, lastActiveIndex };
  } catch {
    return emptyCache();
  }
}

function writeTrailieDemoCache(demoVersion, scenarios, lastActiveIndex) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      TRAILIE_DEMO_CACHE_KEY,
      JSON.stringify({
        v: demoVersion,
        scenarios: Object.fromEntries(scenarios),
        lastActiveIndex,
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function persistTrailieDemoScenario(demoVersion, scenarioId, turns, lastActiveIndex) {
  const { scenarios } = readTrailieDemoCache(demoVersion);
  scenarios.set(scenarioId, turns);
  writeTrailieDemoCache(demoVersion, scenarios, lastActiveIndex);
}

export function persistTrailieDemoActiveIndex(demoVersion, lastActiveIndex) {
  const { scenarios } = readTrailieDemoCache(demoVersion);
  writeTrailieDemoCache(demoVersion, scenarios, lastActiveIndex);
}

export function loadTrailieDemoScenarioMap(demoVersion) {
  return readTrailieDemoCache(demoVersion).scenarios;
}

export function readTrailieDemoLastActiveIndex(demoVersion, scenarioCount) {
  const { lastActiveIndex } = readTrailieDemoCache(demoVersion);
  if (!scenarioCount || scenarioCount < 1) return 0;
  return Math.min(Math.max(0, lastActiveIndex), scenarioCount - 1);
}
