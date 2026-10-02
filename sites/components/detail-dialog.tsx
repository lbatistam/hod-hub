'use client';
import {SlotTransitionGroup} from '@openai/apps-sdk-ui/components/Transition';
import {useMotion,motionTiming} from './apps-motion';
import {useEffect,useRef,type ReactNode} from 'react';
/** Composed dialog: the SDK has no modal/drawer. Portals remain outside inert content. */
export function DetailDialog({open,onClose,children,returnFocus}:{open:boolean;onClose:()=>void;children:ReactNode;returnFocus:HTMLElement|null}){
 const {reduced}=useMotion();
 const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!open)return;const previous=returnFocus;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector<HTMLElement>('button')?.focus({preventScroll:true});
 function onKey(e:KeyboardEvent){if(e.defaultPrevented)return;
  if(e.key==='Escape'){if(panel.current?.querySelector('[aria-expanded="true"]'))return;e.preventDefault();close.current();return}
  if(e.key!=='Tab')return;
  // Official popups manage their own keyboard/focus while open.
  if(!panel.current?.contains(document.activeElement))return;
  const nodes=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(n=>n.getClientRects().length&&!n.closest('[aria-hidden="true"]'));
  const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }
 document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=overflow;const label=previous?.getAttribute('aria-label');const target=previous?.isConnected?previous:label?document.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(label)}"]`):null;target?.focus({preventScroll:true})};
 },[open,returnFocus]);
 return <SlotTransitionGroup disableAnimations={reduced} enterDuration={motionTiming.drawer} exitDuration={motionTiming.exit} onExit={el=>{el.inert=true;el.setAttribute('aria-hidden','true')}} onEnter={el=>{el.inert=false;el.removeAttribute('aria-hidden');el.querySelector<HTMLElement>('button')?.focus({preventScroll:true})}}>{open&&<div key="detail-panel" className="hod-dialog-transition"><div className="hod-backdrop" aria-hidden="true" onClick={onClose}/><div ref={panel} className="hod-dialog overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="detail-title">{children}</div></div>}</SlotTransitionGroup>;
}
