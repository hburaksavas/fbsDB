import {readFileSync} from 'node:fs';

// Keep native renderer fixtures in the exact same cascade as the application.
export function productionStyles(){
  const entry=readFileSync('src/main.jsx','utf8');
  return [...entry.matchAll(/import\s+["']\.\/([^"']+\.css)["']/g)]
    .map(([,file])=>readFileSync('src/'+file,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
}
