import type { TimelineClip, Track, TrackType } from '../types/editor';

export const allowedOnTrack = (mediaType:TrackType, trackType:TrackType) => mediaType===trackType;
// Repair old projects which stored images on audio or video lanes.
export function normalizeTrackAssignments(clips:TimelineClip[], tracks:Track[]) {
  const nextTracks=[...tracks];
  const labels={image:'IMMAGINI',video:'VIDEO',audio:'AUDIO',effect:'EFFECTS',text:'TESTO'};
  const nextClips=clips.map(clip=>{
    if(nextTracks.some(t=>t.id===clip.trackId && t.type===clip.type))return clip;
    let track=nextTracks.find(t=>t.type===clip.type);
    if(!track){track={id:crypto.randomUUID(),type:clip.type,name:labels[clip.type],isMuted:false,isSolo:false,headerBg:'#192638',laneBg:'#111827'};nextTracks.push(track);}
    return {...clip,trackId:track.id};
  });
  return {clips:nextClips,tracks:nextTracks};
}
