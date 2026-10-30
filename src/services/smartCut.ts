import type {TimelineClip,SubtitleItem} from '../types/editor';
import {clipRate} from './clipSpeed';
export interface CutRange {id:string;start:number;end:number;reason:'pause'|'filler'|'retake';label:string;selected:boolean}
export function mergeRanges(ranges:{start:number;end:number}[],duration:number){
  const sorted=ranges.map(r=>({start:Math.max(0,r.start),end:Math.min(duration,r.end)})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end-r.start>.001).sort((a,b)=>a.start-b.start),out:{start:number;end:number}[]=[];
  for(const r of sorted){const last=out.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else out.push({...r});}return out;
}
export function cleanupCandidates(silences:{start:number;end:number}[],subtitles:SubtitleItem[],duration:number,tolerance:number){
  if(!Number.isFinite(tolerance)||tolerance<.5||tolerance>2)throw new Error('Tolleranza pause: da 0,5 a 2 secondi.');
  const out:CutRange[]=[];
  const protectedWords=subtitles.flatMap(s=>s.words||[]);
  for(const s of silences)if(s.end-s.start>=tolerance){let gaps=[{start:Math.min(duration,s.start+.12),end:Math.max(0,s.end-.12)}];for(const w of protectedWords)gaps=gaps.flatMap(g=>w.endTime+.08<=g.start||w.startTime-.08>=g.end?[g]:[{start:g.start,end:Math.min(g.end,w.startTime-.08)},{start:Math.max(g.start,w.endTime+.08),end:g.end}].filter(r=>r.end>r.start));for(const g of gaps)if(g.end-g.start>=Math.max(.05,tolerance-.24))out.push({id:crypto.randomUUID(),...g,reason:'pause',label:'Pausa rilevata nel mix audio',selected:subtitles.length>0});}
  for(const s of subtitles){
    for(const w of s.words||[])if(/^(e+h?m+|u+h?m+|u+h+|e+h+|m+h+m+)[.,!?…]*$/iu.test(w.text)&&w.endTime>w.startTime)out.push({id:crypto.randomUUID(),start:w.startTime,end:w.endTime,reason:'filler',label:`Esitazione: “${w.text}”`,selected:false});
    if(/\b(ciak|rifacciamo|ricominciamo|stop|cut|take again|start again)\b/i.test(s.text))out.push({id:crypto.randomUUID(),start:s.startTime,end:s.endTime,reason:'retake',label:`Da verificare: “${s.text.slice(0,110)}”`,selected:false});
  }
  for(let si=0;si<subtitles.length;si++){const s=subtitles[si],next=subtitles[si+1],tokens=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').split(/\s+/).filter(Boolean),a=tokens(s.text),b=next?tokens(next.text):[];if(next&&a.length>=4&&b.length>=4&&a.slice(0,4).join(' ')===b.slice(0,4).join(' ')&&next.startTime-s.endTime<8)out.push({id:crypto.randomUUID(),start:s.startTime,end:s.endTime,reason:'retake',label:`Possibile ripetizione: “${s.text.slice(0,100)}”`,selected:false});}
  return out.filter(r=>r.start>=0&&r.end<=duration&&r.end>r.start).sort((a,b)=>a.start-b.start);
}
/** Automatic mode shortens each complete pause to the requested total retained margin. */
export function automaticCuts(silences:{start:number;end:number}[],duration:number,margin:number){
  if(!Number.isFinite(margin)||margin<.2||margin>1)throw new Error('Margine pause da 0,2 a 1 secondo.');
  return mergeRanges(silences,duration).filter(r=>r.end-r.start>margin+.04).map(r=>({id:crypto.randomUUID(),start:r.start+margin/2,end:r.end-margin/2,reason:'pause' as const,label:'Pausa accorciata automaticamente',selected:true}));
}
export function rippleRemove(clips:TimelineClip[],ranges:{start:number;end:number}[]){
  const duration=Math.max(0,...clips.map(c=>c.startTime+c.duration)),cuts=mergeRanges(ranges,duration);if(!cuts.length)throw new Error('Seleziona almeno un intervallo da rimuovere.');
  const keeps:{start:number;end:number;target:number}[]=[];let source=0,target=0;
  for(const cut of [...cuts,{start:duration,end:duration}]){if(cut.start>source){keeps.push({start:source,end:cut.start,target});target+=cut.start-source;}source=cut.end;}
  if(target<.04)throw new Error('Il taglio eliminerebbe tutto il montaggio. Conserva almeno una parte.');
  const ids=new Map<string,string>(),parts:{clip:TimelineClip;original:TimelineClip;index:number}[]=[];
  for(const c of clips)keeps.forEach((keep,index)=>{const from=Math.max(c.startTime,keep.start),to=Math.min(c.startTime+c.duration,keep.end);if(to-from<.001)return;const id=crypto.randomUUID();ids.set(`${c.id}:${index}`,id);parts.push({original:c,index,clip:{...c,id,startTime:keep.target+from-keep.start,duration:to-from,offset:(c.offset||0)+(from-c.startTime)*clipRate(c),fadeIn:from===c.startTime?Math.min(c.fadeIn,to-from):0,fadeOut:to===c.startTime+c.duration?Math.min(c.fadeOut,to-from):0,effectSpan:c.type==='effect'?(c.effectSpan??c.duration*clipRate(c)):c.effectSpan}});});
  const next=parts.map(({clip,original,index})=>{const linked=original.isLinked&&original.linkedClipId?ids.get(`${original.linkedClipId}:${index}`):undefined;return {...clip,linkedClipId:linked,isLinked:!!linked};});
  return {clips:next,duration:target,mapTime:(t:number)=>Math.max(0,t-cuts.reduce((sum,r)=>sum+Math.max(0,Math.min(t,r.end)-r.start),0))};
}
