module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  setupFiles: ['<rootDir>/tests/providerDisabledBootstrap.js', '<rootDir>/tests/capturedFixturesBootstrap.js'],
  moduleNameMapper: { '^.*artifacts/(trailie-zion-exposure-live-2026-09-25/.*\\.json)$': '<rootDir>/tests/fixtures/captured/$1' },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/src/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '\\.live\\.(test|spec)\\.js$',
    '[/\\\\]live[/\\\\]',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/**',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true
};
