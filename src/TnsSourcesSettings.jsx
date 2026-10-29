import { isNativeHost,sendNativeCommand } from './nativeBridge';

export function TnsSourcesSettings({aliases}) {
  const sources=[...new Set(aliases.map(alias=>alias.source))];
  return <section><h3>TNS sources</h3><p>Oracle aliases are discovered from TNS_ADMIN and configured Oracle files. Basic and Custom connections can be used without TNS files.</p><div className="settings-tns-sources">{sources.map(source=><code key={source}>{source}</code>)}{!sources.length&&<p>No aliases discovered.</p>}</div><div className="nls-actions"><button type="button" disabled={!isNativeHost} onClick={()=>sendNativeCommand('connection.list')}>Refresh sources</button><button type="button" disabled={!isNativeHost} onClick={()=>sendNativeCommand('tns.add')}>Add TNS file</button></div></section>;
}
