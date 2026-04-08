// Next.js 16 removed `next lint` (the wrapper around eslint v8). This file
// replaces the old `apps/dfg-app/.eslintrc.json` with the official Next.js 16
// flat-config setup.
//
// Reference: https://nextjs.org/docs/app/api-reference/config/eslint
// Source: vercel/next.js docs/01-app/03-api-reference/05-config/03-eslint.mdx
//
// The shape below matches the "Setup ESLint" main section of those docs verbatim,
// with the rule override from the previous .eslintrc.json preserved.

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // Preserved from the previous .eslintrc.json. The dfg-app codebase
      // intentionally uses `any` in a handful of generic-prop wrapper helpers
      // and we don't want lint to block over them.
      '@typescript-eslint/no-explicit-any': 'off',

      // Migration-preservation: this rule was added in eslint-plugin-react-hooks
      // v6+ and is enforced as an error by the latest eslint-config-next. The
      // OLD `next lint` (Next.js 15 and earlier) was bundled with an older
      // plugin that did not enforce it. To keep this PR a behavior-preserving
      // migration (no new violations introduced by the config change), we
      // downgrade the new rule to a warning so editors still surface it but
      // CI doesn't block.
      //
      // Follow-up: a separate issue will sweep all `setState`-in-effect call
      // sites in dfg-app, evaluate each, and either refactor or add an
      // inline disable with per-call-site justification. THEN this rule
      // can be promoted back to error.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
