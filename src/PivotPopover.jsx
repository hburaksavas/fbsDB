import { X } from 'lucide-react';
import { useInspectorWidth } from './useInspectorWidth';

export function TransposePivotInspector(props) {
  const sizing=useInspectorWidth();
  return <aside className="result-inspector transpose-pivot-inspector" style={{'--inspector-width':`${sizing.width}px`}}><span className="result-inspector-resizer" role="separator" aria-label="Resize pivot options" aria-orientation="vertical" tabIndex={0} onPointerDown={sizing.onPointerDown} onKeyDown={sizing.onKeyDown}/><PivotOptionsPanel {...props}/></aside>;
}

export function PivotOptionsPanel({ columns, options, onChange, onClose }) {
  const update = (patch) => onChange({ ...options, ...patch });
  const pivotRows = options.pivotRows || [];

  return <aside id="result-pivot-panel" className="result-pivot-panel" role="region" aria-label="Pivot options">
    <header><div><strong>Pivot options</strong><span>Loaded rows only</span></div><button type="button" aria-label="Close pivot options" title="Close pivot options" onClick={onClose}><X size={15} /></button></header>
    <div className="result-pivot-content">
    <label className="result-pivot-enable"><input type="checkbox" checked={Boolean(options.pivot)} onChange={(event) => update({ pivot: event.target.checked, ...(event.target.checked ? { summary: false, transpose: false } : {}) })} />Enable pivot view</label>
    <div className="result-pivot-section">
      <span>ROW GROUPS</span>
      <div className="result-pivot-columns">{columns.map((column, index) => <label key={index}><input type="checkbox" checked={pivotRows.includes(index)} onChange={(event) => update({ pivotRows: event.target.checked ? [...pivotRows, index] : pivotRows.filter((item) => item !== index) })} /><span>{column.name}</span></label>)}</div>
    </div>
    <div className="result-pivot-fields">
      <label>Pivot column<select aria-label="Pivot column" value={options.pivotColumn ?? 0} onChange={(event) => update({ pivotColumn: Number(event.target.value) })}>{columns.map((column, index) => <option key={index} value={index}>{column.name}</option>)}</select></label>
      <label>Value column<select aria-label="Pivot value" value={options.pivotValue ?? 0} onChange={(event) => update({ pivotValue: Number(event.target.value) })}>{columns.map((column, index) => <option key={index} value={index}>{column.name}</option>)}</select></label>
      <label>Aggregate<select aria-label="Pivot aggregate" value={options.pivotAggregate || 'sum'} onChange={(event) => update({ pivotAggregate: event.target.value })}>{['count', 'sum', 'avg', 'min', 'max'].map((aggregate) => <option key={aggregate} value={aggregate}>{aggregate.toUpperCase()}</option>)}</select></label>
    </div>
    </div>
    <footer><span>{pivotRows.length} row group{pivotRows.length === 1 ? '' : 's'}</span><button type="button" disabled={!options.pivot && !pivotRows.length && options.pivotColumn == null && options.pivotValue == null} onClick={() => update({ pivot: false, pivotRows: [], pivotColumn: 0, pivotValue: 0, pivotAggregate: 'sum' })}>Clear pivot</button></footer>
  </aside>;
}
