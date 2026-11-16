// x
import { isNativeHost } from "./nativeBridge";
import { describeOracleSource, relatedPackageDocument } from "./oracleSourceIdentity.js";
import { sourceRunConfigurations } from "./runConfigurations";
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

export function reviewSourceForCompilation(ctx, statement, target) {
  const {
    documents, objectTabActive, sessionsRef, setRunState, setShowPicker, setSourceCompile, workspace
  } = ctx;
    const document=documents.active,session=sessionsRef.current[document?.id]||{};
    if(!document||document.readOnly||objectTabActive||session.executing||session.fetchingPage||session.scriptRun?.running)return;
    if(!isNativeHost||!session.activeConnection||['No connection','Disconnected'].includes(session.activeConnection.id)){setShowPicker(true);return;}
    const prepared=prepareSourceCompilation(typeof statement==='string'?{...document,content:statement}:document,workspace.projectRules);
    if(prepared.error){setRunState(prepared.error);return;}
    setSourceCompile({document:{...document},prepared,statementOffset:typeof statement==='string'?target?.start??null:0,tabId:document.id,profileId:session.activeConnection.id});
  }

export function openRunConfigurations(ctx) {
  const {
    activateTab, documents, objectTab, objectTabActive, sessionsRef, setObjectTabActive, setRunConfigurations, workspace
  } = ctx;
    let source=objectTabActive?{name:'',content:''}:documents.active;if(!source)return;
    const origin=objectTabActive&&objectTab?objectTab.originTabId:source.metadataOriginTabId||source.id;setObjectTabActive(false);
    if(describeOracleSource(source,workspace.projectRules).declaration?.type==='PACKAGE BODY')source=relatedPackageDocument(source,documents.tabs,{root:workspace.root,sessions:sessionsRef.current,rules:workspace.projectRules}).target||source;
    const generated=sourceRunConfigurations(source,workspace.projectRules,sessionsRef.current[origin]?.schemaOwner||'');
    if(documents.activeId!==origin)activateTab(origin);
    if(documents.active?.readOnly)return;
    setRunConfigurations({root:workspace.root,tabId:origin,signatures:generated.configurations,signatureErrors:generated.errors});
  }

export function switchPackageSource(ctx) {
  const {
    activateTab, documents, sessionsRef, setRelatedSources, workspace
  } = ctx;
    const result = relatedPackageDocument(documents.active || {}, documents.tabs, {root: workspace.root, sessions: sessionsRef.current,rules:workspace.projectRules});
    if (result.target) activateTab(result.target.id);
    else if (isNativeHost && workspace.root && ['PACKAGE','PACKAGE BODY'].includes(describeOracleSource(documents.active || {},workspace.projectRules).declaration?.type)) setRelatedSources({root:workspace.root,document:documents.active});
  }
