export function profileEnvironment(profile) {
  const value=String(profile?.env||profile?.environment||'UNKNOWN').toUpperCase();
  return ['DEV','TEST','UAT','PROD'].includes(value)?value:'UNKNOWN';
}
const validProfile=id=>typeof id==='string'&&!!id&&!['No connection','Disconnected'].includes(id);

export function documentConnection(document,sessions={},profiles=[]) {
  const session=sessions[document.metadataOriginTabId||document.id]||{},active=session.activeConnection;
  const id=session.connecting?session.connectingProfileId:validProfile(active?.id)?active.id:document.connectionProfileId;
  const saved=profiles.find(profile=>profile.id?.toLowerCase()===id?.toLowerCase());
  const environment=session.connecting?profileEnvironment({env:session.connectingEnvironment||saved?.env}):validProfile(active?.id)?profileEnvironment({env:session.connectionEnvironment||active.env||saved?.env}):profileEnvironment(saved);
  const state=session.connecting?'connecting':session.connectionLost?'disconnected':session.inactive?'inactive':validProfile(active?.id)?'connected':'disconnected';
  const text={connecting:'Connecting',connected:'Connected',disconnected:'Disconnected',inactive:'Inactive'}[state];
  const pending=!!session.transactionPending&&!session.analysisReadOnly;
  const short=state==='connecting'?'Conn':state==='inactive'?'Idle':state==='connected'?(pending?'TX':'On'):(pending?'Off TX':'Off');
  return {profileId:validProfile(id)?id:null,profileName:saved?.name||(validProfile(active?.id)?active?.name:null)||id||'No profile',environment,state,pending,short,text:text+(pending?' · not committed':''),generation:session.connectionGeneration??0};
}

export function editedSinceExecution(document,execution) {
  return typeof execution?.editorSnapshot==='string'&&execution.editorSnapshot!==document.content;
}

export function resultProvenance(result,document,connection,currentContext) {
  if(!result)return null;
  const recorded=typeof result.editorSnapshot==='string',edited=recorded&&result.editorSnapshot!==document.content;
  const profile=result.executedProfileId||result.profileId;
  const otherProfile=!!profile&&!!connection.profileId&&profile!==connection.profileId;
  const otherGeneration=result.executedConnectionGeneration!=null&&result.executedConnectionGeneration!==connection.generation;
  const otherContext=result.executedContext&&currentContext&&['schema','container','edition','service','sessionId'].some(key=>result.executedContext[key]!=null&&currentContext[key]!=null&&result.executedContext[key]!==currentContext[key]);
  const otherDocument=result.executedTabId&&result.executedTabId!==document.id;
  const contextChanged=otherProfile||otherGeneration||otherContext||otherDocument;
  const key=contextChanged?'context-changed':edited?'edited':recorded?'matching':'unknown';
  const text=contextChanged?'Result belongs to a different execution context':edited?'Editor changed since this execution':recorded?'Editor matches the execution snapshot':'Execution source was not recorded';
  return {key,text,edited,contextChanged,profile:result.executedProfile||profile||'Unknown profile',executedAt:result.executedAt,sqlVersion:result.sqlVersion,serverSourceVersion:result.compiledSourceVersion,call:!!result.runConfiguration};
}
