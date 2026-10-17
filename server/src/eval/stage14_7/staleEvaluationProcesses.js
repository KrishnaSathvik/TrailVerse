'use strict';

/**
 * Stage 14.7H §10 — stale evaluation-child inventory, diagnosis and cleanup.
 *
 * Orphaned `scenarioChild.js` processes hold loopback listeners and Mongo
 * connections. Left alone they make a later run's port and connection state
 * ambiguous; killed carelessly they take down a live run in progress.
 *
 * So termination is deliberately narrow. A process is a candidate ONLY when all
 * of these hold, and every one is checked from the OS rather than assumed:
 *
 *   - its command is EXACTLY the Stage 14.7 scenario child
 *   - its parent no longer exists (it is genuinely orphaned)
 *   - it started before this run began
 *   - it is not this process or one of its ancestors
 *
 * PROCESS SPAWNING: every child below uses `spawnSync(command, argvArray)` with
 * no `shell` option, matching `compositePreflight.js`. There is no shell for
 * anything to be injected into, and the only interpolated value is a PID that
 * this module obtained from the OS and re-validated as a positive integer.
 *
 * Termination is per-PID and positive-only: `process.kill(pid, ...)` with a
 * positive integer. There is no `pkill`, no process-group kill and no negative
 * PID anywhere in this file — a negative PID signals an entire process group,
 * which is how a cleanup helper takes down a terminal session.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '../../..');

/** The one command that identifies a Stage 14.7 evaluation child. */
const CHILD_PATH = path.join(SERVER_ROOT, 'src/eval/stage14_7e/scenarioChild.js');

const TERM_WAIT_MS = 2000;
const POLL_MS = 100;

/** A PID is only ever used after this check. */
function validPid(pid) {
  return Number.isInteger(pid) && pid > 0;
}

