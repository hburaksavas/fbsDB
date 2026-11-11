import { writeFile } from 'node:fs/promises';

// Oracle documents SQL's nonreserved vocabulary through V$RESERVED_WORDS.
// The desktop host supplements this offline, versioned reference with that view.
const versions = [19, 21, 23, 26];
const entries = new Map();
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const add = (name, kind, version, documentation) => {
  if (!/^[A-Z][A-Z0-9_$#]*(?: [A-Z]+)*$/.test(name)) return;
  const key = `${kind}:${name}`;
  if (!entries.has(key)) entries.set(key, { name, kind, versions: [], documentation });
  const item = entries.get(key);
  if (!item.versions.includes(version)) item.versions.push(version);
};

for (const version of versions) {
  const base = `https://docs.oracle.com/en/database/oracle/oracle-database/${version}/`;
  for (const [path, kind] of [
    ['sqlrf/Oracle-SQL-Reserved-Words.html', 'keyword'],
    ['lnpls/plsql-reserved-words-keywords.html', 'plsql'],
    ['sqlrf/Single-Row-Functions.html', 'function'],
    ['sqlrf/Aggregate-Functions.html', 'function'],
    ['sqlrf/Analytic-Functions.html', 'function'],
  ]) {
    const url = base + path;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const html = await response.text();
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
    if (kind === 'plsql') {
      for (const row of main.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
        if (cells.length === 2 && /^[A-Z]$/.test(plain(cells[0][1]))) {
          for (const word of plain(cells[1][1]).split(/[,\s]+/)) add(word, kind, version, url);
        }
      }
    } else if (kind === 'keyword') {
      for (const item of main.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const name = plain(item[1]).replace(/\s*(?:\*|\(See Note[\s\S]*)$/i, '').trim();
        add(name, kind, version, url);
      }
    } else {
      for (const item of main.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const link = item[1].match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!link) continue;
        const name = plain(link[2]).replace(/\s+\([^)]*\)$/, '').replace(/\([^)]*\)$/, '').trim();
        add(name, kind, version, new URL(link[1], url).href);
      }
    }
  }
}
const data = { versions, entries: [...entries.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)) };
for (const version of versions) for (const kind of ['keyword', 'plsql', 'function']) {
  const count = data.entries.filter(entry => entry.kind === kind && entry.versions.includes(version)).length;
  if (count < (kind === 'keyword' ? 90 : kind === 'plsql' ? 150 : 150)) throw new Error(`Incomplete ${version} ${kind} catalog (${count})`);
}
await writeFile(new URL('../../src/oracleCatalog.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
process.stdout.write(`Updated ${data.entries.length} Oracle catalog entries.\n`);
