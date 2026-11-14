// Effects that attach the Oracle language features and source checks to the editor. App runs each function as the body of one of its effects; see docs/architecture.md.
import { bindAtOffset } from "./bindContext";
import { largeFilePolicy } from "./largeFilePolicy.js";
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { installOracleLanguageProviders } from "./oracleLanguageProviders";
import { oracleSchemaKey } from "./OracleObjectTree.jsx";
import { projectUsage as loadProjectUsage } from "./projectUsageCache.js";
import { resolveSetting } from "./settingsModel";
import { sourceCompilationUnits, sourceIdentity } from "./sourceCompilation";

export function reviewSourceBaselines(ctx) {
  const {
    completionSession, documents, largePolicy, sourceBaselineAttempts, sourceBaselineRequests, tabSessions, workspace
  } = ctx;
    const tab=documents.active,session=tabSessions[tab?.id]||{},profile=session.activeConnection?.id;
    if(!largePolicy.source||!isNativeHost||!tab?.path||tab.readOnly||!profile||['No connection','Disconnected'].includes(profile)||session.connectionLost||session.executing||session.connecting||session.inactive||session.scriptRun?.running)return;
    const timer=setTimeout(()=>{
      for(const prepared of sourceCompilationUnits(tab,workspace.projectRules).slice(0,32)){
        const identity=sourceIdentity(prepared.declaration);
        const key=JSON.stringify([tab.id,tab.path,profile,identity,completionSession.schemaOwner]);
        if(sourceBaselineAttempts.current.has(key))continue;
        sourceBaselineAttempts.current.add(key);
        const request=sendNativeCommand('source.review',{tabId:tab.id,sql:prepared.sql});
        sourceBaselineRequests.current.set(request,{tabId:tab.id,profile,key,identity});
      }
    },300);
    return()=>clearTimeout(timer);
  }

export function installLanguageProviders(ctx) {
  const {
    activateTab, activeTabId, allSqlSnippets, completionAcceptanceRef, completionClientRef, completionMetadataRef, completionObjects,
    completionRecentRef, completionSchema, completionSession, completionSettings, definitionModelsRef, documents, editorRef,
    largeFileOverridesRef, manualSuggestionRef, metadataOriginTabId, monaco, openOracleDefinition, rememberLocation, requestSchemaDetails,
    sessionsRef, setActiveObject, setCompletionError, setPlscopeReport, setSchemaQuery, setSidebarOpen, settingsRef, suggestionLearningRef,
    suggestionScope, usageSourcesRef
  } = ctx;
    if (!monaco || !completionClientRef.current) return;
    const client = completionClientRef.current;
    const broker = completionMetadataRef.current;
    client.configure({ settings: completionSettings, objects: completionObjects, currentSchema: completionSchema, version: completionSession.oracleVocabulary?.version || 19, liveWords: completionSession.oracleVocabulary?.words || [], snippets: allSqlSnippets, learning: completionSettings.learning ? suggestionLearningRef.current.snapshot(suggestionScope()) : [], recent: completionRecentRef.current.get(activeTabId) || [] });
    client.metadata(broker.objects(metadataOriginTabId), broker.systemObjects(metadataOriginTabId), broker.version(metadataOriginTabId));
    return installOracleLanguageProviders({
      monaco, editor: editorRef.current, client, broker, acceptanceCommand: completionAcceptanceRef.current, definitionModels: definitionModelsRef.current,
      snapshot: () => {
        const tab = documents.tabs.find(item => item.id === documents.activeId), originTabId = tab?.metadataOriginTabId || documents.activeId;
        const originSession = sessionsRef.current[originTabId] || {}, connection = originSession.activeConnection;
        return { semanticHighlighting:resolveSetting(settingsRef.current,'editor.semanticHighlighting').value,languageFeatures:largeFilePolicy(tab?.content,largeFileOverridesRef.current[tab?.id]), busy: !!(originSession.executing || originSession.scriptRun?.running || originSession.fetchingPage), sourceObject: tab?.definitionObject, tabId: documents.activeId, originTabId, connected: isNativeHost && !!connection && !["No connection", "Disconnected"].includes(connection.id), settings: completionSettings,
          manualSuggestion: () => { const manual = manualSuggestionRef.current; manualSuggestionRef.current = false; return manual; } };
      },
      onDefinition: openOracleDefinition,
      onBeforeNavigate:()=>rememberLocation(),
      onReveal: target => {
        if (metadataOriginTabId !== documents.activeId) activateTab(metadataOriginTabId);
        setSidebarOpen(true); setSchemaQuery("");
        const object = sessionsRef.current[metadataOriginTabId]?.schemaObjects?.find(item => item.owner === target.owner && item.name === target.name && item.type === target.type);
        if (object) { setActiveObject(oracleSchemaKey(object)); requestSchemaDetails(object); requestAnimationFrame(() => { const section = document.querySelector('.schema-section'); if (section) section.open = true; }); }
        else setCompletionError("This object is not in the current Object Explorer scope.");
      },
      onError: setCompletionError,
      onPlscope: setPlscopeReport,
      projectUsage: () => { const sources = usageSourcesRef.current?.(); return sources ? { activePath: sources.activePath, usage: loadProjectUsage(sources) } : null; },
    });
  }

