import {Feedback} from './Feedback';
export function EditorCompletionSettings({ value, onChange, error, disabled }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const toggle = (key, label, hint) => <label className="preference-toggle"><input type="checkbox" checked={value[key]} onChange={event => set(key, event.target.checked)} /><span>{label}</span>{hint && <small>{hint}</small>}</label>;
  const select = (key, label, options) => <label>{label}<select aria-label={label} value={value[key]} onChange={event => set(key, typeof options[0][0]==='number'?Number(event.target.value):event.target.value)}>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>;
  return <section className="completion-settings" aria-label="SQL and PL/SQL completion settings">

    <fieldset disabled={disabled}>
      <legend>Suggestions</legend>
      <div className="editor-settings-toggles">
        {toggle('popup', 'Suggest while typing')}
        {toggle('inline', 'Inline suggestions')}
        {toggle('acceptEnter', 'Accept with Enter')}
        {toggle('acceptTab', 'Accept with Tab')}
      </div>
      <div className="editor-settings-fields">
        <label>Delay (ms)<input aria-label="Suggestion delay (ms)" type="number" min="0" max="1000" step="50" value={value.delay} onChange={event=>set('delay',Math.max(0,Math.min(1000,Number(event.target.value)||0)))}/></label>
        {select('minCharacters', 'Minimum characters', [0,1,2,3,4].map(n=>[n,n===0?'Contextual':String(n)]))}
        {select('maxSuggestions', 'Suggestion limit', [50,100,200,300].map(n=>[n,String(n)]))}
        {select('matchMode', 'Match names', [['prefix', 'Prefix and initials'], ['contains', 'Contains']])}
      </div>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Sources</legend>
      <div className="editor-settings-toggles">
        {toggle('showKeywords', 'SQL / PL/SQL keywords')}
        {toggle('showFunctions', 'Functions / procedures')}
        {toggle('showColumns', 'Columns / record fields')}
        {toggle('snippets', 'SQL / PL/SQL snippets')}
        {toggle('systemPackages', 'System packages')}
        {toggle('signatureHelp', 'Parameter hints')}
      </div>
      <div className="editor-settings-fields">
        {select('oracleVersion', 'Oracle vocabulary', [['auto', 'Detect from connection'], ['19', 'Oracle 19c'], ['21', 'Oracle 21c'], ['23', 'Oracle 23ai'], ['26', 'Oracle 26ai']])}
        {select('schemaScope', 'Object scope', [['accessible', 'Accessible schemas'], ['current', 'Current schema']])}
      </div>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Insertion</legend>
      <div className="editor-settings-fields">
        {select('keywordCase', 'Keyword case', [['auto', 'Match file style'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['preserve', 'As typed']])}
        {select('qualification', 'Schema qualification', [['collision', 'When names conflict'], ['always', 'Always'], ['never', 'Never']])}
      </div>
      <div className="editor-settings-toggles">
        {toggle('functionParentheses', 'Function parentheses')}
        {toggle('generateAlias', 'Table aliases')}
        {toggle('fkJoins', 'Foreign-key JOINs')}
        {toggle('plscope', 'PL/Scope references')}
      </div>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Ranking</legend>
      <div className="editor-settings-toggles">
        {toggle('learning', 'Learn from usage')}
        {toggle('recentFirst', 'Prefer recent suggestions')}
      </div>
      <div className="completion-actions">
        <button type="button" onClick={()=>window.dispatchEvent(new Event('fbsdb.resetSuggestionLearning'))}>Reset learning</button>
        <button type="button" onClick={()=>window.dispatchEvent(new Event('fbsdb.refreshCompletionMetadata'))}>Refresh metadata</button>
      </div>
    </fieldset>
  </section>;
}
