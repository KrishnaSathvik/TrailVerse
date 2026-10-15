const bypass = require('../mcpBypass');
const previous = process.env.MCP_BYPASS_KEY;
afterEach(() => {
  if (previous === undefined) delete process.env.MCP_BYPASS_KEY;
  else process.env.MCP_BYPASS_KEY = previous;
});
test.each([
  ['shared-secret', true], ['wrong-secret!', false], ['é'.repeat(13), false], [undefined, false], [['shared-secret'], false],
])('only the exact shared key establishes trust (%j)', (presented, trusted) => {
  process.env.MCP_BYPASS_KEY = 'shared-secret';
  const req = { headers: { 'x-trailverse-mcp-key': presented } };
  const next = jest.fn();
  expect(() => bypass(req, {}, next)).not.toThrow();
  expect(Boolean(req.isTrustedMcp)).toBe(trusted);
  expect(Boolean(req.skipAnonymousRateLimit)).toBe(trusted);
  expect(next).toHaveBeenCalledTimes(1);
});
test('missing backend secret fails closed', () => {
  delete process.env.MCP_BYPASS_KEY;
  const req = { headers: { 'x-trailverse-mcp-key': 'shared-secret' } };
  bypass(req, {}, () => {});
  expect(req.isTrustedMcp).toBeUndefined();
});
