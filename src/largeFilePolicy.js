export const LARGE_FILE_THRESHOLD=512*1024;
export function largeFilePolicy(source='',overrides={}){
 const large=source.length>=LARGE_FILE_THRESHOLD;
 return {large,completion:!large||overrides.completion===true,diagnostics:!large||overrides.diagnostics===true,outline:!large||overrides.outline===true,source:!large||overrides.source===true};
}
export function lightweightEditorOptions(policy){return policy.large?{minimap:{enabled:false},stickyScroll:{enabled:false},bracketPairColorization:{enabled:false},guides:{indentation:false,highlightActiveIndentation:false},folding:policy.outline,maxTokenizationLineLength:2000,renderWhitespace:'none',wordWrap:'off',largeFileOptimizations:true}:{maxTokenizationLineLength:20000,largeFileOptimizations:true};}
