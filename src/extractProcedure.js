import {lexOracle} from './oracleLexer.js';
import {parsePlsql} from './plsqlStructure.js';

const validName=name=>/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name)&&new TextEncoder().encode(name).length<=128;
const fail=error=>({error});

export function planExtractProcedure(source,start,end,name){
  if(source.length>100000)return fail('Extract Procedure is limited to 100,000 source characters.');
  const model=parsePlsql(source);
  if(!model.complete)return fail('Complete PL/SQL source is required.');
  if(!validName(name))return fail('Enter a valid unquoted Oracle procedure name.');
  if(lexOracle(source).some(token=>token.kind==='identifier'&&!token.quoted&&token.value.toUpperCase()===name.toUpperCase()))return fail('The procedure name already occurs in this document.');
  const block=model.children.find(node=>node.kind==='block'&&node.declare!=null&&node.begin!=null&&node.begin<=start&&end<=node.end);
  if(!block)return fail('Select complete statements inside a top-level DECLARE block.');
  while(start<end&&/\s/.test(source[start]))start++;
  while(end>start&&/\s/.test(source[end-1]))end--;
  const selected=block.children.filter(node=>node.start>=start&&node.end<=end);
  if(!selected.length||selected[0].start!==start||selected.at(-1).end!==end||selected.some(node=>node.kind!=='statement'))return fail('Select one or more complete, adjacent assignment statements.');
  const scope=model.scopes.find(item=>item.start===block.start&&item.end===block.end&&item.parent);
  if(!scope)return fail('The declaration scope could not be resolved.');
  const variables=new Map(scope.symbols.filter(symbol=>['variable','parameter'].includes(symbol.kind)).map(symbol=>[symbol.key,symbol]));
  const usage=new Map();
  const use=(symbol,write)=>{let state=usage.get(symbol.key);if(!state){state={symbol,readBeforeWrite:false,write:false};usage.set(symbol.key,state)}if(write)state.write=true;else if(!state.write)state.readBeforeWrite=true};
  for(const statement of selected){
    const tokens=lexOracle(source.slice(statement.start,statement.end)).map(token=>({...token,start:token.start+statement.start,end:token.end+statement.start}));
    if(tokens.some(token=>token.kind==='comment')||tokens.length<5||tokens[0].kind!=='identifier'||tokens[1].value!==':'||tokens[2].value!=='='||tokens.at(-1).value!==';')return fail('Only simple assignment statements without comments are supported.');
    const target=variables.get(tokens[0].value.toUpperCase());
    if(!target)return fail('An assignment target is not a declared local variable or parameter.');
    for(const token of tokens.slice(3,-1)){
      if(token.kind==='identifier'){
        const symbol=variables.get(token.value.toUpperCase());if(!symbol)return fail('An expression contains an unresolved identifier or function.');use(symbol,false);
      }else if(!['number','string'].includes(token.kind)&&!['+','-','*','/','(',')'].includes(token.value))return fail('An expression uses unsupported PL/SQL syntax.');
    }
    use(target,true);
  }
  const parameters=[...usage.values()].map(item=>{
    const type=item.symbol.type;
    if(!/^(?:NUMBER|PLS_INTEGER|BINARY_INTEGER|INTEGER|VARCHAR2\(\d+\)|CHAR\(\d+\))$/i.test(type||''))return null;
    return {name:item.symbol.name,type,mode:item.write?item.readBeforeWrite?'IN OUT':'OUT':'IN'};
  });
  if(parameters.includes(null))return fail('Only simple scalar local variable types are supported.');
  const eol=source.includes('\r\n')?'\r\n':'\n',lineStart=source.lastIndexOf('\n',block.begin-1)+1;
  const base=/^[ \t]*/.exec(source.slice(lineStart,block.begin))?.[0]||'',unit=base.includes('\t')?'\t':'  ';
  const body=selected.map(node=>source.slice(node.start,node.end).trim()).map(line=>base+unit+unit+line).join(eol);
  const declaration=`${base}PROCEDURE ${name}(${parameters.map(item=>`${item.name} ${item.mode} ${item.type}`).join(', ')}) IS${eol}${base}BEGIN${eol}${body}${eol}${base}END ${name};${eol}`;
  const call=`${name}(${parameters.map(item=>item.name).join(', ')});`;
  return {name,parameters,scope:'Top-level DECLARE block; simple assignments and scalar locals only. Other files, SQL, control flow and dynamic SQL are excluded.',edits:[{start:lineStart,end:lineStart,before:'',after:declaration,label:'New local procedure'},{start,end,before:source.slice(start,end),after:call,label:'Call at selection'}]};
}
