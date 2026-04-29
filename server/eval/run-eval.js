#!/usr/bin/env node
/**
 * AI Eval Runner — runs test cases against the live AI endpoint.
 *
 * Usage:
 *   node eval/run-eval.js                    # Run all cases
 *   node eval/run-eval.js --tag g1           # Run only cases tagged "g1"
 *   node eval/run-eval.js --case fee-free*   # Run specific case(s) by name glob
 *   node eval/run-eval.js --dry-run          # Show what would run, no API calls
 *
 * Requires:
 *   - Server running on localhost:5001
 *   - EVAL_AUTH_TOKEN env var (or file at eval/.auth-token)
 */

const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────

const CASES_DIR = path.join(__dirname, 'cases');
const RESULTS_DIR = path.join(__dirname, 'results');
const AUTH_TOKEN_FILE = path.join(__dirname, '.auth-token');
const API_BASE = 'http://localhost:5001/api/ai';
const DELAY_MS = 2000; // pause between requests to avoid hammering the API

// ── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tag' && args[i + 1]) flags.tag = args[++i];
  else if (args[i] === '--case' && args[i + 1]) flags.caseGlob = args[++i];
  else if (args[i] === '--dry-run') flags.dryRun = true;
  else if (args[i] === '--verbose') flags.verbose = true;
}

// ── Auth token ──────────────────────────────────────────────────────────────

function getAuthToken() {
  if (process.env.EVAL_AUTH_TOKEN) return process.env.EVAL_AUTH_TOKEN;
  try {
    return fs.readFileSync(AUTH_TOKEN_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

// ── Load test cases ─────────────────────────────────────────────────────────

function loadCases() {
  const files = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json'));
  const cases = files.map(f => {
    const raw = fs.readFileSync(path.join(CASES_DIR, f), 'utf-8');
    return JSON.parse(raw);
  });

  // Filter by --tag
  if (flags.tag) {
    return cases.filter(c => c.tags && c.tags.includes(flags.tag));
  }

  // Filter by --case (simple glob: supports trailing *)
  if (flags.caseGlob) {
    const glob = flags.caseGlob;
    if (glob.endsWith('*')) {
      const prefix = glob.slice(0, -1);
      return cases.filter(c => c.name.startsWith(prefix));
    }
    return cases.filter(c => c.name === glob);
  }

  return cases;
}

// ── Run a single test case ──────────────────────────────────────────────────

async function runCase(testCase, authToken) {
  const endpoint = authToken ? `${API_BASE}/chat` : `${API_BASE}/chat-anonymous`;

  const body = {
    messages: testCase.messages,
    provider: testCase.provider || 'claude',
    metadata: testCase.metadata || {},
  };

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Cookie'] = `trailverse_auth_token=${authToken}`;
  }

  const start = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - start;

  if (!res.ok) {
    return {
      name: testCase.name,
      status: 'ERROR',
      durationMs,
      error: `HTTP ${res.status}: ${await res.text().catch(() => 'unknown')}`,
      assertions: [],
    };
  }

  const json = await res.json();
  const content = json.data?.content || '';

  // Run assertions
  const results = [];

  if (testCase.assertions?.mustInclude) {
    for (const assertion of testCase.assertions.mustInclude) {
      const regex = new RegExp(assertion.pattern, assertion.flags || 'i');
      const passed = regex.test(content);
      results.push({
        type: 'mustInclude',
        pattern: assertion.pattern,
        description: assertion.description,
        passed,
      });
    }
  }

  if (testCase.assertions?.mustNotInclude) {
    for (const assertion of testCase.assertions.mustNotInclude) {
      const regex = new RegExp(assertion.pattern, assertion.flags || 'i');
      const passed = !regex.test(content);
      results.push({
        type: 'mustNotInclude',
        pattern: assertion.pattern,
        description: assertion.description,
        passed,
      });
    }
  }

  const allPassed = results.every(r => r.passed);

  return {
    name: testCase.name,
    status: allPassed ? 'PASS' : 'FAIL',
    durationMs,
    responseLength: content.length,
    assertions: results,
    response: flags.verbose ? content : undefined,
  };
}

// ── Sleep helper ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const cases = loadCases();

  if (cases.length === 0) {
    console.log('No test cases found matching the filter.');
    process.exit(0);
  }

  const authToken = getAuthToken();

  console.log(`\nAI Eval Runner`);
  console.log(`═══════════════════════════════════════════════════`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Auth: ${authToken ? 'authenticated' : 'anonymous (no token found)'}`);
  console.log(`Endpoint: ${authToken ? `${API_BASE}/chat` : `${API_BASE}/chat-anonymous`}`);
  if (flags.tag) console.log(`Filter: tag=${flags.tag}`);
  if (flags.caseGlob) console.log(`Filter: case=${flags.caseGlob}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  if (flags.dryRun) {
    console.log('DRY RUN — no API calls will be made.\n');
    for (const c of cases) {
      const mustInc = c.assertions?.mustInclude?.length || 0;
      const mustNotInc = c.assertions?.mustNotInclude?.length || 0;
      console.log(`  ${c.name}`);
      console.log(`    ${c.description}`);
      console.log(`    messages: ${c.messages.length}, assertions: ${mustInc} include + ${mustNotInc} exclude`);
      console.log(`    tags: ${(c.tags || []).join(', ')}\n`);
    }
    console.log(`Total: ${cases.length} cases`);
    process.exit(0);
  }

  const allResults = [];
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    process.stdout.write(`  [${i + 1}/${cases.length}] ${testCase.name}...`);

    const result = await runCase(testCase, authToken);
    allResults.push(result);

    if (result.status === 'PASS') {
      passCount++;
      console.log(` PASS (${result.assertions.length}/${result.assertions.length} assertions, ${result.durationMs}ms)`);
    } else if (result.status === 'FAIL') {
      failCount++;
      const failed = result.assertions.filter(a => !a.passed);
      console.log(` FAIL`);
      for (const f of failed) {
        console.log(`       ✗ ${f.type}: "${f.description}" — pattern: ${f.pattern}`);
      }
    } else {
      errorCount++;
      console.log(` ERROR: ${result.error}`);
    }

    // Rate limiting delay (skip after last case)
    if (i < cases.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Summary
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`Results: ${passCount} passed, ${failCount} failed, ${errorCount} errors out of ${cases.length} total`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // Write results to file
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultFile = path.join(RESULTS_DIR, `eval-${timestamp}.json`);
  const resultData = {
    timestamp: new Date().toISOString(),
    auth: !!authToken,
    filters: { tag: flags.tag || null, caseGlob: flags.caseGlob || null },
    summary: { total: cases.length, passed: passCount, failed: failCount, errors: errorCount },
    results: allResults,
  };

  fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2));
  console.log(`Results written to: ${resultFile}`);

  // Exit with failure code if any tests failed
  process.exit(failCount + errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Eval runner failed:', err);
  process.exit(2);
});
