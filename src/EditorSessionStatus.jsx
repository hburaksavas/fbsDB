import { useEffect, useState } from 'react';

export function EditorSessionStatus({ editor, tabId, connection, startedAt, ...state }) {
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  useEffect(() => {
    if (!editor) return;
    setPosition(editor.getPosition() || { lineNumber: 1, column: 1 });
    const listener = editor.onDidChangeCursorPosition(event => setPosition(event.position));
    return () => listener.dispose();
  }, [editor, tabId]);
  return <>
    {state.executionTarget&&<span className="execution-target-status" role="status">{state.executing?'Running':'SQL target'}: {state.executionTarget}</span>}
    <span className="editor-position">Ln {position.lineNumber}, Col {position.column}</span>
  </>;
}
