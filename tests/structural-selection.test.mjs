import test from 'node:test';
import assert from 'node:assert/strict';
import {structuralRanges} from '../src/structuralSelection.js';
const texts=(text,offset)=>structuralRanges(text,offset).map(([a,b])=>text.slice(a,b));
test('selection grows from a name through condition, parentheses and statement',()=>{
 const sql="SELECT id FROM orders o WHERE o.status = 'OPEN' AND (o.total > 10 OR o.vip = 'Y');";
 const steps=texts(sql,sql.indexOf('total')+1);
 assert.deepEqual(steps.slice(0,5),['total','o.total','o.total > 10',"o.total > 10 OR o.vip = 'Y'","(o.total > 10 OR o.vip = 'Y')"]);
 assert.ok(steps.includes("o.status = 'OPEN' AND (o.total > 10 OR o.vip = 'Y')"));
 assert.ok(steps.includes("SELECT id FROM orders o WHERE o.status = 'OPEN' AND (o.total > 10 OR o.vip = 'Y');"));
 assert.equal(steps.at(-1),sql);
});
test('select list items and function arguments are steps of their own',()=>{
 const sql='SELECT NVL(a.amount, 0) AS amount, b.name FROM a';
 const steps=texts(sql,sql.indexOf('amount')+2);
 assert.deepEqual(steps.slice(0,4),['amount','a.amount','a.amount, 0','(a.amount, 0)']);
 assert.ok(steps.includes('NVL(a.amount, 0) AS amount'));
});
test('PL/SQL statements grow to the enclosing block body; ranges always nest',()=>{
 const text='BEGIN\n  x := 1;\n  IF x > 0 THEN\n    y := 2;\n  END IF;\nEND;';
 const ranges=structuralRanges(text,text.indexOf('y :=')+1);
 for(let i=1;i<ranges.length;i++)assert.ok(ranges[i][0]<=ranges[i-1][0]&&ranges[i][1]>=ranges[i-1][1]);
 assert.ok(ranges.map(([a,b])=>text.slice(a,b)).includes('y := 2'));
 assert.equal(text.slice(...ranges.at(-1)),text);
});
test('block body step covers the statements between BEGIN and END',()=>{
 const text='BEGIN\n  x := 1;\n  y := 2;\nEND;';
 assert.ok(texts(text,text.indexOf('y')).includes('x := 1;\n  y := 2;'));
});
