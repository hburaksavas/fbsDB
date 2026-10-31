import palettes from './themePalettes.json' with { type: 'json' };

export const themeNames = Object.keys(palettes);
export const normalizeTheme = theme => Object.hasOwn(palettes, theme) ? theme : 'default';
export const themePalette = theme => palettes[normalizeTheme(theme)];
export const themePresets = Object.fromEntries(Object.entries(palettes).map(([name, palette]) => [name, {
  title: palette.title, surface: palette.tokens['--surface'], editor: palette.tokens['--editor-bg'],
  accent: palette.tokens['--accent'], foreground: palette.tokens['--foreground'], line: palette.tokens['--line'],
  selection: palette.tokens['--selection-bg'], ...palette.editor,
}]));

export function resolveTokenColors(saved = {}) {
  return Object.fromEntries(Object.entries(palettes).map(([name, palette]) => {
    const defaults = Object.fromEntries(['keyword', 'string', 'comment', 'number'].map(key => [key, palette.editor[key]]));
    const current = saved[name] || {};
    const legacyDefault = [palette.legacyEditor, ...(palette.previousEditors || [])].some(preset =>
      Object.entries(preset).every(([key, value]) => typeof current[key] === 'string' && current[key].toLowerCase() === value));
    return [name, legacyDefault ? defaults : { ...defaults, ...current }];
  }));
}

export function monacoTokenRules(theme, customColors = {}) {
  const {tokens: t, editor: e} = themePalette(theme);
  const colors = {...e, ...customColors};
  return [
    {token: 'comment', foreground: colors.comment.slice(1), fontStyle: 'italic'},
    {token: 'keyword', foreground: colors.keyword.slice(1)},
    {token: 'type', foreground: colors.keyword.slice(1)},
    {token: 'predefined', foreground: e.function.slice(1)},
    {token: 'operator', foreground: t['--muted'].slice(1)},
    {token: 'delimiter', foreground: t['--muted'].slice(1)},
    {token: 'string', foreground: colors.string.slice(1)},
    {token: 'number', foreground: colors.number.slice(1)},
    {token: 'identifier', foreground: t['--foreground'].slice(1)},
  ].flatMap(rule => [rule, {...rule, token: `${rule.token}.sql`}]);
}

export function applyDocumentTheme(theme, doc = document) {
  doc.documentElement.dataset.theme = normalizeTheme(theme);
  doc.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

export function monacoThemeColors(theme) {
  const { tokens: t, editor: e } = themePalette(theme);
  return {
    'editor.background': t['--editor-bg'], 'editor.foreground': t['--foreground'],
    'editorGutter.background': t['--editor-bg'], 'editorLineNumber.foreground': e.lineNumber,
    'editorLineNumber.activeForeground': t[theme==='light'?'--accent-strong':'--accent'], 'editorCursor.foreground': t['--accent'],
    'editor.lineHighlightBackground': e.lineHighlight, 'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': t['--selection-bg'], 'editor.selectionForeground': t['--selection-text'], 'editor.inactiveSelectionBackground': e.inactiveSelection,
    'editor.selectionHighlightBackground': e.inactiveSelection, 'editorIndentGuide.background1': t['--line'],
    'editorIndentGuide.activeBackground1': t['--accent'], 'editorSuggestWidget.background': t['--surface'],
    'editorSuggestWidget.foreground': t['--foreground'], 'editorSuggestWidget.border': t['--line-strong'],
    'editorSuggestWidget.selectedBackground': t['--selection-bg'], 'editorSuggestWidget.selectedForeground': t['--selection-text'],
    'editorSuggestWidget.highlightForeground': t[theme==='light'?'--accent-strong':'--accent'], 'editorSuggestWidget.focusHighlightForeground': t['--accent-strong'],
    'editorHoverWidget.background': t['--surface'], 'editorHoverWidget.foreground': t['--foreground'],
    'editorHoverWidget.border': t['--line-strong'], 'editorHoverWidget.statusBarBackground': t['--surface-raised'],
    'editorWidget.background': t['--surface'], 'editorWidget.foreground': t['--foreground'], 'editorWidget.border': t['--line-strong'],
    'editorError.foreground': t['--danger'], 'editorWarning.foreground': t['--warning'], 'editorInfo.foreground': t['--info'],
    'scrollbarSlider.background': t['--line'], 'scrollbarSlider.hoverBackground': t['--line-strong'],
    'scrollbarSlider.activeBackground': t['--muted'], 'focusBorder': t['--accent'],
    'input.background': t['--input'], 'input.foreground': t['--foreground'], 'input.border': t['--line'],
    'inputOption.activeBackground': t['--selection-bg'], 'inputOption.activeForeground': t['--selection-text'],
    'inputOption.activeBorder': t['--accent'], 'inputOption.hoverBackground': t['--surface-raised'],
    'inputValidation.errorBackground': t['--input'], 'inputValidation.errorForeground': t['--danger'], 'inputValidation.errorBorder': t['--danger'],
    'inputValidation.warningBackground': t['--input'], 'inputValidation.warningForeground': t['--warning'], 'inputValidation.warningBorder': t['--warning'],
    'inputValidation.infoBackground': t['--input'], 'inputValidation.infoForeground': t['--info'], 'inputValidation.infoBorder': t['--info'],
    'list.hoverBackground': t['--surface-raised'], 'list.hoverForeground': t['--foreground'],
    'list.activeSelectionBackground': t['--selection-bg'], 'list.activeSelectionForeground': t['--selection-text'],
  };
}
