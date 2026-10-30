import type { TimelineClip, SubtitleItem, Track } from '../types/editor';
import {categoryOf,type ExportFormat} from './exportFormats';
export type {ExportFormat} from './exportFormats';
export interface ExportSettings {
  audioMaster?:import('./audioMixer').AudioSettings;
  format: ExportFormat;
  resolution: '4K' | '1080p' | '720p';
  weightPercentage: number;
  durationSec: number;
  aspectRatio?: string;
  frameTime?: number;
}
export interface ExportProgress { percentage: number; currentFrame: number; totalFrames: number; statusText: string }
export function estimateExportFileSizeMB(format: ExportFormat, durationSec: number, weightPercentage: number, resolution: ExportSettings['resolution']) {
  const audioKbps = ['wav','avi','aiff'].includes(format) ? 1536 : Math.round(64 + weightPercentage / 100 * 256);
  const audioOnly = categoryOf(format)==='audio';
  const videoKbps = (1500 + weightPercentage / 100 * 20500) * (resolution === '4K' ? 2.5 : resolution === '720p' ? .6 : 1);
  return { estimatedMB: Math.round((audioOnly ? audioKbps : videoKbps + audioKbps) * 1000 * durationSec / 8 / 1048576 * 10) / 10,
    bitrateFormatted: audioOnly ? `${audioKbps} kbps` : `${(videoKbps / 1000).toFixed(1)} Mbps`,
    qualityLabel: ['wav','aiff'].includes(format) ? 'PCM 16-bit / 48 kHz stereo' : ['png','bmp','tiff','flac'].includes(format)?'Senza perdita':weightPercentage < 30 ? 'Compatto' : weightPercentage > 75 ? 'Alta qualità' : 'Bilanciato' };
}
export async function executeProjectExport(settings: ExportSettings, clips: TimelineClip[], subtitles: SubtitleItem[], _previewCanvas: HTMLCanvasElement, onProgress: (p: ExportProgress) => void, tracks: Track[] = []) {
  if (!clips.some(c => c.type !== 'effect')) throw new Error('Aggiungi un media alla timeline prima di esportare.');
  const progress = (percentage: number, statusText: string) => onProgress({ percentage, statusText, currentFrame: 0, totalFrames: 0 });
  progress(5, 'Verifica e caricamento dei media…');
  // Compatibility with old projects: upload live blob URLs once, and fail explicitly for expired ones.
  const uploads = new Map<string, Promise<string>>();
  const serverClips = await Promise.all(clips.map(async clip => {
    if (!clip.mediaUrl?.startsWith('blob:')) return clip;
    if (!uploads.has(clip.mediaUrl)) uploads.set(clip.mediaUrl, (async () => {
      const source = await fetch(clip.mediaUrl!);
      if (!source.ok) throw new Error(`Media non disponibile: ${clip.name}`);
      const response = await fetch('/api/upload-media', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(clip.name.replace(/ \[Audio\]$/, '')) }, body: await source.blob() });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || `Caricamento fallito: ${clip.name}`);
      return result.url;
    })());
    return { ...clip, mediaUrl: await uploads.get(clip.mediaUrl) };
  }));
  progress(20, 'Codifica FFmpeg in corso…');
  const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, clips: serverClips, subtitles, tracks }) });
  const result = await response.json();
  if (!response.ok || !result.success || !result.downloadUrl) throw new Error(result.error || 'Esportazione fallita.');
  progress(90, 'Caricamento del file esportato…');
  const file = await fetch(result.downloadUrl);
  if (!file.ok) throw new Error('File esportato non disponibile.');
  const blob = await file.blob();
  if (!blob.size) throw new Error('Il file esportato è vuoto.');
  progress(100, 'Esportazione completata.');
  return { blob, fileName: result.fileName, actualSizeBytes: blob.size, downloadUrl: result.downloadUrl };
}
