import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    {
      name: 'copy-styles',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'src/styles.css'),
          resolve(__dirname, 'dist/styles.css')
        );
      }
    }
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GreyEditor',
      fileName: 'grey-editor',
      formats: ['es', 'iife']
    }
  }
});
