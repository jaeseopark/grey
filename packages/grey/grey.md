# grey

`grey` is the React component wrapper for the Grey image editor. It renders a `<div>` container and mounts the editor into it via `@grey/editor-ui`. The component itself ships with **no default CSS** — the host application supplies the stylesheet.

## Installation

```sh
npm install grey @grey/editor-ui
```

> **Peer dependencies:** both `@grey/editor-ui` and `react` / `react-dom` are declared as peer dependencies and must be installed alongside `grey`.

## Usage

### Basic

```tsx
import Grey from 'grey';
import '@grey/editor-ui/styles.css'; // optional: use the built-in default styles

const MyPage = () => (
  <div style={{ height: '780px' }}>
    <Grey />
  </div>
);
```

The component stretches to fill whatever container it is placed in. The host application is responsible for setting the container's dimensions.

### With options

```tsx
import Grey from 'grey';

const MyPage = () => (
  <Grey allowFolders={true} maxParallelDecodes={2} />
);
```

## Props (`GreyProps`)

| Prop | Type | Default | Description |
|---|---|---|---|
| `allowFolders` | `boolean` | `true` | Whether to show the folder-open button in the toolbar |
| `maxParallelDecodes` | `number` | `2` | Max concurrent file decode operations during batch open |

## Styling

The component renders an unstyled `<div>` wrapper. All visual CSS lives in `@grey/editor-ui/styles.css`. To use the default appearance:

```ts
import '@grey/editor-ui/styles.css';
```

To provide fully custom styles, write CSS rules targeting the `.grey-editor` class and its descendant BEM classes (e.g. `.grey-editor__toolbar`, `.grey-editor__canvas`, etc.) without importing `@grey/editor-ui/styles.css`.

## Implementation

`packages/grey/src/Grey.tsx` uses `useEffect` to call `createGreyEditor` once the container `<div>` is mounted, and calls `editor.destroy()` on unmount. The editor instance is stored in a `useRef` so it survives renders without re-initializing.
