'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Select, type Option } from '@openai/apps-sdk-ui/components/Select';
import { CopyTooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { Copy } from '@openai/apps-sdk-ui/components/Icon';
import { applyDocumentTheme } from '@openai/apps-sdk-ui/theme';
import type { OperationalState } from '@/lib/demo';
export const stateColors={Agendadas:'info',Acontecendo:'warning',Compareceu:'success','No-show':'danger'} as const;
export function StatusBadge({state}:{state:OperationalState}){return <Badge color={stateColors[state]}>{state}</Badge>}
export function Panel({children,className='',...rest}:{children:ReactNode;className?:string; 'aria-label'?:string}){return <section className={`rounded-2xl border border-default bg-surface p-5 ${className}`} {...rest}>{children}</section>}
export function Choice({label,value,options,onChange,id,hideLabel=false}:{label:string;value:string;options:readonly string[];onChange:(v:string)=>void;id:string;hideLabel?:boolean}){
 const TriggerView=useMemo(()=>function LabeledTrigger(option:Option){return <><span className="sr-only">{label}: </span>{option.label}</>},[label]);
 return <div className="min-w-0"><label className={hideLabel?'sr-only':'mb-2 block text-sm font-medium'} htmlFor={id}>{label}</label><Select id={id} TriggerView={TriggerView} value={value} options={options.map(value=>({value,label:value}))} onChange={option=>onChange(option.value)} size="lg"/></div>
}
export function CopyAction({value,label,notify}:{value:string;label:string;notify:(v:string)=>void}){
  async function copyByKeyboard(){try{await navigator.clipboard.writeText(value);notify(`${label} copiado`)}catch{notify('Não foi possível copiar. Selecione o texto e copie manualmente.')}}
  return <CopyTooltip copyValue={value}><Button aria-label={`Copiar ${label}`} variant="ghost" color="secondary" size="sm" uniform onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void copyByKeyboard()}}}><Copy/></Button></CopyTooltip>;
}
export type ThemePreference='light'|'dark'|'system';
export function useHodTheme(){const [theme,setTheme]=useState<ThemePreference>('system');
 useEffect(()=>{const stored=localStorage.getItem('hod-theme');if(stored==='light'||stored==='dark'||stored==='system')setTheme(stored);try{const p=JSON.parse(localStorage.getItem('hod-preview-preferences')||'null');if(p)document.documentElement.dataset.density=p.density==='Compacta'?'compact':'comfortable'}catch{}},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const apply=()=>applyDocumentTheme(theme==='system'?(media.matches?'dark':'light'):theme);apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply)},[theme]);
 return {theme,setTheme:(v:ThemePreference)=>{setTheme(v);localStorage.setItem('hod-theme',v)}};
}
