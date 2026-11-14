// Window-level keyboard shortcuts of the workbench. App runs each function as the body of one of its effects; see docs/architecture.md.
import { editorShortcutActions, matchesShortcut } from "./editorShortcuts.js";
import { isNativeHost } from "./nativeBridge";
import { resolveSetting } from "./settingsModel";

export function installWorkbenchShortcuts(ctx) {
  const {
    cycleSqlTab, documents, editorIsReadonly, editorRef, manualSuggestionRef, navigateBookmark, navigateEdit, navigateHistory,
    navigateProblem, newSqlFileFromLastConnection, openCallHierarchy, openSqlFile, paletteMode, problemCursorRef, problemsRef,
    returnToExecution, saveSqlFile, setFocusMode, setPaletteMode, setRelatedSources, setShowBookmarks, setShowHistory, setShowPicker,
    setShowSearch, settingsRef, switchPackageSource, workspace
  } = ctx;
    const handler = (event) => {
      if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='o'&&!document.querySelector('.modal-backdrop')&&isNativeHost&&workspace.root&&editorRef.current?.hasTextFocus()){event.preventDefault();setRelatedSources({root:workspace.root,document:documents.active});return;}
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&event.key.toLowerCase()==='o'&&!document.querySelector('.modal-backdrop')&&editorRef.current?.hasTextFocus()){event.preventDefault();switchPackageSource();return;}
      if(editorRef.current?.hasTextFocus()&&!document.querySelector('.modal-backdrop')){
        const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
        if(matchesShortcut(event,shortcuts.bookmark)){event.preventDefault();setShowBookmarks(true);return}
        if(matchesShortcut(event,shortcuts.nextBookmark)){event.preventDefault();navigateBookmark(1);return}
        if(matchesShortcut(event,shortcuts.previousBookmark)){event.preventDefault();navigateBookmark(-1);return}
      }
      if(editorRef.current?.hasTextFocus()&&!document.querySelector('.modal-backdrop')){
        const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
        if(matchesShortcut(event,shortcuts.callHierarchy)){event.preventDefault();openCallHierarchy();return}
        if(matchesShortcut(event,shortcuts.lastEdit)){event.preventDefault();navigateEdit('last');return}
        if(matchesShortcut(event,shortcuts.previousEdit)){event.preventDefault();navigateEdit(-1);return}
        if(matchesShortcut(event,shortcuts.nextEdit)){event.preventDefault();navigateEdit(1);return}
        if(matchesShortcut(event,shortcuts.lastExecution)){event.preventDefault();returnToExecution();return}
      }
      if(matchesShortcut(event,resolveSetting(settingsRef.current,'editor.shortcuts').value.outline)){event.preventDefault();if(!document.querySelector('.modal-backdrop'))setPaletteMode('outline');return;}
      if(event.altKey&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigateHistory(event.key==='ArrowLeft'?-1:1);return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();if(!document.querySelector('.modal-backdrop')||paletteMode)setPaletteMode(event.shiftKey?'commands':'files');return;}
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); setFocusMode(value=>!value); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "f" && !editorRef.current?.hasTextFocus()) { event.preventDefault(); setShowSearch(true); setShowHistory(false); return; }
      if (event.key === "F8" && !document.querySelector(".modal-backdrop, .feedback-notification")) { const items = problemsRef.current.filter(problem => problem.tabId === documents.activeId); if (items.length) { event.preventDefault(); problemCursorRef.current = problemCursorRef.current < 0 ? event.shiftKey ? items.length - 1 : 0 : (problemCursorRef.current + (event.shiftKey ? -1 : 1) + items.length) % items.length; navigateProblem(items[problemCursorRef.current]); } return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") { event.preventDefault(); openSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "n") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) newSqlFileFromLastConnection(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Tab") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) cycleSqlTab(event.shiftKey ? -1 : 1); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if(!editorIsReadonly())saveSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") { event.preventDefault(); if (!editorIsReadonly()) setShowPicker(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.code === "Space" && !event.defaultPrevented && editorRef.current?.hasTextFocus()) { manualSuggestionRef.current = true; event.preventDefault(); editorRef.current.trigger("keyboard", "editor.action.triggerSuggest", {}); }
    };
    window.addEventListener("keydown", handler,true); return () => window.removeEventListener("keydown", handler,true);
  }

export function installEditorShortcuts(ctx) {
  const {
    editorIsReadonly, editorRef, formatterRef, manualSuggestionRef, runQueryRef, settingsRef
  } = ctx;
    const runStatementShortcut = (event) => {
      const editor=editorRef.current;if(!editor?.hasTextFocus())return;
      const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
      if(matchesShortcut(event,shortcuts.run)){event.preventDefault();event.stopImmediatePropagation();runQueryRef.current?.();return;}
      if(matchesShortcut(event,'Ctrl+Shift+F')||matchesShortcut(event,shortcuts.format)){event.preventDefault();event.stopImmediatePropagation();formatterRef.current?.();return;}
      for(const action of editorShortcutActions.filter(action=>action.command)){
        if(matchesShortcut(event,shortcuts[action.id])){
          event.preventDefault();event.stopImmediatePropagation();
          if(action.id==='suggest')manualSuggestionRef.current=true;
          if(!action.edits||!editorIsReadonly())editor.trigger('keyboard',action.command,{});
          return;
        }
      }
    };
    window.addEventListener("keydown", runStatementShortcut, true);
    return () => window.removeEventListener("keydown", runStatementShortcut, true);
  }
