import {useSyncExternalStore} from 'react';
import {announcementSnapshot,subscribeAnnouncements} from './announcer';

// Mounted once. Visually hidden; the text changes, the region stays, so assistive technology reads each announcement.
export function LiveAnnouncer() {
  const state=useSyncExternalStore(subscribeAnnouncements,announcementSnapshot,announcementSnapshot);
  return <div className="live-announcer">
    <div role="status" aria-live="polite" aria-atomic="true" data-announcer="polite">{state.polite}</div>
    <div role="alert" aria-live="assertive" aria-atomic="true" data-announcer="assertive">{state.assertive}</div>
  </div>;
}
