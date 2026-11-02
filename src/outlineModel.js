export function outlineHierarchy(outline) {
 const roots=[],stack=[],nodes=[];
 for(const item of outline.filter(item=>!['Statement','Region'].includes(item.kind))){
  while(stack.length&&(stack.at(-1).item.depth>=item.depth||stack.at(-1).item.end<item.end))stack.pop();
  const node={item,parent:stack.at(-1)||null,children:[]};
  (node.parent?.children||roots).push(node);nodes.push(node);stack.push(node);
 }
 return {roots,nodes};
}
export function outlineBreadcrumbs(outline,offset){
 const {nodes}=outlineHierarchy(outline),current=nodes.filter(node=>node.item.start<=offset&&node.item.end>=offset).sort((a,b)=>b.item.depth-a.item.depth)[0];
 if(!current)return {ancestors:[],neighbors:[]};
 const ancestors=[];for(let node=current;node;node=node.parent)ancestors.unshift(node.item);
 return {ancestors,neighbors:nodes.filter(node=>node.parent===current.parent).map(node=>node.item)};
}
export function outlineDocumentSymbols(outline,positionAt,kinds={}){
 const {roots}=outlineHierarchy(outline);
 const range=item=>{const start=positionAt(item.start),end=positionAt(item.end);return {startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column}};
 const convert=node=>{const start=positionAt(node.item.start);return {name:node.item.name,detail:node.item.kind,tags:[],kind:({PACKAGE:kinds.Namespace,PROCEDURE:kinds.Method,FUNCTION:kinds.Function,TYPE:kinds.Struct,SUBTYPE:kinds.TypeParameter,CURSOR:kinds.Variable,CTE:kinds.Variable})[node.item.kind]??kinds.Namespace??3,range:range(node.item),selectionRange:{startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:start.lineNumber,endColumn:start.column},children:node.children.map(convert)}};
 return roots.map(convert);
}
