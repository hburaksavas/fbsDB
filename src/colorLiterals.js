import { lexOracle } from './oracleLexer.js';

const hex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
const rgb = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)/gi;

const channel = value => Math.max(0, Math.min(255, value)) / 255;

// Colors written as text inside string literals and comments only; a "#" or "rgb(" in code is never treated as a color.
export function findColors(sql) {
  const found = [];
  for (const token of lexOracle(String(sql)).filter(item => item.kind === 'string' || item.kind === 'comment')) {
    const text = String(sql).slice(token.start, token.end);
    for (const match of text.matchAll(hex)) {
      const digits = match[0].slice(1), full = digits.length === 3 ? [...digits].map(ch => ch + ch).join('') : digits;
      found.push({ start: token.start + match.index, end: token.start + match.index + match[0].length, red: parseInt(full.slice(0, 2), 16) / 255, green: parseInt(full.slice(2, 4), 16) / 255, blue: parseInt(full.slice(4, 6), 16) / 255, alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1, format: 'hex' });
    }
    for (const match of text.matchAll(rgb)) {
      const parts = [match[1], match[2], match[3]].map(Number);
      if (parts.some(part => part > 255)) continue;
      found.push({ start: token.start + match.index, end: token.start + match.index + match[0].length, red: channel(parts[0]), green: channel(parts[1]), blue: channel(parts[2]), alpha: match[4] === undefined ? 1 : Number(match[4]), format: 'rgb' });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const byte = value => Math.round(value * 255);
const two = value => byte(value).toString(16).padStart(2, '0');

// The text a color picker writes back, in the same notation the user already used.
export function colorPresentation({ red, green, blue, alpha }, format) {
  if (format === 'rgb') return alpha < 1 ? `rgba(${byte(red)}, ${byte(green)}, ${byte(blue)}, ${Number(alpha.toFixed(2))})` : `rgb(${byte(red)}, ${byte(green)}, ${byte(blue)})`;
  return `#${two(red)}${two(green)}${two(blue)}${alpha < 1 ? two(alpha) : ''}`;
}
