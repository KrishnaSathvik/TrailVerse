/**
 * Stage 14.8G.1 §4 — credential-leak tripwire.
 *
 * Stage 14.8G had to redact its own console capture because the login path wrote
 * the complete bearer token to the console. Redacting the harness protected the
 * artifact, not the product. This suite is the product-side guard: it drives the
 * real auth surface with a SYNTHETIC credential and fails if any complete raw
 * credential — or a usable slice of one — reaches captured output.
 *
 * Covered paths: login, client auth state update, session restore, /api/auth/me,
 * logout, and the error handling around each.
 *
 * No operator credential appears here. The token below is a structurally valid
 * but meaningless JWT whose signature segment names itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const SYNTHETIC_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImlhdCI6MH0'
  + '.SYNTHETIC0STAGE14x8G1xTRIPWIREx0NOTxAxREALxSIGNATURE';
const SYNTHETIC_PASSWORD = 'synthetic-tripwire-password-not-a-real-secret';
const SYNTHETIC_AUTH_HEADER = `Bearer ${SYNTHETIC_TOKEN}`;
const SYNTHETIC_EMAIL = 'tripwire@example.com';

/**
 * A prefix long enough that a chance collision is impossible, short enough to
 * catch the `token.substring(0, 20)` style of "safe" logging that §3 rules out.
 */
const MIN_LEAKED_SLICE = 16;

const user = {
  _id: '000000000000000000000000',
  id: '000000000000000000000000',
  email: SYNTHETIC_EMAIL,
  name: 'Tripwire User',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ── console capture ────────────────────────────────────────────────────────────
const METHODS = ['log', 'info', 'debug', 'warn', 'error'];
let transcript = [];
let spies = [];

/** Serializes an argument the way a developer would SEE it in a console. */
const renderArg = (arg) => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) {
    // Browsers expand own enumerable properties of an Error too (axios attaches
    // `config`, which is where the Authorization header lives).
    const own = {};
    for (const key of Object.keys(arg)) own[key] = arg[key];
    return `${arg.name}: ${arg.message} ${safeStringify(own)}`;
  }
  return safeStringify(arg);
};

const safeStringify = (value) => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (typeof val === 'function') return '[Function]';
    return val;
  }) ?? String(value);
};

const installCapture = () => {
  transcript = [];
  spies = METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args) => {
      transcript.push(args.map(renderArg).join(' '));
    })
  );
};

const restoreCapture = () => {
  spies.forEach((spy) => spy.mockRestore());
  spies = [];
};

/** Counts complete credentials plus any usable slice of the token. */
const scan = () => {
  const text = transcript.join('\n');
  const slices = [];
  for (let i = 0; i + MIN_LEAKED_SLICE <= SYNTHETIC_TOKEN.length; i += 1) {
    const slice = SYNTHETIC_TOKEN.slice(i, i + MIN_LEAKED_SLICE);
    if (text.includes(slice)) slices.push(i);
  }
  return {
    rawTokenOccurrences: text.split(SYNTHETIC_TOKEN).length - 1,
    passwordOccurrences: text.split(SYNTHETIC_PASSWORD).length - 1,
    authorizationHeaderValueOccurrences: text.split(SYNTHETIC_AUTH_HEADER).length - 1,
    partialTokenSliceOccurrences: slices.length,
    lines: transcript.length,
  };
};

// ── authService with a controllable axios transport ───────────────────────────
const post = vi.fn();
const get = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post: (...args) => post(...args),
      get: (...args) => get(...args),
      put: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    }),
  },
}));

vi.mock('../websocketService', () => ({
  default: { disconnect: vi.fn(), connect: vi.fn() },
}));

/** An axios-shaped rejection: the failure object that carries the header. */
const axiosError = (status) => Object.assign(new Error('Request failed'), {
  response: { status, data: { success: false, error: 'Not authorized', code: 'UNAUTHORIZED' } },
  config: {
    url: '/auth/me',
    method: 'get',
    headers: { Authorization: SYNTHETIC_AUTH_HEADER, 'Content-Type': 'application/json' },
  },
  isAxiosError: true,
});