function alive(pid) {
  if (!validPid(pid)) return false;
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** `ps` output for one pid, or null. No shell. */
function inspect(pid) {
  if (!validPid(pid)) return null;
  const res = spawnSync('ps', ['-o', 'pid=,ppid=,lstart=,command=', '-p', String(pid)], {
    encoding: 'utf8',
  });
  if (res.status !== 0 || !res.stdout) return null;
  const m = /^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/.exec(res.stdout.trim());
  if (!m) return null;
  const startedAt = new Date(m[3]);
  const valid = !Number.isNaN(startedAt.getTime());
  return {
    pid: Number(m[1]),
    ppid: Number(m[2]),
    startedAt: valid ? startedAt.toISOString() : null,
    startedAtMs: valid ? startedAt.getTime() : null,
    command: m[4],
  };
}

/** Bounded port list; a failure to read is reported, never guessed. */
function listeningPorts(pid) {
  if (!validPid(pid)) return [];
  const res = spawnSync('lsof', ['-nP', '-p', String(pid), '-a', '-iTCP', '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (!res.stdout) return [];
  return res.stdout.split('\n').slice(1)
    .map((l) => (l.trim().split(/\s+/)[8] || '').trim())
    .filter(Boolean);
}

/** Every running Stage 14.7 scenario child, with the facts a decision needs. */
function inventory() {
  // pgrep's pattern is a DISCOVERY aid only; the exact filter below is the
  // authority for what may ever be killed.
  const res = spawnSync('pgrep', ['-f', 'scenarioChild.js'], { encoding: 'utf8' });
  const pids = (res.stdout || '').trim().split(/\s+/).filter(Boolean).map(Number).filter(validPid);

  const rows = [];
  for (const pid of pids) {
    const info = inspect(pid);
    if (!info) continue;

    // EXACT match on the resolved child path. A process merely mentioning
    // "scenarioChild.js" in some other argument is not a candidate.
    const argv = info.command.trim().split(/\s+/);
    const isStage14EvaluationChild = argv.some((a) => {
      try { return path.resolve(a) === CHILD_PATH; } catch { return false; }
    });

    rows.push({
      ...info,
      parentAlive: alive(info.ppid),
      isStage14EvaluationChild,
      listeningPorts: listeningPorts(pid),
    });
  }
  return rows;
}

/** Walks up the ppid chain so cleanup can never target its own lineage. */
function ancestryOf(pid) {
  const out = [];
  let current = pid;
  for (let i = 0; i < 32; i += 1) {
    const info = inspect(current);
    if (!info || !info.ppid || info.ppid <= 1) break;
    out.push(info.ppid);
    current = info.ppid;
  }
  return out;
}

/**
 * Which rows may be terminated, and why each other row may not.
 *
 * @param {Array} rows from inventory()
 * @param {number} runStartedAtMs this run's start; nothing newer is touched
 */
function classify(rows, { runStartedAtMs = Date.now(), selfPid = process.pid } = {}) {
  const ancestors = ancestryOf(selfPid);

  return rows.map((r) => {
    const reasons = [];
    if (!r.isStage14EvaluationChild) reasons.push('not_stage14_evaluation_child');
    if (r.parentAlive) reasons.push('parent_still_alive');
    if (r.startedAtMs == null) reasons.push('start_time_unknown');
    else if (r.startedAtMs >= runStartedAtMs) reasons.push('started_during_this_run');
    if (r.pid === selfPid || ancestors.includes(r.pid)) reasons.push('self_or_ancestor');
    if (!validPid(r.pid)) reasons.push('non_positive_pid');

    return { ...r, terminable: reasons.length === 0, withheldBecause: reasons };
  });
}

/** SIGTERM → bounded wait → SIGKILL only if still alive. One PID at a time. */
function terminate(pid, { waitMs = TERM_WAIT_MS } = {}) {
  if (!validPid(pid)) return { pid, ok: false, boundedCode: 'refused_non_positive_pid' };
  const result = { pid, sigterm: false, sigkill: false, ok: false };

  try {
    process.kill(pid, 'SIGTERM');
    result.sigterm = true;
  } catch (error) {
    if (error.code === 'ESRCH') return { ...result, ok: true, boundedCode: 'already_gone' };
    return { ...result, boundedCode: 'sigterm_failed' };
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return { ...result, ok: true };
    // Synchronous bounded sleep without a shell or a busy spin.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
  }
  if (!alive(pid)) return { ...result, ok: true };

  try {
    process.kill(pid, 'SIGKILL');
    result.sigkill = true;
  } catch (error) {
    if (error.code !== 'ESRCH') return { ...result, boundedCode: 'sigkill_failed' };
  }
  return { ...result, ok: !alive(pid) };
}

/** Inventory + classify + terminate only the terminable rows. */
function cleanStaleEvaluationChildren({ runStartedAtMs = Date.now(), dryRun = false } = {}) {
  const classified = classify(inventory(), { runStartedAtMs });
  const terminable = classified.filter((r) => r.terminable);

  const terminated = dryRun ? [] : terminable.map((r) => terminate(r.pid));
  const remaining = classify(inventory(), { runStartedAtMs });

  return {
    inspected: classified.length,
    terminableCount: terminable.length,
    terminated,
    withheld: classified.filter((r) => !r.terminable)
      .map((r) => ({ pid: r.pid, withheldBecause: r.withheldBecause })),
    staleRemaining: remaining.filter((r) => r.terminable).length,
    dryRun,
  };
}

/**
 * §10 — the PREFLIGHT diagnostic. Fails closed when stale children exist and
 * deliberately does NOT kill anything: terminating processes during a paid run
 * is how a live scenario loses its own application child.
 */
function assertNoStaleEvaluationChildren({ runStartedAtMs = Date.now() } = {}) {
  const stale = classify(inventory(), { runStartedAtMs }).filter((r) => r.terminable);
  return {
    ok: stale.length === 0,
    staleEvaluationChildrenDetected: stale.length > 0,
    staleCount: stale.length,
    // PIDs only — no command lines, no ports, nothing that discloses layout.
    stalePids: stale.map((r) => r.pid),
    boundedCode: stale.length > 0 ? 'stale_evaluation_children_present' : null,
  };
}

module.exports = {
  CHILD_PATH,
  validPid,
  inventory,
  classify,
  terminate,
  cleanStaleEvaluationChildren,
  assertNoStaleEvaluationChildren,
};
