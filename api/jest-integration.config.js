/** @type {import('jest').Config} */
/** Pruebas contra PostgreSQL real (DATABASE_URL). Ver `npm run test:integration`. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  setupFiles: ['<rootDir>/test/integration/load-env.ts'],
  testMatch: ['<rootDir>/test/integration/**/*.int.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 60000,
};
