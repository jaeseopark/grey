import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GreyEditor',
      fileName: 'grey-editor',
      formats: ['es']
    },
    rollupOptions: {
      external: ['@grey/editor-core', '@grey/image-worker', '@grey/shared-types']
    }
  }
});
