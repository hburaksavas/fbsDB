import {useMemo,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {filterSections,orderSections,shortcutSections} from './shortcutMap';

// Every shortcut in one searchable list, the section for where the keyboard was first.
export function ShortcutMapDialog({shortcuts,context='general',onClose}) {
  const [query,setQuery]=useState('');
  const sections=useMemo(()=>filterSections(orderSections(shortcutSections(shortcuts),context),query),[shortcuts,context,query]);
  return <ModalBackdrop onClose={onClose} onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="appearance-modal shortcut-map" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <header className="appearance-header"><div><div className="eyebrow">KEYBOARD</div><h2>Keyboard shortcuts</h2><p>Editor shortcuts show your own bindings. Change them in Settings.</p></div></header>
      <input type="search" aria-label="Filter shortcuts" placeholder="Filter by action or key…" value={query} onChange={event=>setQuery(event.target.value)}/>
      <div className="shortcut-map-body">
        {sections.map(section=><section key={section.id} aria-label={section.title} data-section={section.id}><h3>{section.title}</h3><ul>{section.items.map(item=><li key={item.label}><span>{item.label}</span><kbd>{item.keys}</kbd></li>)}</ul></section>)}
        {!sections.length&&<p role="status">No shortcut matches “{query}”.</p>}
      </div>
      <footer className="appearance-footer"><button className="button-primary" onClick={onClose}>Close</button></footer>
    </section>
  </ModalBackdrop>;
}
