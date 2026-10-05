/**
 * Stage 14.7C §1 — OpenAI must not be constructed at import time.
 *
 * The defect this locks down: `openaiService.js` built its client at module
 * scope, so importing the AI router without OPENAI_API_KEY threw — even for
 * Claude-only requests that never touch OpenAI.
 */
const PATH = '../openaiService';

const withoutKey = (fn) => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
};

beforeEach(() => jest.resetModules());

describe('Stage 14.7C §1 — import safety', () => {
  test('1. the service imports without an OpenAI key', () => {
    withoutKey(() => {
      expect(() => require(PATH)).not.toThrow();
    });
  });

  // Stage 14.7D1 removed the workaround that used to live here: npsService
  // constructed its client at module scope and threw without NPS_API_KEY, so
  // these two tests had to feed a fake NPS key just to reach the OpenAI
  // dimension. That was the same import-time-side-effect defect in a different
  // module, and it is now fixed — the router imports with neither key set.

  test('2. the AI router imports without an OpenAI key', () => {
    withoutKey(() => {
      expect(() => require('../../routes/ai')).not.toThrow();
    });
  });

  test('3. a Claude-only path constructs no OpenAI client', () => {
    withoutKey(() => {
      const svc = require(PATH);
      const ctor = jest.fn();
      svc.__setOpenAIClientConstructorForTests(ctor);
      // Importing and using unrelated (Claude) surfaces must not build a client.
      require('../../routes/ai');
      expect(ctor).not.toHaveBeenCalled();
    });
  });

  test('4. an OpenAI invocation without a key fails with a bounded code', () => {
    withoutKey(() => {
      const svc = require(PATH);
      expect(() => svc.getOpenAIClient()).toThrow(svc.OPENAI_NOT_CONFIGURED);
      try { svc.getOpenAIClient(); } catch (e) {
        expect(e.code).toBe('openai_not_configured');
      }
    });
  });

  test('5. the client is constructed lazily when a key is present', () => {
    process.env.OPENAI_API_KEY = 'test-key-not-real';
    const svc = require(PATH);
    const ctor = jest.fn(() => ({ chat: { completions: {} } }));
    svc.__setOpenAIClientConstructorForTests(ctor);

    expect(ctor).not.toHaveBeenCalled(); // nothing built until asked
    svc.getOpenAIClient();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith({ apiKey: 'test-key-not-real' });
  });

  test('6. the constructor runs at most once for the same configuration', () => {
    process.env.OPENAI_API_KEY = 'stable-key';
    const svc = require(PATH);
    const ctor = jest.fn(() => ({ chat: { completions: {} } }));
    svc.__setOpenAIClientConstructorForTests(ctor);

    const a = svc.getOpenAIClient();
    const b = svc.getOpenAIClient();
    const c = svc.getOpenAIClient();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('6b. a changed key rebuilds the client', () => {
    process.env.OPENAI_API_KEY = 'key-one';
    const svc = require(PATH);
    const ctor = jest.fn(() => ({ chat: { completions: {} } }));
    svc.__setOpenAIClientConstructorForTests(ctor);
    svc.getOpenAIClient();
    process.env.OPENAI_API_KEY = 'key-two';
    svc.getOpenAIClient();
    expect(ctor).toHaveBeenCalledTimes(2);
  });

  test('7. no secret, env value, or SDK text leaks in the error', () => {
    process.env.OPENAI_API_KEY = 'super-secret-value';
    const svc = require(PATH);
    delete process.env.OPENAI_API_KEY;
    try {
      svc.getOpenAIClient();
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toBe('openai_not_configured');
      expect(e.message).not.toContain('super-secret-value');
      expect(e.message).not.toMatch(/environment variable|OPENAI_API_KEY/);
      expect(JSON.stringify({ m: e.message, c: e.code })).not.toContain('super-secret-value');
    }
  });

  test('the module no longer constructs a client at module scope', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../openaiService.js'), 'utf8');
    // A module-scope construction would appear outside any function body.
    expect(src).not.toMatch(/^const openai = new OpenAI\(/m);
    expect(src).toMatch(/function getOpenAIClient\(\)/);
  });
});

describe('Stage 14.7D §1 — lazy-client cache edge cases', () => {
  const PATH2 = '../openaiService';

  test('removing the key after construction does NOT reuse the cached client', () => {
    process.env.OPENAI_API_KEY = 'key-A';
    const svc = require(PATH2);
    const ctor = jest.fn(() => ({ id: 'client-A', chat: { completions: {} } }));
    svc.__setOpenAIClientConstructorForTests(ctor);

    const clientA = svc.getOpenAIClient();
    expect(clientA.id).toBe('client-A');

    delete process.env.OPENAI_API_KEY;
    expect(() => svc.getOpenAIClient()).toThrow('openai_not_configured');
    // The cached client must not leak through once configuration is gone.
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  test('a constructor failure does not poison the cache', () => {
    process.env.OPENAI_API_KEY = 'key-B';
    const svc = require(PATH2);
    let attempt = 0;
    const ctor = jest.fn(() => {
      attempt += 1;
      if (attempt === 1) throw new Error('sdk exploded with key-B in the message');
      return { id: 'recovered', chat: { completions: {} } };
    });
    svc.__setOpenAIClientConstructorForTests(ctor);

    expect(() => svc.getOpenAIClient()).toThrow();
    // A later valid invocation must be able to retry construction.
    const recovered = svc.getOpenAIClient();
    expect(recovered.id).toBe('recovered');
    expect(ctor).toHaveBeenCalledTimes(2);
  });

  test('concurrent first access for one key does not duplicate clients', async () => {
    process.env.OPENAI_API_KEY = 'key-C';
    const svc = require(PATH2);
    const ctor = jest.fn(() => ({ id: 'client-C', chat: { completions: {} } }));
    svc.__setOpenAIClientConstructorForTests(ctor);

    // Construction is synchronous, so concurrent callers share the memoized value.
    const [a, b, c] = await Promise.all([
      Promise.resolve().then(() => svc.getOpenAIClient()),
      Promise.resolve().then(() => svc.getOpenAIClient()),
      Promise.resolve().then(() => svc.getOpenAIClient()),
    ]);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('no key or SDK wording enters the bounded failure', () => {
    process.env.OPENAI_API_KEY = 'super-secret-key-D';
    const svc = require(PATH2);
    svc.__setOpenAIClientConstructorForTests(jest.fn(() => ({ chat: { completions: {} } })));
    svc.getOpenAIClient();
    delete process.env.OPENAI_API_KEY;
    try {
      svc.getOpenAIClient();
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toBe('openai_not_configured');
      expect(e.message).not.toContain('super-secret-key-D');
    }
  });
});
