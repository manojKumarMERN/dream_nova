import path from 'node:path';
import { defineConfig } from 'vitest/config';

const packageNames = [
  'errors',
  'logging',
  'config',
  'spec',
  'contracts',
  'component-registry',
  'spec-validator',
  'proposal-model',
  'auth',
  'tenant',
  'db',
  'data-engine',
  'queue',
  'sdk',
  'ai-core',
  'backend-adapters',
  'runtime-core',
  'web-runtime',
  'editor-core'
] as const;

const alias = Object.fromEntries(
  packageNames.map((name) => [
    `@nova/${name}`,
    path.resolve(process.cwd(), 'packages', name, 'src', 'index.ts')
  ])
);

export default defineConfig({
  resolve: {
    alias
  },
  test: {
    environment: 'node',
    include: ['test/db/**/*.db.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: './test/db/global-setup.ts',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    passWithNoTests: false
  }
});
