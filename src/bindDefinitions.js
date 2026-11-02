export const bindTypes=['VARCHAR2','NUMBER','DATE','TIMESTAMP','CLOB'];
const sensitiveBind=/pass(word)?|pwd|secret|token|api[_-]?key|credential/i;
export const sensitiveBindName=name=>sensitiveBind.test(String(name||''));
// Defaults are form conveniences: never for sensitive-looking names, CLOBs or long values.
export const defaultAllowed=(name,type,value)=>typeof value==='string'&&value.length>0&&value.length<=1000&&type!=='CLOB'&&!sensitiveBind.test(String(name));
export function normalizeBindDefinitions(definitions,names) {
  return names.map(name=>{
    const item=Array.isArray(definitions)?definitions.find(item=>typeof item?.name==='string'&&item.name.toUpperCase()===name.toUpperCase()):null;
    const type=bindTypes.includes(item?.type)?item.type:'VARCHAR2';
    return {name,type,required:Boolean(item?.required),description:typeof item?.description==='string'?item.description.slice(0,1000):'',label:typeof item?.label==='string'?item.label.slice(0,100):'',defaultValue:defaultAllowed(name,type,item?.defaultValue)?item.defaultValue:''};
  });
}
export function loadBindDefinitions(storage,file,names) {
  try{return normalizeBindDefinitions(JSON.parse(storage.getItem(`fbsdb.bindForm.${file.toLowerCase()}`)),names)}catch{return normalizeBindDefinitions([],names)}
}
export function saveBindDefinitions(storage,file,definitions) {
  storage.setItem(`fbsdb.bindForm.${file.toLowerCase()}`,JSON.stringify(normalizeBindDefinitions(definitions,definitions.map(item=>item.name))));
}


export function projectBindDefinitions(storage,file,names,variables=[]) {
 let saved=[];
 if(file)try{const value=JSON.parse(storage.getItem(`fbsdb.bindForm.${file.toLowerCase()}`));if(Array.isArray(value))saved=value}catch{}
 return normalizeBindDefinitions([...saved,...variables],names);
}
