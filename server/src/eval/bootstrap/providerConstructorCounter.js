'use strict';

/**
 * Provider constructor counting for acceptance bootstraps.
 *
 * Counting construction separately from dispatch is what lets a stage say
 * "the rejection happened before a provider client was built" (14.8F) or
 * "this many constructions are attributable to the request" (14.8H).
 *
 * THE DEFECT THIS MODULE EXISTS TO PREVENT
 *
 * Both bootstraps previously inlined the same counter, and its construct trap
 * forwarded the Proxy as `newTarget`:
 *
 *     new Proxy(mod, { construct: (t, args, newTarget) =>
 *       Reflect.construct(Original, args, newTarget) })
 *
 * `@anthropic-ai/sdk`'s CJS entry is itself a callable wrapper, so the module
 * Proxy has its own `.prototype`. `Reflect.construct` takes the new object's
 * prototype from `newTarget.prototype`, so the client was built against the
 * wrapper's empty prototype and silently lost EVERY prototype method — `post`,
 * `calculateNonstreamingTimeout`. The first non-streaming `messages.create`
 * then died with "this._client.calculateNonstreamingTimeout is not a function"
 * before any HTTP request, which is what aborted Stage 14.8H's first attempt.
 *
 * The fix is to construct against the real class and not propagate `newTarget`.
 * Nothing in these harnesses subclasses an SDK, so newTarget fidelity buys
 * nothing and costs correctness.
 */

/**
 * Builds the counting wrapper for an already-loaded module object.
 *
 * Separated from the require.cache installation on purpose: this is the part
 * with the correctness property worth testing, and it can be exercised directly
 * with a fixture. Testing only through `require.cache` proved worthless — Jest
 * keeps its own module registry, so a suite written that way passed against the
 * defective implementation.
 *
 * @param {Function|object} mod   the module's exports
 * @param {string} key            counter key, e.g. 'claude'
 * @param {object} counts         mutable counter object, mutated in place
 * @returns {Proxy|null}          the wrapper, or null if nothing is constructable
 */
function wrapCountingModule(mod, key, counts) {
  const Original = mod && (mod.default || mod);
  if (typeof Original !== 'function') return null;

  /** Counts `new Sdk.default()` while preserving the real prototype. */
  const countingConstruct = (target) => new Proxy(target, {
    construct(t, args) {
      counts[key] += 1;
      return Reflect.construct(t, args, t);
    },
  });

  // The SDK export is a callable whose `.default` is getter-only, so the whole
  // module is proxied rather than mutated: `new Sdk()` and `new Sdk.default()`
  // both route through the counter, and every other export passes through.
  return new Proxy(mod, {
    construct(target, args) {
      counts[key] += 1;
      return Reflect.construct(Original, args, Original);
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return (prop === 'default' && typeof value === 'function')
        ? countingConstruct(value)
        : value;
    },
  });
}

/**
 * Wraps a module's exports so every `new` through it is counted, while the
 * constructed instance keeps its real prototype.
 *
 * @param {string} moduleId    module to instrument, e.g. '@anthropic-ai/sdk'
 * @param {string} key         counter key, e.g. 'claude'
 * @param {object} counts      mutable counter object, mutated in place
 * @returns {boolean}          whether instrumentation was installed
 */
function installProviderConstructorCounting(moduleId, key, counts) {
  let mod;
  try { mod = require(moduleId); } catch { return false; }

  const wrapped = wrapCountingModule(mod, key, counts);
  if (!wrapped) return false;

  const resolved = require.resolve(moduleId);
  if (!require.cache[resolved]) return false;

  require.cache[resolved].exports = wrapped;
  return true;
}

module.exports = { installProviderConstructorCounting, wrapCountingModule };
