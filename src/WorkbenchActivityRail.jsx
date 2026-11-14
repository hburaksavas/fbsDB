// The activity rail at the left edge of the workbench. App calls this inside its return; see docs/architecture.md.
import { Braces, Code2, Database, History, Search, Settings2 } from "lucide-react";

export function renderActivityRail(ctx) {
  const {
    focusMode, setFocusMode, setPaletteMode, setShowAppearance, setShowHistory, setShowSearch, setShowSnippets, setSidebarOpen,
    setSnippetFilter, sidebarOpen
  } = ctx;
  return <aside className="activity-rail"><button className={`rail-button explorer-rail-toggle${sidebarOpen && !focusMode ? " selected" : ""}`} title={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-label={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-pressed={sidebarOpen && !focusMode} onClick={() => {if(focusMode){setFocusMode(false);setSidebarOpen(true)}else setSidebarOpen(open=>!open)}}><Database size={18} /></button><button className="rail-button" title="Search workbench (Ctrl+P)" aria-label="Search workbench" onClick={() => setPaletteMode("files")}><Search size={18} /></button><button className="rail-button" title="History" aria-label="History" onClick={() => { setShowHistory(true); setShowSearch(false); }}><History size={18} /></button><button className="rail-button" title="SQL snippets" aria-label="SQL snippets" onClick={() => { setSnippetFilter(""); setShowSnippets(true); }}><Braces size={18} /></button><div className="rail-spacer" /><button className={`rail-button${focusMode?" selected":""}`} title="Editor focus mode (Ctrl+Alt+Z)" aria-label="Editor focus mode" aria-pressed={focusMode} onClick={()=>setFocusMode(value=>!value)}><Code2 size={18}/></button><button className="rail-button" title="Settings" aria-label="Settings" onClick={() => setShowAppearance(true)}><Settings2 size={18} /></button></aside>;
}
