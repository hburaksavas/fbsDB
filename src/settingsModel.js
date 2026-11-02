import {normalizeSavedLayouts} from './savedLayouts.js';
import {defaultEditorShortcuts,normalizeEditorShortcuts} from './editorShortcuts.js';
import {defaultStatusIndicators,normalizeStatusIndicators} from './statusBarModel.js';
import {loadCompletionSettings,normalizeCompletionSettings,defaultCompletionSettings} from './editorCompletionSettings.js';
import {defaultToolbarPrefs,normalizeToolbarPrefs} from './toolbarPrefs.js';
import {defaultDockLayout,normalizeDockLayout,migrateDockLayout} from './dockLayout.js';
import {detectedRegion,usesCommaDecimal} from './localeProfile.js';
import {defaultSqlFormatterSettings,normalizeSqlFormatterSettings} from './sqlFormatterSettings.js';
export const SETTINGS_KEY='fbsdb.settings.v2';
const LEGACY_SETTINGS_KEY='fbsdb.settings.v1';
const select=(label,value,choices,category='results')=>({label,default:value,choices,category,scopes:['results','export','notifications'].includes(category)?['user']:['user','workspace'],when:'New result sets'});
const toggle=(label,value,category='results')=>({...select(label,value,null,category),type:'boolean'});
export const settingDefinitions={
  'notifications.info':{...select('Information duration (seconds)',5,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'notifications.success':{...select('Success duration (seconds)',4,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'notifications.warning':{...select('Warning duration (seconds)',10,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'notifications.error':{...select('Error duration (seconds)',15,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'notifications.progress':{...select('Progress duration (seconds)',60,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'notifications.activateResults':{...toggle('Switch to the Results tab when a query runs',true,'notifications'),scopes:['user'],when:'Next execution'},
  'notifications.completionSound':{...select('Completion sound (off, unfocused, always)','off',['off','unfocused','always'],'notifications'),scopes:['user'],when:'Next execution'},
  'notifications.windowAttention':{...select('Flash the taskbar when a query finishes (off, unfocused, always)','off',['off','unfocused','always'],'notifications'),scopes:['user'],when:'Next execution'},
  'notifications.longQuerySeconds':{...select('Only for queries running at least (seconds)',10,null,'notifications'),type:'number',min:0,max:3600,scopes:['user'],when:'Next execution'},
  'notifications.max':{...select('Maximum notification duration (seconds)',60,null,'notifications'),type:'number',min:1,max:300,scopes:['user'],when:'Immediately'},
  'ui.savedLayouts':{label:'Saved panel layouts',default:{version:1,entries:[]},normalize:normalizeSavedLayouts,category:'general',scopes:['user'],when:'Immediately',hidden:true},
  'ui.layout':{label:'Panel layout',default:defaultDockLayout(),normalize:normalizeDockLayout,category:'general',scopes:['user'],when:'Immediately',hidden:true},
  'ui.density':{...select('Workbench density','compact',['compact','comfortable'],'general'),scopes:['user'],when:'Immediately',hidden:true},
  'ui.scale':{...select('Interface scale',100,[80,90,100,110,125,150],'accessibility'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.fontFamily':{...select('Editor font family','Cascadia Code',['Cascadia Code','Consolas','JetBrains Mono','Courier New'],'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.lineHeight':{...select('Editor line height',23,null,'editor'),type:'number',min:16,max:48,scopes:['user'],when:'Immediately',hidden:true},
  'editor.lineNumbers':{...toggle('Line numbers',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.minimap':{...toggle('Minimap',false,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.indentGuides':{...toggle('Indentation guides',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.whitespace':{...toggle('Visible whitespace',false,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.lineHighlight':{...toggle('Current line highlight',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.wordWrap':{...toggle('Word wrap',false,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'ui.theme':{...select('Workbench theme','default',['default','dark','light'],'general'),scopes:['user'],when:'Immediately',hidden:true},
  'ui.fontFamily':{...select('Interface font','DM Sans',['DM Sans','Segoe UI','Arial','Tahoma','Verdana'],'general'),scopes:['user'],when:'Immediately',hidden:true},
  'ui.startupWorkspaceHub':{...toggle('Show workspace hub on startup',false,'preferences'),scopes:['user'],when:'Next startup'},
  'ui.shortcutCoach':{...toggle('Show shortcut hints after menu use',false,'preferences'),scopes:['user'],when:'Immediately'},
  'ui.toolbars':{label:'Toolbar actions moved to overflow',default:defaultToolbarPrefs,normalize:normalizeToolbarPrefs,category:'preferences',scopes:['user'],when:'Immediately',hidden:true},
  'editor.inlineBinds':{...toggle('Enter query bind values beside the SQL instead of a dialog',false,'editor'),scopes:['user'],when:'Immediately'},
  'ui.iconTheme':{label:'Icon theme',default:'default',normalize:value=>typeof value==='string'&&value.length>0&&value.length<=60?value:'default',category:'preferences',scopes:['user'],when:'Immediately',hidden:true},
  'ui.keyTips':{...toggle('Keyboard access letters: tap Alt to label controls',true,'preferences'),scopes:['user'],when:'Immediately'},
  'ui.doubleShiftSearch':{...toggle('Search Everywhere with double Shift',false,'preferences'),scopes:['user'],when:'Immediately'},
  'ui.connectionNotifications':{...toggle('Connection progress notifications',true,'general'),scopes:['user'],when:'Immediately'},
  'ui.region':{...select('Regional formats','system',['system','en-US','tr-TR','de-DE','en-GB'],'results'),scopes:['user'],when:'New result sets',hidden:true},
  'ui.tokenColors':{label:'SQL token colors',default:{},category:'editor',scopes:['user'],when:'Immediately',hidden:true,normalize:value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
    return Object.fromEntries(['default','dark','light'].filter(theme=>value[theme]&&typeof value[theme]==='object').map(theme=>[theme,Object.fromEntries(['keyword','string','comment','number'].filter(token=>/^#[0-9a-f]{6}$/i.test(value[theme][token]||'')).map(token=>[token,value[theme][token]]))]));
  }},
  'editor.fontSize':{...select('Editor font size',13,null,'editor'),type:'number',min:10,max:24,scopes:['user'],when:'Immediately',hidden:true},
  'editor.tabSize':{...select('Indentation size',4,[2,4,8],'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.insertSpaces':{...toggle('Indent using spaces',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.cursorStyle':{...select('Cursor style','line',['line','block','underline'],'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.cursorBlinking':{...select('Cursor blinking','smooth',['smooth','blink','solid'],'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.semanticHighlighting':{...toggle('Semantic symbol highlighting',false,'editor'),scopes:['user'],when:'Immediately'},
  'editor.overviewRuler':{...toggle('Editor overview ruler',true,'editor'),scopes:['user'],when:'Immediately'},
  'editor.stickyHeaders':{...toggle('Sticky code headers',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.folding':{...toggle('Code folding',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.bracketColors':{...toggle('Bracket colors',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'editor.queryTimeout':{...select('Query timeout in seconds',0,null,'preferences'),type:'number',min:0,max:86400,scopes:['user'],when:'New executions',hidden:true},
  'editor.sqlFormatter':{label:'SQL formatter',default:defaultSqlFormatterSettings,normalize:value=>value&&typeof value==='object'&&!Array.isArray(value)?normalizeSqlFormatterSettings(value):undefined,category:'formatter',scopes:['user'],when:'On format',hidden:true},
  'editor.codeLenses':{...toggle('Code lenses above packages and routines',true,'editor'),scopes:['user'],when:'Immediately',hidden:true},
  'privacy.consoleBindValues':{...toggle('Keep bind values in the run console for this session',false,'privacy'),scopes:['user'],when:'Next execution'},
  'ui.previewTabs':{...toggle('Open Explorer files in a preview tab on single click',true,'preferences'),scopes:['user'],when:'Immediately'},
  'ui.statusIndicators':{label:'Editor status bar indicators',default:defaultStatusIndicators,normalize:normalizeStatusIndicators,category:'preferences',scopes:['user'],when:'Immediately',hidden:true},
  'editor.shortcuts':{label:'Keyboard shortcuts',default:defaultEditorShortcuts,normalize:normalizeEditorShortcuts,category:'shortcuts',scopes:['user'],when:'Immediately',hidden:true},
  'editor.completion':{label:'Oracle completion preferences',default:defaultCompletionSettings,normalize:value=>value&&typeof value==='object'&&!Array.isArray(value)?normalizeCompletionSettings(value):undefined,category:'completion',scopes:['user'],when:'Immediately',hidden:true},
  'ui.motion':{...select('Interface motion','system',['system','reduce','full'],'accessibility'),scopes:['user'],when:'Immediately'},
  'privacy.historyDays':{...select('History retention in days (0 = no expiry)',0,[0,1,7,30,90],'privacy'),scopes:['user'],when:'Immediately'},
  'privacy.excludedProfiles':{...select('Disable history for profile IDs (comma separated)','',null,'privacy'),type:'text',maxLength:2000,scopes:['user'],when:'Immediately'},
  'privacy.historyLimit':{...select('Retained queries (reducing removes older history)',50,[0,10,25,50,100],'privacy'),scopes:['user'],when:'Immediately'},
  'results.budgetRows':{...select('Stop loading remaining rows after this many rows (0 = no limit)',0,null),type:'number',min:0,max:50000000},
  'results.budgetMemoryMb':{...select('Stop loading remaining rows near this client memory estimate in MB (0 = no limit)',0,null),type:'number',min:0,max:16384},
  'results.budgetAction':select('When a loading budget is reached','stop',['stop','warn']),
  'results.density':select('Row density','compact',['compact','comfortable']),
  'results.wrap':toggle('Wrap cell text',false),
  'results.crosshair':toggle('Highlight hovered row and column',true),
  'results.columnWidth':{...select('Initial column width (0 = automatic)',0,null),type:'number',min:0,max:600},
  'results.nullLabel':{...select('NULL display text','NULL',null),type:'text',maxLength:30},
  'results.emptyLabel':{...select('Empty string display text','EMPTY',null),type:'text',maxLength:30},
  'results.nulls':select('NULL sort order','last',['first','last']),
  'results.naturalSort':toggle('Natural text sorting',true),
  'results.caseSensitive':toggle('Case-sensitive matching',false),
  'results.locale':select('Number display locale','en-US',['en-US','tr-TR','de-DE','en-GB']),
  'results.sortLocale':select('Text comparison locale','en-US',['en-US','tr-TR','de-DE','en-GB']),
  'results.grouping':toggle('Group number digits',false),
  'results.decimals':{...select('Decimal places (blank = raw)','',null),type:'precision'},
  'results.dateFormat':select('Date display','raw',['raw','iso','local']),
  'results.timeZone':select('Display zone for offset-aware timestamps only','',['','UTC','Europe/Istanbul','Europe/London','America/New_York','Asia/Tokyo']),
  'results.pageSize':select('Rows per page (not a total result limit)',1000,[100,500,1000,5000,10000]),
  'export.format':select('Preferred file format','csv',['csv','json','xlsx','csv.gz'],'export'),
  'export.encoding':select('CSV encoding','utf-8',['utf-8','utf-16','windows-1254'],'export'),
  'export.delimiter':select('CSV delimiter',',',[',',';','tab','|'],'export'),
  'export.quote':select('CSV quoting','always',['always','needed'],'export'),
  'export.newline':select('CSV line ending','crlf',['crlf','lf'],'export'),
  'export.nullValue':{...select('CSV NULL text','',null,'export'),type:'text',maxLength:100},
  'export.bom':toggle('CSV byte order mark',true,'export'),
  'export.formatted':toggle('Loaded exports use displayed text (XLSX cells become text)',false,'export'),
  'export.includeMetadata':toggle('Include XLSX metadata sheet',false,'export'),
};

function normalize(id,value){
  if(!Object.hasOwn(settingDefinitions,id))return undefined;
  const definition=settingDefinitions[id];
  if(definition.normalize)return definition.normalize(value);
  if(definition.choices)return definition.choices.includes(value)?value:undefined;
  if(definition.type==='boolean')return typeof value==='boolean'?value:undefined;
  if(definition.type==='number')return Number.isFinite(value)&&Number.isInteger(value)&&value>=definition.min&&value<=definition.max?value:undefined;
  if(definition.type==='precision')return value===''||Number.isInteger(value)&&value>=0&&value<=12?value:undefined;
  return typeof value==='string'&&value.length<=(definition.maxLength||100)?value:undefined;
}
function normalizeLayer(layer,scope='user'){return Object.fromEntries(Object.entries(layer||{}).map(([id,value])=>[id,normalize(id,value)]).filter(([id,value])=>value!==undefined&&settingDefinitions[id].scopes.includes(scope)));}
function migrateLegacy(storage,existing){
  const user={...existing};try{const pageSize=Number(storage.getItem('fbsdb.maxRows'));if(!Object.hasOwn(user,'results.pageSize')&&normalize('results.pageSize',pageSize)!==undefined)user['results.pageSize']=pageSize}catch{}
  for(const [id,key] of [['ui.theme','fbsdb.theme'],['ui.tokenColors','fbsdb.tokenColors'],['editor.queryTimeout','fbsdb.queryTimeout']])try{const raw=storage.getItem(key);if(raw!=null&&!Object.hasOwn(user,id)){const value=id==='ui.theme'?raw:JSON.parse(raw);const normalized=normalize(id,value);if(normalized!==undefined)user[id]=normalized}}catch{}
  try{const style=JSON.parse(storage.getItem('fbsdb.codeStyle')||'null');if(style)for(const field of ['fontSize','tabSize','insertSpaces']){const id='editor.'+field;if(!Object.hasOwn(user,id)&&normalize(id,style[field])!==undefined)user[id]=style[field]}}catch{}
  try{if(!Object.hasOwn(user,'editor.completion')&&(storage.getItem('fbsdb.completion')!=null||storage.getItem('fbsdb.autoCompletion')!=null))user['editor.completion']=loadCompletionSettings(storage)}catch{}
  return user;
}
export function loadSettings(storage){
  try{
    const parsed=JSON.parse(storage.getItem(SETTINGS_KEY)||storage.getItem(LEGACY_SETTINGS_KEY)||'null');
    if(parsed?.version===1||parsed?.version===2){
      const user=parsed.migrations?.legacyPreferences===1?normalizeLayer(parsed.user):migrateLegacy(storage,normalizeLayer(parsed.user));
      if(parsed.migrations?.dockLayout!==2){
        const migrated=migrateDockLayout(storage);
        if(!Object.hasOwn(user,'ui.layout'))user['ui.layout']=migrated;
        else {
          const previous=parsed.user?.['ui.layout']||{};
          if(!Object.hasOwn(previous,'expandedPaths'))user['ui.layout'].expandedPaths=migrated.expandedPaths;
          if(!Object.hasOwn(previous,'inspectorWidth'))user['ui.layout'].inspectorWidth=migrated.inspectorWidth;
        }
        try{if(!Object.hasOwn(user,'ui.density')&&storage.getItem('fbsdb.workbenchDensity')==='comfortable')user['ui.density']='comfortable'}catch{}
      }
      return {version:2,migrations:{legacyPreferences:1,dockLayout:2},user,workspaces:Object.fromEntries(Object.entries(parsed.workspaces||{}).map(([root,layer])=>[workspaceKey(root),normalizeLayer(layer,'workspace')]))};
    }
    // A newer schema belongs to the newer application; never overwrite it.
    if(parsed?.version>1)return {version:parsed.version,user:{},workspaces:{},readOnly:true};
  }catch{}
  const user=migrateLegacy(storage,{});user['ui.layout']=migrateDockLayout(storage);try{if(storage.getItem('fbsdb.workbenchDensity')==='comfortable')user['ui.density']='comfortable'}catch{}
  return {version:2,migrations:{legacyPreferences:1,dockLayout:2},user,workspaces:{}};
}
export function saveSettings(storage,settings){if(!settings.readOnly){storage.setItem(SETTINGS_KEY,JSON.stringify({...settings,version:2}));storage.removeItem(LEGACY_SETTINGS_KEY)}}
export function importSettingsDocument(text,current){
  const parsed=JSON.parse(text);if(!parsed||![1,2].includes(parsed.version)||!parsed.user||typeof parsed.user!=='object'||Array.isArray(parsed.user))throw new Error('This file is not a supported fbsDB settings export.');
  const workspaces=Object.fromEntries(Object.entries(parsed.workspaces||{}).map(([root,layer])=>[workspaceKey(root),normalizeLayer(layer,'workspace')]));
  return {version:2,migrations:{legacyPreferences:1,dockLayout:2},user:normalizeLayer(parsed.user),workspaces};
}
const workspaceKey=root=>String(root||'').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
export function resolveSetting(settings,id,workspace,systemLocale){
  const definition=settingDefinitions[id];if(!definition)throw new Error('Unknown setting '+id);
  const scoped=settings.workspaces?.[workspaceKey(workspace)];
  if(definition.scopes.includes('workspace')&&workspace&&Object.hasOwn(scoped||{},id))return {value:scoped[id],source:'workspace',when:definition.when};
  if(Object.hasOwn(settings.user||{},id))return {value:settings.user[id],source:'user',when:definition.when};
  if(id==='ui.region')return {value:definition.default,source:'product',when:definition.when};
  const selected=resolveSetting(settings,'ui.region',workspace);
  const region=selected.value==='system'?detectedRegion(systemLocale?.region||globalThis.navigator?.language||'en-US'):selected.value;
  const regionalDefaults={'results.locale':region,'results.sortLocale':region,'results.grouping':true,'results.dateFormat':'local','export.delimiter':usesCommaDecimal(region)?';':','};
  return {value:Object.hasOwn(regionalDefaults,id)?regionalDefaults[id]:definition.default,source:'product',when:definition.when,region:regionalDefaults[id]!==undefined?region:undefined};
}
export function changeSetting(settings,id,value,scope='user',workspace){
  if(settings.readOnly)throw new Error('Settings were written by a newer app version.');
  if(!settingDefinitions[id]?.scopes.includes(scope)||scope==='workspace'&&!workspace)throw new Error('Unsupported setting scope.');
  if(value!==undefined&&normalize(id,value)===undefined)throw new Error('Invalid setting value.');
  const next=structuredClone(settings),key=workspaceKey(workspace);const layer=scope==='workspace'?{...(Object.hasOwn(next.workspaces,key)?next.workspaces[key]:{})}:{...next.user};
  if(value===undefined)delete layer[id];else layer[id]=structuredClone(normalize(id,value));
  if(scope==='workspace')next.workspaces={...next.workspaces,[key]:layer};else next.user=layer;
  return next;
}
// A region selection is an explicit reset of the related table-format choices.
// Other workspaces retain their deliberate table overrides.
export function changeRegionalFormats(settings,value,workspace){
  const next=changeSetting(settings,'ui.region',value);
  const regionalTableIds=['results.locale','results.sortLocale','results.grouping','results.dateFormat'];
  for(const id of regionalTableIds){
    delete next.user[id];
    const layer=next.workspaces?.[workspaceKey(workspace)];
    if(workspace&&layer)delete layer[id];
  }
  return next;
}
export function newResultDefaults(settings,workspace,systemLocale){
  const options={};for(const id of Object.keys(settingDefinitions).filter(id=>id.startsWith('results.'))){const key=id.slice(8);if(key!=='pageSize')options[key]=resolveSetting(settings,id,workspace,systemLocale).value;}
  options.exportSettings=Object.fromEntries(Object.keys(settingDefinitions).filter(id=>id.startsWith('export.')).map(id=>[id.slice(7),resolveSetting(settings,id,workspace,systemLocale).value]));
  options.locale=resolveSetting(settings,'results.locale',workspace,systemLocale).value;
  options.sortLocale=resolveSetting(settings,'results.sortLocale',workspace,systemLocale).value;
  return options;
}
export function resultPageSizes(settings,workspace,session={},result){
  const next=session.pageSizePreference??resolveSetting(settings,'results.pageSize',workspace).value;
  return {next,current:session.pageSizePreference??result?.executionPageSize??result?.pageSize??next};
}
export function saveResultDefaults(settings,options,scope='user',workspace){
  let next=settings;
  for(const id of Object.keys(settingDefinitions).filter(id=>id.startsWith('results.')||id.startsWith('export.'))){
    const value=id.startsWith('results.')?options[id.slice(8)]:options.exportSettings?.[id.slice(7)];
    if(normalize(id,value)!==undefined)next=changeSetting(next,id,value,'user',workspace);
  }
  return next;
}
