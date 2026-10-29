export const bindTypes=['VARCHAR2','NUMBER','DATE','TIMESTAMP','CLOB'];
export function normalizeBindDefinitions(definitions,names) {
  return names.map(name=>{
    const item=Array.isArray(definitions)?definitions.find(item=>item?.name===name):null;
    return {name,type:bindTypes.includes(item?.type)?item.type:'VARCHAR2',required:Boolean(item?.required),description:typeof item?.description==='string'?item.description.slice(0,1000):''};
  });
}
export function loadBindDefinitions(storage,file,names) {
  try{return normalizeBindDefinitions(JSON.parse(storage.getItem(`fbsdb.bindForm.${file.toLowerCase()}`)),names)}catch{return normalizeBindDefinitions([],names)}
}
export function saveBindDefinitions(storage,file,definitions) {
  storage.setItem(`fbsdb.bindForm.${file.toLowerCase()}`,JSON.stringify(normalizeBindDefinitions(definitions,definitions.map(item=>item.name))));
}
