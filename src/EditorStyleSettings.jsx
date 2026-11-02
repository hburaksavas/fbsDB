import {resolveSetting,changeSetting,settingDefinitions} from './settingsModel.js';
export function EditorStyleSettings({settings,onChange,...props}) {
  const value=id=>resolveSetting(settings,id).value;
  const update=(id,next)=>onChange(changeSetting(settings,id,next));
  const select=(id,label,options)=> <label>{label}<select aria-label={label} disabled={settings.readOnly} value={value(id)} onChange={e=>update(id,typeof settingDefinitions[id].default==='number'?Number(e.target.value):e.target.value)}>{options.map(option=><option key={String(option)} value={option}>{option}</option>)}</select></label>;
  return <section {...props} className="editor-style-settings">
    <div className="editor-settings-fields">
      {select('editor.fontFamily','Font family',settingDefinitions['editor.fontFamily'].choices)}
      {['editor.fontSize','editor.lineHeight'].map(id=><label key={id}>{id==='editor.fontSize'?'Font size':'Line height'}<input aria-label={id==='editor.fontSize'?'Editor font size':'Editor line height'} type="number" min={settingDefinitions[id].min} max={settingDefinitions[id].max} disabled={settings.readOnly} value={value(id)} onChange={e=>update(id,Math.max(settingDefinitions[id].min,Math.min(settingDefinitions[id].max,Number(e.target.value)||settingDefinitions[id].default)))}/></label>)}
      {select('editor.tabSize','Indent size',[2,4,8])}
      {select('editor.cursorStyle','Cursor style',['line','block','underline'])}
      {select('editor.cursorBlinking','Cursor blinking',['smooth','blink','solid'])}
    </div>
    <p>Semantic highlighting resolves parameters, local variables, columns/record fields and members in the visible source range. Unresolved symbols retain syntax colors. Limit: 100,000 source characters, 2,000 identifiers and 64 metadata resolutions per range.</p>
    <div className="editor-settings-toggles">{[['semanticHighlighting','Semantic symbol highlighting'],['overviewRuler','Editor overview ruler'],['stickyHeaders','Sticky code headers'],['insertSpaces','Indent with spaces'],['lineNumbers','Line numbers'],['lineHighlight','Current line highlight'],['indentGuides','Indent guides'],['whitespace','Visible whitespace'],['wordWrap','Word wrap'],['minimap','Minimap'],['folding','Code folding'],['bracketColors','Bracket colors']].map(([id,label])=><label key={id}><input type="checkbox" disabled={settings.readOnly} checked={value('editor.'+id)} onChange={e=>update('editor.'+id,e.target.checked)}/>{label}</label>)}</div>
  </section>;
}
