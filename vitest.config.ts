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
    include: ['**/*.spec.ts', '**/*.spec.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    passWithNoTests: true
  }
});
