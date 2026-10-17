/**
 * Stage 14.7D1 — NPS must not be constructed at import time.
 *
 * The defect this locks down: `npsService.js` ended in
 * `module.exports = new NPSService()`, and the constructor threw when
 * NPS_API_KEY was absent. Importing the AI router — or the Express app, or any
 * module that merely mentioned NPS — therefore required a live NPS key, even
 * for Claude-only requests that never touch NPS. That is why the OpenAI
 * import-safety suite had to hand-feed a fake NPS key to isolate its own axis.
 *
 * No test here supplies a fake NPS key to satisfy an import.
 */

// Jest owns transforms. Do not let an app import install a process-global
// Babel loader referencing a test environment after that environment is gone.
jest.mock('@babel/register', () => jest.fn());

const fs = require('fs');
const path = require('path');

// NOTE: axios must be resolved *inside* each test, after jest.resetModules().
// A module-scope `require('axios')` would hand back an instance from the old
// registry, so spies on it would never see the service's calls.
const axiosNow = () => require('axios');

const PATH = '../npsService';
const NPS_API_BASE = 'https://developer.nps.gov/api/v1';
const SERVER_ROOT = path.join(__dirname, '../../..');
const REPO_ROOT = path.join(SERVER_ROOT, '..');

const withoutKey = (fn) => {
  const saved = process.env.NPS_API_KEY;
  delete process.env.NPS_API_KEY;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.NPS_API_KEY;
    else process.env.NPS_API_KEY = saved;
  }
};

/**
 * Counts NPS client constructions precisely: the constructor is the only place
 * that calls axios.create with the NPS base URL.
 */
const watchNpsConstruction = () => {
  const spy = jest.spyOn(axiosNow(), 'create');
  return {
    get count() {
      return spy.mock.calls.filter((args) => args[0]?.baseURL === NPS_API_BASE).length;
    },
    restore: () => spy.mockRestore(),
  };
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build', '.next', 'uploads']);

/** Recursively collects JS/JSX files under `dir`, returning repo-relative paths. */
const collectSourceFiles = (dir, root, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, root, acc);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      acc.push(path.relative(root, full));
    }
  }
  return acc;
};

const isTestFile = (file) => file.includes('__tests__') || file.includes(`${path.sep}tests${path.sep}`);

beforeEach(() => jest.resetModules());

