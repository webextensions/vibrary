import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The frontend lives in this folder and is built into the package-root `dist/`, which the Express server serves as
// static assets. During `npm run dev`, `/api` is proxied to a locally running `vibrary-server` (default port 3000).
// Vite config files are loaded by tooling that requires a default export.
// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
    root: import.meta.dirname,
    plugins: [react()],
    build: {
        outDir: '../dist',
        emptyOutDir: true
    },
    css: {
        modules: {
            // Export the camelCase alias for each kebab-case class name (`.spec-card` -> `styles.specCard`) so
            // components can reference scoped classes with dot access while the CSS keeps its kebab-case names.
            localsConvention: 'camelCaseOnly'
        }
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
