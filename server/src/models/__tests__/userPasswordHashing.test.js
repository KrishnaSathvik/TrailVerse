'use strict';

/**
 * Stage 14.8G.1 §5/§6/§7 — the password-hashing hook.
 *
 * The defect this locks down: `userSchema.pre('save')` called `next()` on the
 * unmodified-password path and then kept running, so the hook re-hashed whatever
 * `this.password` happened to hold. Two consequences, both latent because they
 * raced the save's own serialization:
 *
 *   - saving a document that HAS its password loaded double-hashed it, which
 *     silently invalidates the user's credential
 *   - saving a document loaded through `select('-password')` — which is exactly
 *     what `protect` does on every authenticated request — hashed `undefined`
 *
 * These tests use real saves against the suite's in-memory Mongo, because the
 * property under test is what ends up stored, not what the hook intends.
 */

const bcrypt = require('bcryptjs');
const User = require('../User');

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'a-different-password-entirely';

/**
 * Why this suite watches `bcrypt.hash` and not just the stored document:
 *
 * the first version of these tests asserted only what ended up in Mongo, and it
 * passed against the DEFECTIVE hook. The stray hash lands after `next()` has
 * already let the save serialize its update, so the database keeps the correct
 * value and the damage shows up elsewhere — in the in-memory document, and in a
 * `bcrypt.hash(undefined)` rejection that no longer has a `next` to report to.
 *
 * Counting the hash calls states the invariant directly ("hash exactly once when
 * the password changes, never otherwise") and fails on the defective hook, which
 * is what makes this suite worth having.
 */
let hashSpy;
let genSaltSpy;

const hashCalls = () => hashSpy.mock.calls.map(([data]) => data);

/**
 * The stray hash is kicked off after the save resolves, so an assertion made
 * immediately after `await save()` would race it. Settling first is what makes
 * "no hashing happened" a real claim rather than a lucky one.
 */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 400); });

beforeEach(() => {
  hashSpy = jest.spyOn(bcrypt, 'hash');
  genSaltSpy = jest.spyOn(bcrypt, 'genSalt');
});

afterEach(() => {
  hashSpy.mockRestore();
  genSaltSpy.mockRestore();
});

const createUser = (overrides = {}) => User.create({
  name: 'Hook Fixture',
  firstName: 'Hook',
  lastName: 'Fixture',
  email: 'hook-fixture@example.com',
  password: PASSWORD,
  ...overrides,
});

/** Reads the stored hash, which `select: false` hides from ordinary queries. */
const storedHash = async (id) => {
  const doc = await User.findById(id).select('+password');
  return doc.password;
};

const BCRYPT_SHAPE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

