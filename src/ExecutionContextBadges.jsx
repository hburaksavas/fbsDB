import {Clock3,LoaderCircle,Plug,Unplug,Diamond} from 'lucide-react';
import {resultProvenance} from './executionContext';

// compact: the tab-strip variant, plain text without a box so the file name keeps priority.
export function EnvironmentBadge({environment,profileName,saved=false,compact=false}) {
  if(!environment||environment==='UNKNOWN'&&(!profileName||profileName==='No profile'))return null;
  const dot=compact&&environment!=='PROD';
  return <span className={`environment-badge${compact?' compact':''}${dot?' environment-dot':''}`} data-env={environment} aria-label={environment==='UNKNOWN'?'Environment unknown':environment} title={`${saved?'Saved file profile':'Connection profile'}: ${profileName} · ${environment}`}>{dot?null:environment==='UNKNOWN'?'? env':environment}{saved?<small> saved</small>:null}</span>;
}

export function TabConnectionBadge({connection,otherPending}) {
  if(!connection)return null;
  const Icon=connection.state==='connecting'?LoaderCircle:connection.state==='inactive'?Clock3:connection.state==='disconnected'?Unplug:connection.pending?Diamond:Plug;
  // The steady "connected" state is shown by its plug shape alone; every exceptional state keeps visible text.
  const label=connection.state==='connected'&&!connection.pending?'':connection.short;
  return <span className="tab-connection-badge" data-state={connection.state} data-pending={connection.pending||otherPending||undefined} title={`${connection.profileName} · ${connection.text}${otherPending?' · another package source has pending work':''}`} aria-label={`${connection.text}${otherPending?' · another package source has pending work':''}`}><Icon size={10} aria-hidden="true"/>{label}{otherPending&&!connection.pending?(label?' · TX':'TX'):''}</span>;
}

export function ResultSourceProvenance({result,document,connection,context}) {
  const provenance=resultProvenance(result,document,connection,context);
  if(!provenance)return null;
  const version=provenance.serverSourceVersion||provenance.sqlVersion;
  return <div className="result-source-provenance" data-kind={provenance.key} aria-label="Result source version">
    <strong>{provenance.text}</strong>{provenance.contextChanged&&provenance.edited&&<span>Editor also changed since execution</span>}
    <span>{provenance.profile}{provenance.executedAt?' · '+new Date(provenance.executedAt).toLocaleString():''}</span>
    {version&&<code title={version}>{provenance.serverSourceVersion?'Server source':'SQL'} {version.slice(0,12)}</code>}
    {provenance.call&&<span>Call SQL recorded · routine implementation version is not captured</span>}
  </div>;
}
