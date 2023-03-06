/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  testSequencer: '<rootDir>/.jest/sequencer.js',
};