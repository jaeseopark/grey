import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@grey/editor-ui': resolve(__dirname, '../../packages/editor-ui/src/index.ts'),
      '@grey/editor-core': resolve(__dirname, '../../packages/editor-core/src/index.ts'),
      '@grey/image-worker': resolve(__dirname, '../../packages/image-worker/src/index.ts'),
      '@grey/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts')
    }
  }
});
