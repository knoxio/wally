import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  publicDir: '../../public',
  build: { outDir: '../../dist', emptyOutDir: true },
});
