const pattern = /^Scratch (\d+)\.sql$/;

// Scratch tabs are numbered per session so several experiments can be told apart.
export function nextScratchName(tabs = []) {
  const used = tabs.map(tab => pattern.exec(tab.name || '')?.[1]).filter(Boolean).map(Number);
  return `Scratch ${(used.length ? Math.max(...used) : 0) + 1}.sql`;
}

// A scratch tab has no project file; once it gets a path it has been promoted and behaves like any document.
export const isScratch = tab => Boolean(tab?.scratch && !tab.path);

// Closing a scratch tab never prompts to save: its text is an experiment unless the user promoted it.
export const promptsOnClose = tab => Boolean(tab?.dirty && !tab.readOnly && !isScratch(tab));
