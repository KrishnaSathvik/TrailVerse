'use strict';

// Test-only filesystem boundary: never materialize historical acceptance records
// in artifacts/private, where a live evaluator could mistake them for evidence.
// Only enumerated reads are redirected. Missing/unknown paths still fail normally.
jest.mock('fs', () => {
  const fs = jest.requireActual('fs');
  const path = jest.requireActual('path');
  const root = path.resolve(__dirname, '../..');
  const fixtures = path.join(__dirname, 'fixtures/captured');
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtures, 'manifest.json'), 'utf8'));
  const mapped = file => {
    if (typeof file !== 'string') return file;
    const entry = manifest[path.relative(root, path.resolve(file)).split(path.sep).join('/')];
    return entry ? path.join(fixtures, entry) : file;
  };
  return {
    ...fs,
    readFileSync: (file, ...args) => fs.readFileSync(mapped(file), ...args),
    existsSync: file => fs.existsSync(mapped(file)),
  };
});
