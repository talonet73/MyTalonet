import {clipRate} from './clipSpeed';
import type {SubtitleItem,TimelineClip,Track} from '../types/editor';
export function textTrack():Track{return {id:crypto.randomUUID(),name:'TESTO',type:'text',headerBg:'#63300d',laneBg:'#301909',isMuted:false,isSolo:false};}
export function captionClips(subtitles:SubtitleItem[],clips:TimelineClip[],tracks:Track[],replace=false,bilingual=false,animated=false){
  const track=tracks.find(t=>t.type==='text') || textTrack();
  const existing=new Map(clips.filter(c=>c.captionId).map(c=>[c.captionId,c]));
  const next=clips.filter(c=>!c.captionId && !(replace && c.type==='text' && c.trackId===track.id));
  const phrases=subtitles.flatMap(sub=>{if(!animated||bilingual||!sub.words?.length)return [sub];const result:SubtitleItem[]=[];for(let i=0;i<sub.words.length;i+=5){const words=sub.words.slice(i,i+5);result.push({...sub,id:`${sub.id}:${i/5}`,text:words.map(w=>w.text).join(' '),startTime:words[0].startTime,endTime:Math.min(sub.endTime,sub.words[i+5]?.startTime??sub.endTime),words,style:'karaoke'});}return result;});
  for(const sub of phrases){
    if(!Number.isFinite(sub.startTime)||!Number.isFinite(sub.endTime)||sub.endTime<=sub.startTime)throw new Error('Tempi del sottotitolo non validi.');
    const old=existing.get(sub.id),text=bilingual && sub.translation?`${sub.text}\n${sub.translation}`:sub.text;
    next.push({id:old?.id || crypto.randomUUID(),type:'text',trackId:old?.trackId || track.id,name:text.slice(0,35),text,captionId:sub.id,captionStyle:sub.style,captionWords:sub.words?.map(w=>({...w,startTime:w.startTime-sub.startTime,endTime:w.endTime-sub.startTime})),startTime:sub.startTime,duration:sub.endTime-sub.startTime,offset:0,color:'#f97316',transparency:100,volumeDb:0,fadeIn:0,fadeOut:0});
  }
  if(next.filter(c=>c.type==='text').length>2000)throw new Error('Troppi mattoncini di testo: massimo 2000.');
  return {clips:next,tracks:tracks.includes(track)?tracks:[...tracks,track]};
}
export function timelineSubtitles(clips:TimelineClip[]):SubtitleItem[]{const tracks=[...new Set(clips.filter(c=>c.type==='text').map(c=>c.trackId))];return clips.filter(c=>c.type==='text' && c.text).map(c=>({id:c.id,text:c.text!,startTime:c.startTime,endTime:c.startTime+c.duration,row:tracks.indexOf(c.trackId),transparency:c.transparency,fadeIn:c.fadeIn,fadeOut:c.fadeOut,style:c.captionStyle,words:c.captionWords?.map(w=>({...w,startTime:c.startTime+(w.startTime-(c.offset||0))/clipRate(c),endTime:c.startTime+(w.endTime-(c.offset||0))/clipRate(c)})).filter(w=>w.endTime>c.startTime&&w.startTime<c.startTime+c.duration)}));}
