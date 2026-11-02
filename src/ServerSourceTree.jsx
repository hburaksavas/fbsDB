import {useMemo,useState} from 'react';
import {Cloud} from 'lucide-react';
import {serverSourceNotice,serverSourceTree} from './serverSources';

// Virtual source tree: every entry is a database definition, opened read-only; local project files stay in the Files view.
export function ServerSourceTree({objects,defaultOwner,connected,error,onOpen}) {
  const [query,setQuery]=useState('');
  const tree=useMemo(()=>serverSourceTree(objects,{query,defaultOwner}),[objects,query,defaultOwner]);
  return <div className="server-sources" role="region" aria-label="Server sources">
    <p className="server-sources-notice"><Cloud size={13} aria-hidden="true"/>{serverSourceNotice}</p>
    <input type="search" aria-label="Filter server sources" placeholder="Filter server sources" value={query} onChange={event=>setQuery(event.target.value)}/>
    {error&&<p role="alert" className="server-sources-error">{error}</p>}
    {!tree.count&&<p className="server-sources-empty">{connected?'No packages, routines, triggers or types match.':'Connect to a database to browse its server sources.'}</p>}
    {tree.groups.map(group=><section key={group.type} aria-label={group.label}><h4>{group.label} <span>{group.items.length}</span></h4>
      {group.items.map(entry=><div key={entry.key} className="server-source-entry"><span className="server-source-name" title={`${entry.owner}.${entry.name}`}>{entry.owner}.{entry.name}</span>
        {entry.parts.map(part=><button key={part.file} type="button" className="server-source-open" title={`Open ${part.file} from the server (read-only)`} aria-label={`Open server ${part.label.toLowerCase()} ${entry.owner}.${entry.name}`} onClick={()=>onOpen(part.target)}><span className="server-badge">Server</span>{part.label}</button>)}
      </div>)}
    </section>)}
  </div>;
}
