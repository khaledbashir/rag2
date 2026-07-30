import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    // Next.js compiles with the automatic JSX runtime, so client components do
    // not import React. Align the test transform with it, otherwise any test
    // that renders one fails with "React is not defined".
    esbuild: { jsx: 'automatic' },
    test: {
        globals: true,
        environment: 'node',
        include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
        exclude: ['**/node_modules/**', '.next', 'scripts/**', 'services/rfp/__tests__/productCatalog.test.ts'],
        testTimeout: 30000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
