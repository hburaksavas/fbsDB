import {missingRequired} from './gridDrafts';
import {newRowFieldOrder} from './tabEntry';

// Sectioned entry form for new rows. Only filled fields are sent; empty ones use the database default, and NULL is an explicit choice.
export function NewRowsPanel({rows,columns,editability,onChange,onRemove,onSaveTemplate}) {
  const fields = newRowFieldOrder(columns, editability.insertColumns).map(index => ({ column: columns[index], index }));
  return <section className="new-rows-panel" aria-label="New rows">
    {rows.map(row => {
      const missing = missingRequired(columns, editability.insertColumns, row.values);
      return <fieldset key={row.id} className="new-row" data-new-row={row.id}>
        <legend>New row {row.id} <span className="new-row-state" role="status">{missing.length ? `Missing required: ${missing.map(item => item.column.name).join(', ')}` : 'Ready'}</span></legend>
        <div className="new-row-fields">{fields.map(({ column, index }) => {
          const entry = row.values[index];
          return <label key={index}><span>{column.name}{column.nullable === false && !column.hasDefault && !column.identity ? ' *' : ''}</span>
            <input aria-label={`New row ${row.id} ${column.name}`} disabled={Boolean(entry?.isNull)} placeholder={entry?.isNull ? 'NULL' : '(database default)'} value={entry?.value ?? ''} onChange={event => onChange(row.id, index, { value: event.target.value })}/>
            <span className="new-row-null"><input type="checkbox" aria-label={`New row ${row.id} ${column.name} NULL`} checked={Boolean(entry?.isNull)} onChange={event => onChange(row.id, index, event.target.checked ? { isNull: true } : { omit: true })}/>NULL</span>
          </label>;
        })}</div>
        <button type="button" onClick={() => onRemove(row.id)}>Remove new row</button>
        {onSaveTemplate && <button type="button" aria-label={`Save new row ${row.id} as template`} title="Keep these field values as a reusable preset (keys, locked and secret-looking columns are left out)" onClick={() => { const name = globalThis.prompt?.('Template name'); if (name) onSaveTemplate(row.id, name); }}>Save as template…</button>}
      </fieldset>;
    })}
  </section>;
}
