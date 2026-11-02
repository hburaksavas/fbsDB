import {parsePlsql} from './plsqlStructure.js';
import {describeOracleSource} from './oracleSourceIdentity.js';

export const inputRunTypes=['NUMBER','VARCHAR2','NVARCHAR2','DATE','TIMESTAMP','CLOB'];
export const outputRunTypes=inputRunTypes.filter(type=>type!=='CLOB');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const identifier=(value,optional=false)=>optional&&value===''||typeof value==='string'&&value.trim().length>0&&new TextEncoder().encode(value).length<=128&&!/\p{Cc}/u.test(value);
const mode=value=>value==='IN/OUT'?'IN OUT':value;

export function normalizeRunConfiguration(value) {
  if(value?.version!==1||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||!identifier(value.owner,true)||!identifier(value.packageName,true)||!identifier(value.routineName)||!['PROCEDURE','FUNCTION'].includes(value.kind)||!Array.isArray(value.parameters)||value.parameters.length>100)throw Error('Invalid run configuration identity or version.');
  if(value.kind==='FUNCTION'&&!outputRunTypes.includes(value.returnBindType))throw Error('Unsupported function return type.');
  const parameters=value.parameters.map(parameter=>{
    const direction=mode(parameter.mode),types=direction==='IN'?inputRunTypes:outputRunTypes;
    if(!identifier(parameter.name)||typeof parameter.oracleType!=='string'||!parameter.oracleType||parameter.oracleType.length>256||!['IN','OUT','IN OUT'].includes(direction)||!types.includes(parameter.bindType)||parameter.useDefault&&(!parameter.optional||direction!=='IN'))throw Error(`Unsupported parameter ${parameter.name||''}: ${parameter.oracleType||''}.`);
    return {name:parameter.name,oracleType:parameter.oracleType,bindType:parameter.bindType,mode:direction,optional:!!parameter.optional,useDefault:!!parameter.useDefault,sensitive:!!parameter.sensitive};
  });
  if(new Set(parameters.map(parameter=>parameter.name)).size!==parameters.length)throw Error('Duplicate parameter names.');
  return {version:1,id:typeof value.id==='string'?value.id:'',name:value.name.trim(),owner:value.owner,packageName:value.packageName,routineName:value.routineName,kind:value.kind,returnBindType:value.kind==='FUNCTION'?value.returnBindType:'',parameters,revision:Number.isInteger(value.revision)&&value.revision>=0?value.revision:0};
}

export function runConfigurationSql(configuration) {
  const call=normalizeRunConfiguration(configuration);
  const target=[call.owner,call.packageName,call.routineName].filter(Boolean).map(quote).join('.');
  const args=call.parameters.flatMap((parameter,index)=>parameter.useDefault?[]:[`${quote(parameter.name)} => :arg_${index}`]).join(', ');
  return `BEGIN\n  ${call.kind==='FUNCTION'?':run_result := ':''}${target}(${args});\nEND;`;
}

export function runConfigurationParameters(configuration,values={}) {
  const call=normalizeRunConfiguration(configuration);
  const parameters=call.parameters.flatMap((parameter,index)=>parameter.useDefault?[]:[{name:`arg_${index}`,type:parameter.bindType,direction:parameter.mode,value:parameter.mode==='OUT'?null:values[`arg_${index}`]||null}]);
  if(call.kind==='FUNCTION')parameters.push({name:'run_result',type:call.returnBindType,direction:'OUT',value:null});
  return parameters;
}

const binding=type=>{
  const value=String(type||'').replace(/\s+/g,'').toUpperCase();
  if(/^NUMBER(?:\([^)]*\))?$/.test(value))return 'NUMBER';
  if(/^(?:VARCHAR2|VARCHAR|CHAR)(?:\([^)]*\))?$/.test(value))return 'VARCHAR2';
  if(/^(?:NVARCHAR2|NCHAR)(?:\([^)]*\))?$/.test(value))return 'NVARCHAR2';
  if(/^TIMESTAMP(?:\(\d+\))?$/.test(value))return 'TIMESTAMP';
  return ['DATE','CLOB'].includes(value)?value:'';
};

export function sourceRunConfigurations(document,rules,currentSchema='') {
  const source=describeOracleSource(document,rules),model=parsePlsql(document.content||'');
  if(source.warning||!source.declaration||!['PACKAGE','PROCEDURE','FUNCTION'].includes(source.declaration.type)||!model.complete)return {configurations:[],errors:['Open a complete package specification or standalone routine to generate a call.']};
  const scope=source.declaration.type==='PACKAGE'?model.scopes.find(scope=>scope.parent&&!scope.parent.parent):model.scopes.find(scope=>!scope.parent);
  const configurations=[],errors=[];
  for(const routine of scope?.routines||[]){
    const parameters=routine.parameters.map(parameter=>({name:parameter.key,oracleType:parameter.type,bindType:binding(parameter.type),mode:mode(parameter.mode),optional:!!parameter.optional,useDefault:!!parameter.optional&&mode(parameter.mode)==='IN',sensitive:/password|secret|token/i.test(parameter.name)}));
    const configuration={version:1,id:'',name:[source.declaration.type==='PACKAGE'?source.declaration.name:'',routine.name].filter(Boolean).join('.').slice(0,100),owner:source.declaration.ownerKey||document.definitionObject?.owner||currentSchema,packageName:source.declaration.type==='PACKAGE'?source.declaration.nameKey:'',routineName:routine.key,kind:routine.routineKind,returnBindType:routine.returnType?binding(routine.returnType):'',parameters,revision:0};
    try{configurations.push(normalizeRunConfiguration(configuration))}catch(error){errors.push(`${routine.name}: ${error.message}`)}
  }
  return {configurations,errors};
}
