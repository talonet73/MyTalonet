/**
 * TALEDIT - Video Editor con Claude DT MCP Integration
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TopNav } from './components/TopNav';
import { MediaLibraryPanel, initialMediaAssets } from './components/MediaLibraryPanel';
import { CaptionsPanel } from './components/CaptionsPanel';
import { PlayerPanel } from './components/PlayerPanel';
import { DetailsPanel } from './components/DetailsPanel';
import { Timeline } from './components/Timeline';
import { ClaudeMCPDialog } from './components/ClaudeMCPDialog';
import { ExportModal } from './components/ExportModal';
import {
  TimelineClip,
  Track,
  SubtitleItem,
  ClaudePromptMessage,
  MediaAsset,
  TimelineMarker,
  TrackType,
} from './types/editor';
import { executeClaudePrompt, formatTimecode } from './services/mcpEngine';

const INITIAL_TRACKS: Track[] = [
  {
    id: 'track_effects',
    name: 'EFFECTS',
    type: 'effect',
    isSolo: false,
    isMuted: false,
    headerBg: '#35121b',
    laneBg: '#1e141a',
  },
  {
    id: 'track_video_1',
    name: 'VIDEO 01',
    type: 'video',
    isSolo: false,
    isMuted: false,
    headerBg: '#0f2942',
    laneBg: '#111d2e',
  },
  {
    id: 'track_video_2',
    name: 'VIDEO 02',
    type: 'video',
    isSolo: false,
    isMuted: false,
    headerBg: '#0f2942',
    laneBg: '#111d2e',
  },
  {
    id: 'track_audio_1',
    name: 'AUDIO 01',
    type: 'audio',
    isSolo: false,
    isMuted: false,
    headerBg: '#0d3324',
    laneBg: '#10251e',
  },
  {
    id: 'track_image_1',
    name: 'AUDIO 02 (Immagini)',
    type: 'audio',
    isSolo: false,
    isMuted: false,
    headerBg: '#0d3324',
    laneBg: '#10251e',
  },
];

const INITIAL_CLIPS: TimelineClip[] = [
  {
    id: 'clip_effect_1',
    name: 'Camera Handed',
    trackId: 'track_effects',
    type: 'effect',
    startTime: 4,
    duration: 8,
    offset: 0,
    color: '#cb5c5b',
    transparency: 100,
    volumeDb: 0,
    fadeIn: 1.5,
    fadeOut: 1.5,
    effectType: 'camera_shake',
  },
  {
    id: 'clip_video_1',
    name: 'Intro01.mp4',
    trackId: 'track_video_1',
    type: 'video',
    startTime: 0,
    duration: 14,
    offset: 0,
    color: '#2563eb',
    transparency: 100,
    volumeDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    linkedClipId: 'clip_audio_1',
    isLinked: true,
    assetId: 'stage_video_1',
    mediaUrl: '/media_downloads/yt_1792223085761_ebms.mp4',
  },
  {
    id: 'clip_audio_1',
    name: 'Intro01.mp4 [Audio]',
    trackId: 'track_audio_1',
    type: 'audio',
    startTime: 0,
    duration: 14,
    offset: 0,
    color: '#10b981',
    transparency: 100,
    volumeDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    linkedClipId: 'clip_video_1',
    isLinked: true,
    assetId: 'stage_video_1',
    mediaUrl: '/media_downloads/yt_1792223085761_ebms.mp4',
  },
  {
    id: 'clip_image_1',
    name: 'Overlay_Grafica.png',
    trackId: 'track_image_1',
    type: 'image',
    startTime: 12,
    duration: 9,
    offset: 0,
    color: '#eab308',
    transparency: 100,
    volumeDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    assetId: 'stage_image_1',
  },
];

const INITIAL_SUBTITLES: SubtitleItem[] = [
  {
    id: 'sub_1',
    startTime: 7.0,
    endTime: 12.0,
    text: "Intro01: Benvenuti nel video montato con TALEDIT.",
    translation: "Welcome to the video edited with TALEDIT.",
  },
  {
    id: 'sub_2',
    startTime: 12.5,
    endTime: 18.0,
    text: "Integrazione attiva tramite Model Context Protocol (MCP).",
    translation: "Active integration via Model Context Protocol (MCP).",
  },
];

export default function App() {
  // Timeline State
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_CLIPS);
  const [currentTime, setCurrentTime] = useState<number>(18.0); // 00:18 playhead matching screenshot
  const [totalDuration, setTotalDuration] = useState<number>(273); // 00:04:33:00 matching screenshot
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip_video_1');
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(['clip_video_1']);
  const [zoom, setZoom] = useState<number>(24);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('16:9');
  const [isMutedMaster, setIsMutedMaster] = useState<boolean>(false);

  // Captions State
  const [spokenLanguage, setSpokenLanguage] = useState<string>('Italian');
  const [bilingualCaptions, setBilingualCaptions] = useState<boolean>(false);
  const [deleteCurrentCaptions, setDeleteCurrentCaptions] = useState<boolean>(false);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(INITIAL_SUBTITLES);

  // Tabs & Toolbars
  const [activeTab, setActiveTab] = useState<string>('Effects');
  const [isMicActive, setIsMicActive] = useState<boolean>(false);

  // Claude DT MCP Integration State
  // User manually decides when to turn ON or OFF as explicitly requested!
  const [claudeConnected, setClaudeConnected] = useState<boolean>(false);
  const [isClaudeDialogOpen, setIsClaudeDialogOpen] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [trackConstraintWarning, setTrackConstraintWarning] = useState<string | null>(null);

  // Markers State
  const [markers, setMarkers] = useState<TimelineMarker[]>([
    {
      id: 'marker_1',
      time: 7.0,
      name: 'Inizio Intro',
      description: 'Punto di avvio del video Intro01 e musica di sottofondo',
      color: '#f59e0b',
    },
    {
      id: 'marker_2',
      time: 18.0,
      name: 'Transizione FX',
      description: 'Dissolvenza effetto Camera Handed e stacco verso seconda inquadratura',
      color: '#ef4444',
    },
  ]);

  // Media Library Assets State
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(initialMediaAssets);

  // Resizable Panels Dimensions (User request #1)
  const [mediaWidth, setMediaWidth] = useState<number>(290);
  const [captionsWidth, setCaptionsWidth] = useState<number>(270);
  const [detailsWidth, setDetailsWidth] = useState<number>(240);
  const [timelineHeight, setTimelineHeight] = useState<number>(260);

  // Panel Resizing Drag state
  const [resizingDivider, setResizingDivider] = useState<{
    type: 'media' | 'captions' | 'details' | 'timeline';
    startX: number;
    startY: number;
    startDim: number;
  } | null>(null);

  // Hidden file input ref for opening .tal projects
  const talFileInputRef = useRef<HTMLInputElement>(null);
  // Hidden file input ref for importing media (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg) into stage
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard & 10-step Undo History (Request #1)
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);
  const clipsRef = useRef<TimelineClip[]>(clips);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const historyRef = useRef<TimelineClip[][]>([INITIAL_CLIPS]);
  const historyIndexRef = useRef<number>(0);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [claudeMessages, setClaudeMessages] = useState<ClaudePromptMessage[]>([
    {
      id: 'init_msg_1',
      role: 'claude',
      content:
        'Benvenuto in TALEDIT con Claude DT MCP! Sono pronto a manipolare la timeline direttamente dai tuoi prompt. Puoi accendere o spegnere il collegamento in qualsiasi momento dal pulsante in alto. Prova a digitare: "Taglia a 00:15", "Imposta trasparenza al 70%" o "Alza volume a +3dB".',
      timestamp: 'Adesso',
    },
  ]);

  // Push new move to history (maintains up to 10 moves)
  const pushHistory = useCallback((newClips: TimelineClip[]) => {
    const currentIdx = historyIndexRef.current;
    const sliced = historyRef.current.slice(0, currentIdx + 1);

    // Skip duplicate states
    const last = sliced[sliced.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(newClips)) {
      return;
    }

    let next = [...sliced, newClips];
    // Keep up to 10 moves backward (11 snapshots total)
    if (next.length > 11) {
      next = next.slice(next.length - 11);
    }

    historyRef.current = next;
    const newIdx = next.length - 1;
    historyIndexRef.current = newIdx;
    setHistoryCount(newIdx);
  }, []);

  // Undo (Ctrl+Z): goes back 1 move, up to 10 moves
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const prevIdx = historyIndexRef.current - 1;
      historyIndexRef.current = prevIdx;
      setHistoryCount(prevIdx);
      const targetClips = historyRef.current[prevIdx];
      if (targetClips) {
        setClips(targetClips);
        clipsRef.current = targetClips;
        setToastMessage(`↩ Annulla (Ctrl+Z): tornato indietro di 1 mossa (${prevIdx}/10 mosse disponibili)`);
        setTimeout(() => setToastMessage(null), 2500);
      }
    } else {
      setToastMessage('Nessuna mossa precedente da annullare (limite 10 mosse)');
      setTimeout(() => setToastMessage(null), 2000);
    }
  }, []);

  // Redo (Ctrl+Y or Ctrl+Shift+Z)
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const nextIdx = historyIndexRef.current + 1;
      historyIndexRef.current = nextIdx;
      setHistoryCount(nextIdx);
      const targetClips = historyRef.current[nextIdx];
      if (targetClips) {
        setClips(targetClips);
        clipsRef.current = targetClips;
        setToastMessage(`↪ Ripristina (Ctrl+Y): avanti di 1 mossa`);
        setTimeout(() => setToastMessage(null), 2500);
      }
    }
  }, []);

  // Commit history when timeline interaction completes
  const handleCommitHistory = useCallback(() => {
    pushHistory(clipsRef.current);
  }, [pushHistory]);

  // Playhead playback timer
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (isPlaying) {
        const delta = (now - lastTime) / 1000;
        setCurrentTime(t => {
          const next = t + delta;
          if (next >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return next;
        });
      }
      lastTime = now;
      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, totalDuration]);

  // Resizing divider mouse listener (User request #1)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingDivider) return;
      if (resizingDivider.type === 'media') {
        const delta = e.clientX - resizingDivider.startX;
        setMediaWidth(Math.max(180, Math.min(600, resizingDivider.startDim + delta)));
      } else if (resizingDivider.type === 'captions') {
        const delta = e.clientX - resizingDivider.startX;
        setCaptionsWidth(Math.max(180, Math.min(500, resizingDivider.startDim + delta)));
      } else if (resizingDivider.type === 'details') {
        const delta = resizingDivider.startX - e.clientX;
        setDetailsWidth(Math.max(180, Math.min(450, resizingDivider.startDim + delta)));
      } else if (resizingDivider.type === 'timeline') {
        const delta = resizingDivider.startY - e.clientY;
        setTimelineHeight(Math.max(160, Math.min(550, resizingDivider.startDim + delta)));
      }
    };

    const handleMouseUp = () => setResizingDivider(null);

    if (resizingDivider) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingDivider]);

  // Duplicate Clip (CTRL+D)
  const handleDuplicateClip = () => {
    if (!selectedClipId) return;
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const newClip: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}`,
      name: `${clip.name} (Duplicato)`,
      startTime: Math.round((clip.startTime + clip.duration) * 10) / 10,
    };
    const updated = [...clips, newClip];
    setClips(updated);
    pushHistory(updated);
    setSelectedClipId(newClip.id);
  };

  // Save TAL Project (CTRL+S)
  const handleSaveTalProject = () => {
    const projectData = {
      appName: 'TALEDIT',
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      tracks,
      clips,
      markers,
      subtitles,
      spokenLanguage,
      bilingualCaptions,
      currentTime,
      aspectRatio,
      mediaAssets,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Progetto_TALEDIT_${Date.now()}.tal`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load TAL Project
  const handleLoadTalProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const content = evt.target?.result as string;
        const data = JSON.parse(content);
        if (data.tracks) setTracks(data.tracks);
        if (data.clips) {
          setClips(data.clips);
          pushHistory(data.clips);
        }
        if (data.markers) setMarkers(data.markers);
        if (data.subtitles) setSubtitles(data.subtitles);
        if (data.spokenLanguage) setSpokenLanguage(data.spokenLanguage);
        if (data.currentTime !== undefined) setCurrentTime(data.currentTime);
        if (data.mediaAssets) setMediaAssets(data.mediaAssets);
      } catch (err) {
        console.error('Error loading .tal project:', err);
      }
    };
    reader.readAsText(file);
  };

  // Import Media Files into Stage (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg)
  const handleMediaFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowedExtensions = ['.mp4', '.mov', '.avi', '.mp3', '.wav', '.png', '.jpg', '.jpeg'];

    Array.from(files).forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        const sysErr: ClaudePromptMessage = {
          id: `sys_err_${Date.now()}`,
          role: 'system',
          content: `⚠️ Formato "${ext}" non consentito. Il tasto Import accetta solo file multimediali (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg). I progetti .tal e .json vanno aperti con il tasto "Apri".`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'error',
        };
        setClaudeMessages(prev => [...prev, sysErr]);
        return;
      }

      const type: 'video' | 'audio' | 'image' =
        file.type.startsWith('video') || ['.mp4', '.mov', '.avi'].includes(ext)
          ? 'video'
          : file.type.startsWith('audio') || ['.mp3', '.wav'].includes(ext)
          ? 'audio'
          : 'image';

      const sysMsg: ClaudePromptMessage = {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: `File "${file.name}" importato con successo nello STAGE. Puoi trascinarlo o fare doppio clic per inserirlo nella timeline.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'success',
      };
      setClaudeMessages(prev => [...prev, sysMsg]);
    });

    e.target.value = '';
  };

  // Delete Track and its clips
  const handleDeleteTrack = (trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setClips(prev => {
      const next = prev.filter(c => c.trackId !== trackId);
      pushHistory(next);
      return next;
    });
  };


  // Helper: verifica restrizioni rigide su quale traccia può ospitare ciascun tipo di media
  // 1) Effetti -> solo timeline effetti
  // 2) Video -> solo timeline video
  // 3) Audio -> solo timeline audio
  // 4) Immagini -> solo timeline audio
  const isMediaAllowedOnTrack = (mediaType: 'effect' | 'video' | 'audio' | 'image', trackType: TrackType): boolean => {
    if (mediaType === 'effect') return trackType === 'effect';
    if (mediaType === 'video') return trackType === 'video';
    if (mediaType === 'audio') return trackType === 'audio';
    if (mediaType === 'image') return trackType === 'audio';
    return false;
  };

  // Drag and drop asset directly from stage files into allowed timeline track
  const handleDropAssetOnTrack = (asset: MediaAsset, trackId: string, dropTime: number) => {
    const targetTrack = tracks.find(t => t.id === trackId);
    if (!targetTrack) return;

    // Controllo rigido sui vincoli di traccia
    if (!isMediaAllowedOnTrack(asset.type, targetTrack.type)) {
      let warning = '';
      if (asset.type === 'video') warning = 'I video possono essere inseriti solo nella timeline dei video (traccia blu)!';
      else if (asset.type === 'audio') warning = 'Gli audio possono essere inseriti solo nella timeline degli audio (traccia verde)!';
      else if (asset.type === 'image') warning = 'Le immagini possono essere inserite solo nella timeline degli audio!';
      else if (asset.type === 'effect') warning = 'Gli effetti possono essere inseriti solo nella timeline effetti (traccia rossa)!';

      setTrackConstraintWarning(warning);
      setTimeout(() => setTrackConstraintWarning(null), 3500);

      const sysErr: ClaudePromptMessage = {
        id: `sys_err_${Date.now()}`,
        role: 'system',
        content: `⚠️ Vincolo traccia: ${warning}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'error',
      };
      setClaudeMessages(prev => [...prev, sysErr]);
      return;
    }

    const duration = asset.durationSec || 12;

    if (asset.type === 'video') {
      // Quando importi un video inserisce il video nella traccia blu ed il relativo audio nella traccia audio (agganciati insieme)
      const audioTrack = tracks.find(t => t.type === 'audio') || tracks[3];
      const now = Date.now();
      const videoClipId = `clip_v_${now}`;
      const audioClipId = `clip_a_${now}`;

      const videoClip: TimelineClip = {
        id: videoClipId,
        name: asset.name,
        trackId: targetTrack.id,
        type: 'video',
        startTime: dropTime,
        duration,
        offset: 0,
        color: '#2563eb',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        linkedClipId: audioClipId,
        isLinked: true,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
        mediaThumbnail: asset.thumbnailUrl,
      };

      const audioClip: TimelineClip = {
        id: audioClipId,
        name: `${asset.name} [Audio]`,
        trackId: audioTrack ? audioTrack.id : 'track_audio_1',
        type: 'audio',
        startTime: dropTime,
        duration,
        offset: 0,
        color: '#10b981',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        linkedClipId: videoClipId,
        isLinked: true,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
      };

      const next = [...clips, videoClip, audioClip];
      setClips(next);
      pushHistory(next);
      setSelectedClipId(videoClipId);

      const sysMsg: ClaudePromptMessage = {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: `Video "${asset.name}" inserito nella traccia Video e relativo audio nella traccia Audio (agganciati insieme).`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'success',
      };
      setClaudeMessages(prev => [...prev, sysMsg]);
      return;
    }

    if (asset.type === 'audio') {
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        name: asset.name,
        trackId: targetTrack.id,
        type: 'audio',
        startTime: dropTime,
        duration,
        offset: 0,
        color: '#10b981',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
      };
      const next = [...clips, newClip];
      setClips(next);
      pushHistory(next);
      setSelectedClipId(newClip.id);
      return;
    }

    if (asset.type === 'image') {
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        name: asset.name,
        trackId: targetTrack.id,
        type: 'image',
        startTime: dropTime,
        duration,
        offset: 0,
        color: '#eab308',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
        mediaThumbnail: asset.thumbnailUrl,
      };
      const next = [...clips, newClip];
      setClips(next);
      pushHistory(next);
      setSelectedClipId(newClip.id);
      return;
    }
  };

  // Keyboard Shortcuts (CTRL+X, CTRL+C, CTRL+V, CTRL+D, CTRL+S, Space, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleSaveTalProject();
        }
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      // CTRL+Z: Undo 1 move up to 10 moves (Request #1)
      if (isCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      // CTRL+Y: Redo
      if (isCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (isCtrl && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCutClip();
      } else if (isCtrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyClip();
      } else if (isCtrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteClip();
      } else if (isCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateClip();
      } else if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveTalProject();
      } else if (isCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        talFileInputRef.current?.click();
      } else if (isCtrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        mediaFileInputRef.current?.click();
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.code === 'Delete' || e.code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          handleDeleteClip();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedClipId, selectedClipIds, clips, clipboardClip, tracks, markers, subtitles, spokenLanguage, currentTime, aspectRatio, mediaAssets]);

  // Toggle Claude Connection manually (User confirmed requirement)
  const handleToggleClaude = () => {
    const nextState = !claudeConnected;
    setClaudeConnected(nextState);

    const logMsg: ClaudePromptMessage = {
      id: `conn_${Date.now()}`,
      role: 'claude',
      content: nextState
        ? '✦ Collegamento MCP con Claude DT ATTIVATO. TALEDIT è pronto a ricevere prompt e comandi sia dall\'app che da Claude Desktop.'
        : 'Collegamento con Claude DT DISATTIVATO manualmente.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: nextState ? 'success' : 'info',
    };
    setClaudeMessages(prev => [...prev, logMsg]);

    // When clicked/turned on, open prompt dialogue window
    if (nextState) {
      setIsClaudeDialogOpen(true);
    }
  };

  // Open Claude Dialog window (always opens when clicked on Claude button)
  const handleOpenClaudeDialog = () => {
    setIsClaudeDialogOpen(true);
  };

  // Execute Prompt from Claude dialog
  const handleSendPrompt = (promptText: string) => {
    const userMsg: ClaudePromptMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setClaudeMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    setTimeout(() => {
      const result = executeClaudePrompt(
        promptText,
        clips,
        tracks,
        currentTime,
        selectedClipId,
        subtitles
      );

      if (result.updatedClips) {
        setClips(result.updatedClips);
        pushHistory(result.updatedClips);
      }
      if (result.updatedTime !== undefined) {
        setCurrentTime(result.updatedTime);
      }
      if (result.selectedClipId) {
        setSelectedClipId(result.selectedClipId);
      }
      if (result.updatedSubtitles) {
        setSubtitles(result.updatedSubtitles);
      }

      const claudeMsg: ClaudePromptMessage = {
        id: `cld_${Date.now()}`,
        role: 'claude',
        content: result.message,
        actionExecuted: result.actionExecuted,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'success',
      };

      setClaudeMessages(prev => [...prev, claudeMsg]);
      setIsThinking(false);
    }, 400);
  };

  // Cut Clip at Playhead
  const handleCutClip = () => {
    handleSendPrompt('Taglia la clip al playhead');
  };

  // Clip selection (supports single and multi-selection with mouse / Shift / Ctrl / box drag)
  const handleSelectClip = (clipId: string | null, isMulti = false) => {
    if (!clipId) {
      setSelectedClipId(null);
      setSelectedClipIds([]);
      return;
    }

    if (isMulti) {
      setSelectedClipIds(prev => {
        const next = prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId];
        setSelectedClipId(next.length > 0 ? next[next.length - 1] : null);
        return next;
      });
    } else {
      setSelectedClipId(clipId);
      setSelectedClipIds([clipId]);
    }
  };

  const handleSelectMultipleClips = (clipIds: string[]) => {
    setSelectedClipIds(clipIds);
    setSelectedClipId(clipIds.length > 0 ? clipIds[clipIds.length - 1] : null);
  };

  // Delete Clip(s) from timeline: supports deleting single or multiple selected clips via keyboard (CANC)
  const handleDeleteClip = (targetClipId?: string) => {
    const idsToDelete = targetClipId
      ? [targetClipId]
      : selectedClipIds.length > 0
        ? selectedClipIds
        : selectedClipId
          ? [selectedClipId]
          : [];

    if (idsToDelete.length === 0) return;

    const idsSet = new Set(idsToDelete);
    const deletedClips = clips.filter(c => idsSet.has(c.id));
    const newClips = clips.filter(c => !idsSet.has(c.id));
    setClips(newClips);
    pushHistory(newClips);
    setSelectedClipId(null);
    setSelectedClipIds([]);

    const count = idsToDelete.length;
    const names = deletedClips.map(c => c.name).join(', ');
    const sysMsg: ClaudePromptMessage = {
      id: `sys_${Date.now()}`,
      role: 'system',
      content: count === 1
        ? `Mattoncino "${names}" rimosso dalla timeline. Il file originale rimane conservato nello stage.`
        : `${count} mattoncini rimossi dalla timeline con CANC (${names}). I file originali rimangono conservati nello stage.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'info',
    };
    setClaudeMessages(prev => [...prev, sysMsg]);
  };

  // Cancellazione di un file dallo stage:
  // "QUANDO CANCELLO UN FILE NELLO STAGE, IL CORRISPONDENTE (SE CI STA INSERITO) MATTONCINO CORRISPONDENTE NELLA TIMELINE DEVE ESSERE CANCELLATO.
  //  Al contrario quando cancello un mattoncino nella timeline non devi cancellare il file corrispondente nello stage"
  const handleDeleteStageAsset = (assetId: string) => {
    const targetAsset = mediaAssets.find(a => a.id === assetId);

    // 1. Rimuovi il file dallo stage
    setMediaAssets(prev => prev.filter(a => a.id !== assetId));

    // 2. Rimuovi automaticamente tutti i mattoncini corrispondenti nella timeline (se presenti)
    setClips(prev => {
      const nextClips = prev.filter(c => {
        // Se ha l'assetId esplicito corrispondente
        if (c.assetId && c.assetId === assetId) return false;

        // Se corrisponde al nome del file o al nome audio collegato
        if (targetAsset) {
          const rawName = targetAsset.name;
          const cleanName = rawName.replace(/\.[^/.]+$/, ''); // es. Intro01 da Intro01.mp4

          if (c.name === rawName) return false;
          if (c.name === `${rawName} [Audio]`) return false;
          if (c.name === cleanName) return false;
          if (c.name === `${cleanName} [Audio]`) return false;

          // Se il clip ha mediaUrl che corrisponde al fileUrl dell'asset
          if (c.mediaUrl && targetAsset.fileUrl && c.mediaUrl === targetAsset.fileUrl) return false;
        }

        return true;
      });

      pushHistory(nextClips);
      return nextClips;
    });

    // Se il clip attualmente selezionato è tra quelli cancellati, deseleziona
    setSelectedClipId(prevId => {
      if (!prevId) return null;
      const c = clips.find(clip => clip.id === prevId);
      if (!c) return null;
      if (c.assetId === assetId) return null;
      if (targetAsset) {
        const rawName = targetAsset.name;
        const cleanName = rawName.replace(/\.[^/.]+$/, '');
        if (
          c.name === rawName ||
          c.name === `${rawName} [Audio]` ||
          c.name === cleanName ||
          c.name === `${cleanName} [Audio]`
        ) {
          return null;
        }
      }
      return prevId;
    });

    const assetName = targetAsset ? targetAsset.name : assetId;
    const sysMsg: ClaudePromptMessage = {
      id: `sys_${Date.now()}`,
      role: 'system',
      content: `File "${assetName}" cancellato dallo stage e rimossi automaticamente tutti i mattoncini corrispondenti dalla timeline.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'info',
    };
    setClaudeMessages(prev => [...prev, sysMsg]);
  };

  // Copy Clip
  const handleCopyClip = () => {
    const target = clips.find(c => c.id === selectedClipId);
    if (target) {
      setClipboardClip(target);
    }
  };

  // Paste Clip
  const handlePasteClip = () => {
    if (!clipboardClip) return;
    const newClip: TimelineClip = {
      ...clipboardClip,
      id: `clip_${Date.now()}`,
      name: `${clipboardClip.name} (Copia)`,
      startTime: Math.round(currentTime * 10) / 10,
    };
    const updated = [...clips, newClip];
    setClips(updated);
    pushHistory(updated);
    setSelectedClipId(newClip.id);
  };

  // Update specific clip properties
  const handleUpdateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    setClips(prev => {
      const next = prev.map(c => (c.id === clipId ? { ...c, ...updates } : c));
      return next;
    });
  };

  // Update selected clip from Details panel
  const handleUpdateSelectedClip = (updates: Partial<TimelineClip>) => {
    if (!selectedClipId) return;
    handleUpdateClip(selectedClipId, updates);
  };

  // Toggle Solo / Mute on Tracks
  const handleToggleTrackSolo = (trackId: string) => {
    setTracks(prev =>
      prev.map(t => (t.id === trackId ? { ...t, isSolo: !t.isSolo } : t))
    );
  };

  const handleToggleTrackMute = (trackId: string) => {
    setTracks(prev =>
      prev.map(t => (t.id === trackId ? { ...t, isMuted: !t.isMuted } : t))
    );
  };

  // Add media asset from stage library into timeline at exact vertical playhead position (doppio click)
  const handleAddMediaToTimeline = (asset: MediaAsset) => {
    const playheadTime = Math.max(0, Math.round(currentTime * 10) / 10);
    const duration = asset.durationSec || 12;

    if (asset.type === 'video') {
      // 2) I video vanno nella timeline video (blu) ed il relativo audio nella traccia audio (verde) agganciati insieme
      const videoTrack = tracks.find(t => t.type === 'video') || tracks[1];
      const audioTrack = tracks.find(t => t.type === 'audio') || tracks[3];

      const now = Date.now();
      const videoClipId = `clip_v_${now}`;
      const audioClipId = `clip_a_${now}`;

      const videoClip: TimelineClip = {
        id: videoClipId,
        name: asset.name,
        trackId: videoTrack.id,
        type: 'video',
        startTime: playheadTime, // Esattamente nel punto della barra verticale del play (playhead)!
        duration,
        offset: 0,
        color: '#2563eb',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        linkedClipId: audioClipId,
        isLinked: true,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
        mediaThumbnail: asset.thumbnailUrl,
      };

      const audioClip: TimelineClip = {
        id: audioClipId,
        name: `${asset.name} [Audio]`,
        trackId: audioTrack ? audioTrack.id : 'track_audio_1',
        type: 'audio',
        startTime: playheadTime,
        duration,
        offset: 0,
        color: '#10b981',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        linkedClipId: videoClipId,
        isLinked: true,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
      };

      const nextClips = [...clips, videoClip, audioClip];
      setClips(nextClips);
      pushHistory(nextClips);
      setSelectedClipId(videoClipId);

      const sysMsg: ClaudePromptMessage = {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: `Video "${asset.name}" posizionato al playhead (${playheadTime}s) su traccia Video (blu) e relativo audio su traccia Audio (verde) agganciati insieme.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'success',
      };
      setClaudeMessages(prev => [...prev, sysMsg]);
      return;
    }

    if (asset.type === 'audio') {
      // 3) Gli audio possono essere inseriti solo nella timeline degli audio
      const audioTrack = tracks.find(t => t.type === 'audio') || tracks[3];
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        name: asset.name,
        trackId: audioTrack.id,
        type: 'audio',
        startTime: playheadTime,
        duration,
        offset: 0,
        color: '#10b981',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
      };
      const nextClips = [...clips, newClip];
      setClips(nextClips);
      pushHistory(nextClips);
      setSelectedClipId(newClip.id);
      return;
    }

    if (asset.type === 'image') {
      // 4) Le immagini possono essere inserite solo nella timeline degli audio e non nelle altre
      const audioTrack = tracks.find(t => t.type === 'audio') || tracks[3];
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        name: asset.name,
        trackId: audioTrack.id,
        type: 'image',
        startTime: playheadTime,
        duration,
        offset: 0,
        color: '#eab308',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
        assetId: asset.id,
        mediaUrl: asset.fileUrl,
        mediaThumbnail: asset.thumbnailUrl,
      };
      const nextClips = [...clips, newClip];
      setClips(nextClips);
      pushHistory(nextClips);
      setSelectedClipId(newClip.id);
      return;
    }
  };

  // Add new track dynamically
  const handleAddTrack = (type: TrackType, name: string) => {
    const isEffects = type === 'effect';
    const isVideo = type === 'video';
    const isAudio = type === 'audio';
    const isImage = type === 'image';

    const headerBg = isEffects
      ? '#35121b'
      : isVideo
      ? '#0f2942'
      : isAudio
      ? '#0d3324'
      : '#382a08';

    const laneBg = isEffects
      ? '#1e141a'
      : isVideo
      ? '#111d2e'
      : isAudio
      ? '#10251e'
      : '#1a1608';

    const newTrack: Track = {
      id: `track_${type}_${Date.now()}`,
      name,
      type,
      isSolo: false,
      isMuted: false,
      headerBg,
      laneBg,
    };

    setTracks(prev => [...prev, newTrack]);
  };

  // Markers Handlers
  const handleAddMarker = (time?: number) => {
    const markerTime = time !== undefined ? time : currentTime;
    const newMarker: TimelineMarker = {
      id: `marker_${Date.now()}`,
      time: Math.round(markerTime * 10) / 10,
      name: `Marker ${markers.length + 1}`,
      description: `Nota al tempo ${formatTimecode(markerTime)}`,
      color: '#f59e0b',
    };
    setMarkers(prev => [...prev, newMarker]);
  };

  const handleUpdateMarker = (updated: TimelineMarker) => {
    setMarkers(prev => prev.map(m => (m.id === updated.id ? updated : m)));
  };

  const handleDeleteMarker = (markerId: string) => {
    setMarkers(prev => prev.filter(m => m.id !== markerId));
  };

  // Generate captions
  const handleGenerateCaptions = () => {
    if (deleteCurrentCaptions) {
      setSubtitles([]);
    }
    const newItems: SubtitleItem[] = [
      {
        id: `sub_${Date.now()}_1`,
        startTime: 7.0,
        endTime: 12.0,
        text: spokenLanguage === 'Italian'
          ? "Benvenuti in TALEDIT: il montaggio video intelligente via MCP."
          : "Welcome to TALEDIT: intelligent video editing via MCP.",
        translation: spokenLanguage === 'Italian' ? "Welcome to TALEDIT: video editing via MCP." : undefined,
      },
      {
        id: `sub_${Date.now()}_2`,
        startTime: 12.5,
        endTime: 18.0,
        text: spokenLanguage === 'Italian'
          ? "Ogni traccia ha il suo colore dedicato e maniglie interattive per trasparenza, volume e dissolvenze."
          : "Each track has its dedicated color and interactive handles for transparency, volume, and fades.",
        translation: spokenLanguage === 'Italian' ? "Each track has dedicated color and interactive handles." : undefined,
      },
      {
        id: `sub_${Date.now()}_3`,
        startTime: 18.5,
        endTime: 24.0,
        text: spokenLanguage === 'Italian'
          ? "Puoi scrivere prompt sia da Claude DT che da TALEDIT per modificare tutto in tempo reale."
          : "You can write prompts from both Claude DT and TALEDIT to modify everything in real time.",
        translation: spokenLanguage === 'Italian' ? "Write prompts from Claude DT or TALEDIT in real time." : undefined,
      },
    ];

    setSubtitles(newItems);
  };

  const handleUpdateSubtitle = (id: string, text: string) => {
    setSubtitles(prev => prev.map(s => (s.id === id ? { ...s, text } : s)));
  };

  const handleDeleteSubtitle = (id: string) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  // Microphone toggle (simulated voice prompting)
  const handleToggleMic = () => {
    const nextState = !isMicActive;
    setIsMicActive(nextState);
    if (nextState) {
      setIsClaudeDialogOpen(true);
      handleSendPrompt("Taglia al tempo corrente e alza volume di +2 dB");
    }
  };

  const selectedClip = clips.find(c => c.id === selectedClipId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090d16] text-[#e2e8f0] font-sans antialiased select-none">
      {/* Hidden file input for opening .tal projects */}
      <input
        ref={talFileInputRef}
        type="file"
        accept=".tal,application/json,.json"
        onChange={handleLoadTalProject}
        className="hidden"
      />

      {/* Hidden file input for importing media files into stage */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept=".mp4,.mov,.avi,.mp3,.wav,.png,.jpg,.jpeg,video/mp4,video/quicktime,video/x-msvideo,audio/mpeg,audio/wav,image/png,image/jpeg"
        multiple
        onChange={handleMediaFileImport}
        className="hidden"
      />

      {/* 1. Top Navigation Bar */}
      <TopNav
        claudeConnected={claudeConnected}
        onToggleClaude={handleToggleClaude}
        onOpenClaudeDialog={handleOpenClaudeDialog}
        onCut={handleCutClip}
        onDelete={handleDeleteClip}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopyClip}
        onPaste={handlePasteClip}
        onOpenProject={() => talFileInputRef.current?.click()}
        onImport={() => mediaFileInputRef.current?.click()}
        onSave={handleSaveTalProject}
        onExport={() => setIsExportModalOpen(true)}
        onAddMarker={() => handleAddMarker(currentTime)}
        markerCount={markers.length}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMicActive={isMicActive}
        onToggleMic={handleToggleMic}
      />

      {/* 2. Main Middle Workspace: Header + 4 Resizable Panels */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#0e121d]">
        {/* Subheader matching screenshot: "PREVIEW / Importa un file multimediale per iniziare" */}
        <div className="px-4 py-1.5 border-b border-[#1b2436] bg-[#0c101a] flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-bold tracking-widest text-gray-400">PREVIEW</span>
            <span className="text-xs text-gray-500">
              Importa un file multimediale per iniziare
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="font-mono text-cyan-400">
              {formatTimecode(currentTime)}
            </span>
            <span>•</span>
            <span className="text-gray-400">TALEDIT MCP Studio</span>
          </div>
        </div>

        {/* 4 Panels Grid with draggable borders (User request #1) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Panel 1: Media Library */}
          <div style={{ width: `${mediaWidth}px` }} className="h-full shrink-0">
            <MediaLibraryPanel
              assets={mediaAssets}
              onDeleteAsset={handleDeleteStageAsset}
              onAddAsset={asset => setMediaAssets(prev => [asset, ...prev])}
              onAddMediaToTimeline={handleAddMediaToTimeline}
              onCustomFileImported={() => {
                // File importato solo nello stage. L'inserimento in timeline avviene solo per trascinamento o doppio clic.
              }}
            />
          </div>

          {/* Draggable Divider 1 (Media / Captions) */}
          <div
            onMouseDown={e => {
              e.preventDefault();
              setResizingDivider({ type: 'media', startX: e.clientX, startY: e.clientY, startDim: mediaWidth });
            }}
            className="w-1.5 hover:w-2 bg-[#172133] hover:bg-cyan-500 cursor-col-resize transition-all z-20 flex items-center justify-center group shrink-0 select-none"
            title="Trascina per allargare o stringere la sezione"
          >
            <div className="w-0.5 h-8 bg-gray-600 group-hover:bg-black rounded" />
          </div>

          {/* Panel 2: Spoken Language / Captions */}
          <div style={{ width: `${captionsWidth}px` }} className="h-full shrink-0">
            <CaptionsPanel
              spokenLanguage={spokenLanguage}
              setSpokenLanguage={setSpokenLanguage}
              bilingualCaptions={bilingualCaptions}
              setBilingualCaptions={setBilingualCaptions}
              deleteCurrentCaptions={deleteCurrentCaptions}
              setDeleteCurrentCaptions={setDeleteCurrentCaptions}
              subtitles={subtitles}
              onGenerateCaptions={handleGenerateCaptions}
              onUpdateSubtitle={handleUpdateSubtitle}
              onDeleteSubtitle={handleDeleteSubtitle}
            />
          </div>

          {/* Draggable Divider 2 (Captions / Player) */}
          <div
            onMouseDown={e => {
              e.preventDefault();
              setResizingDivider({ type: 'captions', startX: e.clientX, startY: e.clientY, startDim: captionsWidth });
            }}
            className="w-1.5 hover:w-2 bg-[#172133] hover:bg-cyan-500 cursor-col-resize transition-all z-20 flex items-center justify-center group shrink-0 select-none"
            title="Trascina per allargare o stringere la sezione"
          >
            <div className="w-0.5 h-8 bg-gray-600 group-hover:bg-black rounded" />
          </div>

          {/* Panel 3: Video Player */}
          <div className="flex-1 h-full min-w-[280px]">
            <PlayerPanel
              currentTime={currentTime}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(p => !p)}
              onSeek={t => setCurrentTime(t)}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              clips={clips}
              subtitles={subtitles}
              isMuted={isMutedMaster}
              onToggleMute={() => setIsMutedMaster(m => !m)}
            />
          </div>

          {/* Draggable Divider 3 (Player / Details) */}
          <div
            onMouseDown={e => {
              e.preventDefault();
              setResizingDivider({ type: 'details', startX: e.clientX, startY: e.clientY, startDim: detailsWidth });
            }}
            className="w-1.5 hover:w-2 bg-[#172133] hover:bg-cyan-500 cursor-col-resize transition-all z-20 flex items-center justify-center group shrink-0 select-none"
            title="Trascina per allargare o stringere la sezione"
          >
            <div className="w-0.5 h-8 bg-gray-600 group-hover:bg-black rounded" />
          </div>

          {/* Panel 4: DETAILS Sidebar */}
          <div style={{ width: `${detailsWidth}px` }} className="shrink-0 h-full">
            <DetailsPanel
              selectedClip={selectedClip}
              tracks={tracks}
              onUpdateClip={handleUpdateSelectedClip}
            />
          </div>
        </div>
      </div>

      {/* Draggable Divider 4 (Workspace / Timeline) */}
      <div
        onMouseDown={e => {
          e.preventDefault();
          setResizingDivider({ type: 'timeline', startX: e.clientX, startY: e.clientY, startDim: timelineHeight });
        }}
        className="h-2 hover:h-2.5 bg-[#172133] hover:bg-cyan-500 cursor-row-resize transition-all z-30 flex items-center justify-center group shrink-0 select-none border-t border-b border-[#1e293b]"
        title="Trascina per allargare o stringere l'altezza della timeline"
      >
        <div className="w-16 h-0.5 bg-gray-500 group-hover:bg-black rounded" />
      </div>

      {/* 3. Bottom Timeline Section */}
      <div style={{ height: `${timelineHeight}px` }} className="w-full shrink-0">
        <Timeline
          tracks={tracks}
          clips={clips}
          currentTime={currentTime}
          totalDuration={totalDuration}
          selectedClipId={selectedClipId}
          selectedClipIds={selectedClipIds}
          zoom={zoom}
          setZoom={setZoom}
          onSeek={t => setCurrentTime(t)}
          onSelectClip={handleSelectClip}
          onSelectMultipleClips={handleSelectMultipleClips}
          onUpdateClip={handleUpdateClip}
          onToggleTrackSolo={handleToggleTrackSolo}
          onToggleTrackMute={handleToggleTrackMute}
          onDeleteTrack={handleDeleteTrack}
          onAddTrack={handleAddTrack}
          markers={markers}
          onAddMarker={handleAddMarker}
          onUpdateMarker={handleUpdateMarker}
          onDeleteMarker={handleDeleteMarker}
          onDropAsset={handleDropAssetOnTrack}
          onCutClip={handleCutClip}
          onDuplicateClip={handleDuplicateClip}
          onDeleteClip={handleDeleteClip}
        />
      </div>

      {/* 4. Claude DT MCP Dialog Window */}
      <ClaudeMCPDialog
        isOpen={isClaudeDialogOpen}
        onClose={() => setIsClaudeDialogOpen(false)}
        claudeConnected={claudeConnected}
        onToggleConnected={handleToggleClaude}
        messages={claudeMessages}
        onSendPrompt={handleSendPrompt}
        isThinking={isThinking}
      />

      {/* 5. Export / Save Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        clips={clips}
        tracks={tracks}
        subtitles={subtitles}
        aspectRatio={aspectRatio}
      />

      {/* Floating Track Constraint Warning Toast */}
      {trackConstraintWarning && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-[#4c0519] border-2 border-rose-500 text-rose-100 px-5 py-2.5 rounded-lg shadow-2xl z-50 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <span className="text-base">⛔</span>
          <span>{trackConstraintWarning}</span>
        </div>
      )}
    </div>
  );
}
