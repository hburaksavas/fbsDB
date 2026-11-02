import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRuleFindings,scanProfiles,scanSourceFile,summarizeFindings} from '../src/portabilityCheck.js';
const bs=String.fromCharCode(92);
test('absolute paths are separated into workspace-internal and machine-specific ones',()=>{
 const root=['D:','work','proj'].join(bs);
 const file={path:'a.sql',content:`-- header\nSPOOL ${['C:','temp','out.log'].join(bs)}\n@${['D:','work','proj','run.sql'].join(bs)}\nselect '/home/user/x' from dual;\n@/home/ana/scripts/x.sql`};
 const findings=scanSourceFile(file,root);
 assert.deepEqual(findings.map(item=>[item.kind,item.line]),[['machine-path',2],['workspace-absolute-path',3],['machine-path',4],['machine-path',5]]);
 assert.match(findings[0].detail,/out\.log$/);assert.match(findings[1].advice,/relative to the workspace/);
 assert.deepEqual(scanSourceFile({path:'b.sql',content:'select 1 from dual -- plain'},root),[]);
});
test('host commands are reported as local tool dependencies',()=>{
 const findings=scanSourceFile({path:'c.sql',content:'HOST sqlldr control=load.ctl\nselect 1 from dual;'},'D:/proj');
 assert.equal(findings.some(item=>item.kind==='local-tool'&&item.line===1),true);
});
test('TNS aliases and project rule paths are reported only when referenced or absolute',()=>{
 const profiles=[{id:'DEV',name:'Dev',method:'tns',alias:'DEVDB',source:['C:','oracle','network','admin','tnsnames.ora'].join(bs)},{id:'BASIC',method:'basic'},{id:'UNUSED',method:'tns',alias:'X',source:'x'}];
 const findings=scanProfiles(profiles,new Set(['DEV','BASIC']),'D:/work/proj');
 assert.equal(findings.length,1);assert.equal(findings[0].kind,'tns-dependency');assert.match(findings[0].detail,/DEVDB from C:/);
 assert.equal(scanProfiles([{id:'IN',method:'tns',alias:'A',source:'D:/work/proj/net/tnsnames.ora'}],new Set(['IN']),'D:/work/proj')[0].advice.includes('inside the workspace'),true);
 const rules=projectRuleFindings({project:{areas:{packages:'packages',tests:'C:/x/tests'}},packagePairs:[{specification:'packages/{name}.pks',body:'/abs/{name}.pkb'}],testPatterns:['tests/{name}.sql']},'D:/work/proj');
 assert.deepEqual(rules.map(item=>item.detail),['area tests: C:/x/tests','package body: /abs/{name}.pkb']);
});
test('summary counts by kind and bounds the list',()=>{
 const many=Array.from({length:400},(_,i)=>({kind:i%2?'machine-path':'local-tool',file:'f',line:i,detail:'d',advice:'a'}));
 const summary=summarizeFindings(many);
 assert.equal(summary.findings.length,300);assert.equal(summary.truncated,true);assert.deepEqual(summary.counts,{'local-tool':200,'machine-path':200});assert.equal(summary.total,400);
});
