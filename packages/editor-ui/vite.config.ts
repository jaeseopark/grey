import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [cssInjectedByJsPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GreyEditor',
      fileName: 'grey-editor',
      formats: ['es', 'iife']
    }
  }
});
