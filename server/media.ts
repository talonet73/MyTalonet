import {maskPng} from './maskPng';
import {validateMask} from '../src/services/penMask';
import {karaokeLayout,validateWords,validateCaptionClip} from '../src/services/karaoke';
import {gradeCube,hasGrade,validateGrade} from '../src/services/colorGrade';
import {audioFilters,validateAudio} from '../src/services/audioMixer';
import {clipRate,sourceTime,tempoFilters,validSpeedLevel} from '../src/services/clipSpeed';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { visualFilters } from './visualFilters';
import {categoryOf, EXPORT_FORMATS} from '../src/services/exportFormats';
import {timelineSubtitles} from '../src/services/captionClips';
import {clipAlpha} from '../src/services/visualSettings';
import { ADJUSTMENTS, EFFECTS } from '../src/services/visualSettings';
import type { TimelineClip, Track, SubtitleItem } from '../src/types/editor';

const runFile = promisify(execFile);
export const downloadsDir = path.resolve(process.env.MEDIA_DIR || 'media_downloads');
export class InputError extends Error {}
export async function run(command: string, args: string[], timeout = 300_000, cwd?: string) {
  return runFile(command, args, { timeout, cwd, maxBuffer: 8 * 1024 * 1024 });
}
export async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(stdout);
}
export function localMediaPath(url: string) {
  if (typeof url !== 'string' || !url.startsWith('/media_downloads/')) throw new InputError('Media non caricato sul server. Importa nuovamente il file.');
  const name = url.slice('/media_downloads/'.length);
  if (!name || name !== path.basename(name) || /[\\\x00-\x1f]/.test(name)) throw new InputError('Percorso media non valido.');
  return path.join(downloadsDir, name);
}
export async function describeMedia(file: string, name: string) {
  let info;
  try { info = await probe(file); } catch { throw new InputError('File multimediale non leggibile o danneggiato.'); }
  const video = info.streams.find((s: any) => s.codec_type === 'video');
  const audio = info.streams.find((s: any) => s.codec_type === 'audio');
  const image = /\.(png|jpe?g|webp)$/i.test(file);
  if (!video && !audio) throw new InputError('Il file non contiene audio o video leggibile.');
  const durationSec = image ? 8 : Number(info.format.duration || video?.duration || audio?.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new InputError('Durata del file non valida.');
  return { id: randomUUID(), name, type: image ? 'image' : video ? 'video' : 'audio', durationSec,
    duration: `${String(Math.floor(durationSec / 60)).padStart(2, '0')}:${String(Math.floor(durationSec % 60)).padStart(2, '0')}`,
    fileUrl: `/media_downloads/${path.basename(file)}`, thumbnailUrl: image ? `/media_downloads/${path.basename(file)}` : undefined,
    hasAudio: Boolean(audio), width: video?.width, height: video?.height, isLost: false };
}
export function activeClips(clips: TimelineClip[], tracks: Track[] = []) {
  const solo = tracks.some(t => t.isSolo);
  return clips.filter(c => {
    const t = tracks.find(t => t.id === c.trackId);
    return !t?.isMuted && (!solo || t?.isSolo);
  });
}
function number(value: unknown, fallback: number, min: number, max: number) {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new InputError('Valore numerico fuori intervallo.');
  return n;
}
export async function exportMedia(body: any, options:{screenshot?:boolean}={}) {
  const { format = 'mp4', resolution = '1080p', aspectRatio = '16:9' } = body;
  if (!Object.values(EXPORT_FORMATS).flat().includes(format)) throw new InputError('Formato non supportato.');
  if (!['720p', '1080p', '4K'].includes(resolution) || !['16:9', '9:16', '1:1', '4:3'].includes(aspectRatio)) throw new InputError('Risoluzione o proporzioni non valide.');
  const still=categoryOf(format)==='image';
  const frameTime=still?number(body.frameTime,0,0,600):0;
  const duration = number(body.durationSec, 15, 0.04, 600);
  const weight = number(body.weightPercentage, 55, 1, 100);
  if (!Array.isArray(body.clips) || body.clips.filter((c:TimelineClip)=>c.type==='text').length>2000 || !body.clips.length) throw new InputError('Aggiungi almeno una clip alla timeline (massimo 2000 testi).');
  if (body.tracks !== undefined && !Array.isArray(body.tracks)) throw new InputError('Tracce non valide.');
  try{validateAudio(body.audioMaster);for(const t of body.tracks||[])validateAudio(t.audio);}catch(error){throw new InputError((error as Error).message);}
  const clips = activeClips(body.clips, body.tracks);
  for (const clip of clips) {
    try{validateGrade(clip.colorGrade);validateMask(clip.mask);validateCaptionClip(clip);}catch(error){throw new InputError((error as Error).message);}
    if(!validSpeedLevel(clip.speedLevel))throw new InputError('Velocità clip non valida: da -5 a +5.');
    number(clip.startTime, 0, 0, 86400); number(clip.duration, 0, 0.001, 86400); number(clip.offset, 0, 0, 86400);
    number(clip.intensity,5,0,10);number(clip.speed,5,0,10);number(clip.effectSpan,clip.duration,.001,86400);
    number(clip.volumeDb, 0, -60, 12); number(clip.transparency, 100, 0, 100);
    number(clip.fadeIn, 0, 0, 600); number(clip.fadeOut, 0, 0, 600);
    if (clip.effects !== undefined && (!Array.isArray(clip.effects) || clip.effects.length > 12 || clip.effects.some((e:string) => ![...EFFECTS.map(e=>e.type),'glitch'].includes(e as any)))) throw new InputError('Effetto visivo non valido.');
    if (clip.adjustments !== undefined) {
      if (!clip.adjustments || typeof clip.adjustments !== 'object' || Array.isArray(clip.adjustments)) throw new InputError('Regolazioni non valide.');
      for (const [key,value] of Object.entries(clip.adjustments)) {
        if (!ADJUSTMENTS.some(a=>a.key===key)) throw new InputError('Regolazione non supportata.');
        number(value,0,key==='sharpness'?0:-100,100);
      }
    }
    if (!['video', 'audio', 'image', 'effect','text'].includes(clip.type)) throw new InputError('Tipo di clip non valido.');
  }
  const audioOnly = categoryOf(format)==='audio';
  if(still && !options.screenshot && !clips.some(c=>c.type==='image' && (!body.tracks?.length || body.tracks.some((t:Track)=>t.id===c.trackId && t.type==='image'))))throw new InputError('Popola e attiva la pista IMMAGINI prima di esportare un’immagine.');
  if(options.screenshot && !clips.some(c=>c.type==='video' && frameTime>=c.startTime && frameTime<c.startTime+c.duration))throw new InputError('Posiziona il cursore su una clip video per lo Screenshot.');
  const media = clips.filter(c => ['video','audio','image'].includes(c.type) && c.startTime < duration && (!still || (c.type!=='audio' && (options.screenshot || c.type==='image') && frameTime>=c.startTime && frameTime<c.startTime+c.duration)));

  if (!media.length) throw new InputError(still?'Scegli un fotogramma con un’immagine attiva nella pista IMMAGINI.':'Nessun media attivo da esportare.');
  const resolved = await Promise.all(media.map(async clip => {
    const file = localMediaPath(clip.mediaUrl!);
    let info;
    try { info = await probe(file); } catch { throw new InputError(`Media non disponibile o danneggiato: ${clip.name}`); }
    if (clip.type !== 'audio' && !info.streams.some((s: any) => s.codec_type === 'video')) throw new InputError(`Nessun fotogramma in ${clip.name}`);
    if (clip.type === 'audio' && !info.streams.some((s: any) => s.codec_type === 'audio')) {
      // An automatically separated track from a silent video is intentionally silent.
      if (!clip.linkedClipId) throw new InputError(`Nessuna traccia audio in ${clip.name}`);
    }
    const sourceDuration = Number(info.format.duration);
    if (clip.type !== 'image' && Number.isFinite(sourceDuration) && clip.offset+(still?(frameTime-clip.startTime)*clipRate(clip):0) >= sourceDuration) throw new InputError(`Taglio oltre la durata del media: ${clip.name}`);
    return { ...clip, file, info };
  }));
  let width = resolution === '4K' ? 3840 : resolution === '720p' ? 1280 : 1920;
  let height = resolution === '4K' ? 2160 : resolution === '720p' ? 720 : 1080;
  if (aspectRatio === '9:16') [width, height] = [height, width];
  if (aspectRatio === '1:1') width = height;
  if (aspectRatio === '4:3') width = Math.round(height * 4 / 3 / 2) * 2;
  const videoKbps = Math.round((1500 + weight / 100 * 20500) * (resolution === '4K' ? 2.5 : resolution === '720p' ? .6 : 1));
  const audioKbps = Math.round(64 + weight / 100 * 256);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'taledit-export-'));
  const fileName = `${options.screenshot?'TALEDIT_Screenshot':still?'TALEDIT_Immagine':'TALEDIT_Export'}_${resolution}_${randomUUID()}.${format}`;
  const output = path.join(downloadsDir, fileName);
  try {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-filter_complex_threads', '2'];
  const filters: string[] = [];
  let input = 0;
  let layer = 'base';
  if (!audioOnly) {
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=25:d=${still ? .04:duration}`);
    filters.push(`[0:v]setpts=PTS-STARTPTS+${frameTime}/TB[base]`); input++;
  }
  const audioTags: string[] = [];
  const audioTrackIds=new Map<string,string>();
  for (const clip of resolved.sort((a,b)=>a.startTime-b.startTime)) {
    const visual = !audioOnly && (clip.type === 'video' || clip.type === 'image');
    const separateAudio = clip.type === 'video' && (clip.linkedClipId || body.clips.some((c: TimelineClip) => c.type === 'audio' && c.linkedClipId === clip.id));
    const audible = !still && (clip.type === 'audio' || (clip.type === 'video' && !separateAudio)) && clip.info.streams.some((s: any) => s.codec_type === 'audio');
    if (!visual && !audible) continue;
    const idx = input++;
    if (clip.type === 'image') args.push('-loop', '1', '-framerate', '25');
    else args.push('-ss', String(still?sourceTime(clip,frameTime):(clip.offset || 0)));
    // FFmpeg's native VP9 decoder discards WebM alpha. libvpx preserves it.
    if(visual && clip.info.streams.some((s:any)=>s.codec_name==='vp9' && String(s.tags?.alpha_mode ?? s.tags?.ALPHA_MODE)==='1'))args.push('-c:v','libvpx-vp9');
    args.push('-t', String(still?Math.max(.04,.04*clipRate(clip)):Math.min(clip.duration, duration - clip.startTime)*(clip.type==='image'?1:clipRate(clip))), '-i', clip.file);
    if (visual) {
      const lutFile=hasGrade(clip.colorGrade)?`grade-${idx}.cube`:undefined;
      if(lutFile)await fs.writeFile(path.join(temp,lutFile),gradeCube(clip.colorGrade!));
      const v = `v${idx}`, next = `layer${idx}`;
      const alpha = (clip.transparency ?? 100) / 100;
      const hasMask=clip.mask?.closed&&clip.mask.enabled!==false;
      filters.push(`[${idx}:v]${visualFilters(still?{...clip,startTime:frameTime,fadeIn:0,fadeOut:0,transparency:clipAlpha(clip,frameTime-clip.startTime)*100,animationOffset:frameTime-clip.startTime}:clip,width,height,false,lutFile)}[${hasMask?v+'raw':v}]`);
      if(hasMask){const mi=input++;await fs.writeFile(path.join(temp,`mask-${idx}.png`),maskPng(clip.mask!,width,height));args.push('-loop','1','-framerate','25','-t',String(still ? .04 : clip.duration),'-i',path.join(temp,`mask-${idx}.png`));filters.push(`[${v}raw]split[${v}color][${v}alpha];[${v}alpha]alphaextract[${v}old];[${mi}:v]format=gray,setpts=PTS+${still?frameTime:clip.startTime}/TB[${v}mask];[${v}old][${v}mask]blend=all_mode=multiply[${v}new];[${v}color][${v}new]alphamerge[${v}]`);}
      filters.push(`[${layer}][${v}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${clip.startTime})*lt(t,${clip.startTime + clip.duration})'[${next}]`); layer = next;
    }
    if (audible) {
      const a = `a${idx}`;
      const volume = clip.volumeDb <= -60 ? '0' : `${clip.volumeDb || 0}dB`;
      const fade = `${clip.fadeIn ? `,afade=t=in:d=${clip.fadeIn}` : ''}${clip.fadeOut ? `,afade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut)}:d=${clip.fadeOut}` : ''}`;
      filters.push(`[${idx}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${tempoFilters(clipRate(clip)).map(f=>f+',').join('')}volume=${volume}${fade},apad,atrim=duration=${Math.min(clip.duration,duration-clip.startTime)},adelay=${Math.round(clip.startTime * 1000)}:all=1[${a}]`);
      audioTags.push(`[${a}]`);audioTrackIds.set(`[${a}]`,clip.trackId);
    }
  }
  if (!audioOnly) {
    for (const [i, effect] of clips.filter(c => c.type === 'effect' && (still?frameTime>=c.startTime && frameTime<c.startTime+c.duration:c.startTime<duration)).entries()) {
      if(![...EFFECTS.map(e=>e.type),'dissolvenza'].includes(effect.effectType as any))throw new InputError('Effetto non supportato.');
      if(effect.intensity===0)continue;
      const next=`fx${i}`,original=`fxorig${i}`,work=`fxwork${i}`,processed=`fxprocessed${i}`;
      filters.push(`[${layer}]split[${original}][${work}]`);
      const elapsed=`(T-${effect.startTime})`, clock=`((${elapsed}*${clipRate(effect)}+${effect.offset||0})*${(effect.speed??5)/5})`;
      const fade=`max(0,min(1,min(${effect.fadeIn?`${elapsed}/${effect.fadeIn}`:'1'},${effect.fadeOut?`(${effect.startTime+effect.duration}-T)/${effect.fadeOut}`:'1'})))`;
      const moving=['camera_shake','zoom_in','zoom_out'].includes(effect.effectType!);
      const pulse=moving?'1':`(.9+.1*cos(${clock}*6.28318530718))`;
      const weight=effect.effectType==='dissolvenza'?`1-(${fade})*${(effect.intensity??5)/5}`:`(${fade})*${pulse}`;
      const chain=effect.effectType==='dissolvenza'?'colorchannelmixer=rr=0:gg=0:bb=0':visualFilters({...effect,effects:[effect.effectType as any],fadeIn:0,fadeOut:0},width,height,true);
      // Evaluate time envelopes on a tiny mask, then scale it. Evaluating the
      // same expression for every output pixel makes ordinary effects needlessly slow.
      const maskInput=input++;
      args.push('-f','lavfi','-i',`color=c=white:s=16x16:r=25:d=${still ? .04:duration}`);
      filters.push(`[${maskInput}:v]setpts=PTS+${frameTime}/TB,format=gray,geq=lum='255*max(0,min(1,${weight}))',scale=${width}:${height}[fxmask${i}]`);
      filters.push(`[${work}]${chain},format=rgb24[${processed}]`);
      filters.push(`[${processed}][fxmask${i}]alphamerge[fxalpha${i}]`);
      filters.push(`[${original}][fxalpha${i}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${effect.startTime})*lt(t,${effect.startTime+effect.duration})'[${next}]`);layer=next;
    }
  }
  // Mix clips into track buses before processing, so compressors respond to the whole track.
  const busTags:string[]=[];
  for(const trackId of new Set(audioTags.map(tag=>audioTrackIds.get(tag)!))){
    const tags=audioTags.filter(tag=>audioTrackIds.get(tag)===trackId);
    const chain=audioFilters(body.tracks?.find((t:Track)=>t.id===trackId)?.audio);
    const bus=`bus${busTags.length}`;filters.push(`${tags.join('')}amix=inputs=${tags.length}:normalize=0:dropout_transition=0${chain.length?','+chain.join(','):''}[${bus}]`);busTags.push(`[${bus}]`);
  }
  if (!still && busTags.length) {
    filters.push(`${busTags.join('')}amix=inputs=${busTags.length}:normalize=0:dropout_transition=0${audioFilters(body.audioMaster).length?','+audioFilters(body.audioMaster).join(','):''},alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=${duration}[audio]`);
  } else if(!still) {
    if (audioOnly) throw new InputError('Nessuna traccia audio attiva da esportare.');
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[audio]`);
  }
    if (!audioOnly) {
      const subtitles: SubtitleItem[] = body.clips.some((c:TimelineClip)=>c.type==='text')?timelineSubtitles(clips):body.subtitles || [];
      if (!Array.isArray(subtitles) || subtitles.length > 2000) throw new InputError('Sottotitoli non validi.');
      let font='';
      if(subtitles.length) {
        const candidates=[path.join(process.env.WINDIR || 'C:\\Windows','Fonts','arial.ttf'),'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf','/System/Library/Fonts/Supplemental/Arial.ttf'];
        for(const candidate of candidates) {try {await fs.copyFile(candidate,path.join(temp,'font.ttf'));font=":fontfile='font.ttf'";break;}catch{/* Try the next platform font. */}}
      }
      let monoFont=font;
      if(subtitles.some(s=>s.style==='karaoke')){for(const candidate of [path.join(process.env.WINDIR||'C:\\Windows','Fonts','consolab.ttf'),'/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf','/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf','/System/Library/Fonts/Menlo.ttc']){try{await fs.copyFile(candidate,path.join(temp,'mono.ttf'));monoFont=":fontfile='mono.ttf'";break;}catch{}}}
      for (const [i, sub] of subtitles.entries()) {
        if (typeof sub.text !== 'string' || sub.text.length > 10000) throw new InputError('Testo sottotitolo non valido.');
        const start = number(sub.startTime, 0, 0, 86400), end = number(sub.endTime, 0, start, 86400);
        const opacity=number(sub.transparency,100,0,100)/100,fadeIn=number(sub.fadeIn,0,0,600),fadeOut=number(sub.fadeOut,0,0,600),row=Math.floor(number(sub.row,0,0,99));
        const alpha=`${opacity}*max(0,min(1,min(${fadeIn?`(t-${start})/${fadeIn}`:'1'},${fadeOut?`(${end}-t)/${fadeOut}`:'1'})))`;
        try{validateWords(sub);}catch(error){throw new InputError((error as Error).message);}
        if(sub.style==='karaoke'&&sub.words?.length){
          const layout=karaokeLayout(sub,width,height);let current=layer;
          for(const [wi,word] of layout.words.entries()){
            const file=`kw${i}_${wi}.txt`;await fs.writeFile(path.join(temp,file),word.text);const tag=`kt${i}_${wi}`;filters.push(`[${current}]drawtext=textfile='${file}'${monoFont}:expansion=none:fontsize=${layout.font}:fontcolor=white:x=${word.x}:y=${word.y}:alpha='${alpha}':enable='gte(t,${start})*lt(t,${end})'[${tag}]`);current=tag;
            const startWord=Math.max(start,word.startTime),endWord=Math.min(end,word.endTime);if(endWord>startWord){const active=`ka${i}_${wi}`;filters.push(`[${current}]drawtext=textfile='${file}'${monoFont}:expansion=none:fontsize=${layout.font}:fontcolor=white:box=1:boxcolor=0x087f8c@0.95:boxborderw=4:x=${word.x}:y=${word.y}:alpha='${alpha}':enable='gte(t,${startWord})*lt(t,${endWord})'[${active}]`);current=active;}
          }layer=current;continue;
        }
        const textPath = path.join(temp, `${i}.txt`);
        await fs.writeFile(textPath, sub.text);
        const next = `sub${i}`;
        filters.push(`[${layer}]drawtext=textfile='${i}.txt'${font}:expansion=none:fontsize=${Math.round(height / 24)}:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8:x=(w-text_w)/2:y=h-text_h-30-${row*Math.round(height/24)*2}:alpha='${alpha}':enable='gte(t,${start})*lt(t,${end})'[${next}]`); layer = next;
      }
    }
    // Animated captions create many filters; keep them out of Windows' command-line limit.
    const filterScript=path.join(temp,'filters.ffscript');await fs.writeFile(filterScript,filters.join(';'));
    args.push('-filter_complex_script', filterScript);
    if(still) {
      const codec=({png:'png',jpg:'mjpeg',webp:'libwebp',bmp:'bmp',tiff:'tiff',gif:'gif'} as Record<string,string>)[format];
      args.push('-map',`[${layer}]`,'-frames:v','1','-fps_mode','passthrough','-c:v',codec!,'-threads','2','-an');
      if(format==='jpg')args.push('-q:v',String(Math.round(2+(100-weight)/100*25)));
      if(format==='webp')args.push('-quality',String(weight));
    }else{
      if (!audioOnly) args.push('-map', `[${layer}]`, '-c:v',format==='webm'?'libvpx-vp9':'libx264', ...(format==='webm'?['-b:v',`${videoKbps}k`]:['-preset','veryfast','-b:v',`${videoKbps}k`]),'-threads','2','-pix_fmt','yuv420p','-r','25');
      const audioCodec=({wav:'pcm_s16le',avi:'pcm_s16le',aiff:'pcm_s16be',mp3:'libmp3lame',flac:'flac',ogg:'libvorbis',opus:'libopus',webm:'libopus'} as Record<string,string>)[format] || 'aac';
      args.push('-map','[audio]','-c:a',audioCodec);
      if(!['pcm_s16le','pcm_s16be','flac'].includes(audioCodec))args.push('-b:a',`${audioCodec==='libopus'?Math.min(256,audioKbps):audioKbps}k`);
      if(['mp4','mov','m4v','m4a'].includes(format))args.push('-movflags','+faststart');
      if(format==='m4v')args.push('-f','mp4');
      args.push('-t',String(duration));
    }
    args.push(output);
    await fs.mkdir(downloadsDir, { recursive: true });
    await run('ffmpeg', args, 300_000, temp);
    const info = await probe(output);
    if (!info.streams.some((s: any) => s.codec_type === (audioOnly ? 'audio' : 'video'))) throw new Error('Export privo del flusso richiesto.');
    const stats = await fs.stat(output);
    return { success: true, fileName, downloadUrl: `/api/download/${fileName}`, actualSizeBytes: stats.size, durationSec: duration, format, resolution };
  } catch (error) { await fs.rm(output, { force: true }); throw error; }
  finally { await fs.rm(temp, { recursive: true, force: true }); }
}
