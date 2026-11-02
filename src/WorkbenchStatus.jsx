import {Activity,AlertCircle,Check,MousePointer2,Unplug,TriangleAlert} from 'lucide-react';
import {workbenchStatus} from './workbenchStatusModel.js';
export function WorkbenchStatus(props){
 const status=workbenchStatus(props),Icon=({busy:Activity,error:AlertCircle,warning:TriangleAlert,selection:MousePointer2,offline:Unplug,ready:Check})[status.kind];
 return <div className="workbench-context-status" data-kind={status.kind} role="status" aria-live="polite" title={status.detail||status.text}><Icon size={11}/><span>{status.text}</span></div>;
}
