import assert from 'node:assert/strict';
import { getVisibleResultRows } from '../../src/resultRows.js';
import { csvText } from '../../src/resultWorkbench.js';
import { oracleLanguageCompletions } from '../../src/oracleLanguageService.js';
import { getSqlStatements } from '../../src/sqlStatements.js';
import { filteredWorkspaceTree } from '../../src/workspaceTree.js';

export const profiles = {
  smoke: { rows: 1000, objects: 1000, statements: 200, files: 1000, iterations: 3 },
  standard: { rows: 50000, objects: 10000, statements: 5000, files: 20000, iterations: 10 },
  stress: { rows: 200000, objects: 50000, statements: 20000, files: 100000, iterations: 20 },
};

const columns = [
  { name: 'ID', type: 'NUMBER' }, { name: 'NAME', type: 'VARCHAR2' },
  { name: 'AMOUNT', type: 'NUMBER' }, { name: 'NOTE', type: 'VARCHAR2' },
];
const makeRows = count => Array.from({ length: count }, (_, i) => [
  String(count - i), i % 10 === 0 ? 'İSTANBUL' : 'Ankara',
  i % 17 === 0 ? null : `${i}.25`, 'a,"b"\nç',
]);

// Every iteration validates output as well as timing the real production helper.
export const scenarios = {
  'result-filter-sort': {
    budgetMs: 3000,
    setup({ rows: count }) {
      const rows = makeRows(count);
      return () => {
        const visible = getVisibleResultRows(rows, columns, '  istanbul  ', 0, 'asc', [], { sortLocale: 'tr-TR' });
        assert.equal(visible.length, Math.ceil(count / 10));
        for (let i = 0; i < visible.length; i++) {
          const index = (visible.length - i - 1) * 10;
          assert.equal(visible[i].index, index);
          assert.equal(visible[i].row, rows[index]);
          assert.equal(rows[index][0], String(count - index));
        }
        return count;
      };
    },
  },
  'csv-export': {
    budgetMs: 3000,
    setup({ rows: count }) {
      const rows = makeRows(count);
      const prefix = `ID,NAME,AMOUNT,NOTE\r\n${count},İSTANBUL,,"a,""b""\nç"\r\n`;
      return () => {
        const csv = csvText(rows, columns);
        assert.ok(csv.startsWith(prefix));
        assert.equal(csv.split('\r\n').length, count + 1);
        const i = count - 1;
        assert.ok(csv.endsWith(`${count - i},${i % 10 === 0 ? 'İSTANBUL' : 'Ankara'},${i % 17 === 0 ? '' : `${i}.25`},"a,""b""\nç"`));
        return count;
      };
    },
  },
  'schema-completion': {
    budgetMs: 1500,
    setup({ objects: count }) {
      const objects = Array.from({ length: count }, (_, i) => ({
        owner: 'APP', name: `TABLE_${i}`, type: 'TABLE', columns,
      }));
      const source = `SELECT t. FROM TABLE_${count - 1} t`;
      return () => {
        const result = oracleLanguageCompletions(source, source.indexOf('t.') + 2, { objects, currentSchema: 'APP', automatic: true });
        const names = result.candidates.filter(item => !item.bulkColumns).map(item => item.label);
        for (const column of columns) assert.ok(names.includes(column.name), `Missing ${column.name}`);
        assert.equal(new Set(names).size, names.length);
        return 1;
      };
    },
  },
  'schema-wide-completion': {
    budgetMs: 1500,
    setup({ objects: count }) {
      // Catalog identities are eager; wide column metadata is loaded only for the referenced tables.
      const objects = Array.from({ length: count }, (_, i) => ({
        owner: `OWNER_${Math.floor(i / 500)}`, name: `TABLE_${i % 500}`, type: 'TABLE',
      }));
      const wide = [{ name: 'ID', type: 'NUMBER' }, ...Array.from({ length: 199 }, (_, i) => ({ name: `COL_${String(i).padStart(3, '0')}`, type: 'VARCHAR2' }))];
      objects.at(-1).columns = wide;
      objects[0].columns = [{ name: 'OTHER_ONLY', type: 'NUMBER' }];
      const target = `${objects.at(-1).owner}.${objects.at(-1).name}`;
      const marked = [
        `SELECT a.| FROM ${target} a JOIN OWNER_0.TABLE_0 b ON a.ID = b.OTHER_ONLY`,
        `WITH q AS (SELECT a.* FROM ${target} a) SELECT q.| FROM q`,
      ];
      return () => {
        for (const text of marked) {
          const result = oracleLanguageCompletions(text.replace('|', ''), text.indexOf('|'), { objects, currentSchema: 'OWNER_0', automatic: true });
          const labels = result.candidates.filter(item => !item.bulkColumns).map(item => item.label);
          assert.equal(labels.length, 200);
          assert.equal(new Set(labels).size, 200);
          for (const column of wide) assert.ok(labels.includes(column.name), `Missing wide column ${column.name}`);
          assert.ok(!labels.includes('OTHER_ONLY'));
        }
        return marked.length;
      };
    },
  },
  'sql-batch': {
    budgetMs: 3000,
    setup({ statements: count }) {
      const source = Array.from({ length: count }, (_, i) => i % 10 === 0
        ? `-- block ${i}\nBEGIN\n NULL;\nEND;\n/\n`
        : `SELECT ${i}, q'[a;b]', 'it''s;' FROM dual;\n`).join('');
      return () => {
        const result = getSqlStatements(source);
        assert.equal(result.length, count);
        for (let i = 0; i < count; i++) {
          assert.equal(result[i].sql, i % 10 === 0 ? 'BEGIN\n NULL;\nEND;' : `SELECT ${i}, q'[a;b]', 'it''s;' FROM dual;`);
          assert.equal(source.slice(result[i].start, result[i].end).trim(), result[i].sql);
        }
        return count;
      };
    },
  },
  'workspace-search': {
    budgetMs: 3000,
    setup({ files: count }) {
      const files = Array.from({ length: count }, (_, i) => {
        const relativePath = `queries/group_${i % 100}/query_${i}.sql`;
        return { relativePath, path: `C:\\load\\${relativePath.replaceAll('/', '\\')}` };
      });
      return () => {
        // Include both an unfiltered tree and a selective, case-insensitive search.
        const all = filteredWorkspaceTree(files, '');
        assert.equal(all.filter(item => !item.isDirectory).length, count);
        const result = filteredWorkspaceTree(files, 'QUERY_99.');
        assert.equal(result.filter(item => !item.isDirectory).length, 1);
        assert.ok(result.some(item => item.relativePath === 'queries/group_99' && item.isDirectory));
        return count * 2;
      };
    },
  },
};
