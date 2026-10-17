const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
test('known captures are test fixtures without installing live acceptance evidence', () => {
  const target = path.join(root, 'artifacts/private/stage14_7-three-day-adjudication.json');
  expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toBeTruthy();
  expect(jest.requireActual('fs').existsSync(target)).toBe(false);
});
test('missing capture remains an error, never fabricated evidence', () => {
  expect(() => fs.readFileSync(path.join(root, 'artifacts/private/not-a-fixture.json'))).toThrow();
});
