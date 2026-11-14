// The editor toolbar items, keyed by id. App builds toolbarDefs with this during its render; see docs/architecture.md.
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { commitButtonTitle, rollbackButtonTitle } from "./reversibility";
import { AlignLeft, Check, Code2, FolderOpen, Plus, Redo2, RefreshCw, Save, Search, Undo2, Workflow, X } from "lucide-react";

export function renderToolbarDefs(ctx) {
  const {
    activeTabId, activeTabReadonly, busy, connecting, editorCommand, explainQuery, finishTransaction, formatSql, newSqlFile, openSqlFile,
    saveSqlFile, setActiveObject, setObjectTabActive, shortcutsSetting, tabSession, transactionPending, updateTabSession
  } = ctx;
  return {
    open:{label:'Open SQL file',shortcut:'Ctrl+Shift+O',title:'Open file (Ctrl+Shift+O)',aria:'Open file (Ctrl+Shift+O)',icon:<FolderOpen size={16}/>,onClick:openSqlFile},
    save:{label:'Save SQL file',shortcut:'Ctrl+S',title:'Save SQL file (Ctrl+S)',aria:'Save SQL file',icon:<Save size={15}/>,disabled:activeTabReadonly,onClick:()=>saveSqlFile()},
    new:{label:'New SQL file',shortcut:'Ctrl+N',title:'New SQL file (Ctrl+N)',aria:'New SQL file',icon:<Plus size={15}/>,onClick:()=>{setObjectTabActive(false);setActiveObject('');newSqlFile()}},
    undo:{label:'Undo',shortcut:'Ctrl+Z',title:'Undo (Ctrl+Z)',aria:'Undo',icon:<Undo2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('undo')},
    redo:{label:'Redo',shortcut:'Ctrl+Y',title:'Redo (Ctrl+Y)',aria:'Redo',icon:<Redo2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('redo')},
    format:{label:'Format SQL',shortcut:'Ctrl+Shift+F',title:'Format SQL (Ctrl+Shift+F)',aria:'Format SQL',icon:<AlignLeft size={15}/>,className:'format-sql-button',disabled:activeTabReadonly,keepFocus:true,onClick:formatSql},
    find:{label:'Find',shortcut:shortcutsSetting.find,title:`Find (${shortcutsSetting.find||'Ctrl+F'})`,aria:'Find in editor',icon:<Search size={15}/>,keepFocus:true,onClick:()=>editorCommand('actions.find')},
    comment:{label:'Toggle comment',shortcut:shortcutsSetting.commentLine,title:`Toggle comment (${shortcutsSetting.commentLine||'Ctrl+/'})`,aria:'Toggle comment',icon:<Code2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('editor.action.commentLine')},
    explain:{label:'Explain plan',title:'Explain plan for the statement at the cursor',aria:'Explain plan',icon:<Workflow size={15}/>,disabled:busy||connecting,onClick:explainQuery},
    commit:{label:'Commit',title:commitButtonTitle,aria:'Commit',className:'transaction-button commit',icon:<Check size={13}/>,disabled:activeTabReadonly||!transactionPending||busy,onClick:()=>finishTransaction('commit')},
    rollback:{label:'Rollback',title:rollbackButtonTitle,aria:'Rollback',className:'transaction-button rollback',icon:<X size={13}/>,disabled:activeTabReadonly||!transactionPending||busy,onClick:()=>finishTransaction('rollback')},
    autoCommit:{label:`Auto commit ${tabSession.autoCommit?'(on)':'(off)'}`,title:transactionPending?'Commit or roll back pending changes before changing auto commit':`Auto commit ${tabSession.autoCommit?'on':'off'}`,aria:'Auto commit',className:`transaction-button auto-commit${tabSession.autoCommit?' enabled':''}`,pressed:Boolean(tabSession.autoCommit),icon:<RefreshCw size={13}/>,disabled:!isNativeHost||activeTabReadonly||transactionPending||busy||connecting||tabSession.autoCommitPending,onClick:()=>{updateTabSession('autoCommitPending',true,activeTabId);updateTabSession('autoCommitRequestId',sendNativeCommand('transaction.autoCommit',{tabId:activeTabId,enabled:!tabSession.autoCommit}),activeTabId)}},
    rows:{label:'Rows per result page'},
  };
}
