// A defined subset of Oracle date format models, evaluated locally: what you see is what TO_CHAR would produce for that value with the
// chosen date language. Elements outside the subset are reported, never approximated.
const names = {
  en: { months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  tr: { months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'], days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
    monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'], daysShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] },
};
for (const dictionary of Object.values(names)) { dictionary.monthsShort ??= dictionary.months.map(name => name.slice(0, 3)); dictionary.daysShort ??= dictionary.days.map(name => name.slice(0, 3)); }
export const dateLanguages = Object.freeze([{ id: 'en', label: 'English (AMERICAN)' }, { id: 'tr', label: 'Turkish (TURKISH)' }]);
export const supportedElements = Object.freeze(['YYYY', 'YY', 'MM', 'MONTH', 'MON', 'DD', 'DDD', 'DAY', 'DY', 'D', 'HH24', 'HH12', 'HH', 'MI', 'SS', 'FF1-FF9', 'AM/PM', 'A.M./P.M.', 'Q', 'FM', '"text"', '- / , . : ; space']);

const elements = ['A.M.', 'P.M.', 'YYYY', 'MONTH', 'HH24', 'HH12', 'FF1', 'FF2', 'FF3', 'FF4', 'FF5', 'FF6', 'FF7', 'FF8', 'FF9', 'MON', 'DDD', 'DAY', 'YY', 'MM', 'DD', 'DY', 'HH', 'MI', 'SS', 'AM', 'PM', 'FM', 'D', 'Q'];
const punctuation = new Set(['-', '/', ',', '.', ':', ';', ' ']);

export function tokenizeFormat(format) {
  const text = String(format ?? '');
  const tokens = [];
  for (let at = 0; at < text.length;) {
    if (text[at] === '"') {
      const end = text.indexOf('"', at + 1);
      if (end < 0) return { error: 'A quoted text is not closed.' };
      tokens.push({ kind: 'text', value: text.slice(at + 1, end) }); at = end + 1; continue;
    }
    const upper = text.slice(at).toUpperCase();
    const element = elements.find(item => upper.startsWith(item));
    if (element) {
      const written = text.slice(at, at + element.length);
      tokens.push({ kind: 'element', value: element, upperCase: written === written.toUpperCase(), titleCase: written[0] === written[0].toUpperCase() && written.slice(1) === written.slice(1).toLowerCase() }); at += element.length; continue;
    }
    if (punctuation.has(text[at])) { tokens.push({ kind: 'text', value: text[at] }); at++; continue; }
    return { error: `“${text.slice(at, at + 4)}” is not a supported format element.`, at };
  }
  if (!tokens.length) return { error: 'Enter a format model.' };
  return { tokens };
}

const pad = (value, width) => String(value).padStart(width, '0');
const dayOfYear = date => Math.floor((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(date.year, 0, 0)) / 86400000);
const weekday = date => new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();

// date: { year, month (1-12), day, hour, minute, second, fraction (digits string, up to 9) }
export function formatDate(date, tokens, language = 'en') {
  const dictionary = names[language] || names.en;
  let fillMode = false;
  let out = '';
  const cased = (text, token) => token.upperCase ? text.toUpperCase() : token.titleCase ? text : text.toLowerCase();
  const number = (value, width) => fillMode ? String(value) : pad(value, width);
  for (const token of tokens) {
    if (token.kind === 'text') { out += token.value; continue; }
    switch (token.value) {
      case 'FM': fillMode = !fillMode; break;
      case 'YYYY': out += number(date.year, 4); break;
      case 'YY': out += pad(date.year % 100, 2); break;
      case 'MM': out += number(date.month, 2); break;
      case 'MONTH': { const name = dictionary.months[date.month - 1]; out += cased(fillMode ? name : name.padEnd(9), token); break; }
      case 'MON': out += cased(dictionary.monthsShort[date.month - 1], token); break;
      case 'DD': out += number(date.day, 2); break;
      case 'DDD': out += number(dayOfYear(date), 3); break;
      case 'DAY': { const name = dictionary.days[weekday(date)]; out += cased(fillMode ? name : name.padEnd(9), token); break; }
      case 'DY': out += cased(dictionary.daysShort[weekday(date)], token); break;
      case 'D': out += String(weekday(date) + 1); break;
      case 'HH24': out += number(date.hour, 2); break;
      case 'HH12': case 'HH': out += number(date.hour % 12 === 0 ? 12 : date.hour % 12, 2); break;
      case 'MI': out += number(date.minute, 2); break;
      case 'SS': out += number(date.second, 2); break;
      case 'Q': out += String(Math.ceil(date.month / 3)); break;
      case 'AM': case 'PM': out += token.upperCase ? (date.hour < 12 ? 'AM' : 'PM') : (date.hour < 12 ? 'am' : 'pm'); break;
      case 'A.M.': case 'P.M.': out += date.hour < 12 ? 'A.M.' : 'P.M.'; break;
      default: if (/^FF[1-9]$/.test(token.value)) out += (date.fraction || '').padEnd(9, '0').slice(0, Number(token.value[2])); break;
    }
  }
  return out;
}

// Reads text with the same model (TO_DATE direction). Only numeric elements and names in the chosen language are read; anything else fails clearly.
export function parseDate(text, tokens, language = 'en') {
  const dictionary = names[language] || names.en;
  const source = String(text ?? '');
  const value = { year: null, month: null, day: null, hour: 0, minute: 0, second: 0, fraction: '', pm: null, hour12: false };
  let at = 0;
  const digits = (min, max) => { const match = new RegExp(`^\\d{${min},${max}}`).exec(source.slice(at)); if (!match) return null; at += match[0].length; return Number(match[0]); };
  for (const token of tokens) {
    if (token.kind === 'text') { if (token.value === ' ') { while (source[at] === ' ') at++; } else if (source.startsWith(token.value, at)) at += token.value.length; else return { error: `Expected “${token.value}” at position ${at + 1}.` }; continue; }
    const read = (key, min, max) => { const got = digits(min, max); if (got == null) return { error: `Expected digits for ${token.value} at position ${at + 1}.` }; value[key] = got; return null; };
    let failure = null;
    switch (token.value) {
      case 'FM': break;
      case 'YYYY': failure = read('year', 4, 4); break;
      case 'YY': { failure = read('year', 2, 2); if (!failure) value.year += value.year < 50 ? 2000 : 1900; break; }
      case 'MM': failure = read('month', 1, 2); break;
      case 'DD': failure = read('day', 1, 2); break;
      case 'HH24': failure = read('hour', 1, 2); break;
      case 'HH12': case 'HH': failure = read('hour', 1, 2); value.hour12 = true; break;
      case 'MI': failure = read('minute', 1, 2); break;
      case 'SS': failure = read('second', 1, 2); break;
      case 'MON': case 'MONTH': {
        const rest = source.slice(at).toLowerCase();
        const index = dictionary.months.findIndex(name => token.value === 'MON' ? rest.startsWith(dictionary.monthsShort[dictionary.months.indexOf(name)].toLowerCase()) : rest.startsWith(name.toLowerCase()));
        if (index < 0) { failure = { error: `Expected a month name at position ${at + 1}.` }; break; }
        value.month = index + 1; at += token.value === 'MON' ? 3 : dictionary.months[index].length; while (token.value === 'MONTH' && source[at] === ' ' && /^ +\S/.test(source.slice(at)) === false) at++; break;
      }
      case 'AM': case 'PM': case 'A.M.': case 'P.M.': {
        const rest = source.slice(at).toUpperCase();
        if (rest.startsWith('AM') || rest.startsWith('A.M.')) { value.pm = false; at += rest.startsWith('AM') ? 2 : 4; } else if (rest.startsWith('PM') || rest.startsWith('P.M.')) { value.pm = true; at += rest.startsWith('PM') ? 2 : 4; } else failure = { error: `Expected AM or PM at position ${at + 1}.` };
        break;
      }
      default:
        if (/^FF[1-9]$/.test(token.value)) { const match = /^\d+/.exec(source.slice(at)); if (!match) failure = { error: `Expected fractional seconds at position ${at + 1}.` }; else { value.fraction = match[0].slice(0, Number(token.value[2])); at += match[0].length; } }
        else failure = { error: `${token.value} cannot be read back; it can only be used to print a date.` };
    }
    if (failure) return failure;
  }
  if (at < source.length) return { error: `Unexpected “${source.slice(at, at + 6)}” at position ${at + 1}; the text is longer than the format.` };
  if (value.year == null) value.year = new Date().getFullYear();
  if (value.month == null) value.month = new Date().getMonth() + 1;
  if (value.day == null) value.day = 1;
  if (value.hour12) { if (value.hour < 1 || value.hour > 12) return { error: 'The 12-hour clock needs 1 to 12.' }; value.hour = (value.hour % 12) + (value.pm ? 12 : 0); }
  const check = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second));
  if (value.month < 1 || value.month > 12 || check.getUTCMonth() !== value.month - 1 || check.getUTCDate() !== value.day || value.hour > 23 || value.minute > 59 || value.second > 59) return { error: 'That is not a real date and time.' };
  return { date: { year: value.year, month: value.month, day: value.day, hour: value.hour, minute: value.minute, second: value.second, fraction: value.fraction } };
}

export function dateFromInput(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/.exec(String(text ?? '').trim());
  if (!match) return { error: 'Use YYYY-MM-DD HH:MM:SS.' };
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0), fraction: match[7] || '' };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCMonth() !== date.month - 1 || check.getUTCDate() !== date.day || date.hour > 23 || date.minute > 59 || date.second > 59) return { error: 'That is not a real date and time.' };
  return { date };
}
