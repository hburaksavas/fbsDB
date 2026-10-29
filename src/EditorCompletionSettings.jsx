export function EditorCompletionSettings({ value, onChange, error, metadataStatus, vocabulary }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const toggle = (key, label, hint) => <label className="preference-toggle"><input type="checkbox" checked={value[key]} onChange={event => set(key, event.target.checked)} /><span>{label}</span>{hint && <small>{hint}</small>}</label>;
  const select = (key, label, options) => <label>{label}<select value={value[key]} onChange={event => set(key, event.target.value)}>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>;
  return <section className="editor-preferences" aria-label="SQL and PL/SQL completion settings">
    <div className="appearance-section-title">SQL & PL/SQL COMPLETION</div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {metadataStatus && <small role="status">{metadataStatus}</small>}
    {vocabulary && <small role="status">{vocabulary}</small>}
    {toggle('popup', 'Suggest while typing', 'Ctrl+Space always opens suggestions, including when automatic suggestions are off.')}
    {toggle('inline', 'Inline suggestions', 'Ghost text uses the same Oracle vocabulary and context as the suggestion list.')}
    <div className="preference-row">
      <label>Suggestion delay<select value={value.delay} onChange={event => set('delay', Number(event.target.value))}>{[100, 200, 400].map(delay => <option key={delay} value={delay}>{delay === 100 ? 'Fast' : delay === 200 ? 'Balanced' : 'Relaxed'}</option>)}{![100, 200, 400].includes(value.delay) && <option value={value.delay}>{value.delay} ms</option>}</select></label>
      {select('keywordCase', 'Keyword case', [['auto', 'Match file style'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['preserve', 'As typed']])}
    </div>
    <div className="preference-row">
      {select('oracleVersion', 'Oracle vocabulary', [['auto', 'Detect from connection'], ['19', 'Oracle 19c'], ['21', 'Oracle 21c'], ['23', 'Oracle 23ai'], ['26', 'Oracle 26ai']])}
      {select('schemaScope', 'Object scope', [['accessible', 'Accessible schemas'], ['current', 'Current schema']])}
    </div>
    <small>Enter accepts the highlighted suggestion while the list is open. Press Escape to dismiss it and then Enter for a new line.</small>
    {toggle('learning', 'Learn from my SQL usage', 'Object usage and acceptance counts stay on this device; SQL text and values are not stored by learning.')}
    <button className="button-secondary" onClick={() => window.dispatchEvent(new Event('fbsdb.resetSuggestionLearning'))}>Reset learned suggestions</button>
    {toggle('acceptTab', 'Accept suggestions with Tab')}
    {toggle('snippets', 'Show SQL and PL/SQL snippets')}
    {toggle('functionParentheses', 'Insert function parentheses')}
    {toggle('signatureHelp', 'Show function and procedure parameter hints')}
    <details className="completion-advanced"><summary>Advanced completion preferences</summary><div className="editor-preferences">
      <div className="preference-row">
        {select('qualification', 'Schema qualification', [['collision', 'When names conflict'], ['always', 'Always'], ['never', 'Never']])}
        {select('matchMode', 'Match names', [['prefix', 'Prefix and initials'], ['contains', 'Contains']])}
      </div>
      {toggle('recentFirst', 'Prefer recently accepted suggestions within the current context')}
      {toggle('generateAlias', 'Generate table aliases')}
      {toggle('fkJoins', 'Suggest JOIN conditions from verified foreign keys')}
      {toggle('systemPackages', 'Include accessible system packages while typing', 'System packages are also available through Ctrl+Space or a typed package prefix.')}
      {toggle('plscope', 'Enable PL/Scope reference lookup', 'Reads identifiers already collected by Oracle. It never changes compilation settings or compiles an object.')}
      <label className="preference-row"><span>Suggestion delay (ms)</span><input type="number" min="0" max="1000" value={value.delay} onChange={event => set('delay', Math.max(0, Math.min(1000, Number(event.target.value) || 0)))} /></label>
      <button className="button-secondary" onClick={() => window.dispatchEvent(new Event('fbsdb.refreshCompletionMetadata'))}>Refresh Oracle metadata</button>
    </div></details>
  </section>;
}
