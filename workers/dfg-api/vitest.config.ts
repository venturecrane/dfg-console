import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['test/harness/**'],
        },
      },
      {
        test: {
          name: 'harness',
          globals: true,
          environment: 'node',
          include: ['test/harness/**/*.test.ts'],
        },
      },
    ],
  },
})
