# Refactor tools

Scripts that move code out of a large React function component (by default `App` in `src/App.jsx`) without changing behaviour. They move text unchanged and prove it: every move can be put back mechanically, and the verify script requires the result to equal the original file byte for byte outside the import lines. `docs/architecture.md` describes the module patterns they produce.

Nothing in `src` changes until you copy a stage over it. Each move writes a stage folder with the rewritten files, `original/` with the files they replace, and `plan-files.json` for the verify script.

## Functions

```bash
node scripts/refactor/function-safety.mjs --min 600
node scripts/refactor/move-functions.mjs plan.json .artifacts/refactor-stage
node scripts/refactor/verify-functions.mjs .artifacts/refactor-stage
```

`function-safety.mjs` lists the component's function declarations by size with `OK` or the reason a function cannot move. A function moves behind a wrapper of the same name and parameter list, which passes the component's values in one object: `function closeTab(id, onClosed = null) { return tabActions.closeTab({ … }, id, onClosed); }`. Because the wrapper reads all those values when it is called, a function is refused when:

- the render can reach a reference to it before a `const` it reads is initialised. References count as after the render when they sit inside an effect, inside a function written directly as a JSX attribute value (`onClick={() => f()}`), or in a closure that is only stored: `const g = () => f()`, `ref.current = () => f()` or `ref.current = f`. Such a closure then runs when `g` or `ref` is itself reached, which is followed the same way, so a ref that the render calls still blocks the function;
- it uses its own `this`, `arguments` or `new.target`, is a generator, assigns to a component value or reads a `let` or `var`;
- a parameter default contains a function;
- it reads a declaration of the component's module that is not an import;
- it is already a wrapper.

The plan names the modules and the functions they receive:

```json
[{ "module": "WorkbenchTabActions", "ns": "tabActions", "comment": "What the module holds.", "functions": ["closeTabs", "detachTabs"] }]
```

A module the component already imports as `* as <ns>` gets the new functions appended; its existing functions must stay unchanged, which the verify script checks. The wrapper of an async function is not async, so callers get the moved function's promise with the same timing.

## Effects

```bash
node scripts/refactor/move-effects.mjs plan.json .artifacts/refactor-stage
node scripts/refactor/verify-effects.mjs .artifacts/refactor-stage
```

The effect and its dependency list stay in the component and only the body moves: `useEffect(() => installEditorShortcuts({ … }), deps)`. Each effect is found by a `marker`, text that only that effect contains:

```json
[{ "module": "WorkbenchShortcutEffects.js", "comment": "What the module holds.", "effects": [{ "fn": "installEditorShortcuts", "marker": "const runStatementShortcut" }] }]
```

## After a move

1. Copy the stage files (not `original/` or `plan-files.json`) into `src`.
2. Run `npx tsc --allowJs --checkJs --noEmit --jsx react-jsx --module esnext --target esnext --moduleResolution bundler --skipLibCheck src/App.jsx` and confirm it reports no "Cannot find name".
3. Some tests read `src/App.jsx` as text and cut functions out of it (`tests/tab-connection-restoration.test.mjs`). Do not move a function such a test runs from the source.
4. Run `npm test`, `scripts/test/test-native.ps1` and the desktop suites (`npm run test:desktop`, then `scripts/test/test-desktop.ps1 -SkipBuild` with `-DragTest`, `-ProjectRulesTest` and, with the local database running, `-OracleFlowTest`), and compare the counts and test names with a run from before the move.

`tests/refactor-tools.test.mjs` covers the tools on a small component.
