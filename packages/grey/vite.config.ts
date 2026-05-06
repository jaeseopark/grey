import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Grey',
      fileName: 'grey',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', '@grey/editor-ui']
    }
  }
});
