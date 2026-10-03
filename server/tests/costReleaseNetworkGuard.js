// Test-only guard. Never imported by production startup.
process.env.NPS_API_KEY = 'synthetic-test-key';
process.env.OPENAI_API_KEY = 'synthetic-test-key';
process.env.ANTHROPIC_API_KEY = 'synthetic-test-key';
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
const allowed = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
for (const name of ['http', 'https']) {
  const mod = require(name);
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function (input, ...rest) {
      const options = typeof input === 'string' || input instanceof URL ? new URL(input) : input;
      const host = options.hostname || options.host || 'localhost';
      if (!allowed(host)) throw new Error('Release test blocked external HTTP');
      return original.call(this, input, ...rest);
    };
  }
}
const originalFetch = global.fetch;
if (originalFetch) global.fetch = (input, ...rest) => {
  if (!allowed(new URL(typeof input === 'string' ? input : input.url).hostname)) throw new Error('Release test blocked external fetch');
  return originalFetch(input, ...rest);
};