export function scheduleDiagnostics(ctx) {
  const {
    activeTabId, completionClientRef, documents, editorRef, largePolicy, monaco, updateTabSession
  } = ctx;
    if (!monaco) return;
    const owner = activeTabId;
    if(!largePolicy.diagnostics){updateTabSession('lintProblems',[],owner);const model=editorRef.current?.getModel();if(model)monaco.editor.setModelMarkers(model,'fbsdb-lint',[]);return;}
    let cancelled=false;
    const timer = setTimeout(async () => {
      const model = editorRef.current?.getModel(), client = completionClientRef.current;
      if (!model || !client) return;
      const text = model.getValue(), version = model.getVersionId();
      const result = await client.request("diagnostics", text, 0);
      if (cancelled || !result.diagnostics || model.isDisposed() || model.getVersionId() !== version || documents.activeId !== owner) return;
      const problems = result.diagnostics.map((item, index) => {
        const start = model.getPositionAt(item.start), end = model.getPositionAt(item.end);
        return { ...item, id: `${owner}:lint:${index}`, tabId: owner, fileName: documents.tabs.find(tab => tab.id === owner)?.name || "SQL", line: start.lineNumber, column: start.column, offset: item.start, editorSnapshot: text, startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
      });
      updateTabSession("lintProblems", problems, owner);
      monaco.editor.setModelMarkers(model, "fbsdb-lint", problems.map(problem => ({ ...problem, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error })));
    }, 250);
    return () => {cancelled=true;clearTimeout(timer)};
  }

export function installEditorContextMenu(ctx) {
  const {
    bindTypeFor, completionObjects, completionSchema, documents, editorIsReadonly, editorRef, monaco, openObjectContext, setEditorContext
  } = ctx;
    const editor=editorRef.current;if(!monaco||!editor)return;
    let disposed = false;
    const show=async event=>{
      const model=editor.getModel();if(!model)return;
      const position=event.target?.position||editor.getPosition(),selection=editor.getSelection();
      if(position&&(!selection||selection.isEmpty()||!selection.containsPosition(position)))editor.setPosition(position);
      const range=editor.getSelection(),start=model.getOffsetAt(range.getStartPosition()),end=model.getOffsetAt(range.getEndPosition());
      const version = model.getVersionId();
      event.event?.preventDefault?.();event.event?.stopPropagation?.();
      const { editorContextObject } = await import('./editorContext.js');
      if (disposed || model.isDisposed() || editor.getModel() !== model || model.getVersionId() !== version) return;
      const object=editorContextObject(model.getValue(),start,end,model.getOffsetAt(position),completionObjects,completionSchema);
      const trigger=editor.getDomNode(),r=trigger.getBoundingClientRect(),x=event.event?.posx||r.left+30,y=event.event?.posy||r.top+30;
      event.event?.preventDefault?.();event.event?.stopPropagation?.();
      if(object){openObjectContext({type:'contextmenu',preventDefault(){},stopPropagation(){},currentTarget:trigger,clientX:x,clientY:y},object);setEditorContext(null)}
      else setEditorContext({tabId:documents.activeId,model,version:model.getVersionId(),selection:range,trigger,x,y,bind:range.isEmpty()?bindAtOffset(model.getValue(),model.getOffsetAt(position)):null,bindType:range.isEmpty()?bindTypeFor(bindAtOffset(model.getValue(),model.getOffsetAt(position)),model.getValue()):null,selected:!range.isEmpty(),canUndo:model.canUndo(),canRedo:model.canRedo(),readOnly:editorIsReadonly()});
    };const listener=editor.onContextMenu(show),keyboard=editor.onKeyDown(event=>{const e=event.browserEvent;if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();e.stopPropagation();const position=editor.getPosition(),p=editor.getScrolledVisiblePosition(position),r=editor.getDomNode().getBoundingClientRect();show({target:{position},event:{posx:r.left+(p?.left||20),posy:r.top+(p?.top||20)+20}})}});return()=>{disposed=true;listener.dispose();keyboard.dispose();setEditorContext(null)};
  }
