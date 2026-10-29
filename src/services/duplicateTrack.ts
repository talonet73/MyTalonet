import type {TimelineClip,Track} from '../types/editor';

export function duplicateTrack(tracks:Track[],clips:TimelineClip[],trackId:string){
  const source=tracks.find(t=>t.id===trackId);if(!source)throw new Error('Pista non trovata.');
  const copies=new Map<string,Track>();
  const add=(track:Track)=>{if(!copies.has(track.id))copies.set(track.id,{...track,id:crypto.randomUUID(),name:`${track.name} (Copia)`});};
  add(source);
  const selected=clips.filter(c=>c.trackId===trackId);
  // A video carries its linked soundtrack into a new audio lane. Duplicating
  // an audio lane on its own deliberately creates independent audio clips.
  if(source.type==='video')for(const video of [...selected]){
    const audio=video.isLinked && clips.find(c=>c.id===video.linkedClipId && c.type==='audio' && c.linkedClipId===video.id && c.isLinked!==false);
    const audioTrack=audio && tracks.find(t=>t.id===audio.trackId);
    if(audio && audioTrack){selected.push(audio);add(audioTrack);}
  }
  const ids=new Map(selected.map(c=>[c.id,crypto.randomUUID()]));
  const duplicateClips=selected.map(c=>({...c,id:ids.get(c.id)!,trackId:copies.get(c.trackId)!.id,captionId:undefined,linkedClipId:c.isLinked?ids.get(c.linkedClipId!):undefined,isLinked:Boolean(c.isLinked && ids.has(c.linkedClipId!))}));
  const newTracks=tracks.flatMap(t=>copies.has(t.id)?[t,copies.get(t.id)!]:[t]);
  return {tracks:newTracks,clips:[...clips,...duplicateClips],newTrackId:copies.get(trackId)!.id};
}
