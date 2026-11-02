import {lexOracle} from './oracleLexer.js';
import {parsePlsql} from './plsqlStructure.js';
import {oracleReferenceLocations} from './oracleLanguageService.js';

const validName=name=>/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name)&&new TextEncoder().encode(name).length<=128;
const key=token=>token?.value?.toUpperCase();
const fail=error=>({error});

function parens(tokens,at){
  if(tokens[at]?.value!=='(')return null;
  let depth=0,parts=[],begin=at+1;
  for(let i=at;i<tokens.length;i++){
    if(tokens[i].value==='(')depth++;
    else if(tokens[i].value===')'&&!--depth){if(i>begin)parts.push(tokens.slice(begin,i));return {open:tokens[at],close:tokens[i],parts};}
    else if(tokens[i].value===','&&depth===1){parts.push(tokens.slice(begin,i));begin=i+1;}
  }
  return null;
}

export function planChangeSignature(source,cursor,change){
  if(source.length>100000)return fail('Change Signature is limited to 100,000 source characters.');
  const model=parsePlsql(source);
  if(!model.complete)return fail('Complete PL/SQL source is required.');
  const routines=model.scopes.flatMap(scope=>scope.routines.map(routine=>({routine,parent:scope})));
  const found=routines.find(({routine})=>routine.name&&routine.start<=cursor&&cursor<=routine.start+routine.name.length||routine.parameters.some(parameter=>parameter.start<=cursor&&cursor<=parameter.start+parameter.name.length));
  if(!found||found.routine.routineKind!=='PROCEDURE'||!found.routine.scope||!found.parent.parent)return fail('Place the caret on a local procedure name or parameter.');
  const {routine,parent}=found;
  if(routines.filter(item=>item.routine.key===routine.key).length!==1)return fail('Overloaded or repeated declarations need a broader semantic analysis.');
  const tokens=lexOracle(source).filter(token=>token.kind!=='comment');
  const declaration=tokens.findIndex(token=>token.start===routine.start);
  const signature=parens(tokens,declaration+1);
  if(!signature||signature.parts.length!==routine.parameters.length||!routine.parameters.length)return fail('A simple parameter list is required.');
  const comments=lexOracle(source).filter(token=>token.kind==='comment');
  if(comments.some(token=>token.start>=signature.open.end&&token.end<=signature.close.start))return fail('Comments in the parameter list require manual review.');
  const parts=signature.parts.map(part=>source.slice(part[0].start,part.at(-1).end));
  if(parts.some((part,index)=>!validName(routine.parameters[index].name)||/\b(?:DEFAULT|OUT|NOCOPY)\b|:=/i.test(part)))return fail('Only required IN parameters are supported.');
  const calls=[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];if(token.kind!=='identifier'||token.quoted||key(token)!==routine.key)continue;
    if(i===declaration)continue;
    if(tokens[i-1]?.value==='.'||tokens[i-1]?.value==='@')return fail('Qualified procedure references require semantic analysis.');
    if(token.start<parent.start||token.start>parent.end)return fail('A same-name reference lies outside the local scope.');
    if(tokens[i-1]?.value?.toUpperCase()==='END')continue;
    const args=parens(tokens,i+1);
    if(!args)return fail('An unresolved procedure reference prevents a complete preview.');
    if(comments.some(comment=>comment.start>=args.open.end&&comment.end<=args.close.start))return fail('Comments in call arguments require manual review.');
    if(args.parts.some(part=>!part.length))return fail('Empty arguments require manual review.');
    const named=args.parts.map(part=>part[0]?.kind==='identifier'&&part[1]?.value==='='&&part[2]?.value==='>');
    if(named.some(Boolean)&&!named.every(Boolean))return fail('Mixed positional and named calls require manual review.');
    const values=args.parts.map(part=>source.slice(part[0].start,part.at(-1).end));
    if(named.every(Boolean)&&named.length){
      if(new Set(args.parts.map(part=>key(part[0]))).size!==args.parts.length||args.parts.some(part=>!routine.parameters.some(parameter=>parameter.key===key(part[0]))))return fail('A named call could not be matched to the signature.');
    }else if(values.length!==routine.parameters.length)return fail('A positional call has an unexpected argument count.');
    calls.push({args,named:named.length>0&&named.every(Boolean),values});
    i=tokens.findIndex((candidate,index)=>index>i&&candidate.start===args.close.start);
  }
  const operation=change?.operation,index=Number(change?.index),edits=[];
  const replace=(start,end,after,label)=>edits.push({start,end,before:source.slice(start,end),after,label});
  let detail='';
  if(operation==='rename'){
    const newName=change.name?.trim();
    if(!Number.isInteger(index)||index<0||index>=parts.length||!validName(newName))return fail('Choose a parameter and enter a valid Oracle identifier.');
    if(routine.parameters.some((parameter,at)=>at!==index&&parameter.key===newName.toUpperCase()))return fail('Another parameter already has that name.');
    const parameter=routine.parameters[index];
    if(parameter.name===newName)return fail('Enter a different parameter name.');
    const references=oracleReferenceLocations(source,parameter.start+1);
    if(references.reason||references.truncated||!references.locations.some(location=>location.declaration))return fail('Parameter references could not be resolved completely.');
    for(const location of references.locations)replace(location.start,location.end,newName,location.declaration?'Parameter declaration':'Parameter use');
    for(const call of calls.filter(call=>call.named))for(const part of call.args.parts)if(key(part[0])===parameter.key)replace(part[0].start,part[0].end,newName,'Named call');
    detail=`${parameter.name} → ${newName}`;
  }else if(operation==='reorder'){
    const order=change.order?.map(Number);
    if(!Array.isArray(order)||order.length!==parts.length||new Set(order).size!==parts.length||order.some(value=>!Number.isInteger(value)||value<0||value>=parts.length))return fail('Enter each parameter position exactly once.');
    if(order.every((value,at)=>value===at))return fail('Choose a different order.');
    replace(signature.open.end,signature.close.start,order.map(value=>parts[value]).join(', '),'Procedure parameters');
    for(const call of calls.filter(call=>!call.named))replace(call.args.open.end,call.args.close.start,order.map(value=>call.values[value]).join(', '),'Positional call');
    detail=`Order ${order.map(value=>routine.parameters[value].name).join(', ')}`;
  }else if(operation==='add'){
    const newName=change.name?.trim(),type=change.type?.trim();
    if(!validName(newName)||routine.parameters.some(parameter=>parameter.key===newName.toUpperCase())||!type||!/^[A-Za-z][A-Za-z0-9_$#]*(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?$/.test(type))return fail('Enter a unique name and simple Oracle type, such as NUMBER or VARCHAR2(30).');
    replace(signature.open.end,signature.close.start,`${parts.join(', ')}, ${newName} IN ${type} DEFAULT NULL`,'Procedure parameters');
    detail=`Add optional ${newName} ${type}; existing calls use DEFAULT NULL`;
  }else return fail('Choose a supported signature change.');
  const sorted=edits.sort((a,b)=>a.start-b.start);
  if(sorted.some((edit,at)=>at&&edit.start<sorted[at-1].end))return fail('Overlapping edits require manual review.');
  return {name:routine.name,detail,edits:sorted,callCount:calls.length,scope:'One local procedure and direct calls in the current document. Dynamic SQL, qualified calls and other files are excluded.'};
}
