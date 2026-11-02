import {lexOracle} from './oracleLexer.js';

const lineAt=(source,offset)=>{const start=source.lastIndexOf('\n',Math.max(0,offset)-1)+1,end=source.indexOf('\n',offset);return {start,end:end<0?source.length:end,text:source.slice(start,end<0?source.length:end).replace(/\r$/,'')}};

export function contextualQuickFixes(source,cursor,problems=[]){
  if(source.length>100000)return [];
  const line=lineAt(source,cursor),available=problems.filter(problem=>problem.source==='Oracle compiler'&&problem.editorSnapshot===source&&problem.offset!=null&&lineAt(source,problem.offset).start===line.start);
  const fixes=[];
  for(const problem of available){
    const message=problem.message||'';
    if(/PLS-00103/i.test(message)&&/expecting[^\n]*;/i.test(message)){
      const target=/^\s*END\b/i.test(line.text)&&line.start>0?lineAt(source,line.start-1):line;
      const comment=lexOracle(target.text).find(token=>token.kind==='comment'&&token.value.startsWith('--'));
      const code=(comment?target.text.slice(0,comment.start):target.text).trimEnd();
      if(code&&!/^(?:BEGIN|DECLARE|EXCEPTION)\b/i.test(code.trim())&&!/[;,]$/.test(code))fixes.push({id:`semicolon:${problem.id}`,label:'Add missing semicolon',detail:'Oracle compiler reported an expected semicolon. Review the preceding statement.',edits:[{start:target.start+code.length,end:target.start+code.length,text:';'}]});
    }
    const unknown=/PLS-00201:\s*identifier\s+['"]([A-Za-z][A-Za-z0-9_$#]*)['"]\s+must be declared/i.exec(message);
    if(unknown){
      const name=unknown[1],tokens=lexOracle(source),declarations=tokens.filter(token=>token.kind==='identifier'&&!token.quoted&&token.value.toUpperCase()==='DECLARE'&&token.start<cursor);
      const declaration=declarations.at(-1),begin=declaration&&tokens.find(token=>token.start>declaration.end&&token.kind==='identifier'&&!token.quoted&&token.value.toUpperCase()==='BEGIN');
      if(begin&&begin.start<cursor&&declarations.length===1&&/\b[A-Za-z][A-Za-z0-9_$#]*\b\s*:=/.test(line.text)){
        const lineStart=lineAt(source,begin.start).start,eol=source.includes('\r\n')?'\r\n':'\n';
        fixes.push({id:`declare:${problem.id}`,label:`Declare ${name} locally`,detail:'VARCHAR2(4000) is a placeholder type. Review the declaration and all uses before compiling.',edits:[{start:lineStart,end:lineStart,text:`  ${name} VARCHAR2(4000); -- TODO: verify type${eol}`}]});
      }
    }
  }
  return fixes;
}
