import {useSyncExternalStore} from 'react';
import {draftStoreVersion,listTabDrafts,saveStoredDrafts,subscribeDraftStore} from './draftStore';
import {getNativeTabId} from './nativeBridge';
import {heldDraftsNotice} from './heldDrafts';

// Shown above a result that is not the one the tab's unapplied edits belong to.
export function HeldDraftsNotice({currentKey}) {
  useSyncExternalStore(subscribeDraftStore,draftStoreVersion,draftStoreVersion);
  const notice=heldDraftsNotice(listTabDrafts(getNativeTabId()),currentKey);
  if(!notice)return null;
  return <p className="held-drafts-notice" role="status" aria-label="Unapplied edits kept">{notice.text}<button type="button" onClick={()=>notice.keys.forEach(key=>saveStoredDrafts(key,null))}>Discard</button></p>;
}
