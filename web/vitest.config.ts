import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            include: ['src/actions/**', 'src/lib/**', 'src/app/api/**'],
            exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__tests__/**'],
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 60,
            },
        },
        // Group tests by file — keeps concurrency-test output clean
        pool: 'threads',
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
