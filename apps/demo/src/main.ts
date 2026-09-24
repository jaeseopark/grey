import { createGreyEditor } from '@grey/editor-ui';
import '@grey/editor-ui/styles.css';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app container.');
}

app.innerHTML = `
  <main class="demo-shell">
    <section class="demo-hero">
      <p class="demo-eyebrow">Grey</p>
      <h1>Scanner cleanup in the browser.</h1>
      <p class="demo-copy">
        Open a batch of scans, rotate them with proper padding, crop repeatedly, switch color space,
        and export optimized files without leaving the browser.
      </p>
    </section>
    <section class="demo-editor-panel">
      <div id="grey-editor"></div>
    </section>
  </main>
`;

createGreyEditor({
  target: '#grey-editor',
  allowFolders: true,
  maxParallelDecodes: 2
});
