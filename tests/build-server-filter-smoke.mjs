import { writeFileSync } from 'node:fs';
import { buildServerFilter } from '../src/resultAdvanced.js';
const filtered=buildServerFilter("SELECT LEVEL AS ID, CASE WHEN MOD(LEVEL,2)=0 THEN 'Alpha' ELSE 'Beta' END AS NAME FROM DUAL CONNECT BY LEVEL<=:count",[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'}],{filterGroups:[{id:'either',logic:'or',parent:'root'}],filters:[{column:0,op:'gt',kind:'number',value:'5'},{column:1,op:'starts',value:'A',group:'either'},{column:0,op:'lt',kind:'number',value:'8',group:'either'}]},[{name:'count',type:'NUMBER',value:'20'}]);
writeFileSync('artifacts/server-filter-smoke.json',JSON.stringify(filtered));
