import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' so the build works from any sub-path (GitHub Pages, Netlify, artifact hosting)
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { globals: true, environment: 'node', include: ['src/tests/**/*.test.ts'] },
});
