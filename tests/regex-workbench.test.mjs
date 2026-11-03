import test from 'node:test';
import assert from 'node:assert/strict';
import {runRegex,translatePattern} from '../src/regexWorkbench.js';
const run=(operation,pattern,text,extra={})=>runRegex({operation,pattern,text,...extra});
test('POSIX classes and Oracle anchors are translated',()=>{
 assert.equal(run('substr','[[:digit:]]+','abc 1234 x').value,'1234');assert.equal(run('count','[[:alpha:]]+','ab 12 cd').value,'2');
 assert.equal(run('like','^[[:upper:]][[:lower:]]+$','Hello').value,'TRUE');assert.equal(run('like','\\Aab','ab').value,'TRUE');assert.equal(run('like','\\Aab','cab').value,'FALSE');
 assert.equal(run('substr','[^[:space:]]+','  word  ').value,'word');
});
test('match parameters change case, dot and line anchors',()=>{
 assert.equal(run('like','abc','ABC').value,'FALSE');assert.equal(run('like','abc','ABC',{parameter:'i'}).value,'TRUE');assert.equal(run('like','abc','ABC',{parameter:'ic'}).value,'FALSE');
 assert.equal(run('like','a.b','a\nb').value,'FALSE');assert.equal(run('like','a.b','a\nb',{parameter:'n'}).value,'TRUE');assert.equal(run('like','^b','a\nb',{parameter:'m'}).value,'TRUE');
});
test('substr, instr and count honour position, occurrence and subexpression like the SQL functions',()=>{
 assert.equal(run('substr','(\\w+)@(\\w+)','a@b c@d',{occurrence:2}).value,'c@d');assert.equal(run('substr','(\\w+)@(\\w+)','a@b c@d',{occurrence:2,subexpression:2}).value,'d');
 assert.equal(run('instr','o','foo boo',{occurrence:3}).value,'6');assert.equal(run('instr','o+','foo boo',{returnOption:1}).value,'4');assert.equal(run('instr','z','foo').value,'0');
 assert.equal(run('count','o','foo boo',{position:4}).value,'2');assert.equal(run('substr','x','abc').value,null);
});
test('replace expands back references and replaces one or all occurrences',()=>{
 assert.equal(run('replace','(\\w+) (\\w+)','hello world',{replacement:'\\2 \\1'}).value,'world hello');
 assert.equal(run('replace','a','banana',{replacement:'o',occurrence:0}).value,'bonono');assert.equal(run('replace','a','banana',{replacement:'o',occurrence:2}).value,'banona');
 assert.equal(run('replace','x','abc',{replacement:'y'}).value,'abc');
});
test('constructs Oracle does not have are refused, not approximated',()=>{
 for(const [pattern,part] of [['(?=a)','Lookahead'],['\\bword','word boundaries'],['(?i)a','Inline flags'],['(?<n>a)','named groups'],['[[:bogus:]]','Unknown character class'],['[abc','not closed'],['(a','not valid'],['','Enter a pattern']])assert.match(translatePattern(pattern).error,new RegExp(part),pattern);
 assert.match(translatePattern('a','x').error,/not supported/);assert.match(translatePattern('a','q').error,/Unknown match parameter/);
});
