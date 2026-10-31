export const defaultSqlFormatterSettings = Object.freeze({
  keywordCase: 'upper', indentation: 'editor', tabSize: 4,
  newlineAfterClause: true, newlineAfterComma: true,
  newlineBeforeLogical: true, blankLinesBetweenStatements: 1,
  commaPosition: 'trailing', newlineBeforeJoin: true, newlineBeforeOn: true,
  logicalIndent: 2, finalNewline: true,
});

export function normalizeSqlFormatterSettings(value) {
  const result = { ...defaultSqlFormatterSettings };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, choices] of Object.entries({ keywordCase: ['upper', 'lower', 'preserve'], indentation: ['editor', 'spaces', 'tabs'], tabSize: [2, 4, 8], blankLinesBetweenStatements: [0, 1, 2], commaPosition: ['leading','trailing'], logicalIndent: [1,2] })) {
    if (choices.includes(value[key])) result[key] = value[key];
  }
  for (const key of ['newlineAfterClause', 'newlineAfterComma', 'newlineBeforeLogical','newlineBeforeJoin','newlineBeforeOn','finalNewline']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  return result;
}

export const sqlFormatterPresets = {
  Readable: { newlineAfterClause:true, newlineAfterComma:true, newlineBeforeLogical:true, newlineBeforeJoin:true, newlineBeforeOn:true, commaPosition:'trailing', logicalIndent:2, blankLinesBetweenStatements:1 },
  Compact: { newlineAfterClause:false, newlineAfterComma:false, newlineBeforeLogical:false, newlineBeforeJoin:false, newlineBeforeOn:false, commaPosition:'trailing', logicalIndent:1, blankLinesBetweenStatements:0 },
  'Leading commas': { newlineAfterClause:true, newlineAfterComma:true, newlineBeforeLogical:true, newlineBeforeJoin:true, newlineBeforeOn:true, commaPosition:'leading', logicalIndent:1, blankLinesBetweenStatements:1 },
};

export function sqlFormatterStyle(preferences, editorStyle = {}) {
  const settings = normalizeSqlFormatterSettings(preferences);
  return { ...settings,
    insertSpaces: settings.indentation === 'editor' ? editorStyle.insertSpaces !== false : settings.indentation !== 'tabs',
    tabSize: settings.indentation === 'editor' ? editorStyle.tabSize || 4 : settings.tabSize,
  };
}
