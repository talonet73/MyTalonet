import {clipRate} from './clipSpeed';
import type { TimelineClip, Track, SubtitleItem, MediaAsset } from '../types/editor';
export interface TimelineState {
  audioMaster?: import('./audioMixer').AudioSettings;
  clips: TimelineClip[];
  tracks: Track[];
  subtitles: SubtitleItem[];
  mediaAssets: MediaAsset[];
  currentTime: number;
  selectedClipId: string | null;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
}
export const timelineTools = [
  { name: 'get_timeline_state', description: 'Legge la timeline reale e i media importati.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'cut_clip_at_time', description: 'Divide una clip e il relativo audio collegato al tempo indicato.', inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, timeSeconds: { type: 'number', minimum: 0 } }, required: ['timeSeconds'] } },
  { name: 'set_video_transparency', description: 'Imposta opacità video/immagine da 0 a 100%.', inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, transparencyPercent: { type: 'number', minimum: 0, maximum: 100 } }, required: ['transparencyPercent'] } },
  { name: 'set_audio_volume', description: 'Imposta volume audio/video in decibel.', inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, volumeDb: { type: 'number', minimum: -60, maximum: 12 } }, required: ['volumeDb'] } },
  { name: 'set_effect_dissolvenza', description: 'Imposta durata dissolvenze dell’effetto.', inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, fadeIn: { type: 'number', minimum: 0 }, fadeOut: { type: 'number', minimum: 0 } } } },
  { name: 'seek_time', description: 'Sposta il cursore della timeline.', inputSchema: { type: 'object', properties: { timeSeconds: { type: 'number', minimum: 0 } }, required: ['timeSeconds'] } },
  { name: 'delete_clip', description: 'Rimuove una clip e il relativo audio collegato, lasciando i file nello stage.', inputSchema: { type: 'object', properties: { clipId: { type: 'string' } } }, annotations: { destructiveHint: true } },
  { name: 'add_clip', description: 'Inserisce un media dello stage nella timeline.', inputSchema: { type: 'object', properties: { assetId: { type: 'string' }, trackId: { type: 'string' }, timeSeconds: { type: 'number', minimum: 0 } }, required: ['assetId', 'trackId', 'timeSeconds'] } },
];
function numeric(value: unknown, min: number, max = 86400): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Numero richiesto tra ${min} e ${max}.`);
  return value;
}
const uid = () => globalThis.crypto.randomUUID();
export function applyTimelineTool(state: TimelineState, name: string, args: Record<string, any>): TimelineState {
  if (name === 'get_timeline_state') return state;
  if (name === 'seek_time') return { ...state, currentTime: numeric(args.timeSeconds, 0) };
  if (name === 'add_clip') {
    const asset = state.mediaAssets.find(a => a.id === args.assetId);
    const track = state.tracks.find(t => t.id === args.trackId);
    if (!asset?.fileUrl || !track || track.type !== asset.type) throw new Error('Ogni file va nella propria traccia: immagini in IMMAGINI, video in VIDEO, audio in AUDIO.');
    const id = uid(), startTime = numeric(args.timeSeconds, 0);
    const clip: TimelineClip = { id, assetId: asset.id, trackId: track.id, name: asset.name, type: asset.type, mediaUrl: asset.fileUrl, mediaThumbnail: asset.thumbnailUrl, startTime, duration: asset.durationSec, offset: 0, transparency: 100, volumeDb: 0, fadeIn: 0, fadeOut: 0, color: asset.type === 'video' ? '#2563eb' : asset.type === 'audio' ? '#10b981' : '#eab308' };
    const audioTrack = state.tracks.find(t => t.type === 'audio');
    if (asset.type === 'video' && asset.hasAudio !== false && audioTrack) {
      const audioId = uid();
      const audio: TimelineClip = { ...clip, id: audioId, trackId: audioTrack.id, type: 'audio', name: `${asset.name} [Audio]`, color: '#10b981', linkedClipId: id, isLinked: true };
      clip.linkedClipId = audioId; clip.isLinked = true;
      return { ...state, clips: [...state.clips, clip, audio], selectedClipId: id };
    }
    return { ...state, clips: [...state.clips, clip], selectedClipId: id };
  }
  if (!timelineTools.some(t => t.name === name)) throw new Error(`Strumento sconosciuto: ${name}`);
  const target = state.clips.find(c => c.id === (args.clipId || state.selectedClipId));
  if (!target) throw new Error('Seleziona una clip o specifica clipId.');
  const linked = target.isLinked === false ? undefined : state.clips.find(c => c.id === target.linkedClipId && c.linkedClipId === target.id && c.isLinked !== false);
  if (name === 'delete_clip') return { ...state, clips: state.clips.filter(c => c.id !== target.id && c.id !== linked?.id), selectedClipId: null };
  if (name === 'cut_clip_at_time') {
    const time = numeric(args.timeSeconds, 0);
    const targets = linked ? [target, linked] : [target];
    if (targets.some(c => time <= c.startTime || time >= c.startTime + c.duration)) throw new Error('Il taglio deve cadere all’interno della clip e dell’audio collegato.');
    const ids = new Map(targets.map(c => [c.id, uid()]));
    const left = state.clips.map(c => ids.has(c.id) ? { ...c, duration: time - c.startTime } : c);
    const right = targets.map(c => ({ ...c, id: ids.get(c.id)!, startTime: time, duration: c.duration - (time - c.startTime), offset: (c.offset || 0) + (time - c.startTime)*clipRate(c), linkedClipId: linked ? ids.get(c.linkedClipId!) : undefined, isLinked: Boolean(linked) }));
    return { ...state, clips: [...left, ...right], selectedClipId: ids.get(target.id)!, currentTime: time };
  }
  let updates: Partial<TimelineClip>;
  if (name === 'set_video_transparency') {
    if (!['video', 'image'].includes(target.type)) throw new Error('Seleziona un video o un’immagine.');
    updates = { transparency: numeric(args.transparencyPercent, 0, 100) };
  } else if (name === 'set_audio_volume') {
    if (!['audio', 'video'].includes(target.type)) throw new Error('Seleziona una clip audio o video.');
    updates = { volumeDb: numeric(args.volumeDb, -60, 12) };
  } else {
    if (target.type !== 'effect') throw new Error('Seleziona una clip effetto.');
    updates = {};
    if (args.fadeIn !== undefined) updates.fadeIn = numeric(args.fadeIn, 0, target.duration);
    if (args.fadeOut !== undefined) updates.fadeOut = numeric(args.fadeOut, 0, target.duration);
  }
  const updateId = name === 'set_audio_volume' && target.type === 'video' && linked ? linked.id : target.id;
  return { ...state, clips: state.clips.map(c => c.id === updateId ? { ...c, ...updates } : c) };
}
