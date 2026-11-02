const normalize = value => String(value || '').split(String.fromCharCode(92)).join('/').toLowerCase();
const same = (a, b) => normalize(a) === normalize(b);

// Decides how an Explorer open behaves: single clicks reuse one clean preview tab, explicit opens are persistent.
export function previewOpenPlan({ previewId = null, tabs = [] }, file, { preview = false, enabled = true } = {}) {
  const cached = tabs.find(tab => tab.path && same(tab.path, file.path));
  if (cached) return { type: 'activate', id: cached.id, promote: cached.id === previewId && !preview };
  if (preview && enabled) {
    const reusable = tabs.find(tab => tab.id === previewId && !tab.dirty);
    return { type: 'open', asPreview: true, replace: reusable ? reusable.id : null };
  }
  return { type: 'open', asPreview: false, replace: null };
}

// A preview tab becomes a normal tab as soon as it is edited, and disappears from tracking when closed.
export function settlePreview(previewId, tabs = []) {
  const tab = tabs.find(item => item.id === previewId);
  return tab && !tab.dirty ? previewId : null;
}
