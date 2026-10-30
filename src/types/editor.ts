import type { VisualEffect, Adjustments } from '../services/visualSettings';
export type TrackType = 'effect' | 'video' | 'audio' | 'image' | 'text';

export interface TimelineMarker {
  id: string;
  time: number; // in seconds
  name: string;
  description: string;
  color: string;
}

export interface TimelineClip {
  id: string;
  name: string;
  trackId: string;
  type: TrackType;
  startTime: number; // in seconds
  duration: number; // in seconds
  offset: number; // in seconds
  color: string;
  // Specific handles
  transparency: number; // 0 to 100 (%) for video & images
  volumeDb: number; // -60 to +12 dB for audio
  fadeIn: number; // in seconds for effects
  fadeOut: number; // in seconds for effects
  effectType?: 'camera_shake' | 'glow' | 'blur' | 'glitch' | 'vintage' | 'cinematic' | 'dissolvenza' | 'zoom_in' | 'zoom_out' | 'monochrome';
  effects?: VisualEffect[];
  intensity?: number; // effect controls: 0..10, default 5
  speed?: number;
  speedLevel?: number; // -5..+5 playback step; independent of effect animation speed
  effectSpan?: number; // original animation duration, retained through cuts
  animationOffset?: number; // internal still-frame animation clock
  text?: string;
  captionId?: string;
  adjustments?: Adjustments;
  colorGrade?: import('../services/colorGrade').ColorGrade;
  mediaUrl?: string;
  mediaThumbnail?: string;
  subtitles?: string;
  linkedClipId?: string; // ID della clip video o audio agganciata
  isLinked?: boolean;    // true se video e audio sono uniti e si muovono insieme sulla timeline
  assetId?: string;     // ID del file corrispondente nello stage
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  isSolo: boolean;
  isMuted: boolean;
  headerBg: string;
  laneBg: string;
  audio?: import('../services/audioMixer').AudioSettings;
  height?: number; // preferred row height before fitting the timeline viewport
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration: string;
  durationSec: number;
  thumbnailUrl?: string;
  fileUrl?: string;
  hasAudio?: boolean;
  width?: number;
  audio?: import('../services/audioMixer').AudioSettings;
  height?: number;
  isLost?: boolean;
  downloadProgress?: number; // 0 to 100 (%)
  isDownloading?: boolean;
  sourceUrl?: string;
}

export interface SubtitleItem {
  row?:number;
  transparency?:number;
  fadeIn?:number;
  fadeOut?:number;
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
}

export interface ClaudePromptMessage {
  id: string;
  role: 'user' | 'claude' | 'system';
  content: string;
  timestamp: string;
  actionExecuted?: string;
  actionPayload?: Record<string, any>;
  status?: 'success' | 'info' | 'error';
}

export interface EditorState {
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  zoom: number; // pixels per second
  claudeConnected: boolean;
  spokenLanguage: string;
  bilingualCaptions: boolean;
  deleteCurrentCaptions: boolean;
  subtitles: SubtitleItem[];
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  isMutedMaster: boolean;
  masterVolume: number;
}
