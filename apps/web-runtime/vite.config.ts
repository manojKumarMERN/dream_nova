import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@nova/sdk',
      '@nova/spec',
      '@nova/spec-validator',
      '@nova/contracts',
      '@nova/component-registry',
      '@nova/runtime-core',
      '@nova/web-runtime',
      '@nova/errors',
      '@nova/proposal-model'
    ]
  },
  server: {
    port: 5174
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages[\\/].*[\\/]dist/]
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true
  }
});
