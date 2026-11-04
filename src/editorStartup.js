const STARTUP_BUDGET_MS = 3000;

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

// Resolves once the mounted editor can be shown as finished: SQL colors loaded,
// fonts applied and the result painted. The splash stays up until then. It never
// rejects and is time-limited, because nothing here may keep the splash up forever.
export function editorPresentable(monaco, budgetMs = STARTUP_BUDGET_MS) {
  const ready = Promise.all([monaco.editor.colorize('SELECT 1 FROM dual', 'sql', {}), document.fonts?.ready]).then(nextPaint);
  const budget = new Promise(resolve => setTimeout(resolve, budgetMs));
  return Promise.race([ready, budget]).catch(() => {});
}
