const relationTypes=new Set(['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM']);
const id=value=>/^[A-Z][A-Z0-9_$#]*$/.test(String(value))?String(value):`"${String(value).replaceAll('"','""')}"`;
const name=object=>`${object.owner?id(object.owner)+'.':''}${id(object.name)}`;

export function dragSqlDraft(object, columnName=null, source='', objects=[]) {
  if(!object||!relationTypes.has(object.type)||!object.name)return null;
  if(columnName && !(object.columns||[]).some(column=>column.name===columnName))return null;
  const columns=columnName?[columnName]:(object.columns||[]).slice(0,200).map(column=>column.name);
  const projection=columns.length?columns.map(column=>`t.${id(column)}`).join(',\n  '):'t.*';
  if(!columnName){
    const from=/\bFROM\s+(?:([A-Z][A-Z0-9_$#]*)\.)?([A-Z][A-Z0-9_$#]*)\b/i.exec(String(source));
    const matches=from?objects.filter(item=>relationTypes.has(item.type)&&item.name.toUpperCase()===from[2].toUpperCase()&&(!from[1]||item.owner?.toUpperCase()===from[1].toUpperCase())):[];
    const first=matches.length===1?matches[0]:null;
    if(first && first!==object){
      const groups=new Map();
      for(const fk of [...(first.foreignKeys||[]),...(object.foreignKeys||[])]){
        const forward=fk.owner===first.owner&&fk.table===first.name&&fk.targetOwner===object.owner&&fk.targetTable===object.name;
        const reverse=fk.owner===object.owner&&fk.table===object.name&&fk.targetOwner===first.owner&&fk.targetTable===first.name;
        if(!forward&&!reverse)continue;
        const key=`${fk.owner}.${fk.table}.${fk.name}`;
        if(!groups.has(key))groups.set(key,[]);
        if(!groups.get(key).some(row=>row.fk.position===fk.position&&row.fk.column===fk.column&&row.fk.targetColumn===fk.targetColumn))groups.get(key).push({fk,forward});
      }
      if(groups.size===1){
        const predicates=[...groups.values()][0].sort((a,b)=>a.fk.position-b.fk.position).map(({fk,forward})=>`a.${id(forward?fk.column:fk.targetColumn)} = b.${id(forward?fk.targetColumn:fk.column)}`);
        return {text:`SELECT a.*, b.*\nFROM ${name(first)} a\nJOIN ${name(object)} b ON ${predicates.join('\n  AND ')};`,kind:'join'};
      }
    }
  }
  const limited=!columnName&&object.columns?.length>200;
  return {text:`${limited?`-- First 200 of ${object.columns.length} loaded columns\n`:''}SELECT\n  ${projection}\nFROM ${name(object)} t;`,kind:'select',limited};
}
