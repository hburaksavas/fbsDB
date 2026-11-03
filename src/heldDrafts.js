// Unapplied grid edits stay in memory while another result is shown. This says so, so they are not forgotten.
export function heldDraftsNotice(entries, currentKey) {
  const held = entries.filter(entry => entry.key !== currentKey && entry.count > 0);
  if (!held.length) return null;
  const total = held.reduce((sum, entry) => sum + entry.count, 0);
  const names = held.map(entry => entry.table);
  const shown = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
  return {
    total, keys: held.map(entry => entry.key),
    text: `${total.toLocaleString('en-US')} unapplied grid edit${total === 1 ? ' is' : 's are'} kept for ${shown}. Run its query again to continue, or discard ${total === 1 ? 'it' : 'them'}.`
  };
}
