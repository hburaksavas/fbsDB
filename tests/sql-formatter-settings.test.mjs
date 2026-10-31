import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOracleDocument } from '../src/sqlFormatter.js';
import { sqlFormatterStyle, normalizeSqlFormatterSettings } from '../src/sqlFormatterSettings.js';
import { loadSettings, saveSettings, changeSetting, resolveSetting, importSettingsDocument } from '../src/settingsModel.js';
import { lexOracle } from '../src/oracleLexer.js';

test('custom SQL layout, casing and statement spacing are stable and preserve Oracle values', () => {
  const source = `SeLeCt "Mixed", q'[Some; SQL]', :Keep, 12345678901234567890 from dual where x = 'ABC' and y >= 2;\nselect 2 from dual;`;
  const style = sqlFormatterStyle({keywordCase:'lower',indentation:'spaces',tabSize:8,newlineAfterClause:false,newlineAfterComma:false,newlineBeforeLogical:false,blankLinesBetweenStatements:2});
  const formatted = formatOracleDocument(source,style).formatted;
  assert.match(formatted,/select "Mixed", q'\[Some; SQL\]', :Keep, 12345678901234567890\nfrom dual\nwhere x = 'ABC' and y >= 2;/);
  assert.ok(formatted.includes(';\n\n\nselect'));
  assert.equal(formatOracleDocument(formatted,style).formatted,formatted);
  const significant = text=>lexOracle(text).map(t=>t.kind==='identifier'&&!t.quoted?t.value.toUpperCase():text.slice(t.start,t.end));
  assert.deepEqual(significant(formatted),significant(source));
  assert.ok(formatOracleDocument('select a, b from dual;',sqlFormatterStyle({indentation:'spaces',tabSize:8})).formatted.includes('\n        a,'));
  assert.ok(formatOracleDocument('select a from dual;',sqlFormatterStyle({indentation:'tabs'})).formatted.includes('\n\ta'));
  assert.ok(formatOracleDocument('SeLeCt a FrOm dual;',sqlFormatterStyle({keywordCase:'preserve'})).formatted.startsWith('SeLeCt\n'));
});

test('formatter indentation follows editor for SQL and PL/SQL; invalid preferences fall back safely', () => {
  const style=sqlFormatterStyle({}, {insertSpaces:false,tabSize:4});
  assert.ok(formatOracleDocument('begin null; end;',style).formatted.includes('\n\tnull;'));
  assert.equal(normalizeSqlFormatterSettings({tabSize:999,keywordCase:'bad',newlineAfterComma:'no'}).tabSize,4);
  assert.equal(normalizeSqlFormatterSettings({newlineAfterComma:'no'}).newlineAfterComma,true);
});

test('formatter settings persist, export/import, reset and stay user scoped', () => {
  const data=new Map(), storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  let settings=loadSettings(storage);
  assert.equal(resolveSetting(settings,'editor.shortcuts').value.format,'Ctrl+Shift+F');
  settings=changeSetting(settings,'editor.sqlFormatter',{keywordCase:'lower',indentation:'spaces',tabSize:8});
  saveSettings(storage,settings);
  const restored=loadSettings(storage);
  assert.equal(resolveSetting(restored,'editor.sqlFormatter').value.keywordCase,'lower');
  assert.deepEqual(importSettingsDocument(JSON.stringify(restored)).user,restored.user);
  assert.equal(resolveSetting(changeSetting(restored,'editor.sqlFormatter',undefined),'editor.sqlFormatter').value.keywordCase,'upper');
  assert.throws(()=>changeSetting(restored,'editor.sqlFormatter',{keywordCase:'upper'},'workspace','D:/sql'),/Unsupported setting scope/);
});
