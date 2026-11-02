export const compareLimits = { bytes: 2 * 1024 * 1024, files: 2 };
const textExtensions = /\.(sql|pks|pkb|prc|fnc|trg|txt|md|json|xml|csv|log|ora|ctl|sh|ps1)$/i;

// Accepts dropped files for a comparison; anything binary-looking, oversized or beyond two files is reported, never read silently.
export async function readDroppedFiles(files, readText = file => file.text()) {
  const accepted = [], rejected = [];
  for (const file of [...files || []]) {
    if (accepted.length >= compareLimits.files) { rejected.push({ name: file.name, reason: 'Only two files can be compared at once.' }); continue; }
    if (file.size > compareLimits.bytes) { rejected.push({ name: file.name, reason: 'Larger than 2 MB.' }); continue; }
    if (file.name && !textExtensions.test(file.name) && file.type && !file.type.startsWith('text/')) { rejected.push({ name: file.name, reason: 'Not a text file.' }); continue; }
    const text = await readText(file);
    if (text.includes('\u0000')) { rejected.push({ name: file.name, reason: 'Contains binary data.' }); continue; }
    accepted.push({ label: file.name || 'Dropped file', text });
  }
  return { accepted, rejected };
}

// Dropped files fill the empty side first, then replace the right side; a pair fills both.
export function placeSources(current, accepted) {
  if (accepted.length >= 2) return { left: accepted[0], right: accepted[1] };
  if (accepted.length === 1) return !current.left ? { ...current, left: accepted[0] } : { ...current, right: accepted[0] };
  return current;
}

export function comparisonSummary(left, right) {
  if (!left || !right) return 'Choose both sides to compare.';
  if (left.text === right.text) return 'The two sides are identical.';
  const lines = text => text.split(/\r?\n/);
  const a = lines(left.text), b = lines(right.text);
  return `${a.length.toLocaleString('en-US')} lines vs ${b.length.toLocaleString('en-US')} lines. Differences are highlighted.`;
}
