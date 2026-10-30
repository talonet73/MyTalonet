import type {TimelineClip} from '../types/editor';
/** Snap only sub-microsecond arithmetic residue; deliberate gaps remain untouched. */
export function joinCutSeams(clips:TimelineClip[]){
  const result=clips.map(c=>({...c})),tracks=new Set(result.map(c=>c.trackId));
  for(const track of tracks){const ordered=result.filter(c=>c.trackId===track).sort((a,b)=>a.startTime-b.startTime);for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i],end=a.startTime+a.duration,gap=b.startTime-end;if(Math.abs(gap)<1e-6&&gap!==0){const oldEnd=b.startTime+b.duration;b.startTime=end;b.duration=oldEnd-end;}}}
  return result;
}
