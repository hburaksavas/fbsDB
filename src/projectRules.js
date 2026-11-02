import {pathKey} from './workspaceTree.js';

export const defaultProjectOptions={areas:{packages:'packages',migrations:'migrations',scripts:'scripts',tests:'tests'},connectionIds:[],defaultConnectionId:null,variables:[],run:{timeoutSeconds:0,pageSize:1000,continueOnError:false},dictionary:{style:'snake',terms:[]}};
export const projectOptions=rules=>({...defaultProjectOptions,...rules?.project,dictionary:rules?.project?.dictionary||defaultProjectOptions.dictionary});

export const defaultProjectRules = {
  version: 1,
  project:defaultProjectOptions,
  associations: [{extension:'.sql',type:'SQL'},{extension:'.pks',type:'PACKAGE'},{extension:'.pkb',type:'PACKAGE BODY'},{extension:'.prc',type:'PROCEDURE'},{extension:'.fnc',type:'FUNCTION'},{extension:'.trg',type:'TRIGGER'}],
  packagePairs: [],
  testPatterns: ['tests/test_{name}.sql','tests/{name}.test.sql']
};
export const sourceAssociation = (path, rules = defaultProjectRules) => rules.associations.find(item => path.toLowerCase().endsWith(item.extension.toLowerCase()))?.type;

export function projectRelativePath(path, root) {
  const key = pathKey(path), base = pathKey(root);
  return base && key.startsWith(base+'/') ? key.slice(base.length+1) : null;
}

export function expandSourcePattern(pattern, name, directory = '') {
  if (!name || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || ['.','..'].includes(name)) return null;
  if (!pattern.includes('{name}')) return null;
  let value = pattern.replaceAll('{name}',name).replaceAll('{directory}',directory);
  if (!directory && pattern.startsWith('{directory}/')) value = value.replace(/^\//,'');
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some(part => !part || part.startsWith('.') || /[<>:"|?*{}\u0000-\u001f]/.test(part) || ['bin','obj','node_modules'].includes(part) || /[. ]$/.test(part))) return null;
  return value.toLowerCase();
}

export function packageConventionMatch(current, candidate, context) {
  const rules = context.rules || defaultProjectRules;
  const path = projectRelativePath(current.path,context.root), target = projectRelativePath(candidate.path,context.root);
  if (!path || !target) return {applies:false,matches:false};
  const directory = path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';
  const spec = current.declaration.type === 'PACKAGE';
  const matches = rules.packagePairs.filter(pair => expandSourcePattern(spec?pair.specification:pair.body,current.declaration.nameKey,directory)===path);
  return {applies:matches.length>0,matches:matches.some(pair => expandSourcePattern(spec?pair.body:pair.specification,current.declaration.nameKey,directory)===target)};
}

export function relatedTestPaths(document, declaration, context) {
  const relative = projectRelativePath(document.path,context.root);
  if (relative === null) return [];
  const directory = relative.includes('/') ? relative.slice(0,relative.lastIndexOf('/')) : '';
  return (context.rules || defaultProjectRules).testPatterns.map(pattern => expandSourcePattern(pattern,declaration.nameKey,directory)).filter(Boolean);
}


export function projectAreaFiles(files,root,area,rules) {
  if(!area||area==='all')return files;
  const folder=projectOptions(rules).areas[area]?.toLowerCase();
  return folder?files.filter(file=>projectRelativePath(file.path,root)?.startsWith(folder+'/')):[];
}
