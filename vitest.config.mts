import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: ['features/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.keystone/**'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Database suites share one scratch schema; run files one at a time.
    fileParallelism: false,
  },
})
