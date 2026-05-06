import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@grey/editor-ui/styles.css', replacement: resolve(__dirname, '../../packages/editor-ui/src/styles.css') },
      { find: '@grey/editor-ui', replacement: resolve(__dirname, '../../packages/editor-ui/src/index.ts') },
      { find: '@grey/editor-core', replacement: resolve(__dirname, '../../packages/editor-core/src/index.ts') },
      { find: '@grey/image-worker', replacement: resolve(__dirname, '../../packages/image-worker/src/index.ts') },
      { find: '@grey/shared-types', replacement: resolve(__dirname, '../../packages/shared-types/src/index.ts') }
    ]
  },
  test: {
    exclude: ['**/node_modules/**', 'e2e/**']
  }
});
