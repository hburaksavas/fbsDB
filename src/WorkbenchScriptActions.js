// Previewing a script run and reviewing a paused one. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { describeOracleSource } from "./oracleSourceIdentity.js";
import { prepareSourceCompilation } from "./sourceCompilation";

export function openScriptPreview(ctx) {
  const {
    documents, editorIsReadonly, operations, reviewSourceForCompilation, setRunState, setScriptDialog, workspace
  } = ctx; if(editorIsReadonly())return; const tabId=documents.activeId,run=operations.scripts.get(tabId),source=describeOracleSource(documents.active||{},workspace.projectRules);if(!run?.running&&!prepareSourceCompilation(documents.active||{},workspace.projectRules).error){reviewSourceForCompilation();return;}if(!run?.running&&source.expectedType&&source.warning){setRunState(source.warning+' Review the source declaration before compiling.');return;}setScriptDialog({tabId,source:run?.running?run.source:documents.text}); }

export function reviewPausedScript(ctx, owner) {
  const {
    activateTab, documents, operations, setSourceCompile
  } = ctx;
    const run=operations.scripts.get(owner),waiting=run?.awaitingSourceReview,document=documents.tabs.find(tab=>tab.id===owner);
    if(!waiting||!document)return;
    if(documents.activeId!==owner)activateTab(owner);
    const prepared={sql:waiting.sql,original:waiting.sql};
    setSourceCompile({document:{...document,content:run.source},prepared,statementOffset:waiting.offset,tabId:owner,profileId:waiting.profileId,generation:waiting.generation,scriptRequestId:run.requestId,scriptIndex:waiting.index,reviewNonce:waiting.reviewNonce});
  }
