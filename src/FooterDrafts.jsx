import {useSyncExternalStore} from 'react';
import {countTabDrafts,draftStoreVersion,subscribeDraftStore} from './draftStore';

// Always-visible reminder that this tab holds grid edits Oracle has not received; clicking brings the results forward.
export function FooterDrafts({tabId,onShow}) {
  useSyncExternalStore(subscribeDraftStore,draftStoreVersion,draftStoreVersion);
  const count=countTabDrafts(tabId);
  if(!count)return null;
  return <button type="button" className="footer-drafts" aria-label={`${count} unapplied grid edit${count===1?'':'s'}. Show results`} title="Grid edits that have not been sent to Oracle" onClick={onShow}>{count} unapplied edit{count===1?'':'s'}</button>;
}
