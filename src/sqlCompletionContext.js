import { getOracleCompletionContext } from './oracleCompletionContext.js';

// Compatibility entry point for consumers that only need relation completion.
export function getTableCompletionContext(before) {
  const context = getOracleCompletionContext(before, before.length);
  if (context.blocked || !context.relation) return null;
  return {
    owner: context.qualifier || null,
    fragment: context.fragment,
    ...(context.needsLeadingSpace ? { needsLeadingSpace: true } : {}),
  };
}
