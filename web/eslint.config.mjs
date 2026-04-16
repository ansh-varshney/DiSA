import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,

    // ── Ignores ────────────────────────────────────────────────────────────────
    globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),

    // ── Source-level rules ─────────────────────────────────────────────────────
    {
        rules: {
            // Downgraded to warn: existing Supabase query results use `any` extensively.
            // Gradually replace with generated Supabase types (run `supabase gen types`).
            '@typescript-eslint/no-explicit-any': 'warn',
            // Catch let variables that are never reassigned
            'prefer-const': 'error',
            // Warn on genuinely unused imports/variables (prefix with _ to suppress)
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },

    // ── Test file overrides ────────────────────────────────────────────────────
    // Mocks and test helpers need `any` extensively — downgrade to warn
    {
        files: [
            'src/__tests__/**/*.{ts,tsx}',
            '**/*.test.{ts,tsx}',
            '**/*.spec.{ts,tsx}',
            'vitest.setup.ts',
            'vitest.config.ts',
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
        },
    },

    // ── Prettier — must be last to disable conflicting format rules ────────────
    prettier,
])

export default eslintConfig
