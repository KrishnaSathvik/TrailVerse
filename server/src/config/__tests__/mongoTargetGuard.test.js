const { assessMongoTarget } = require('../mongoTargetGuard');

/**
 * Environment safety (audit 2026-08-31): local development was writing to the
 * production Atlas cluster because nothing between MONGODB_URI and
 * mongoose.connect() asked whether that made sense.
 *
 * The guard deliberately does NOT try to recognize "the production hostname" —
 * that rots the day the cluster is renamed. In non-production, every remote
 * Mongo host is refused unless it is explicitly named in
 * MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS. Local topologies (loopback,
 * host.docker.internal) always pass.
 */

describe('assessMongoTarget', () => {
  it('allows any target in production', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://user:pass@trailverseapp.plpij7w.mongodb.net/trailverse',
      nodeEnv: 'production',
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(true);
  });

  it('allows localhost in development', () => {
    const result = assessMongoTarget({
      uri: 'mongodb://localhost:27017/trailverse-dev',
      nodeEnv: 'development',
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(true);
  });

  it('allows loopback, docker-internal, and multi-host local replica sets', () => {
    for (const uri of [
      'mongodb://127.0.0.1:27017/dev',
      'mongodb://[::1]:27017/dev',
      'mongodb://host.docker.internal:27017/dev',
      'mongodb://localhost:27017,localhost:27018,localhost:27019/dev?replicaSet=rs0',
    ]) {
      const result = assessMongoTarget({ uri, nodeEnv: 'development', allowRemoteHosts: '' });
      expect(result.allowed).toBe(true);
    }
  });

  it('refuses a remote Atlas host in development', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://user:pass@trailverseapp.plpij7w.mongodb.net/trailverse',
      nodeEnv: 'development',
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(false);
    expect(result.remoteHosts).toEqual(['trailverseapp.plpij7w.mongodb.net']);
    expect(result.reason).toMatch(/remote/i);
    expect(result.reason).toContain('MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS');
  });

  it('refuses any remote host in development, not just known production ones', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://user:pass@some-other-cluster.abcde.mongodb.net/whatever',
      nodeEnv: 'development',
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(false);
  });

  it('treats a missing NODE_ENV as non-production', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://user:pass@trailverseapp.plpij7w.mongodb.net/trailverse',
      nodeEnv: undefined,
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(false);
  });

  it('allows a remote host that is explicitly named in the override', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://user:pass@dev-cluster.xyz.mongodb.net/trailverse-dev',
      nodeEnv: 'development',
      allowRemoteHosts: 'dev-cluster.xyz.mongodb.net',
    });
    expect(result.allowed).toBe(true);
  });

  it('override must name every remote host — a partial match is refused', () => {
    const result = assessMongoTarget({
      uri: 'mongodb://a.remote.example:27017,b.remote.example:27017/dev',
      nodeEnv: 'development',
      allowRemoteHosts: 'a.remote.example',
    });
    expect(result.allowed).toBe(false);
    expect(result.remoteHosts).toContain('b.remote.example');
  });

  it('override matching is exact hostname, not substring', () => {
    const result = assessMongoTarget({
      uri: 'mongodb+srv://u:p@trailverseapp.plpij7w.mongodb.net/db',
      nodeEnv: 'development',
      allowRemoteHosts: 'mongodb.net',
    });
    expect(result.allowed).toBe(false);
  });

  it('refuses an unparseable URI in non-production', () => {
    const result = assessMongoTarget({
      uri: 'not-a-mongo-uri',
      nodeEnv: 'development',
      allowRemoteHosts: '',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/parse/i);
  });
});
