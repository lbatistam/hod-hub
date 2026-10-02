import {normalizeName} from './domain';
export type LeadObservation={id:string;creationKey:string;name:string;createdAt:string;startsAt:string;eligible:boolean};
export type LeadClassification={creationRecord:boolean;qualified:boolean;rescheduled:boolean;firstCreatedAt:string|null;firstId:string|null};
// Names are matched exactly after normalization. Phone numbers never merge people.
// One creation per Google event/recurring series; invite copies share the canonical id.
export function classifyLeadHistory(observations:LeadObservation[]){
 const result=new Map<string,LeadClassification>(),first=new Map<string,LeadObservation>(),seenCreations=new Set<string>();
 const validTime=(v:string)=>{const n=Date.parse(v);return Number.isFinite(n)?n:Infinity};
 const sorted=[...observations].sort((a,b)=>validTime(a.createdAt)-validTime(b.createdAt)||validTime(a.startsAt)-validTime(b.startsAt)||a.id.localeCompare(b.id));
 for(const item of sorted){
  const creationRecord=!seenCreations.has(item.creationKey);seenCreations.add(item.creationKey);
  const key=normalizeName(item.name),valid=item.eligible&&Boolean(key)&&Number.isFinite(Date.parse(item.createdAt));
  const previous=valid?first.get(key):undefined;
  // The same recurring series is one creation, rather than repeated qualifications.
  const repeated=Boolean(previous&&previous.creationKey!==item.creationKey);
  result.set(item.id,{creationRecord,qualified:valid&&creationRecord&&!previous,rescheduled:valid&&creationRecord&&repeated,firstCreatedAt:previous?.createdAt||(valid?item.createdAt:null),firstId:previous?.id||(valid?item.id:null)});
  if(valid&&!previous)first.set(key,item);
 }
 return result;
}
