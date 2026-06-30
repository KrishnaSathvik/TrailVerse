#!/usr/bin/env node
/**
 * Ad-hoc messy-prompt Trailie QA — authenticated /api/ai/chat
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER_ENV = join(ROOT, 'server/.env');
if (existsSync(SERVER_ENV)) {
  for (const line of readFileSync(SERVER_ENV, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const EMAIL = process.env.PLAN_AI_TEST_EMAIL || 'travelswithkrishna@gmail.com';
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD || 'Travel@2025*';
const TIMEOUT_MS = Number(process.env.TRAILIE_MESSY_TIMEOUT_MS || 240000);
const ONLY = process.env.TRAILIE_MESSY_ONLY?.trim();

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const { ok, body } = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!ok || !body.token) throw new Error(`Login failed: ${body.error || 'no token'}`);
  return body.token;
}

async function chat(token, messages, metadata = {}) {
  const { ok, status, body } = await fetchJson(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, provider: 'auto', metadata }),
  });
  if (!ok) throw new Error(body?.error || `HTTP ${status}`);
  return body.data || {};
}

function snippet(text, n = 400) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function redFlags(text, data) {
  const flags = [];
  if (/\[ITINERARY_JSON\]/i.test(text)) flags.push('raw ITINERARY_JSON visible');
  if ((text || '').length < 120) flags.push('answer very short');
  if (data.model && !/sonnet-5/i.test(data.model)) flags.push(`model=${data.model}`);
  if (/^(before i plan|i need to know|a few questions|which park|how many days)/i.test(text?.slice(0, 200))) {
    flags.push('intake-only opener');
  }
  return flags;
}

const TESTS = [
  {
    id: '1-channel-islands-impossible',
    label: 'Impossible / pushback',
    turns: [
      {
        question:
          "Plan a one-day trip to Channel Islands from Los Angeles, but I don't want to take a boat or plane.",
      },
    ],
    expect: (text) => {
      const ok =
        /\b(boat|ferry|plane|flight|can't|cannot|impossible|no road|not possible|only way)\b/i.test(text) &&
        !/\bday 1\b.*\bday 2\b/i.test(text);
      return { pass: ok, note: ok ? 'pushback on no-boat access' : 'missing pushback or fake full itinerary' };
    },
  },
  {
    id: '2-death-valley-august-kids',
    label: 'Dangerous heat / safety',
    turns: [
      {
        question:
          'Plan a Death Valley weekend in August with kids. We want short hikes, sunset photos, and no extreme heat issues.',
      },
    ],
    expect: (text) => {
      const warns =
        /\b(heat|hot|danger|unsafe|extreme|120|115|avoid midday|early morning|sunrise|evening|not safe)\b/i.test(
          text
        );
      const bad = /\b(midday hike|long hike|full day on trail)\b/i.test(text) && !warns;
      return {
        pass: warns && !bad,
        note: warns ? 'heat warnings present' : 'weak or missing heat safety guidance',
      };
    },
  },
  {
    id: '8-sedona-non-nps',
    label: 'Non-NPS Sedona plan',
    turns: [
      {
        question:
          'Plan a weekend in Sedona from Phoenix with easy hikes, sunset views, and one scenic drive.',
        metadata: { skipUserContext: true },
      },
    ],
    expect: (text) => {
      const ok =
        /sedona/i.test(text) &&
        (/\bat a glance\b|\blogistics\b|day\s*[12]|day one|first day/i.test(text) ||
          /sunset|drive|hike/i.test(text)) &&
        text.length > 400;
      return { pass: ok, note: ok ? 'substantive Sedona plan' : 'intake-only or too thin' };
    },
  },
  {
    id: 'multi-seattle-pnw',
    label: 'Seattle multi-turn (4 turns)',
    multiTurn: true,
    turns: [
      {
        question:
          'I have 3 days from Seattle. I want mountains, lakes, easy hikes, and not too much driving. Should I pick Mount Rainier, Olympic, or North Cascades?',
      },
      { question: 'Okay choose one and make a relaxed itinerary.' },
      { question: 'Make it more photography-focused but keep it easy.' },
      { question: 'What if it rains one day?' },
    ],
    expect: (text, { turns }) => {
      const postCommit = turns.slice(1).map((t) => t.answer).join('\n');
      const parks = ['olympic', 'rainier', 'north cascades'];
      const mentionedCompare = parks.filter((p) => new RegExp(p, 'i').test(turns[0]?.answer || ''));
      const mentionedPostCommit = parks.filter((p) => new RegExp(p, 'i').test(postCommit));
      const drift = mentionedPostCommit.length > 1;
      const locked =
        turns.slice(1).every((t) => /north cascades/i.test(t.meta?.activeDestination || t.answer.slice(0, 120))) &&
        !/\[ITINERARY_JSON\]/i.test(text);
      const lastThree = turns.slice(1).map((t) => t.answer).join('\n');
      const hasRain = /rain|wet|backup|indoor|museum|drive|viewpoint/i.test(lastThree);
      const hasPhoto = /photo|sunrise|sunset|golden|viewpoint|light/i.test(text);
      const turn2Plan = turns[1]?.meta?.hasItinerary === true;
      return {
        pass: !drift && locked && hasRain && hasPhoto && turn2Plan && mentionedCompare.length >= 2,
        note: `post-commit parks: ${mentionedPostCommit.join(', ') || 'none'}; locked=${locked}; rain=${hasRain}; photo=${hasPhoto}; turn2Plan=${turn2Plan}`,
      };
    },
  },
  {
    id: '10-compare-first-timers',
    label: 'Compare Acadia vs Shenandoah vs Smokies',
    turns: [
      {
        question:
          'For a first national park trip with my wife, should we choose Acadia, Shenandoah, or Great Smoky Mountains?',
      },
    ],
    expect: (text) => {
      const pick =
        /\b(i'?d (pick|choose|go with)|go with|choose|pick)\b/i.test(text.slice(0, 500)) ||
        /\b(acadia|shenandoah|smoky)\b.*\b(best|recommend|winner)\b/i.test(text.slice(0, 800));
      const mentions = ['acadia', 'shenandoah', 'smoky'].filter((p) => new RegExp(p, 'i').test(text));
      return {
        pass: pick && mentions.length >= 2,
        note: pick ? 'decisive compare' : 'waffling or no clear pick',
      };
    },
  },
  {
    id: '11-compare-followup-shenandoah',
    label: 'Follow-up: second one = Shenandoah',
    dependsOn: '10-compare-first-timers',
    turns: [{ question: 'Tell me more about the second one and make it a 2-day plan.' }],
    expect: (text, _ctx, turnMeta) => {
      const meta = turnMeta || {};
      const ok =
        /shenandoah/i.test(text) &&
        (meta.resolutionSource === 'ordinal_pick' || /shenandoah/i.test(meta.activeDestination || '')) &&
        !/\b(choose acadia|go with acadia|pick acadia)\b/i.test(text.slice(0, 200)) &&
        (/\bday\s*[12]\b|day one|at a glance|logistics/i.test(text) || text.length > 500);
      const bad = /\b(acadia|smoky mountains)\b/i.test(text.slice(0, 120)) && !/shenandoah/i.test(text.slice(0, 120));
      return { pass: ok && !bad, note: ok ? 'Shenandoah 2-day follow-up' : 'wrong park or no plan' };
    },
  },
  {
    id: '3-acadia-seniors-accessibility',
    label: 'Acadia seniors accessibility',
    turns: [
      {
        question:
          'Plan 2 days in Acadia for my parents. They can walk only 10-15 minutes at a time, no steep trails, but they still want the best views.',
      },
    ],
    expect: (text) => {
      const ok =
        /acadia/i.test(text) &&
        text.length > 400 &&
        (/\bday\s*[12]\b|day one|at a glance|logistics/i.test(text) || /view|overlook|drive|scenic/i.test(text)) &&
        !/^(before i plan|i need to know|how many days|which park)/i.test(text.slice(0, 200));
      const badSteep = /\b(beehive|precipice|iron rung|angels landing|strenuous|exposed)\b/i.test(text) && !/avoid|skip|not|closed/i.test(text);
      return { pass: ok && !badSteep, note: ok ? 'senior-friendly Acadia plan' : 'intake-only or missing easy viewpoints' };
    },
  },
  {
    id: '4-smokies-dog',
    label: 'Smokies with dog',
    turns: [
      {
        question:
          'Plan a weekend in Great Smoky Mountains with my dog. I want waterfalls, scenic drives, and easy trails.',
      },
    ],
    expect: (text) => {
      const warnsPets =
        /\b(dog|pet|leash|not allowed|restricted|trails?\s+(do not|don't) allow|cannot bring)\b/i.test(text);
      const ok =
        /smoky|smokies/i.test(text) &&
        text.length > 400 &&
        (warnsPets || /\broadside|picnic|campground|drive|Cades Cove|Newfound Gap\b/i.test(text));
      return { pass: ok, note: ok ? 'Smokies plan with pet awareness' : 'ignores pet restrictions or too thin' };
    },
  },
  {
    id: '5-yosemite-permits',
    label: 'Yosemite permits pushback',
    turns: [
      {
        question:
          'Plan Yosemite for next weekend. I want Half Dome, Glacier Point, Mariposa Grove, and no reservations or permits.',
      },
    ],
    expect: (text) => {
      const pushback =
        /\b(half dome|permit|reservation|lottery|timed entry|not possible|can't|cannot|need a permit)\b/i.test(text);
      const ok = /yosemite/i.test(text) && pushback && text.length > 250;
      return { pass: ok, note: ok ? 'permits/reservations pushback' : 'missing Half Dome or reservation realism' };
    },
  },
  {
    id: '6-vegas-5-park-driving',
    label: 'Vegas 5-park driving realism',
    turns: [
      {
        question:
          "Plan 3 days from Las Vegas covering Grand Canyon South Rim, Antelope Canyon, Monument Valley, Arches, and Bryce. I don't want long drives.",
      },
    ],
    expect: (text) => {
      const realistic =
        /\b(unrealistic|too much driving|too ambitious|not feasible|pick (one|two)|narrow|reduce|can't fit|won't work|spread out)\b/i.test(text) ||
        (/\b(grand canyon|arches|bryce)\b/i.test(text) && !/\bday\s*1\b.*\b(arches|bryce|monument|antelope).*\bday\s*2\b.*\b(arches|bryce|monument|antelope).*\bday\s*3\b/i.test(text));
      const ok = text.length > 200 && realistic;
      return { pass: ok, note: ok ? 'scope reduced or driving realism' : 'forced impossible 5-park loop' };
    },
  },
  {
    id: '7-rmnp-crowds-no-early',
    label: 'RMNP crowds vs no early mornings',
    turns: [
      {
        question:
          'Plan a peaceful no-crowds weekend in Rocky Mountain National Park in peak summer. I want no early mornings.',
      },
    ],
    expect: (text) => {
      const pushback =
        /\b(crowd|busy|peak summer|timed entry|reservation|early|morning|conflict|realistic|tradeoff|hard to avoid)\b/i.test(text);
      const ok = /rocky mountain|rmnp/i.test(text) && pushback && text.length > 200;
      return { pass: ok, note: ok ? 'crowd vs no-early-mornings tension addressed' : 'ignores contradiction' };
    },
  },
  {
    id: '9-olympic-ambiguous',
    label: 'Olympic ambiguous name',
    turns: [
      {
        question:
          'Plan 2 days in Olympic. I want beaches, rainforest, and easy hikes, but no snow driving.',
      },
    ],
    expect: (text) => {
      const ok =
        /olympic/i.test(text) &&
        (/\bbeach|rainforest|hoh|hurricane|coast|temperate/i.test(text)) &&
        text.length > 400 &&
        (/\bday\s*[12]\b|day one|at a glance|logistics/i.test(text) || /easy|short|boardwalk/i.test(text));
      return { pass: ok, note: ok ? 'Olympic NP inferred with beaches + rainforest' : 'wrong place or intake-only' };
    },
  },
  {
    id: '12-grand-canyon-beginner',
    label: 'Grand Canyon beginner / no below-rim',
    turns: [
      {
        question:
          'Plan 2 days in Grand Canyon for beginners. No hikes below the rim, no exposed trails, no long walks, and no sunrise wakeups.',
      },
    ],
    expect: (text) => {
      const safe =
        !/\b(descend|down to river|bright angel to|south kaibab to|rim to rim|below the rim)\b/i.test(text) ||
        /\b(avoid|skip|don't|do not|stay on rim|rim trail|mather|yavapai|desert view)\b/i.test(text);
      const ok =
        /grand canyon/i.test(text) &&
        text.length > 400 &&
        safe &&
        (/\bday\s*[12]\b|day one|at a glance|logistics/i.test(text) || /rim|viewpoint|easy/i.test(text));
      return { pass: ok, note: ok ? 'rim-safe beginner plan' : 'below-rim or risky recommendations' };
    },
  },
  {
    id: 'brutal-messy-seattle',
    label: 'Brutal messy Seattle prompt',
    turns: [
      {
        question:
          "Bro plan something for me and my wife for 2 days near Seattle maybe national park or scenic place idk, we don't want crazy hikes, want lakes/mountains/views/photos, not too much driving, maybe one good food stop, and if weather is bad give backup also.",
        metadata: { skipUserContext: true },
      },
    ],
    expect: (text) => {
      const ok =
        text.length > 500 &&
        (/\bday\s*[12]\b|day one|at a glance|logistics/i.test(text) ||
          /olympic|rainier|north cascades|mountains|lake/i.test(text)) &&
        (/\bbackup|rain|weather|if .* bad/i.test(text) || /\bfood|restaurant|eat\b/i.test(text));
      return { pass: ok, note: ok ? 'inferred plan with backup/food' : 'too many questions or too thin' };
    },
  },
];

async function runTest(token, test, priorContext = null) {
  const messages = priorContext?.messages ? [...priorContext.messages] : [];
  let sessionMeta = priorContext?.metadata ? { ...priorContext.metadata } : {};
  const capturedTurns = [];

  for (const turn of test.turns) {
    messages.push({ role: 'user', content: turn.question });
    const meta = { ...sessionMeta, ...(turn.metadata || {}) };
    const data = await chat(token, messages, meta);
    const answer = data.content || '';
    messages.push({ role: 'assistant', content: answer });
    if (data.activeTripContext) {
      sessionMeta = { ...sessionMeta, activeTripContext: data.activeTripContext };
    }
    capturedTurns.push({
      question: turn.question,
      answer,
      meta: {
        provider: data.provider,
        model: data.model,
        hasItinerary: data.hasItinerary,
        hasLiveData: data.hasLiveData,
        hasWebSearch: data.hasWebSearch,
        parkName: data.parkName,
        activeDestination: data.activeTripContext?.primaryDestination?.name || null,
        resolutionSource: data.activeTripContext?.resolutionSource || null,
      },
    });
  }

  const allText = capturedTurns.map((t) => t.answer).join('\n');
  const last = capturedTurns.at(-1);
  const flags = redFlags(allText, last?.meta || {});
  for (const turn of capturedTurns) {
    if (turn.meta?.model && !/sonnet-5/i.test(turn.meta.model)) {
      flags.push(`model=${turn.meta.model} on turn: ${snippet(turn.question, 60)}`);
    }
  }
  const evaluation = test.expect(allText, { turns: capturedTurns }, capturedTurns.at(-1)?.meta);

  return {
    id: test.id,
    label: test.label,
    turns: capturedTurns,
    evaluation,
    flags,
    context: { messages, metadata: sessionMeta },
  };
}

async function main() {
  const onlyIds = ONLY ? ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const filter = onlyIds
    ? TESTS.filter((t) => onlyIds.some((id) => t.id.includes(id) || t.id === id))
    : TESTS;
  if (ONLY && filter.length === 0) {
    console.error(`No test matching TRAILIE_MESSY_ONLY=${ONLY}`);
    process.exit(1);
  }

  console.log(`Trailie messy-prompt QA → ${API_BASE}/ai/chat\n`);
  const token = await login();
  const results = [];
  const contextById = new Map();

  for (const test of filter) {
    process.stdout.write(`→ ${test.id}… `);
    try {
      const prior = test.dependsOn ? contextById.get(test.dependsOn) : null;
      const result = await runTest(token, test, prior);
      contextById.set(test.id, result.context);
      results.push(result);
      const icon = result.evaluation.pass ? 'PASS' : 'FAIL';
      const model = result.turns.at(-1)?.meta?.model || '?';
      console.log(`${icon} (${model}) — ${result.evaluation.note}`);
      if (result.flags.length) console.log(`   flags: ${result.flags.join('; ')}`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ id: test.id, error: err.message });
      process.exitCode = 1;
    }
  }

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/trailieMessyPromptResults.json');
  writeFileSync(
    outPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), api: API_BASE, results }, null, 2)}\n`,
    'utf8'
  );

  console.log(`\n--- Summary ---`);
  for (const r of results) {
    if (r.error) {
      console.log(`✗ ${r.id}: ${r.error}`);
      continue;
    }
    console.log(`${r.evaluation.pass ? '✓' : '✗'} ${r.id}: ${r.evaluation.note}`);
    console.log(`   ${snippet(r.turns.at(-1)?.answer, 220)}`);
  }
  console.log(`\nWrote ${outPath}`);

  const fails = results.filter((r) => r.evaluation && !r.evaluation.pass);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
