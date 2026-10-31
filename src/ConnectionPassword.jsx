import {useEffect,useId,useRef,useState} from 'react';
import {Check,Eye,EyeOff,LockKeyhole} from 'lucide-react';

export function ConnectionPassword({value,onChange,remember,onRememberChange,saved=false,disabled=false,autoComplete='current-password',placeholder}) {
  const id=useId(),input=useRef(null),[visible,setVisible]=useState(false);
  useEffect(()=>{if(disabled||saved||!value)setVisible(false)},[disabled,saved,value]);
  const reveal=()=>{
    const field=input.current,start=field?.selectionStart,end=field?.selectionEnd,focused=document.activeElement===field;
    setVisible(current=>!current);
    if(focused)requestAnimationFrame(()=>{if(document.activeElement===field)field.setSelectionRange(start,end)});
  };
  return <div className="connection-password" data-remembered={remember||undefined} data-disabled={disabled||undefined}>
    <div className="password-entry-header">
      <label className="password-entry-label" htmlFor={id}>Password</label>
      <label className="password-remember-toggle">
        <input type="checkbox" aria-label="Remember password" checked={remember} disabled={disabled} onChange={event=>onRememberChange(event.target.checked)}/>
        <span className="password-remember-track" aria-hidden="true"><span className="password-remember-thumb"><Check size={8}/></span></span>
        <span>Remember</span>
      </label>
    </div>
    <div className="password-entry-frame">
      <LockKeyhole className="password-entry-lock" size={15} aria-hidden="true"/>
      <input ref={input} id={id} className="password-entry-input" type={visible&&!saved?'text':'password'} value={value} onChange={event=>onChange(event.target.value)} disabled={disabled} autoComplete={autoComplete} autoCapitalize="off" spellCheck={false} placeholder={saved?'Saved password':placeholder||'Enter password'}/>
      <button type="button" className="password-visibility" disabled={disabled||saved||!value} aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onMouseDown={event=>event.preventDefault()} onClick={reveal}>{visible?<EyeOff size={15}/>:<Eye size={15}/>}</button>
    </div>
  </div>;
}
