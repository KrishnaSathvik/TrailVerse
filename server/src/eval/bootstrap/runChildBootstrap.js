'use strict';

/**
 * Stage 14.7D2 §3/§10 — parent driver for the fresh-child bootstrap.
 *
 * Uses execFile-style spawning with an explicit argument array (never a shell
 * string), so no fixture or environment value can be interpreted as a command.
 *
 * The parent captures the child PID up front; a stuck child is terminated by
 * that PID and only that PID. Nothing here signals a process group, so a local
 * `mongod` started outside the run can never be caught by cleanup.
 */

const { spawn } = require('child_process');
const path = require('path');

const CHILD_ENTRY = path.join(__dirname, 'childBootstrap.js');
const MARKER = '__EVAL_JSON__';
const DEFAULT_TIMEOUT_MS = 60000;

/** Extracts the single bounded JSON document without trusting surrounding noise. */
function parseBoundedPayload(stdout) {
  const first = stdout.indexOf(MARKER);
  if (first === -1) return null;
  const second = stdout.indexOf(MARKER, first + MARKER.length);
  if (second === -1) return null;
  try {
    return JSON.parse(stdout.slice(first + MARKER.length, second));
  } catch {
    return null;
  }
}

/**
 * Runs one fresh child.
 *
 * @returns {Promise<{outcome, payload, pid, timedOut, exitCode, stderrClean, elapsedMs}>}
 */
function runChildBootstrap({ task = 'sweep', fixtures = null, timeoutMs = DEFAULT_TIMEOUT_MS, env = {} } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const childEnv = { ...process.env, ...env };
    if (fixtures) childEnv.EVAL_FIXTURES_JSON = JSON.stringify(fixtures);

    const child = spawn(process.execPath, [CHILD_ENTRY, task], {
      env: childEnv,
      cwd: path.join(__dirname, '../../..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const pid = child.pid;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      // Terminate by captured PID only. SIGKILL after SIGTERM grace.
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
      setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }, 2000);
    }, timeoutMs);

    const settle = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        outcome: timedOut ? 'timeout' : (exitCode === 0 ? 'ok' : 'failed'),
        boundedCode: timedOut ? 'child_bootstrap_timeout' : undefined,
        payload: parseBoundedPayload(stdout),
        pid,
        timedOut,
        exitCode,
        signal,
        elapsedMs: Date.now() - startedAt,
        stderrLength: stderr.length,
        stderrClean: assessStderr(stderr)
      });
    };

    child.on('error', () => settle(-1, null));
    child.on('close', (code, signal) => settle(code, signal));
  });
}

/**
 * §3 — stderr must not contain credentials, complete URIs, prompts, user input
 * or provider messages. Reports booleans, never the offending text.
 */
function assessStderr(stderr) {
  const patterns = {
    looksLikeCredential: /\b(sk-[A-Za-z0-9_-]{8,}|re_[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/,
    looksLikeMongoUri: /mongodb(\+srv)?:\/\/[^\s]+/,
    looksLikeHttpUrl: /https?:\/\/[^\s]+/
  };
  const findings = {};
  for (const [name, re] of Object.entries(patterns)) findings[name] = re.test(stderr);
  return { clean: Object.values(findings).every((v) => v === false), ...findings };
}

module.exports = { runChildBootstrap, parseBoundedPayload, assessStderr, CHILD_ENTRY };
