import {Table2,Eye,Layers3,Link2,Package,Code2,Braces,Zap,ArrowUpDown,Workflow,KeyRound,Shapes,Globe2,Database} from 'lucide-react';
const icons={TABLE:Table2,VIEW:Eye,'MATERIALIZED VIEW':Layers3,SYNONYM:Link2,PACKAGE:Package,PROCEDURE:Code2,FUNCTION:Braces,TRIGGER:Zap,SEQUENCE:ArrowUpDown,INDEX:Workflow,CONSTRAINT:KeyRound,TYPE:Shapes,'DATABASE LINK':Globe2};
export const oracleObjectClass=type=>`object-${String(type).toLowerCase().replaceAll(' ','-')}`;
export function OracleObjectIcon({type,size=13}){const Icon=icons[type]||Database;return <Icon size={size} className={`oracle-object-icon ${oracleObjectClass(type)}`} aria-hidden="true"/>}