describe('Stage 14.8G.1 §4 — credential-leak tripwire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = 'trailverse_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    installCapture();
  });

  afterEach(() => {
    restoreCapture();
  });

  it('login + auth state update + getMe + getToken + logout leak nothing', async () => {
    const authService = (await import('../authService')).default;

    post.mockResolvedValue({ status: 200, data: { success: true, data: user, token: SYNTHETIC_TOKEN } });
    get.mockResolvedValue({ status: 200, data: { success: true, data: user } });

    await authService.login(SYNTHETIC_EMAIL, SYNTHETIC_PASSWORD, false);
    // The credential really was stored — otherwise this suite would pass vacuously.
    expect(window.localStorage.getItem('token')).toBe(SYNTHETIC_TOKEN);
    expect(document.cookie).toContain(SYNTHETIC_TOKEN);

    await authService.getMe();
    authService.getToken();
    authService.getCurrentUser();
    authService.logout();

    const result = scan();
    expect(result.lines).toBeGreaterThan(0);
    expect(result).toMatchObject({
      rawTokenOccurrences: 0,
      passwordOccurrences: 0,
      authorizationHeaderValueOccurrences: 0,
      partialTokenSliceOccurrences: 0,
    });
  });

  it('a rejected login leaks neither the password nor the transport error headers', async () => {
    const authService = (await import('../authService')).default;

    post.mockRejectedValue(axiosError(401));

    await expect(authService.login(SYNTHETIC_EMAIL, SYNTHETIC_PASSWORD, false)).rejects.toThrow();

    expect(scan()).toMatchObject({
      rawTokenOccurrences: 0,
      passwordOccurrences: 0,
      authorizationHeaderValueOccurrences: 0,
      partialTokenSliceOccurrences: 0,
    });
  });

  it('a login response with no token leaks nothing', async () => {
    const authService = (await import('../authService')).default;

    post.mockResolvedValue({ status: 200, data: { success: true, data: user } });

    await authService.login(SYNTHETIC_EMAIL, SYNTHETIC_PASSWORD, false);

    expect(scan()).toMatchObject({
      rawTokenOccurrences: 0,
      passwordOccurrences: 0,
      authorizationHeaderValueOccurrences: 0,
      partialTokenSliceOccurrences: 0,
    });
  });
});

// ── session restore, driven through the real provider ─────────────────────────
vi.mock('../../services/tripHistoryService', () => ({
  migrateLegacyTrips: vi.fn().mockResolvedValue({ migrated: 0 }),
}));
vi.mock('../../utils/cacheUtils', () => ({ invalidateCache: { dailyFeed: vi.fn() } }));
vi.mock('../../components/auth/LoginModal', () => ({ default: () => null }));
vi.mock('../../utils/analytics', () => ({
  logAnonymousChatMigrated: vi.fn(),
  logEvent: vi.fn(),
  logLoginPromptShown: vi.fn(),
  logUserLogin: vi.fn(),
  logUserLogout: vi.fn(),
  logUserSignup: vi.fn(),
}));

describe('Stage 14.8G.1 §4 — session restore leaks nothing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    window.localStorage.clear();
    installCapture();
  });

  afterEach(() => {
    restoreCapture();
  });

  /**
   * The regression this pins: the restore failure path logged the whole axios
   * error, and an axios error embeds `config.headers.Authorization`. A 500 keeps
   * the user signed in and a 401 clears the session — both must stay quiet.
   */
  it.each([
    ['transport failure keeps the session', 500],
    ['rejected credential clears the session', 401],
  ])('%s', async (_label, status) => {
    vi.doMock('../authService', () => ({
      AUTH_SESSION_EXPIRED_EVENT: 'authSessionExpired',
      AUTH_TOKEN_COOKIE: 'trailverse_auth_token',
      default: {
        getToken: () => SYNTHETIC_TOKEN,
        getCurrentUser: () => ({ ...user }),
        getMe: () => Promise.reject(axiosError(status)),
        logout: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
      },
    }));

    const { AuthProvider } = await import('../../context/AuthContext');
    render(<AuthProvider><div /></AuthProvider>);

    await waitFor(() => {
      expect(transcript.join('\n')).toContain('Server validation failed');
    });

    expect(scan()).toMatchObject({
      rawTokenOccurrences: 0,
      passwordOccurrences: 0,
      authorizationHeaderValueOccurrences: 0,
      partialTokenSliceOccurrences: 0,
    });
  });
});
