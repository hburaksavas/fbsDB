import { parseOracleTemporal } from './oracleTemporal.js';

const offsetPattern = /^([+-])(\d{2}):(\d{2})$/;
export function offsetMinutes(text) {
  if (text === 'Z' || text === 'UTC' || text === '+00:00') return 0;
  const match = offsetPattern.exec(String(text || ''));
  if (!match || Number(match[2]) > 14 || Number(match[3]) > 59) return null;
  return (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1);
}
const pad = value => String(value).padStart(2, '0');
const offsetText = minutes => minutes === 0 ? '+00:00' : `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
const wall = (date, fraction) => `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${fraction ? `.${fraction}` : ''}`;

// Formats an instant in a fixed offset or an IANA zone; offsets never come from the browser for stored values.
export function formatInstant(instant, zone, fraction = '') {
  const fixed = offsetMinutes(zone);
  if (fixed != null) return `${wall(new Date(instant + fixed * 60000), fraction)} ${offsetText(fixed)}`;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const offset = (parts.timeZoneName || '').replace('GMT', '') || '+00:00';
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${fraction ? `.${fraction}` : ''} ${offset} ${zone}`;
  } catch { return null; }
}

// Describes what is stored and which conversions are derived; timezone-free values need an explicit assumption.
export function timezoneLens(value, { localZone, assumption = null } = {}) {
  const parsed = parseOracleTemporal(value);
  if (!parsed) return null;
  const type = value?.oracleType || 'DATE';
  const stored = `${value.value}${parsed.offset ? ` ${parsed.offset === 'Z' ? '+00:00' : parsed.offset}` : ''}${parsed.region ? ` ${parsed.region}` : ''}`;
  let source = null, basis = null;
  if (parsed.offset) { source = offsetMinutes(parsed.offset); basis = 'Stored offset'; }
  else if (/LOCAL TIME ZONE/i.test(type) && offsetMinutes(parsed.sessionTimeZone) != null) { source = offsetMinutes(parsed.sessionTimeZone); basis = `Session time zone ${parsed.sessionTimeZone}`; }
  else if (assumption != null && offsetMinutes(assumption) != null) { source = offsetMinutes(assumption); basis = `Assumed ${offsetText(source)} (not stored)`; }
  const result = { type, stored, timezoneFree: !parsed.offset && !/LOCAL TIME ZONE/i.test(type), sessionTimeZone: parsed.sessionTimeZone, region: parsed.region, conversions: [] };
  if (source == null) return { ...result, instant: null, note: result.timezoneFree ? 'No time zone is stored. Choose an explicit assumption to convert this value.' : 'The session time zone offset is unknown, so no absolute instant is shown.' };
  const instant = parsed.base - source * 60000;
  result.instant = instant; result.basis = basis;
  result.conversions.push({ label: 'UTC', text: formatInstant(instant, '+00:00', parsed.fraction) });
  if (localZone) result.conversions.push({ label: `Local (${localZone})`, text: formatInstant(instant, localZone, parsed.fraction) });
  if (parsed.sessionTimeZone) result.conversions.push({ label: `Session (${parsed.sessionTimeZone})`, text: formatInstant(instant, parsed.sessionTimeZone, parsed.fraction) });
  if (parsed.region) result.conversions.push({ label: `Stored region (${parsed.region})`, text: formatInstant(instant, parsed.region, parsed.fraction) });
  result.conversions = result.conversions.filter(item => item.text);
  return result;
}
