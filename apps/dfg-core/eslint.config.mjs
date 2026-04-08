// Next.js 16 removed `next lint` (the wrapper around eslint v8). This file
// replaces the old `apps/dfg-core/.eslintrc.json` with the official Next.js 16
// flat-config setup.
//
// Reference: https://nextjs.org/docs/app/api-reference/config/eslint
// Source: vercel/next.js docs/01-app/03-api-reference/05-config/03-eslint.mdx
//
// The shape below matches the "Setup ESLint" main section of those docs verbatim.
// dfg-core's previous .eslintrc.json had no rule overrides, so this is the
// minimal canonical config.

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    // Default ignores of eslint-config-next.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
