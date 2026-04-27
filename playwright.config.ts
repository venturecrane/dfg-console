/**
 * Playwright config for dfg-console.
 *
 * Auth bootstrap: see playwright/auth.setup.ts and docs/runbooks/clerk-playwright-auth-setup.md
 * (in crane-console) for the rationale. The `setup-clerk` project runs once per suite,
 * captures a Clerk session via the Backend API, and writes it to `playwright/.clerk/user.json`.
 * Authenticated browser projects load that storageState; public projects skip it.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',

  projects: [
    // 1. Auth setup — runs once before authenticated projects
    {
      name: 'setup-clerk',
      testMatch: /auth\.setup\.ts/,
    },

    // 2. Authenticated projects — reuse the captured storageState
    {
      name: 'chromium-authed',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
      dependencies: ['setup-clerk'],
    },

    // 3. Unauthenticated projects — no storageState, no dependency
    {
      name: 'chromium-public',
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev --workspace apps/dfg-app',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
  },
})
