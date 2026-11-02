const MAX_ENTRIES=20,MAX_CHARS=20000;

export function rememberClipboard(history,parts){
  if(!Array.isArray(parts)||!parts.length||parts.some(part=>typeof part!=='string'||!part||part.length>MAX_CHARS))return history;
  const text=parts.join('\n');if(text.length>MAX_CHARS)return history;
  return [{id:crypto.randomUUID(),parts:[...parts],text,at:Date.now()},...history.filter(item=>item.text!==text)].slice(0,MAX_ENTRIES);
}

export function clipboardPasteTexts(entry,count,distributeLines=false){
  if(!entry||!Number.isInteger(count)||count<1||count>100)return {error:'Select one or more editor ranges.'};
  if(count===1)return {texts:[entry.text]};
  if(entry.parts.length===count)return {texts:entry.parts};
  if(distributeLines){const lines=entry.text.split(/\r\n|\r|\n/);if(lines.length!==count)return {error:`The entry has ${lines.length} lines but the editor has ${count} selections.`};return {texts:lines}}
  return {texts:Array(count).fill(entry.text)};
}
