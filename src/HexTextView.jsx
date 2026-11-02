import {useMemo,useRef,useState} from 'react';
import {binaryChunk,binaryRows,byteRange,describeByteRange} from './binaryRows';

// Hex and text panes share byte offsets: hovering or selecting in either pane highlights the same range in both.
export function HexTextView({bytes,offset}){
 const [anchor,setAnchor]=useState(null),[focus,setFocus]=useState(null),[hover,setHover]=useState(null),dragging=useRef(false);
 const rows=useMemo(()=>binaryRows(bytes,offset,binaryChunk),[bytes,offset]);
 const range=byteRange(anchor,focus),detail=describeByteRange(bytes,range);
 const state=at=>range&&at>=range.start&&at<=range.end?'selected':hover===at?'hover':undefined;
 const down=(event,at)=>{event.preventDefault();dragging.current=true;if(event.shiftKey&&anchor!=null)setFocus(at);else{setAnchor(at);setFocus(at)}window.addEventListener('pointerup',()=>{dragging.current=false},{once:true})};
 const cell=(item,kind)=><span key={item.at} data-byte={item.at} data-state={state(item.at)} onPointerDown={event=>down(event,item.at)} onPointerEnter={()=>{setHover(item.at);if(dragging.current)setFocus(item.at)}}>{kind==='hex'?item.hex:item.char}</span>;
 const key=event=>{
  const current=focus??anchor??offset,last=Math.min(bytes.length,offset+binaryChunk)-1,move={ArrowLeft:-1,ArrowRight:1,ArrowUp:-16,ArrowDown:16}[event.key];
  if(event.key==='Escape'){setAnchor(null);setFocus(null);return}
  if(move==null)return;event.preventDefault();
  const next=Math.max(offset,Math.min(last,current+move));
  if(event.shiftKey&&anchor!=null)setFocus(next);else{setAnchor(next);setFocus(next)}
 };
 return <div className="hex-text-view">
  <div className="hex-text-status" role="status">{detail?<><span>{detail.label}</span><button type="button" onClick={()=>navigator.clipboard.writeText(detail.hex)}>Copy hex</button></>:<span>Click or drag bytes in either pane; Shift extends the range.</span>}</div>
  <div className="hex-text-grid" tabIndex={0} role="grid" aria-label="Hex and text bytes" onKeyDown={key} onPointerLeave={()=>setHover(null)}>
   {rows.map(row=><div className="hex-text-row" key={row.offset} role="row"><span className="hex-offset">{row.label}</span><span className="hex-bytes" role="gridcell">{row.cells.map(item=>cell(item,'hex'))}</span><span className="hex-chars" role="gridcell">{row.cells.map(item=>cell(item,'text'))}</span></div>)}
  </div>
 </div>;
}
