const {
  assessEvalPersistenceTarget,
  requireIsolatedEvalDatabase,
  mayDropDatabase,
  parseMongoUri,
} = require('../../../eval/evalPersistenceGuard');

const GOOD = 'mongodb://127.0.0.1:27018/trailverse_eval_14_7';
const PROD = 'mongodb+srv://user:secret@cluster0.example.mongodb.net/trailverse?retryWrites=true';

const ok = async () => ({ ok: 1 });

describe('Stage 14.7A §2 — isolated persistence guard', () => {
  test('accepts the approved local evaluation database', () => {
    const r = assessEvalPersistenceTarget({ evalUri: GOOD, productionUri: PROD });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.target).toEqual({ scheme: 'mongodb', host: '127.0.0.1', port: 27018, database: 'trailverse_eval_14_7' });
  });

  test('rejects a missing evaluation URI', () => {
    const r = assessEvalPersistenceTarget({ evalUri: undefined, productionUri: PROD });
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/not set/);
  });

  test('rejects an evaluation URI identical to production', () => {
    const r = assessEvalPersistenceTarget({ evalUri: PROD, productionUri: PROD });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(expect.arrayContaining([expect.stringMatching(/identical to MONGODB_URI/)]));
  });

  test('rejects an Atlas/SRV URI', () => {
    const r = assessEvalPersistenceTarget({ evalUri: PROD, productionUri: null });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/scheme must be local/),
      expect.stringMatching(/hosted-cluster fragment \(mongodb\.net\)/),
    ]));
  });

  test('rejects a non-loopback host', () => {
    const r = assessEvalPersistenceTarget({ evalUri: 'mongodb://10.0.0.5:27018/trailverse_eval_14_7' });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(expect.arrayContaining([expect.stringMatching(/host must be loopback/)]));
  });

  test.each([
    ['the production database name', 'mongodb://127.0.0.1:27018/trailverse'],
    ['an unrelated name', 'mongodb://127.0.0.1:27018/somethingelse'],
    ['no database at all', 'mongodb://127.0.0.1:27018'],
    ['the bare prefix with no suffix', 'mongodb://127.0.0.1:27018/trailverse_eval_'],
  ])('rejects %s', (_label, uri) => {
    const r = assessEvalPersistenceTarget({ evalUri: uri });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(expect.arrayContaining([expect.stringMatching(/database must be/)]));
  });

  test('accepts an approved prefixed namespace', () => {
    expect(assessEvalPersistenceTarget({ evalUri: 'mongodb://localhost:27018/trailverse_eval_scratch' }).ok).toBe(true);
  });

  test('never reports credentials', () => {
    const r = assessEvalPersistenceTarget({ evalUri: PROD, productionUri: null });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(JSON.stringify(r.target)).not.toContain('user');
  });

  test('parseMongoUri strips credentials from the authority', () => {
    expect(parseMongoUri('mongodb://u:p@127.0.0.1:27018/db').host).toBe('127.0.0.1');
  });
});

describe('Stage 14.7A §2 — reachability', () => {
  test('passes when the isolated database responds to ping', async () => {
    const r = await requireIsolatedEvalDatabase({ evalUri: GOOD, productionUri: PROD, connect: ok });
    expect(r.ok).toBe(true);
    expect(r.reachable).toBe(true);
  });

  test('fails closed when the local database is unreachable', async () => {
    const r = await requireIsolatedEvalDatabase({
      evalUri: GOOD, productionUri: PROD,
      connect: async () => { throw new Error(`connect ECONNREFUSED ${GOOD}`); },
    });
    expect(r.ok).toBe(false);
    expect(r.reachable).toBe(false);
    expect(r.failures).toEqual(['evaluation database is unreachable']);
    // The driver message can echo the URI; it must not propagate.
    expect(JSON.stringify(r.failures)).not.toContain('27018');
  });

  test('fails closed when ping does not return ok:1', async () => {
    const r = await requireIsolatedEvalDatabase({ evalUri: GOOD, connect: async () => ({ ok: 0 }) });
    expect(r.ok).toBe(false);
  });

  test('never attempts a connection when static checks fail', async () => {
    let attempted = false;
    const r = await requireIsolatedEvalDatabase({
      evalUri: PROD, productionUri: PROD,
      connect: async () => { attempted = true; return { ok: 1 }; },
    });
    expect(r.ok).toBe(false);
    expect(attempted).toBe(false);
  });
});

describe('Stage 14.7A §3/§8 — drop authorization', () => {
  test('permits dropping only the exact approved evaluation database', () => {
    expect(mayDropDatabase(GOOD)).toBe(true);
  });

  test.each([
    ['production Atlas', PROD],
    ['the production database name locally', 'mongodb://127.0.0.1:27018/trailverse'],
    ['a prefixed but non-exact namespace', 'mongodb://127.0.0.1:27018/trailverse_eval_scratch'],
  ])('refuses to drop %s', (_label, uri) => {
    expect(mayDropDatabase(uri)).toBe(false);
  });
});
