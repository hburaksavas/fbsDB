import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlOutline} from '../src/editorNavigation.js';
import {outlineBreadcrumbs,outlineDocumentSymbols} from '../src/outlineModel.js';
test('source hierarchy provides package/routine/block context and actual sibling navigation',()=>{
 const source='CREATE PACKAGE BODY demo AS\n PROCEDURE first IS BEGIN NULL; END;\n PROCEDURE second IS BEGIN NULL; END;\nEND;';
 const outline=sqlOutline(source),offset=source.indexOf('NULL');
 const path=outlineBreadcrumbs(outline,offset);assert.deepEqual(path.ancestors.map(item=>item.kind),['PACKAGE','PROCEDURE']);assert.equal(path.neighbors.length,2);
 const symbols=outlineDocumentSymbols(outline,offset=>({lineNumber:source.slice(0,offset).split('\n').length,column:1}));assert.equal(symbols.length,1);assert.equal(symbols[0].children.length,2);assert.equal(symbols[0].children[1].range.startLineNumber,3);
});
test('named regions are paired through real comments, excluding strings and unmatched markers',()=>{
 const source="BEGIN\n-- #region Billing\n NULL;\n-- #region Inner\n NULL;\n-- #endregion\n-- #endregion\n x := '-- #region literal';\n-- #endregion\nEND;";
 const regions=sqlOutline(source).filter(item=>item.kind==='Region');assert.deepEqual(regions.map(item=>item.name),['Billing','Inner']);assert.ok(regions[0].end>regions[1].end);
});