describe('Stage 14.7D1 §7 — import safety without NPS_API_KEY', () => {
  test('1. the service imports without an NPS key', () => {
    withoutKey(() => {
      expect(() => require(PATH)).not.toThrow();
    });
  });

  test('2. the AI router imports without an NPS key', () => {
    withoutKey(() => {
      expect(() => require('../../routes/ai')).not.toThrow();
    });
  });

  // §7.3 — "where available". The Express factory is NOT importable under jest
  // for a reason that predates and is independent of this refactor:
  // src/app.js → routes/auth → authController → resendEmailService →
  // reactEmailRenderer → emails/*.jsx, and jest.config.js has no transform for
  // email JSX, so it throws a syntax/transform error. None of those files
  // reference NPS, so the NPS dimension is pinned
  // directly: app.js must carry no eager NPS import, and whatever it does throw
  // must not be nps_not_configured.
  test('3. the Express application factory is not blocked by NPS configuration', () => {
    const appSrc = fs.readFileSync(path.join(SERVER_ROOT, 'src/app.js'), 'utf8');
    expect(appSrc).not.toMatch(/require\([^)]*npsService/);

    withoutKey(() => {
      try {
        require('../../app');
      } catch (e) {
        expect(e.message).not.toMatch(/nps_not_configured/);
        expect(e.code).not.toBe('nps_not_configured');
        // Confirm the known, unrelated cause rather than swallowing anything.
        expect(e.message).toMatch(/Cannot use import statement outside a module|experimental syntax 'jsx' isn't currently enabled/);
      }
    });
  });

  test('4. no NPS client is constructed during those imports', () => {
    const watch = watchNpsConstruction();
    try {
      withoutKey(() => {
        require(PATH);
        require('../../routes/ai');
        try { require('../../app'); } catch { /* pre-existing .jsx transform gap */ }
      });
      expect(watch.count).toBe(0);
    } finally {
      watch.restore();
    }
  });

  test('5. no NPS request is issued during import', () => {
    const requestSpy = jest.spyOn(axiosNow(), 'request');
    const getSpy = jest.spyOn(axiosNow(), 'get');
    try {
      withoutKey(() => {
        require(PATH);
        require('../../routes/ai');
      });
      expect(requestSpy).not.toHaveBeenCalled();
      expect(getSpy).not.toHaveBeenCalled();
    } finally {
      requestSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  test('6. a Claude-only path initializes with no NPS construction', () => {
    const watch = watchNpsConstruction();
    try {
      withoutKey(() => {
        const svc = require(PATH);
        require('../../routes/ai');
        // Nothing has been built, and asking would fail rather than silently
        // reaching for a live key.
        expect(() => svc.getNpsService()).toThrow('nps_not_configured');
      });
      expect(watch.count).toBe(0);
    } finally {
      watch.restore();
    }
  });

  test('7. a live NPS invocation without a key fails with exactly nps_not_configured', () => {
    withoutKey(() => {
      const svc = require(PATH);
      expect(() => svc.getNpsService()).toThrow(svc.NPS_NOT_CONFIGURED);
      try {
        svc.getNpsService();
        throw new Error('should have thrown');
      } catch (e) {
        expect(e.message).toBe('nps_not_configured');
        expect(e.code).toBe('nps_not_configured');
      }
    });
  });

  test('8. an injected deterministic adapter supports the intended invocation', async () => {
    const svc = withoutKey(() => require(PATH));
    const adapter = {
      getParkByCode: jest.fn().mockResolvedValue({ fullName: 'Zion National Park' }),
    };
    svc.setNpsAdapterForTests(adapter);
    try {
      const park = await svc.getNpsService().getParkByCode('zion');
      expect(park.fullName).toBe('Zion National Park');
      expect(adapter.getParkByCode).toHaveBeenCalledWith('zion');
    } finally {
      svc.resetNpsServiceForTests();
    }
  });
});

describe('Stage 14.7D1 §5 — lazy-service cache behavior', () => {
  test('a valid key builds exactly one instance, memoized across accesses', () => {
    process.env.NPS_API_KEY = 'key-A';
    const svc = require(PATH);
    const watch = watchNpsConstruction();
    try {
      const a = svc.getNpsService();
      const b = svc.getNpsService();
      const c = svc.getNpsService();
      expect(watch.count).toBe(1);
      expect(a).toBe(b);
      expect(b).toBe(c);
    } finally {
      watch.restore();
      svc.resetNpsServiceForTests();
    }
  });

  test('a changed key rebuilds the service', () => {
    process.env.NPS_API_KEY = 'key-A';
    const svc = require(PATH);
    const watch = watchNpsConstruction();
    try {
      const a = svc.getNpsService();
      process.env.NPS_API_KEY = 'key-B';
      const b = svc.getNpsService();
      expect(watch.count).toBe(2);
      expect(a).not.toBe(b);
    } finally {
      watch.restore();
      svc.resetNpsServiceForTests();
    }
  });

  test('removing the key does NOT silently reuse the key-A instance', () => {
    process.env.NPS_API_KEY = 'key-A';
    const svc = require(PATH);
    const watch = watchNpsConstruction();
    try {
      const a = svc.getNpsService();
      expect(a).toBeDefined();
      delete process.env.NPS_API_KEY;
      expect(() => svc.getNpsService()).toThrow('nps_not_configured');
      expect(watch.count).toBe(1);
    } finally {
      watch.restore();
      svc.resetNpsServiceForTests();
    }
  });

  test('a constructor failure leaves the cache empty and permits a retry', () => {
    process.env.NPS_API_KEY = 'key-C';
    const svc = require(PATH);
    const spy = jest.spyOn(axiosNow(), 'create');
    spy.mockImplementationOnce(() => {
      throw new Error('axios exploded and quoted key-C in the message');
    });
    try {
      expect(() => svc.getNpsService()).toThrow('nps_not_configured');
      // The failed construction must not be cached; a later call retries.
      const recovered = svc.getNpsService();
      expect(recovered).toBeDefined();
      expect(typeof recovered.getParkByCode).toBe('function');
    } finally {
      spy.mockRestore();
      svc.resetNpsServiceForTests();
    }
  });

  test('no key material or constructor text leaks into the bounded error', () => {
    process.env.NPS_API_KEY = 'super-secret-nps-value';
    const svc = require(PATH);
    svc.getNpsService();
    delete process.env.NPS_API_KEY;
    try {
      svc.getNpsService();
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toBe('nps_not_configured');
      expect(e.message).not.toContain('super-secret-nps-value');
      expect(e.message).not.toMatch(/environment variable|NPS_API_KEY|axios/);
      expect(JSON.stringify({ m: e.message, c: e.code })).not.toContain('super-secret-nps-value');
    } finally {
      svc.resetNpsServiceForTests();
    }
  });

  test('a placeholder key counts as unconfigured', () => {
    process.env.NPS_API_KEY = 'your_nps_api_key_here';
    const svc = require(PATH);
    try {
      expect(() => svc.getNpsService()).toThrow('nps_not_configured');
    } finally {
      svc.resetNpsServiceForTests();
    }
  });
});

describe('Stage 14.7D1 §4 — test-adapter seam', () => {
  test('an injected adapter is returned without validating configuration', () => {
    withoutKey(() => {
      const svc = require(PATH);
      const adapter = { getAllParks: jest.fn() };
      svc.setNpsAdapterForTests(adapter);
      try {
        expect(svc.getNpsService()).toBe(adapter);
      } finally {
        svc.resetNpsServiceForTests();
      }
    });
  });

  test('an adapter never falls through to the live service', async () => {
    process.env.NPS_API_KEY = 'key-live';
    const svc = require(PATH);
    const watch = watchNpsConstruction();
    svc.setNpsAdapterForTests({ getAllParks: jest.fn().mockResolvedValue([]) });
    try {
      await svc.getNpsService().getAllParks();
      // A method the adapter does not define must fail plainly, naming the
      // method, rather than resolving against the real service.
      expect(() => svc.getNpsService().getParkByCode('zion')).toThrow(/getParkByCode is not a function/);
      expect(watch.count).toBe(0);
    } finally {
      watch.restore();
      svc.resetNpsServiceForTests();
    }
  });

  test('reset clears the adapter so it cannot leak into another test', () => {
    withoutKey(() => {
      const svc = require(PATH);
      svc.setNpsAdapterForTests({ getAllParks: jest.fn() });
      svc.resetNpsServiceForTests();
      expect(() => svc.getNpsService()).toThrow('nps_not_configured');
    });
  });

  test('production execution cannot install a test adapter', () => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const svc = require(PATH);
    try {
      expect(() => svc.setNpsAdapterForTests({ getAllParks: jest.fn() }))
        .toThrow('nps_test_adapter_forbidden_in_production');
    } finally {
      process.env.NODE_ENV = savedEnv;
      svc.resetNpsServiceForTests();
    }
  });
});

describe('Stage 14.7D1 §6 — production bootstrap validation', () => {
  test('importing the module never validates configuration', () => {
    const watch = watchNpsConstruction();
    try {
      withoutKey(() => {
        expect(() => require(PATH)).not.toThrow();
      });
      expect(watch.count).toBe(0);
    } finally {
      watch.restore();
    }
  });

  test('assertNpsConfigured fails clearly when NPS is required and missing', () => {
    withoutKey(() => {
      const { assertNpsConfigured } = require(PATH);
      expect(() => assertNpsConfigured()).toThrow('nps_not_configured');
      try {
        assertNpsConfigured();
      } catch (e) {
        expect(e.code).toBe('nps_not_configured');
      }
    });
  });

  test('assertNpsConfigured passes with a key and still constructs nothing', () => {
    process.env.NPS_API_KEY = 'key-bootstrap';
    const svc = require(PATH);
    const watch = watchNpsConstruction();
    try {
      expect(svc.assertNpsConfigured()).toBe(true);
      expect(watch.count).toBe(0);
    } finally {
      watch.restore();
      svc.resetNpsServiceForTests();
    }
  });

  test('the production startup seam is server.js, not the app factory', () => {
    const read = (p) => fs.readFileSync(path.join(SERVER_ROOT, p), 'utf8');
    expect(read('server.js')).toMatch(/assertNpsConfigured\(\)/);
    // Import-time surfaces must stay free of the bootstrap check.
    expect(read('src/app.js')).not.toMatch(/assertNpsConfigured/);
    expect(read('src/routes/ai.js')).not.toMatch(/assertNpsConfigured/);
    expect(read('src/services/npsService.js')).not.toMatch(/^assertNpsConfigured\(\);/m);
  });
});

describe('Stage 14.7D1 §8 — source-level structural guards', () => {
  const serviceSrc = fs.readFileSync(path.join(SERVER_ROOT, 'src/services/npsService.js'), 'utf8');

  // Every server file that imports npsService, split by production vs test.
  const importers = collectSourceFiles(SERVER_ROOT, SERVER_ROOT).filter((file) =>
    /require\([^)]*npsService/.test(fs.readFileSync(path.join(SERVER_ROOT, file), 'utf8'))
  );
  const eagerSingletonBinding = /(const|let|var)\s+npsService\s*=\s*require\(/;

  test('the module does not export an eagerly constructed singleton', () => {
    expect(serviceSrc).not.toMatch(/module\.exports\s*=\s*new NPSService\(/);
  });

  test('no NPSService is constructed at module scope', () => {
    // A module-scope construction sits at column 0; the legitimate one lives
    // inside getNpsService and is indented.
    // Module scope starts at column 0; the legitimate construction is indented
    // inside getNpsService, so requiring a non-space first character is enough
    // without pinning any single line number.
    expect(serviceSrc).not.toMatch(/^\S[^\n]*\bnew NPSService\(/m);
    expect(serviceSrc).toMatch(/function getNpsService\(\)/);
  });

  test('the refactor uses no JavaScript Proxy', () => {
    expect(serviceSrc).not.toMatch(/\bnew Proxy\b/);
  });

  test('the importer scan actually found the expected files', () => {
    // Guards the guards: an empty sweep would make the checks below vacuous.
    expect(importers.length).toBeGreaterThan(15);
  });

  test('no production file imports a deprecated eager singleton', () => {
    const offenders = importers
      .filter((file) => !isTestFile(file))
      .filter((file) => eagerSingletonBinding.test(fs.readFileSync(path.join(SERVER_ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('no test mutates the exported service object directly', () => {
    // Binding the module export to a bare identifier is what enabled
    // `npsService._loadSnapshot = ...` monkey-patching.
    const offenders = importers
      .filter(isTestFile)
      .filter((file) => eagerSingletonBinding.test(fs.readFileSync(path.join(SERVER_ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('the test-adapter setter is unreachable from routes, controllers and client code', () => {
    // The guard names what must never reach the setter — request-handling code
    // and the browser bundles. Test suites and the evaluation-bootstrap
    // infrastructure (src/eval/bootstrap) are its intended callers: neither is
    // reachable from public route input.
    const FORBIDDEN_SERVER_DIRS = ['src/routes', 'src/controllers', 'src/middleware'];
    const leaked = [];

    for (const file of collectSourceFiles(SERVER_ROOT, SERVER_ROOT)) {
      const normalized = file.split(path.sep).join('/');
      if (!FORBIDDEN_SERVER_DIRS.some((dir) => normalized.startsWith(dir))) continue;
      if (/setNpsAdapterForTests/.test(fs.readFileSync(path.join(SERVER_ROOT, file), 'utf8'))) {
        leaked.push(normalized);
      }
    }

    // Client bundles must never reference it at all.
    for (const root of [path.join(REPO_ROOT, 'next-frontend/src'), path.join(REPO_ROOT, 'client/src')]) {
      if (!fs.existsSync(root)) continue;
      for (const file of collectSourceFiles(root, root)) {
        if (/setNpsAdapterForTests/.test(fs.readFileSync(path.join(root, file), 'utf8'))) {
          leaked.push(path.join(root, file));
        }
      }
    }

    expect(leaked).toEqual([]);
  });
});
