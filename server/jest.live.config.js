'use strict';

const base = require('./jest.config');

module.exports = {
  ...base,
  setupFiles: ['<rootDir>/tests/liveAuthorizationBootstrap.js'],
  testMatch: [
    '<rootDir>/tests/**/*.live.test.js',
    '<rootDir>/tests/**/*.live.spec.js',
    '<rootDir>/tests/**/live/**/*.test.js',
    '<rootDir>/src/**/*.live.test.js',
    '<rootDir>/src/**/*.live.spec.js',
    '<rootDir>/src/**/live/**/*.test.js',
  ],
  testPathIgnorePatterns: [],
};

