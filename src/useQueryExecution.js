import { useRef } from 'react';
import { createQueryExecution } from './queryExecution.js';

export function useQueryExecution(ports) {
  const latest = useRef(ports), actions = useRef(null);
  latest.current = ports;
  if (!actions.current) actions.current = createQueryExecution(() => latest.current);
  return actions.current;
}
