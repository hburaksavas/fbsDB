import {editorToolItems,resultToolItems,normalizeToolbarPrefs,toggleToolbarItem} from './toolbarPrefs';

// Editor and result actions live on separate rows; unchecked actions move to that row's overflow menu, never disappear.
export function ToolbarSettings({prefs,readOnly,onChange}) {
  const current=normalizeToolbarPrefs(prefs);
  const group=(bar,title,items)=><fieldset className="toolbar-settings-group"><legend>{title}</legend>{items.map(item=><label key={item.id}><input type="checkbox" aria-label={`${title}: ${item.label}`} disabled={readOnly||item.fixed} checked={item.fixed||!current[bar].includes(item.id)} onChange={()=>onChange(toggleToolbarItem(current,bar,item.id))}/>{item.label}</label>)}</fieldset>;
  return <section className="toolbar-settings" aria-label="Toolbars"><h4>Toolbars</h4><p>Unchecked actions move to the overflow menu of that toolbar.</p><div className="toolbar-settings-columns">{group('editor','Editor toolbar',editorToolItems)}{group('result','Result toolbar',resultToolItems)}</div></section>;
}