describe('User password hashing hook', () => {
  describe('§6 initial creation', () => {
    it('stores a bcrypt hash, never the plaintext, and accepts the original credential', async () => {
      const user = await createUser();
      const hash = await storedHash(user._id);

      expect(hash).not.toBe(PASSWORD);
      expect(BCRYPT_SHAPE.test(hash)).toBe(true);
      expect(hash.slice(0, 6)).toBe('$2a$10');
      expect(await bcrypt.compare(PASSWORD, hash)).toBe(true);
    });

    it('hashes exactly once, with the plaintext, and never again', async () => {
      const user = await createUser();
      await settle();

      expect(hashCalls()).toEqual([PASSWORD]);
      expect(await bcrypt.compare(PASSWORD, await storedHash(user._id))).toBe(true);
    });
  });

  describe('§6 saving an unrelated field', () => {
    it('does not hash at all, and leaves the stored hash byte-identical', async () => {
      const user = await createUser();
      const before = await storedHash(user._id);
      hashSpy.mockClear();

      const loaded = await User.findById(user._id).select('+password');
      loaded.bio = 'changed something that is not the password';
      await loaded.save();
      await settle();

      expect(hashCalls()).toEqual([]);
      const after = await storedHash(user._id);
      expect(after).toBe(before);
      expect(await bcrypt.compare(PASSWORD, after)).toBe(true);
    });

    it('leaves the SAVED DOCUMENT still able to verify its own credential', async () => {
      // The defect's most direct symptom: the in-memory password was replaced by
      // a hash of the hash, so the very instance that was just saved could no
      // longer verify the user's password.
      const user = await createUser();

      const loaded = await User.findById(user._id).select('+password');
      const passwordFieldBefore = loaded.password;
      loaded.bio = 'unrelated change';
      await loaded.save();
      await settle();

      expect(loaded.password).toBe(passwordFieldBefore);
      expect(await loaded.comparePassword(PASSWORD)).toBe(true);
    });

    it('survives repeated saves — the hash never drifts and nothing is rehashed', async () => {
      const user = await createUser();
      const before = await storedHash(user._id);
      hashSpy.mockClear();

      for (let i = 0; i < 3; i += 1) {
        const loaded = await User.findById(user._id).select('+password');
        loaded.bio = `save number ${i}`;
        await loaded.save();
      }
      await settle();

      expect(hashCalls()).toEqual([]);
      const after = await storedHash(user._id);
      expect(after).toBe(before);
      expect(await bcrypt.compare(PASSWORD, after)).toBe(true);
    });
  });

  describe("§6 documents loaded without the password (the `protect` path)", () => {
    it('never hashes undefined, never throws, and leaves the stored hash intact', async () => {
      const user = await createUser();
      const before = await storedHash(user._id);
      hashSpy.mockClear();

      const rejections = [];
      const onRejection = (reason) => rejections.push(String(reason && reason.message));
      process.on('unhandledRejection', onRejection);

      try {
        // Exactly how middleware/auth.js protect loads the user.
        const loaded = await User.findById(user._id).select('-password');
        expect(loaded.password).toBeUndefined();

        loaded.lastActiveAt = new Date();
        await expect(loaded.save()).resolves.toBeDefined();
        await settle();

        // The defective hook reached `bcrypt.hash(undefined, salt)` here, which
        // rejects with no `next` left to receive the error.
        expect(hashCalls()).toEqual([]);
        expect(hashCalls()).not.toContain(undefined);
        expect(rejections).toEqual([]);
      } finally {
        process.off('unhandledRejection', onRejection);
      }

      const after = await storedHash(user._id);
      expect(after).toBe(before);
      expect(await bcrypt.compare(PASSWORD, after)).toBe(true);
    });

    it('does not write a password field derived from undefined', async () => {
      const user = await createUser();

      const loaded = await User.findById(user._id).select('-password');
      loaded.bio = 'set from a password-excluded document';
      await loaded.save();

      const raw = await User.collection.findOne({ _id: user._id });
      expect(typeof raw.password).toBe('string');
      expect(BCRYPT_SHAPE.test(raw.password)).toBe(true);
      expect(await bcrypt.compare(PASSWORD, raw.password)).toBe(true);
    });
  });

  describe('§6 explicit password change', () => {
    it('rehashes exactly once, rejects the old credential and accepts the new one', async () => {
      const user = await createUser();
      const oldHash = await storedHash(user._id);
      hashSpy.mockClear();

      const loaded = await User.findById(user._id).select('+password');
      loaded.password = NEW_PASSWORD;
      await loaded.save();
      await settle();

      expect(hashCalls()).toEqual([NEW_PASSWORD]);
      const newHash = await storedHash(user._id);
      expect(newHash).not.toBe(oldHash);
      expect(BCRYPT_SHAPE.test(newHash)).toBe(true);
      expect(Number(newHash.slice(4, 6))).toBe(10);
      expect(await bcrypt.compare(PASSWORD, newHash)).toBe(false);
      expect(await bcrypt.compare(NEW_PASSWORD, newHash)).toBe(true);
    });

    it('leaves comparePassword agreeing with the change', async () => {
      const user = await createUser();

      const loaded = await User.findById(user._id).select('+password');
      loaded.password = NEW_PASSWORD;
      await loaded.save();

      const reloaded = await User.findById(user._id).select('+password');
      expect(await reloaded.comparePassword(NEW_PASSWORD)).toBe(true);
      expect(await reloaded.comparePassword(PASSWORD)).toBe(false);
    });
  });

  describe('§7 the two saves signup performs', () => {
    /**
     * authController.signup does `User.create(...)` and then, after
     * `getEmailVerificationToken()`, a second `user.save()`. The second save is
     * intentional — it is what persists the verification token — so the property
     * to prove is that it does not touch the password.
     */
    it('persists the verification token without rehashing the password', async () => {
      const user = await createUser();
      const hashAfterCreate = await storedHash(user._id);
      hashSpy.mockClear();

      const verificationToken = user.getEmailVerificationToken();
      await user.save();
      await settle();

      expect(hashCalls()).toEqual([]);
      const hashAfterSecondSave = await storedHash(user._id);
      const reloaded = await User.findById(user._id).select('+password');

      expect(verificationToken).toBeTruthy();
      expect(reloaded.emailVerificationToken).toBeTruthy();
      expect(reloaded.emailVerificationCode).toMatch(/^\d{6}$/);
      expect(hashAfterSecondSave).toBe(hashAfterCreate);
      expect(await bcrypt.compare(PASSWORD, hashAfterSecondSave)).toBe(true);
    });

    it('token-usage bookkeeping saves do not disturb the credential', async () => {
      const user = await createUser();
      const before = await storedHash(user._id);
      hashSpy.mockClear();

      const loaded = await User.findById(user._id).select('+password');
      await loaded.addTokenUsage(120, 340);
      await settle();

      expect(hashCalls()).toEqual([]);
      const after = await storedHash(user._id);
      expect(after).toBe(before);
      expect(await bcrypt.compare(PASSWORD, after)).toBe(true);
      expect((await User.findById(user._id)).tokenUsage.totalTokensUsed).toBe(460);
    });
  });
});
