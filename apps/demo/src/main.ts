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
