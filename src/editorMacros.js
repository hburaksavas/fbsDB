export const macroActions={moveUp:'Move SQL item or PL/SQL statement up',moveDown:'Move SQL item or PL/SQL statement down',comment:'Toggle line comment'};

export function recordMacroStep(steps,action){
  if(!Object.hasOwn(macroActions,action)||steps.length>=20)return steps;
  return [...steps,action];
}

export function createEditorMacro(name,steps){
  const title=String(name||'').trim();
  if(!title||title.length>60)return {error:'Enter a macro name up to 60 characters.'};
  if(!Array.isArray(steps)||!steps.length||steps.length>20||steps.some(step=>!Object.hasOwn(macroActions,step)))return {error:'Record 1 to 20 supported editor actions.'};
  return {macro:{id:crypto.randomUUID(),name:title,steps:[...steps]}};
}
