'use strict';

/**
 * Stage 14.8G.1 §8/§11 — the authentication transport contract, pinned.
 *
 * Stage 14.8G recorded the real contract for the first time:
 *
 *   Authorization: Bearer  → the actual backend authentication
 *   localStorage.token     → the client credential source
 *   trailverse_auth_token  → an SSR/proxy HINT, script-readable, not HttpOnly
 *
 * The client comment used to claim the cookie was HttpOnly, which invited the
 * assumption that it is a security boundary. These tests fix the boundary in
 * place: `protect` reads the header and ONLY the header, so a request carrying
 * the mirror cookie alone stays unauthenticated. If someone later teaches
 * `protect` to fall back to the cookie, that is a deliberate design change and
 * this suite is where it has to be argued.
 *
 * The middleware is exercised directly rather than over HTTP: requiring
 * `src/app` pulls the JSX email templates into Jest, which cannot parse them
 * (a pre-existing condition, see the integration suites). The end-to-end HTTP
 * proof of the same contract is the live §11 revalidation against the isolated
 * acceptance backend, which runs the real app.
 */

const jwt = require('jsonwebtoken');
const { protect, optionalAuth } = require('../auth');
const User = require('../../models/User');

const AUTH_COOKIE = 'trailverse_auth_token';

const createUser = () => User.create({
  name: 'Protect Fixture',
  firstName: 'Protect',
  lastName: 'Fixture',
  email: 'protect-fixture@example.com',
  password: 'protect-fixture-password',
});

const signFor = (userId, options = {}) =>
  jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d', ...options });

/** Minimal express-shaped req/res, so the assertion is about the middleware. */
const makeReq = (headers = {}) => ({ headers });

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.set = jest.fn(() => res);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

const run = async (middleware, headers) => {
  const req = makeReq(headers);
  const res = makeRes();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};

describe('protect — bearer header only', () => {
  it('accepts a valid bearer token and resolves the right user without the password', async () => {
    const user = await createUser();
    const token = signFor(user._id);

    const { req, res, nextCalled } = await run(protect, { authorization: `Bearer ${token}` });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
    expect(String(req.user._id)).toBe(String(user._id));
    expect(req.user.email).toBe('protect-fixture@example.com');
    expect(req.user.password).toBeUndefined();
  });

  it('rejects a request carrying ONLY the mirror cookie', async () => {
    const user = await createUser();
    const token = signFor(user._id);

    const { res, nextCalled } = await run(protect, { cookie: `${AUTH_COOKIE}=${token}` });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: 'Not authorized to access this route',
    });
  });

  it('rejects the cookie even when it sits alongside other cookies', async () => {
    const user = await createUser();
    const token = signFor(user._id);

    const { res, nextCalled } = await run(protect, {
      cookie: `theme=dark; ${AUTH_COOKIE}=${token}; other=1`,
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with no credential at all', async () => {
    const { res, nextCalled } = await run(protect, {});
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed bearer value', async () => {
    const { res, nextCalled } = await run(protect, { authorization: 'Bearer not-a-jwt' });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const user = await createUser();
    const forged = jwt.sign({ id: String(user._id) }, 'not-the-real-secret', { expiresIn: '7d' });

    const { res, nextCalled } = await run(protect, { authorization: `Bearer ${forged}` });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('reports an expired token distinctly, so the client can prompt a re-login', async () => {
    const user = await createUser();
    const expired = signFor(user._id, { expiresIn: '-1s' });

    const { res } = await run(protect, { authorization: `Bearer ${expired}` });

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
    expect(res.body.error).toBe('Session expired. Please sign in again.');
  });

  it('rejects a valid signature whose user no longer exists', async () => {
    const user = await createUser();
    const token = signFor(user._id);
    await User.deleteOne({ _id: user._id });

    const { res, nextCalled } = await run(protect, { authorization: `Bearer ${token}` });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('User not found');
  });

  it('never echoes the credential back in a rejection', async () => {
    const user = await createUser();
    const token = signFor(user._id);

    const { res } = await run(protect, { cookie: `${AUTH_COOKIE}=${token}` });

    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});

describe('optionalAuth — same transport, anonymous fallback', () => {
  it('resolves a user from the bearer header', async () => {
    const user = await createUser();

    const { req, nextCalled } = await run(optionalAuth, {
      authorization: `Bearer ${signFor(user._id)}`,
    });

    expect(nextCalled).toBe(true);
    expect(String(req.user._id)).toBe(String(user._id));
  });

  it('treats a cookie-only request as anonymous rather than authenticated', async () => {
    const user = await createUser();

    const { req, nextCalled } = await run(optionalAuth, {
      cookie: `${AUTH_COOKIE}=${signFor(user._id)}`,
    });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeNull();
  });
});
