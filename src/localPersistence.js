import { notifyFeedback } from './feedbackStore.js';
export function persistLocal(storage, key, value) {
  try { storage.setItem(key, value); return true; }
  catch {
    notifyFeedback({id:`storage:${key}`,scope:null,kind:'error',title:'Local save failed',message:key==='fbsdb.sqlDrafts'?'Draft recovery could not be saved. Save your SQL to a file before closing the app.':'Preferences or history could not be saved on this device. Free local storage and try again.'});
    return false;
  }
}
