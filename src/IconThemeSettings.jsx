import {useRef,useState} from 'react';
import {addIconPack,builtInIconThemes,packThemeId,parseIconPack,saveIconPacks} from './iconTheme';
import {ThemedIcon} from './ThemedIcon';
import {OracleObjectIcon} from './OracleObjectIcon';

// Chooses a built-in icon theme or an imported pack. Packs hold SVG path data only and are stored on this computer.
export function IconThemeSettings({value, packs, onChange, onPacksChange, readOnly}) {
  const [message, setMessage] = useState(''), [error, setError] = useState(''), file = useRef(null);
  const importText = text => {
    const result = parseIconPack(text);
    if (result.error) { setError(result.error); setMessage(''); return; }
    const next = addIconPack(packs, result.pack);
    saveIconPacks(localStorage, next); onPacksChange(next); onChange(packThemeId(result.pack.name));
    setError(''); setMessage(`Imported “${result.pack.name}” with ${Object.keys(result.pack.icons).length} icons.${result.rejected.length ? ` Skipped: ${result.rejected.join('; ')}.` : ''}`);
  };
  return <section className="icon-theme-settings" aria-label="Icon theme">
    <h4>Icon theme</h4>
    <label>Theme<select aria-label="Icon theme" disabled={readOnly} value={value} onChange={event => onChange(event.target.value)}>
      {builtInIconThemes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      {packs.map(pack => <option key={pack.name} value={packThemeId(pack.name)}>{`Imported: ${pack.name}`}</option>)}
    </select></label>
    <div className="icon-theme-preview" aria-label="Icon preview">
      {['TABLE', 'VIEW', 'PACKAGE', 'PROCEDURE', 'TRIGGER'].map(type => <span key={type} title={type}><OracleObjectIcon type={type} size={16}/></span>)}
      <span title="File"><ThemedIcon slot="FILE" size={16}/></span><span title="Folder"><ThemedIcon slot="FOLDER" size={16}/></span>
    </div>
    <div className="icon-theme-actions">
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Import icon pack file" onChange={async event => { const chosen = event.target.files?.[0]; event.target.value = ''; if (!chosen) return; if (chosen.size > 100000) { setError('The icon pack is larger than 100 KB.'); return; } importText(await chosen.text()); }}/>
      <button type="button" disabled={readOnly} onClick={() => file.current?.click()}>Import icon pack…</button>
      {value.startsWith('pack:') && <button type="button" disabled={readOnly} onClick={() => { const name = value.slice(5), next = packs.filter(pack => pack.name !== name); saveIconPacks(localStorage, next); onPacksChange(next); onChange('default'); setMessage(`Removed “${name}”.`); }}>Remove this pack</button>}
    </div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <small>Packs are JSON: {'{"version":1,"name":"My pack","icons":{"TABLE":"M3 3h18v18H3z"}}'} with SVG path data on a 24×24 grid. Only path data is accepted.</small>
  </section>;
}
