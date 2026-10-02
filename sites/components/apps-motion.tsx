'use client';
import {createContext,useContext,useEffect,useState,useRef,type ReactNode} from 'react';
import {Animate,AnimateLayout,AnimateLayoutGroup,TransitionGroup} from '@openai/apps-sdk-ui/components/Transition';

// Timings are intentionally short; easing comes from the official SDK tokens.
export const motionTiming={enter:180,exit:150,layout:180,drawer:280,swap:240,swapExit:140} as const;
type MotionPreference='system'|'reduced';
const MotionContext=createContext({reduced:true,preference:'system' as MotionPreference,setPreference:(_v:MotionPreference)=>{}});
export function MotionProvider({children}:{children:ReactNode}){
 const [preference,setPreference]=useState<MotionPreference>('system'),[systemReduced,setSystemReduced]=useState(true);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystemReduced(media.matches);update();if(localStorage.getItem('hod-motion-preference')==='reduced')setPreference('reduced');media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 const reduced=systemReduced||preference==='reduced';
 useEffect(()=>{document.documentElement.dataset.motion=reduced?'reduced':'normal'},[reduced]);
 function change(v:MotionPreference){setPreference(v);localStorage.setItem('hod-motion-preference',v)}
 return <MotionContext.Provider value={{reduced,preference,setPreference:change}}>{children}</MotionContext.Provider>
}
export function useMotion(){return useContext(MotionContext)}
export function MotionReveal({children}:{children:ReactNode}){
 const {reduced}=useMotion();
 if(reduced)return <div className="hod-motion-region">{children}</div>;
 return <AnimateLayout as="div" className="hod-motion-region" hideOverflow enter={{opacity:1,duration:motionTiming.enter,timingFunction:'var(--cubic-enter)'}} exit={{opacity:0,duration:motionTiming.exit,timingFunction:'var(--cubic-exit)'}} layoutEnter={{duration:motionTiming.layout,timingFunction:'var(--cubic-enter)'}} layoutExit={{delay:0,duration:motionTiming.exit,timingFunction:'var(--cubic-exit)'}}>{children}</AnimateLayout>
}
export function MotionList({children,className=''}:{children:ReactNode;className?:string}){
 const {reduced}=useMotion();
 const region=useRef<HTMLDivElement>(null);
 useEffect(()=>{const root=region.current;if(!root)return;const sync=()=>{root.querySelectorAll<HTMLElement>('[data-exiting]').forEach(el=>{el.inert=true;el.setAttribute('aria-hidden','true')});root.querySelectorAll<HTMLElement>('[data-entering]').forEach(el=>{if(!el.hasAttribute('data-exiting')){el.inert=false;el.removeAttribute('aria-hidden')}})};const observer=new MutationObserver(sync);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-exiting','data-entering']});sync();return()=>observer.disconnect()},[reduced]);
 if(reduced)return <div className={className}>{children}</div>;
 return <div ref={region} className={className}><AnimateLayoutGroup as="div" initial={{opacity:0,y:8,scale:0.985}} enter={{opacity:1,y:0,scale:1,delay:0,duration:motionTiming.enter,timingFunction:'var(--cubic-enter)'}} exit={{opacity:0,duration:motionTiming.exit,timingFunction:'var(--cubic-exit)'}} layoutEnter={{duration:motionTiming.layout,timingFunction:'var(--cubic-enter)'}} layoutExit={{delay:0,duration:motionTiming.exit,timingFunction:'var(--cubic-exit)'}} layoutMove={{duration:motionTiming.layout,timingFunction:'var(--cubic-move)'}}>{children}</AnimateLayoutGroup></div>
}
export function MotionFade({children}:{children:ReactNode}){
 const {reduced}=useMotion();
 if(reduced)return <div className="hod-motion-region">{children}</div>;
 return <Animate as="div" className="hod-motion-region" transitionPosition="static" enter={{opacity:1,duration:motionTiming.enter,timingFunction:'var(--cubic-enter)'}} exit={{opacity:0,duration:motionTiming.exit,timingFunction:'var(--cubic-exit)'}}>{children}</Animate>
}

/** Retain outgoing visuals, but remove them from focus and assistive navigation. */
export function MotionSwap({children,identity,className=''}:{children:ReactNode;identity:string;className?:string}){
 const {reduced}=useMotion();
 return <div className="hod-content-swap"><TransitionGroup as="div" className="hod-swap-item" disableAnimations={reduced} enterDuration={motionTiming.swap} exitDuration={motionTiming.swapExit} onExit={el=>{el.inert=true;el.setAttribute('aria-hidden','true')}} onEnter={el=>{el.inert=false;el.removeAttribute('aria-hidden')}}><div key={identity} className={className}>{children}</div></TransitionGroup></div>
}
