import type {TimelineClip} from '../types/editor';

export const SPEED_PERCENTAGES=[25,40,50,65,80,100,125,150,200,300,400] as const;
export const validSpeedLevel=(level:unknown)=>level===undefined || (typeof level==='number' && Number.isInteger(level) && level>=-5 && level<=5);
export function clipRate(clip:{speedLevel?:number}){return (SPEED_PERCENTAGES[(clip.speedLevel ?? 0)+5] ?? 100)/100;}
export function sourceTime(clip:{startTime:number;offset?:number;speedLevel?:number},time:number){return (clip.offset || 0)+(time-clip.startTime)*clipRate(clip);}
export function tempoFilters(rate:number){const filters:string[]=[];while(rate<.5){filters.push('atempo=0.5');rate/=.5;}while(rate>2){filters.push('atempo=2');rate/=2;}if(Math.abs(rate-1)>1e-8)filters.push(`atempo=${rate}`);return filters;}
export function changeClipSpeed(clips:TimelineClip[],id:string,level:number){
  if(!validSpeedLevel(level))throw new Error('Scegli una velocità intera da -5 a +5.');
  const target=clips.find(c=>c.id===id);if(!target)throw new Error('Clip non trovata.');
  const linked=target.isLinked && ['video','audio'].includes(target.type)?clips.find(c=>c.id===target.linkedClipId && c.linkedClipId===id && c.isLinked!==false):undefined;
  return clips.map(c=>{
    if(c.id!==id && c.id!==linked?.id)return c;
    const scale=clipRate(c)/clipRate({speedLevel:level});
    return {...c,speedLevel:level,duration:c.duration*scale,fadeIn:(c.fadeIn||0)*scale,fadeOut:(c.fadeOut||0)*scale};
  });
}
