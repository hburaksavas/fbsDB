import {SavedLayouts} from './SavedLayouts.jsx';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PANEL_IDS, PANEL_LABELS } from './dockLayout';
import { resolveSetting } from './settingsModel';
import { isNativeHost } from './nativeBridge';
import {translate as t} from './localeProfile';

export function ViewMenu({ settings, layout, onSetting, onLayout, onPanel, focusMode, onFocusMode, onResults, onReset, onSettings, onCloseDetails,language='en',resultOptions={},canPreviewResult=false,onResultAppearance,onApplyLayout }) {
  const [open, setOpen] = useState(false), [category, setCategory] = useState('Panels'), root = useRef(null), opener = useRef(null), previousFocus = useRef(null);
  const [quickNull,setQuickNull]=useState(null);
  useEffect(()=>{if(open)setQuickNull(null)},[open]);
  const value = id => resolveSetting(settings, id).value;
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (event.type === 'keydown') { if (event.key !== 'Escape' || document.querySelector('.modal-backdrop')) return; event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); (previousFocus.current?.isConnected ? previousFocus.current : opener.current)?.focus(); }
      else if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss, true); };
  }, [open]);
  const toggle = (label, checked, action) => <button className="view-toggle" role="menuitemcheckbox" aria-checked={checked} onClick={action}><span className="view-check">{checked && <Check size={12}/>}</span>{t(label,language)}</button>;
  const field = (label, id, choices,ariaLabel=label) => <label className="view-field">{t(label,language)}<select aria-label={t(ariaLabel,language)} disabled={settings.readOnly||id === 'ui.scale' && !isNativeHost} title={id === 'ui.scale' && !isNativeHost ? t('Available in the desktop app',language) : undefined} value={id === 'ui.scale' && !isNativeHost ? 100 : value(id)} onChange={event => onSetting(id, typeof choices[0] === 'number' ? Number(event.target.value) : event.target.value)}>{choices.map(option => <option key={option} value={option}>{id === 'ui.scale' ? `${option}%` : t(String(option),language)}</option>)}</select></label>;
  const run = action => { setOpen(false); action(); };
  return <div className="ide-view-menu" ref={root}><button ref={opener} className={open ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onPointerDown={() => { previousFocus.current = document.activeElement; }} onClick={() => setOpen(current => !current)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); previousFocus.current = document.activeElement; setOpen(true); requestAnimationFrame(() => root.current?.querySelector('[role="menuitemcheckbox"], [role="menuitem"]')?.focus()); } }}>{t('View',language)}</button>
    {open && <div className="view-popover" role="menu" aria-label={t('View',language)} onKeyDown={event => { if (!['ArrowDown', 'ArrowUp'].includes(event.key) || ['INPUT', 'SELECT'].includes(event.target.tagName)) return; event.preventDefault(); const entries = [...root.current.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')], index = entries.indexOf(document.activeElement); entries[(index + (event.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length]?.focus(); }}>
      <div className="view-categories" role="tablist" aria-label={t('View categories',language)}>{['Panels', 'Quick', 'Editor', 'Appearance', 'Layout'].map(name => <button key={name} role="tab" aria-selected={category === name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{t(name,language)}</button>)}</div>
      <div className="view-category-content">
        {category === 'Panels' && <>
          {toggle('Explorer panels', layout.visible && layout.hidden.length < PANEL_IDS.length && !focusMode, () => { const visible = !layout.visible || layout.hidden.length === PANEL_IDS.length || focusMode; onFocusMode(false); onLayout({ ...layout, visible, hidden: visible && layout.hidden.length === PANEL_IDS.length ? [] : layout.hidden }); })}<hr/>
          {PANEL_IDS.map(panel => <div key={panel}>{toggle(PANEL_LABELS[panel], layout.visible && !focusMode && !layout.hidden.includes(panel), () => { if (layout.visible && !focusMode && !layout.hidden.includes(panel)) onLayout({ ...layout, hidden: [...layout.hidden, panel] }); else onPanel(panel); })}</div>)}<hr/>
          {['Results', 'Output', 'Explain', 'Problems'].map(name => <button key={name} role="menuitem" onClick={() => run(() => onResults(name))}>{name === 'Explain' ? t('Explain Plan',language) : t(name,language)}</button>)}
          {toggle('Minimize bottom panel', layout.resultsCollapsed || focusMode, () => { onFocusMode(false); onLayout({ ...layout, resultsCollapsed: !(layout.resultsCollapsed || focusMode) }); })}
          <button role="menuitem" onClick={() => run(onCloseDetails)}>Close detail panes</button>
        </>}
        {category==='Quick'&&<>
          <p className="view-description">Preview the current editor and selected result. Density also updates trees and toolbars.</p>
          {field('Font size','editor.fontSize',[10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],'Quick editor font size')}
          <label className="view-field">Line height<input aria-label="Quick editor line height" type="number" min={16} max={48} value={value('editor.lineHeight')} disabled={settings.readOnly} onChange={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=16&&next<=48)onSetting('editor.lineHeight',next)}}/></label>
          {field('Density','ui.density',['compact','comfortable'],'Quick workbench density')}
          <label className="view-field">NULL display text<input aria-label="Quick NULL display text" maxLength={30} disabled={settings.readOnly||!canPreviewResult} value={quickNull??resultOptions.nullLabel??value('results.nullLabel')} onChange={event=>{const text=event.target.value;setQuickNull(text);onSetting('results.nullLabel',text);onResultAppearance?.({nullLabel:text})}}/></label>
        </>}
        {category === 'Editor' && <>
          {field('Font family', 'editor.fontFamily', ['Cascadia Code', 'Consolas', 'JetBrains Mono', 'Courier New'])}
          {field('Font size', 'editor.fontSize', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])}
          <label className="view-field">Line height<input aria-label="Editor line height" type="number" min={16} max={48} value={value('editor.lineHeight')} onChange={event => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 16 && next <= 48) onSetting('editor.lineHeight', next); }}/></label><hr/>
          {[['Semantic symbol highlighting','editor.semanticHighlighting'],['Editor overview ruler','editor.overviewRuler'],['Sticky code headers','editor.stickyHeaders'],['Line numbers', 'editor.lineNumbers'], ['Minimap', 'editor.minimap'], ['Indentation guides', 'editor.indentGuides'], ['Visible whitespace', 'editor.whitespace'], ['Current line highlight', 'editor.lineHighlight'], ['Word wrap', 'editor.wordWrap']].map(([label, id]) => <div key={id}>{toggle(label, value(id), () => onSetting(id, !value(id)))}</div>)}
        </>}
        {category === 'Appearance' && <>
          {field('Theme', 'ui.theme', ['default', 'dark', 'light'])}
          {field('Density', 'ui.density', ['compact', 'comfortable'])}
          {field('Interface scale', 'ui.scale', [80, 90, 100, 110, 125, 150])}
          <button role="menuitem" disabled={!isNativeHost} onClick={() => onSetting('ui.scale', 100)}>Reset scale to 100%</button><hr/>
          <button role="menuitem" onClick={() => run(onSettings)}>Customize SQL colors…</button>
        </>}
        {category === 'Layout' && <>
          <SavedLayouts saved={value('ui.savedLayouts')} layout={layout} focus={focusMode} onSave={saved=>onSetting('ui.savedLayouts',saved)} onApply={onApplyLayout} readOnly={settings.readOnly}/>
          {toggle('Lock panel layout',!!layout.locked,()=>onLayout({...layout,locked:!layout.locked}))}
          {toggle('Editor focus mode', focusMode, () => onFocusMode(!focusMode))}
          <p className="view-description">Drag panels to the position you want. Edges create splits; headings group panels as tabs.</p>
          <button role="menuitem" onClick={() => run(onReset)}>Reset Panel Layout</button>
        </>}
      </div>
    </div>}
  </div>;
}
