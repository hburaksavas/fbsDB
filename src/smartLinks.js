const scanLimit = 2000;
const sourceExtensions = /\.(sql|pks|pkb|prc|fnc|trg)$/i;
const identifier = '(?:"[^"]{1,128}"|[A-Za-z][A-Za-z0-9_$#]{0,127})';
const qualifiedObject = new RegExp(`^(${identifier})\\.(${identifier})$`);
const unquote = text => text.startsWith('"') ? text.slice(1, -1) : text.toUpperCase();

// Detection only proposes an explicit action; nothing opens or navigates on render or click.
export function detectSmartLink(value) {
  if (value == null || typeof value === 'object') return null;
  const text = String(value).slice(0, scanLimit).trim();
  if (!text) return null;
  const url = text.match(/\bhttps?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;]+$/, '');
  if (url) { try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol)) return { kind: 'url', text: url, target: parsed.href }; } catch { /* not a URL */ } }
  const email = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/)?.[0];
  if (email) return { kind: 'email', text: email, target: `mailto:${email}` };
  if (/^(?:[A-Za-z]:\\|\\\\[^\\\s]+\\[^\\\s]+)[^<>"|?*\r\n]*$/.test(text)) return { kind: 'path', text, target: text, openable: sourceExtensions.test(text) };
  const object = text.match(qualifiedObject);
  if (object) return { kind: 'object', text, owner: unquote(object[1]), name: unquote(object[2]) };
  return null;
}

export const smartLinkActionLabel = { url: 'Open URL in browser', email: 'Compose email', path: 'Open file in editor', object: 'Show Oracle object' };
