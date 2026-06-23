import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The frontend lives in this folder and is built into the package-root `dist/`, which the Express server serves as
// static assets. During `npm run dev`, `/api` is proxied to a locally running `truths-server` (default port 3000).
export default defineConfig({
    root: import.meta.dirname,
    plugins: [react()],
    build: {
        outDir: '../dist',
        emptyOutDir: true
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
