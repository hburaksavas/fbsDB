import { isNativeHost, sendNativeCommand } from './nativeBridge.js';
import { useRef } from 'react';
import { createConnectionLifecycle } from './connectionLifecycle.js';
export function useConnectionLifecycle(ports) {
 const latest=useRef(ports),actions=useRef(null);latest.current=ports;
 if(!actions.current)actions.current=createConnectionLifecycle(()=>latest.current,{native:isNativeHost,send:sendNativeCommand});
 return actions.current;
}
