export function ActionableState({ title, detail, action, onAction, className = '' }) {
  return <div className={`actionable-state ${className}`} role="status"><strong>{title}</strong><span>{detail}</span>{action && <button type="button" className="button-secondary" onClick={onAction}>{action}</button>}</div>;
}
