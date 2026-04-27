import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // The workspace package ships its compiled dist via `tsup`, but no
      // `prepare` script builds it on install. Resolve the source directly
      // so tests don't depend on a prior `npm run build` in the package.
      '@dfg/money-math': resolve(__dirname, '../../packages/dfg-money-math/src/index.ts'),
    },
  },
})
