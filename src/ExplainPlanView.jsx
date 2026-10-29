import { useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronRight, GitBranch, ListTree } from "lucide-react";

function cell(row, columns, field) {
  const index = columns.findIndex(column => String(column.name).toUpperCase() === field);
  return index < 0 ? null : row?.[index] ?? null;
}

function makePlanTree(result) {
  const columns = result?.columns || [];
  const nodes = (result?.rows || []).map((row, index) => ({
    id: cell(row, columns, "ID") ?? index,
    parentId: cell(row, columns, "PARENT_ID"),
    operation: String(cell(row, columns, "OPERATION") ?? "Operation").trim(),
    options: cell(row, columns, "OPTIONS"),
    object: cell(row, columns, "OBJECT_NAME"),
    cost: cell(row, columns, "COST"),
    rows: cell(row, columns, "CARDINALITY"),
    bytes: cell(row, columns, "BYTES"),
    children: [],
  }));
  const byId = new Map(nodes.map(node => [String(node.id), node]));
  const roots = [];
  for (const node of nodes) {
    const parent = node.parentId == null ? null : byId.get(String(node.parentId));
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function PlanNodeCard({ node, selected, onSelect }) {
  const category = /TABLE ACCESS|INDEX|TABLE FULL|INDEX FAST/i.test(node.operation) ? "source" : /JOIN|HASH|NESTED LOOPS|MERGE JOIN/i.test(node.operation) ? "join" : "result";
  return <button className={`explain-node-card plan-node-${category}${selected ? " selected" : ""}`} onClick={() => onSelect(node.id)} aria-pressed={selected}>
    <span className="explain-node-operation">{node.operation}{node.options ? ` · ${node.options}` : ""}</span>
    {node.object && <span className="explain-node-object">{node.object}</span>}
    <span className="explain-node-metrics"><span>Cost <b>{node.cost ?? "—"}</b></span><span>Rows <b>{node.rows ?? "—"}</b></span></span>
  </button>;
}

function DiagramBranch({ node, selectedId, onSelect, ancestors = new Set() }) {
  if (ancestors.has(String(node.id))) return null;
  const nextAncestors = new Set(ancestors).add(String(node.id));
  return <div className="explain-diagram-branch">
    <PlanNodeCard node={node} selected={String(selectedId) === String(node.id)} onSelect={onSelect} />
    {!!node.children.length && <div className="explain-diagram-children">{node.children.map(child => <DiagramBranch key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} ancestors={nextAncestors} />)}</div>}
  </div>;
}

function NestedStep({ node, depth, selectedId, onSelect, ancestors = new Set() }) {
  if (ancestors.has(String(node.id))) return null;
  const nextAncestors = new Set(ancestors).add(String(node.id));
  const title = `${node.operation}${node.options ? ` · ${node.options}` : ""}${node.object ? ` · ${node.object}` : ""}`;
  return <details className={`explain-step${String(selectedId) === String(node.id) ? " selected" : ""}`} open={depth < 1}>
    <summary onClick={() => onSelect(node.id)}>{node.children.length ? <ChevronDown className="step-open-icon" size={14} /> : <ChevronRight size={14} />}<span>{title}</span><small>Cost {node.cost ?? "—"} · Rows {node.rows ?? "—"}</small></summary>
    {node.children.length > 0 && <div className="explain-step-children">{node.children.map(child => <NestedStep key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} ancestors={nextAncestors} />)}</div>}
  </details>;
}

export function ExplainPlanView({ result, loading = false, error = "", mode = "diagram", onModeChange }) {
  const roots = useMemo(() => makePlanTree(result), [result]);
  const [selectedId, setSelectedId] = useState(null);
  const nodes = useMemo(() => {
    const all = [];
    const visit = (node, ancestors = new Set()) => {
      if (ancestors.has(String(node.id))) return;
      all.push(node);
      const next = new Set(ancestors).add(String(node.id));
      node.children.forEach(child => visit(child, next));
    };
    roots.forEach(root => visit(root));
    return all;
  }, [roots]);
  const selected = nodes.find(node => String(node.id) === String(selectedId)) || roots[0] || null;

  if (loading) return <div className="explain-plan-empty"><Activity size={20} className="connection-progress-spinner" /><b>Building execution plan…</b><span>Oracle is preparing the plan for the current statement.</span></div>;
  if (error) return <div className="explain-plan-empty explain-plan-error"><b>Execution plan unavailable</b><span>{error}</span></div>;
  if(result?.planKind==='runtime')return <section className="runtime-cursor-plan" aria-label="Executed cursor plan"><header><strong>Executed cursor plan · SQL ID {result.sqlId}</strong><p>Oracle cursor cache · ALLSTATS LAST · all child cursors. Last-execution statistics may reflect another session; this is not a measurement limited to this run.</p><p>Actual row and timing statistics are shown only when collected by Oracle. This action does not rerun SQL, collect new statistics or change session settings.</p></header><pre>{result.lines?.join('\n')||'No cached plan is available for this SQL ID.'}</pre></section>;
  if (!roots.length) return <div className="explain-plan-empty"><GitBranch size={20} /><b>No plan steps returned</b><span>Run Explain Plan for the current SQL statement.</span></div>;

  return <section className="explain-plan-view" aria-label="Execution plan">
    <header className="explain-plan-toolbar"><div><strong>Execution plan</strong><span>{nodes.length} steps · estimated cost {roots[0]?.cost ?? "—"}</span></div><div className="explain-plan-mode" role="group" aria-label="Execution plan view">
      <button className={mode === "diagram" ? "active" : ""} onClick={() => onModeChange?.("diagram")} aria-pressed={mode === "diagram"}><GitBranch size={14} /> Diagram</button>
      <button className={mode === "nested" ? "active" : ""} onClick={() => onModeChange?.("nested")} aria-pressed={mode === "nested"}><ListTree size={14} /> Nested steps</button>
    </div></header>
    <div className={`explain-plan-workspace ${mode === "diagram" ? "diagram-mode" : "nested-mode"}`}>
      <div className="explain-plan-scroll">
        {mode === "diagram" ? <div className="explain-diagram-canvas">{roots.map(root => <DiagramBranch key={root.id} node={root} selectedId={selected?.id} onSelect={setSelectedId} />)}</div> : <div className="explain-nested-list">{roots.map(root => <NestedStep key={root.id} node={root} depth={0} selectedId={selected?.id} onSelect={setSelectedId} />)}</div>}
      </div>
      <aside className="explain-plan-details"><div className="explain-plan-details-heading"><span>SELECTED STEP</span><b>{selected.operation}</b>{selected.object && <small>{selected.object}</small>}</div>
        <div className="explain-plan-detail-metrics"><div><span>Options</span><b>{selected.options ?? "—"}</b></div><div><span>Estimated cost</span><b>{selected.cost ?? "—"}</b></div><div><span>Estimated rows</span><b>{selected.rows ?? "—"}</b></div><div><span>Estimated bytes</span><b>{selected.bytes ?? "—"}</b></div></div>
      </aside>
    </div>
    <footer className="explain-plan-legend"><span><i className="plan-legend-source" /> Data access</span><span><i className="plan-legend-join" /> Join</span><span><i className="plan-legend-result" /> Result / other</span><small>Estimates from Oracle’s optimizer; actual runtime can differ.</small></footer>
  </section>;
}
