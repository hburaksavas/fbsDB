import {createContext} from 'react';
// The connection the active tab runs on, so result views can say where a change would go without prop drilling.
export const ExecutionTargetContext = createContext(null);
