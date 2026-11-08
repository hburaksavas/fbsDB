import {semanticHighlights} from './semanticHighlights.js';
import { parameterNameHints } from './parameterNameHints.js';
import {localChangeRanges} from './localChangeRanges.js';
import { extractSuggestionUsage } from './suggestionUsage.js';
import { rankLearnedCandidates, learningContext } from './suggestionLearning.js';
import { sqlOutline } from './editorNavigation.js';
import { getOracleCompletionContext } from './oracleCompletion.js';
import { oracleLanguageCompletions, languageMetadataTargets, oracleSignatureHelp, oracleSymbolInfo, oracleReferenceLocations } from './oracleLanguageService.js';
import { formatOracleDocument } from './sqlFormatter.js';
import { oracleDiagnostics } from './oracleDiagnostics.js';

let options = {}, revision = 0;
self.onmessage = ({ data }) => {
  if (data.type === 'configure') { options = data.options; revision = data.revision; return; }
  if (data.type === 'learning') { options.learning = data.entries; return; }
  if (data.type === 'remember') { options.recent = [data.key, ...(options.recent || []).filter(key => key !== data.key)].slice(0, 100); return; }
  if (data.type === 'metadata') { options.metadata = data.metadata; options.systemObjects = data.systemObjects; return; }
  if (!['learn', 'complete', 'analyze', 'signature', 'symbol', 'format', 'diagnostics', 'outline', 'references','changes','semantic','parameterHints'].includes(data.type)) return;
  try {
    if (data.revision !== revision) { self.postMessage({ id: data.id, revision: data.revision, result: { candidates: [], context: {} } }); return; }
    if (data.type === 'learn') { self.postMessage({ id: data.id, revision, result: { observations: extractSuggestionUsage(data.source, [...(options.objects || []).map(o => ({...o, ...(options.metadata || []).find(m => m.owner === o.owner && m.name === o.name)}))], options.currentSchema, options.version) } }); return; }
    if(data.type==='parameterHints'){self.postMessage({id:data.id,revision,result:{hints:parameterNameHints(data.source,{...options,start:data.start??0,end:data.end??data.source.length})}});return;}
if(data.type==='semantic'){self.postMessage({id:data.id,revision,result:{semantic:semanticHighlights(data.source,data.start??0,data.end??data.source.length,options)}});return;}
    if (data.type==='changes'){self.postMessage({id:data.id,revision,result:{changes:localChangeRanges(data.before||'',data.source)}});return;}
    if (data.type === 'outline') { self.postMessage({id:data.id,revision,result:{outline:sqlOutline(data.source)}});return; }
    if (data.type === 'format') { self.postMessage({ id: data.id, revision, result: formatOracleDocument(data.source, data.style || {}) }); return; }
    if (data.type === 'diagnostics') { self.postMessage({ id: data.id, revision, result: { diagnostics: oracleDiagnostics(data.source) } }); return; }
    const requestOptions = { ...options, manual: !!data.manual, automatic: !data.manual };
    if (data.type === 'analyze') {
      const context = getOracleCompletionContext(data.source, data.cursor);
      self.postMessage({ id: data.id, revision, result: { targets: languageMetadataTargets(data.source, data.cursor, requestOptions, data.mode), wantsSystem: context.qualifierPath?.some(part => /^(?:SYS|DBMS_|UTL_)/i.test(part.key)) || /^(?:DBMS_|UTL_)/i.test(context.fragment) } }); return;
    }
    if (data.type === 'references') {self.postMessage({id:data.id,revision,result:{references:oracleReferenceLocations(data.source,data.cursor,requestOptions)}});return;}
    if (data.type === 'signature' || data.type === 'symbol') {
      self.postMessage({ id: data.id, revision, result: data.type === 'signature' ? { signature: oracleSignatureHelp(data.source, data.cursor, requestOptions) } : { symbol: oracleSymbolInfo(data.source, data.cursor, requestOptions) } }); return;
    }
    const result = oracleLanguageCompletions(data.source, data.cursor, requestOptions);
    if (options.settings?.learning !== false) result.candidates = rankLearnedCandidates(result.candidates, result.context, options.learning);
    result.candidates = result.candidates.map(candidate => ({ ...candidate, object: candidate.object ? { owner: candidate.object.owner, name: candidate.object.name, type: candidate.object.type, comment: candidate.object.comment } : undefined }));
    const { fragment, blocked, relation, qualifier } = result.context;
    self.postMessage({ id: data.id, revision, result: { context: { fragment, blocked, relation, qualifier, learningContext: learningContext(result.context) }, candidates: result.candidates } });
  } catch (error) { self.postMessage({ id: data.id, revision, error: error.message }); }
};
