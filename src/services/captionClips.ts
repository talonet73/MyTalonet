import type {SubtitleItem,TimelineClip,Track} from '../types/editor';
export function textTrack():Track{return {id:crypto.randomUUID(),name:'TESTO',type:'text',headerBg:'#63300d',laneBg:'#301909',isMuted:false,isSolo:false};}
export function captionClips(subtitles:SubtitleItem[],clips:TimelineClip[],tracks:Track[],replace=false,bilingual=false){
  const track=tracks.find(t=>t.type==='text') || textTrack();
  const existing=new Map(clips.filter(c=>c.captionId).map(c=>[c.captionId,c]));
  const next=clips.filter(c=>!c.captionId && !(replace && c.type==='text' && c.trackId===track.id));
  for(const sub of subtitles){
    if(!Number.isFinite(sub.startTime)||!Number.isFinite(sub.endTime)||sub.endTime<=sub.startTime)throw new Error('Tempi del sottotitolo non validi.');
    const old=existing.get(sub.id),text=bilingual && sub.translation?`${sub.text}\n${sub.translation}`:sub.text;
    next.push({id:old?.id || crypto.randomUUID(),type:'text',trackId:old?.trackId || track.id,name:text.slice(0,35),text,captionId:sub.id,startTime:sub.startTime,duration:sub.endTime-sub.startTime,offset:0,color:'#f97316',transparency:100,volumeDb:0,fadeIn:0,fadeOut:0});
  }
  if(next.length>2200 || next.filter(c=>c.type==='text').length>2000)throw new Error('Troppi mattoncini: massimo 2200.');
  return {clips:next,tracks:tracks.includes(track)?tracks:[...tracks,track]};
}
export function timelineSubtitles(clips:TimelineClip[]):SubtitleItem[]{const tracks=[...new Set(clips.filter(c=>c.type==='text').map(c=>c.trackId))];return clips.filter(c=>c.type==='text' && c.text).map(c=>({id:c.id,text:c.text!,startTime:c.startTime,endTime:c.startTime+c.duration,row:tracks.indexOf(c.trackId),transparency:c.transparency,fadeIn:c.fadeIn,fadeOut:c.fadeOut}));}
