import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { TimelineClip, Track, SubtitleItem } from '../src/types/editor';

const runFile = promisify(execFile);
export const downloadsDir = path.resolve(process.env.MEDIA_DIR || 'media_downloads');
export class InputError extends Error {}
export async function run(command: string, args: string[], timeout = 300_000) {
  return runFile(command, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
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
export async function exportMedia(body: any) {
  const { format = 'mp4', resolution = '1080p', aspectRatio = '16:9' } = body;
  if (!['mp4', 'mov', 'avi', 'mp3', 'wav'].includes(format)) throw new InputError('Formato non supportato.');
  if (!['720p', '1080p', '4K'].includes(resolution) || !['16:9', '9:16', '1:1', '4:3'].includes(aspectRatio)) throw new InputError('Risoluzione o proporzioni non valide.');
  const duration = number(body.durationSec, 15, 0.04, 600);
  const weight = number(body.weightPercentage, 55, 1, 100);
  if (!Array.isArray(body.clips) || body.clips.length > 200 || !body.clips.length) throw new InputError('Aggiungi almeno una clip alla timeline (massimo 200).');
  if (body.tracks !== undefined && !Array.isArray(body.tracks)) throw new InputError('Tracce non valide.');
  const clips = activeClips(body.clips, body.tracks);
  for (const clip of clips) {
    number(clip.startTime, 0, 0, 86400); number(clip.duration, 0, 0.001, 86400); number(clip.offset, 0, 0, 86400);
    number(clip.volumeDb, 0, -60, 12); number(clip.transparency, 100, 0, 100);
    number(clip.fadeIn, 0, 0, 600); number(clip.fadeOut, 0, 0, 600);
    if (!['video', 'audio', 'image', 'effect'].includes(clip.type)) throw new InputError('Tipo di clip non valido.');
  }
  const audioOnly = ['wav', 'mp3'].includes(format);
  const media = clips.filter(c => c.type !== 'effect' && c.startTime < duration);
  if (!media.length) throw new InputError('Nessun media attivo da esportare.');
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
    if (clip.type !== 'image' && Number.isFinite(sourceDuration) && clip.offset >= sourceDuration) throw new InputError(`Taglio oltre la durata del media: ${clip.name}`);
    return { ...clip, file, info };
  }));
  let width = resolution === '4K' ? 3840 : resolution === '720p' ? 1280 : 1920;
  let height = resolution === '4K' ? 2160 : resolution === '720p' ? 720 : 1080;
  if (aspectRatio === '9:16') [width, height] = [height, width];
  if (aspectRatio === '1:1') width = height;
  if (aspectRatio === '4:3') width = Math.round(height * 4 / 3 / 2) * 2;
  const videoKbps = Math.round((1500 + weight / 100 * 20500) * (resolution === '4K' ? 2.5 : resolution === '720p' ? .6 : 1));
  const audioKbps = Math.round(64 + weight / 100 * 256);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-filter_complex_threads', '2'];
  const filters: string[] = [];
  let input = 0;
  let layer = 'base';
  if (!audioOnly) {
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=25:d=${duration}`);
    filters.push('[0:v]setpts=PTS-STARTPTS[base]'); input++;
  }
  const audioTags: string[] = [];
  for (const clip of resolved) {
    const visual = !audioOnly && (clip.type === 'video' || clip.type === 'image');
    const separateAudio = clip.type === 'video' && (clip.linkedClipId || body.clips.some((c: TimelineClip) => c.type === 'audio' && c.linkedClipId === clip.id));
    const audible = (clip.type === 'audio' || (clip.type === 'video' && !separateAudio)) && clip.info.streams.some((s: any) => s.codec_type === 'audio');
    if (!visual && !audible) continue;
    const idx = input++;
    if (clip.type === 'image') args.push('-loop', '1', '-framerate', '25');
    else args.push('-ss', String(clip.offset || 0));
    args.push('-t', String(Math.min(clip.duration, duration - clip.startTime)), '-i', clip.file);
    if (visual) {
      const v = `v${idx}`, next = `layer${idx}`;
      const alpha = (clip.transparency ?? 100) / 100;
      filters.push(`[${idx}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,format=rgba,colorchannelmixer=aa=${alpha},setpts=PTS+${clip.startTime}/TB[${v}]`);
      filters.push(`[${layer}][${v}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${clip.startTime})*lt(t,${clip.startTime + clip.duration})'[${next}]`); layer = next;
    }
    if (audible) {
      const a = `a${idx}`;
      const volume = clip.volumeDb <= -60 ? '0' : `${clip.volumeDb || 0}dB`;
      const fade = `${clip.fadeIn ? `,afade=t=in:d=${clip.fadeIn}` : ''}${clip.fadeOut ? `,afade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut)}:d=${clip.fadeOut}` : ''}`;
      filters.push(`[${idx}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume}${fade},adelay=${Math.round(clip.startTime * 1000)}:all=1[${a}]`);
      audioTags.push(`[${a}]`);
    }
  }
  if (!audioOnly) {
    for (const [i, effect] of clips.filter(c => c.type === 'effect').entries()) {
      const next = `fx${i}`, enable = `enable='gte(t,${effect.startTime})*lt(t,${effect.startTime + effect.duration})'`;
      const intensity = `max(0,min(1,min((t-${effect.startTime})/${Math.max(.04, effect.fadeIn)},(${effect.startTime + effect.duration}-t)/${Math.max(.04, effect.fadeOut)})))`;
      let filter: string;
      switch (effect.effectType) {
        case 'blur': filter = `boxblur=8:1:${enable}`; break;
        case 'glow': filter = `eq=brightness=0.08:saturation=1.2:${enable}`; break;
        case 'vintage': filter = `eq=saturation=0.4:contrast=1.1:${enable}`; break;
        case 'cinematic': filter = `eq=contrast=1.15:saturation=0.8:${enable}`; break;
        case 'glitch': filter = `rgbashift=rh=6:bh=-6:${enable}`; break;
        case 'camera_shake': filter = `crop=w=iw-24:h=ih-24:x='12+10*sin(t*23)*(${intensity})':y='12+10*cos(t*19)*(${intensity})',scale=${width}:${height}`; break;
        case 'dissolvenza': filter = `fade=t=in:st=${effect.startTime}:d=${Math.max(.04, effect.fadeIn)},fade=t=out:st=${Math.max(effect.startTime, effect.startTime + effect.duration - effect.fadeOut)}:d=${Math.max(.04, effect.fadeOut)}`; break;
        default: throw new InputError('Effetto non supportato.');
      }
      filters.push(`[${layer}]${filter}[${next}]`); layer = next;
    }
  }
  if (audioTags.length) {
    filters.push(`${audioTags.join('')}amix=inputs=${audioTags.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=${duration}[audio]`);
  } else {
    if (audioOnly) throw new InputError('Nessuna traccia audio attiva da esportare.');
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[audio]`);
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'taledit-export-'));
  const fileName = `TALEDIT_Export_${resolution}_${randomUUID()}.${format}`;
  const output = path.join(downloadsDir, fileName);
  try {
    if (!audioOnly) {
      const subtitles: SubtitleItem[] = body.subtitles || [];
      if (!Array.isArray(subtitles) || subtitles.length > 1000) throw new InputError('Sottotitoli non validi.');
      for (const [i, sub] of subtitles.entries()) {
        if (typeof sub.text !== 'string' || sub.text.length > 10000) throw new InputError('Testo sottotitolo non valido.');
        const start = number(sub.startTime, 0, 0, 86400), end = number(sub.endTime, 0, start, 86400);
        const textPath = path.join(temp, `${i}.txt`);
        await fs.writeFile(textPath, sub.text);
        const next = `sub${i}`;
        filters.push(`[${layer}]drawtext=textfile='${textPath}':expansion=none:fontsize=${Math.round(height / 24)}:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8:x=(w-text_w)/2:y=h-text_h-30:enable='gte(t,${start})*lt(t,${end})'[${next}]`); layer = next;
      }
    }
    args.push('-filter_complex', filters.join(';'));
    if (!audioOnly) args.push('-map', `[${layer}]`, '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', '25', '-b:v', `${videoKbps}k`);
    args.push('-map', '[audio]', '-c:a', ['wav','avi'].includes(format) ? 'pcm_s16le' : format === 'mp3' ? 'libmp3lame' : 'aac');
    if (!['wav','avi'].includes(format)) args.push('-b:a', `${audioKbps}k`);
    if (['mp4','mov'].includes(format)) args.push('-movflags', '+faststart');
    args.push('-t', String(duration), output);
    await fs.mkdir(downloadsDir, { recursive: true });
    await run('ffmpeg', args);
    const info = await probe(output);
    if (!info.streams.some((s: any) => s.codec_type === (audioOnly ? 'audio' : 'video'))) throw new Error('Export privo del flusso richiesto.');
    const stats = await fs.stat(output);
    return { success: true, fileName, downloadUrl: `/api/download/${fileName}`, actualSizeBytes: stats.size, durationSec: duration, format, resolution };
  } catch (error) { await fs.rm(output, { force: true }); throw error; }
  finally { await fs.rm(temp, { recursive: true, force: true }); }
}
