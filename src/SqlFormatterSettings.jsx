import { formatOracleDocument } from './sqlFormatter.js';
import { sqlFormatterStyle,sqlFormatterPresets } from './sqlFormatterSettings.js';

const sample = "select i.invoice_id, c.customer_name from invoices i left join customers c on c.id = i.customer_id where i.status = 'OPEN' and i.amount > :minimum;\nselect sysdate from dual;";
export function SqlFormatterSettings({ value, onChange, codeStyle, disabled, ...props }) {
  const update = (key, next) => onChange({ ...value, [key]: next });
  return <section {...props} className="sql-formatter-settings">
    <div className="appearance-section-title">SQL FORMATTER</div>
    <div className="formatter-presets">{Object.entries(sqlFormatterPresets).map(([name,preset])=><button type="button" disabled={disabled} key={name} aria-pressed={Object.entries(preset).every(([key,v])=>value[key]===v)} onClick={()=>onChange({...value,...preset})}>{name}</button>)}</div>
    <fieldset disabled={disabled} className="sql-formatter-options">
      <label>SQL keyword case<select aria-label="SQL keyword case" value={value.keywordCase} onChange={e=>update('keywordCase',e.target.value)}><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="preserve">Preserve</option></select></label>
      <label>Indentation<select aria-label="Formatter indentation" value={value.indentation} onChange={e=>update('indentation',e.target.value)}><option value="editor">Follow editor</option><option value="spaces">Spaces</option><option value="tabs">Tabs</option></select></label>
      <label>Indent size<select aria-label="Formatter indent size" disabled={value.indentation!=='spaces'} value={value.tabSize} onChange={e=>update('tabSize',Number(e.target.value))}>{[2,4,8].map(n=><option key={n} value={n}>{n} spaces</option>)}</select></label>
      <label>Blank lines between statements<select aria-label="Blank lines between statements" value={value.blankLinesBetweenStatements} onChange={e=>update('blankLinesBetweenStatements',Number(e.target.value))}>{[0,1,2].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>Comma position<select aria-label="Comma position" disabled={!value.newlineAfterComma} value={value.commaPosition} onChange={e=>update('commaPosition',e.target.value)}><option value="trailing">Trailing</option><option value="leading">Leading</option></select></label>
      <label>AND / OR indentation<select aria-label="Logical indentation" disabled={!value.newlineBeforeLogical} value={value.logicalIndent} onChange={e=>update('logicalIndent',Number(e.target.value))}><option value={1}>1 level</option><option value={2}>2 levels</option></select></label>
      {[['newlineAfterClause','New line after SQL clause'],['newlineAfterComma','One SQL list item per line'],['newlineBeforeLogical','New line before AND / OR'],['newlineBeforeJoin','New line before JOIN'],['newlineBeforeOn','New line before ON'],['finalNewline','Final newline']].map(([key,label])=><label className="sql-formatter-toggle" key={key}><input type="checkbox" checked={value[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
    </fieldset>
    <pre aria-label="SQL formatter preview">{formatOracleDocument(sample,sqlFormatterStyle(value,codeStyle)).formatted}</pre>
  </section>;
}
