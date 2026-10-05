import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: [
      'tests/**',
      'node_modules/**',
      '.next/**',
      // Isolated-eval spawn suites need Mongo 127.0.0.1:27018.
      // Keep in-tree; run with `npm run test:eval-isolated`.
      'src/__tests__/integration/stage14_7f*.test.js',
      'src/__tests__/integration/stage14_7g*.test.js',
      'src/__tests__/integration/stage14_7p*.test.js',
      'src/__tests__/integration/stage14_7r*.test.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/**',
        'src/setupTests.js',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@components': resolve(import.meta.dirname, './src/components'),
      '@context': resolve(import.meta.dirname, './src/context'),
      '@hooks': resolve(import.meta.dirname, './src/hooks'),
      '@lib': resolve(import.meta.dirname, './src/lib'),
      '@services': resolve(import.meta.dirname, './src/services'),
      '@utils': resolve(import.meta.dirname, './src/utils'),
    },
  },
});
