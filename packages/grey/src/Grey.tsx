import { useEffect, useRef } from 'react';
import { createGreyEditor } from '@grey/editor-ui';
import type { CreateGreyEditorOptions, GreyEditorInstance } from '@grey/editor-ui';

export type GreyProps = Omit<CreateGreyEditorOptions, 'target'>;

// The editor is initialized once on mount. Props such as allowFolders and
// maxParallelDecodes are passed at creation time and are not reactive —
// changing them after mount has no effect without unmounting and remounting
// the component.
export default function Grey({ allowFolders, maxParallelDecodes }: GreyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GreyEditorInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options: CreateGreyEditorOptions = { target: container };
    if (allowFolders !== undefined) options.allowFolders = allowFolders;
    if (maxParallelDecodes !== undefined) options.maxParallelDecodes = maxParallelDecodes;

    editorRef.current = createGreyEditor(options);

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  // Props are read once at mount time; the editor does not support
  // reconfiguration after initialization.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} />;
}
