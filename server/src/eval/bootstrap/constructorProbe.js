'use strict';

/**
 * Stage 14.7D2 §7 — live SDK constructor instrumentation.
 *
 * Wraps provider SDK constructors at the module-export level BEFORE application
 * modules are imported, so `new Anthropic(...)` / `new OpenAI(...)` /
 * `new Resend(...)` anywhere in the import graph is counted regardless of which
 * module performs it.
 *
 * This exists because "no network attempt" is not the same claim as "no live
 * client was built": an SDK can be constructed at import and simply not dial
 * out yet. Both are reported separately.
 *
 * Records counts and the module class that triggered them — never the options
 * object, which carries the API key.
 */

const SDKS = [
  { name: 'anthropic', moduleId: '@anthropic-ai/sdk' },
  { name: 'openai', moduleId: 'openai' },
  { name: 'resend', moduleId: 'resend', exportKey: 'Resend' }
];

function installConstructorProbe() {
  const counts = {};
  const events = [];
  const restorers = [];
  let currentPhase = 'import';
  let currentModuleClass = null;

  /** Builds a counting stand-in that constructs the real class. */
  const makeWrapper = (name, original) => {
    const wrapped = function ProbedSdkConstructor(...args) {
      counts[name].invocations += 1;
      events.push({ sdk: name, phase: currentPhase, moduleClass: currentModuleClass });
      return Reflect.construct(original, args, new.target || wrapped);
    };
    wrapped.prototype = original.prototype;
    Object.setPrototypeOf(wrapped, original);
    return wrapped;
  };

  /**
   * These SDKs are transpiled ESM: their named exports are getter-only
   * accessors, so plain assignment throws. defineProperty is the only way to
   * substitute them, and it must be attempted per-export so one unwrappable
   * SDK cannot abort instrumentation for the others.
   */
  const replaceExport = (mod, key, value) => {
    Object.defineProperty(mod, key, { value, writable: true, configurable: true, enumerable: true });
  };

  for (const sdk of SDKS) {
    let mod;
    try {
      mod = require(sdk.moduleId);
    } catch {
      counts[sdk.name] = { available: false, wrapped: false, invocations: 0 };
      continue;
    }
    counts[sdk.name] = { available: true, wrapped: false, invocations: 0 };

    try {
      // 1. Module itself is the constructor (anthropic, openai): swap the
      //    require-cache entry so every requiring module sees the wrapper.
      if (typeof mod === 'function') {
        const wrapped = makeWrapper(sdk.name, mod);
        const resolved = require.resolve(sdk.moduleId);
        const entry = require.cache[resolved];
        const original = entry.exports;
        entry.exports = wrapped;
        restorers.push(() => { entry.exports = original; });
        counts[sdk.name].wrapped = true;
      }

      // 2. Otherwise wrap the named export, which is what destructuring call
      //    sites (`const { Resend } = require('resend')`) resolve. Skipped when
      //    step 1 already wrapped this class, since wrapping both seams would
      //    count a single construction twice.
      for (const key of counts[sdk.name].wrapped ? [] : [sdk.exportKey, 'default'].filter(Boolean)) {
        const original = mod[key];
        if (typeof original !== 'function') continue;
        const wrapped = makeWrapper(sdk.name, original);
        replaceExport(mod, key, wrapped);
        restorers.push(() => replaceExport(mod, key, original));
        counts[sdk.name].wrapped = true;
      }
    } catch (error) {
      // Recorded, never swallowed: an unwrappable SDK means its count is not
      // trustworthy and the report must say so.
      counts[sdk.name].wrapError = error.constructor.name;
    }
  }

  return {
    setPhase(phase) { currentPhase = phase; },
    setModuleClass(moduleClass) { currentModuleClass = moduleClass; },
    countFor(name) { return counts[name] ? counts[name].invocations : 0; },
    totalInvocations() {
      return Object.values(counts).reduce((sum, c) => sum + c.invocations, 0);
    },
    snapshot() {
      return {
        counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.invocations])),
        available: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.available])),
        // Instrumentation coverage: a false here means that SDK's count proves
        // nothing and must not be read as evidence.
        wrapped: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.wrapped])),
        wrapErrors: Object.fromEntries(Object.entries(counts).filter(([, v]) => v.wrapError).map(([k, v]) => [k, v.wrapError])),
        events: events.slice()
      };
    },
    uninstall() { for (const restore of restorers) restore(); }
  };
}

module.exports = { installConstructorProbe, SDKS };
