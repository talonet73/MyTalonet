/**
 * TALEDIT - Video Editor con Claude DT MCP Integration
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditingToolsPanel } from './components/EditingToolsPanel';
import {BGRemoverPanel} from './components/BGRemoverPanel';
import { applyCrossDissolve, makeEffectClip, type VisualEffect } from './services/visualSettings';
import {allowedOnTrack, normalizeTrackAssignments} from './services/trackRules';
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
import { importMediaFile } from './services/mediaService';
import { activeTimelineClips } from './services/timelineMedia';
import { applyTimelineTool } from './services/timelineTools';
import { useEditorSync } from './services/useEditorSync';

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
    name: 'IMMAGINI',
    type: 'image',
    isSolo: false,
    isMuted: false,
    headerBg: '#0d3324',
    laneBg: '#10251e',
  },
];

const INITIAL_CLIPS: TimelineClip[] = [];
const INITIAL_SUBTITLES: SubtitleItem[] = [];

export default function App() {
  // Timeline State
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_CLIPS);
  const [currentTime, setCurrentTime] = useState<number>(0); // 00:18 playhead matching screenshot
  const [totalDuration, setTotalDuration] = useState<number>(30); // 00:04:33:00 matching screenshot
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number>(24);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('16:9');
  const [isMutedMaster, setIsMutedMaster] = useState<boolean>(false);

  // Captions State
  const [spokenLanguage, setSpokenLanguage] = useState<string>('Italian');
  const [bilingualCaptions, setBilingualCaptions] = useState<boolean>(false);
  const [deleteCurrentCaptions, setDeleteCurrentCaptions] = useState<boolean>(false);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(INITIAL_SUBTITLES);

  // Tabs & Toolbars
  const [activeTab, setActiveTab] = useState<string>('');
  const [isMicActive, setIsMicActive] = useState<boolean>(false);

  // Claude DT MCP Integration State
  // User manually decides when to turn ON or OFF as explicitly requested!
  const [claudeConnected, setClaudeConnected] = useState<boolean>(false);
  const [mcpProvider, setMcpProvider] = useState<'claude' | 'chatgpt'>('claude');
  const [isClaudeDialogOpen, setIsClaudeDialogOpen] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [trackConstraintWarning, setTrackConstraintWarning] = useState<string | null>(null);

  // Markers State
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);

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
  const recognitionRef = useRef<any>(null);

  // Clipboard & 10-step Undo History (Request #1)
  const [clipboardClip, setClipboardClip] = useState<TimelineClip[] | null>(null);
  const clipsRef = useRef<TimelineClip[]>(clips);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const tracksRef = useRef<Track[]>(tracks);
  useEffect(() => { tracksRef.current=tracks; },[tracks]);
  const historyRef = useRef<{clips:TimelineClip[];tracks:Track[]}[]>([{clips:INITIAL_CLIPS,tracks:INITIAL_TRACKS}]);
  const historyIndexRef = useRef<number>(0);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [claudeMessages, setClaudeMessages] = useState<ClaudePromptMessage[]>([
    {
      id: 'init_msg_1',
      role: 'claude',
      content:
        'Benvenuto in TALEDIT! La console locale interpreta comandi di montaggio. Claude e ChatGPT si collegano tramite gli endpoint MCP nella scheda di configurazione. Puoi accendere o spegnere il collegamento in qualsiasi momento dal pulsante in alto. Prova a digitare: "Taglia a 00:15", "Imposta trasparenza al 70%" o "Alza volume a +3dB".',
      timestamp: 'Adesso',
    },
  ]);

  // Push new move to history (maintains up to 10 moves)
  const pushHistory = useCallback((newClips: TimelineClip[], newTracks=tracksRef.current) => {
    const snapshot={clips:newClips,tracks:newTracks};
    const currentIdx = historyIndexRef.current;
    const sliced = historyRef.current.slice(0, currentIdx + 1);

    // Skip duplicate states
    const last = sliced[sliced.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) {
      return;
    }

    let next = [...sliced, snapshot];
    // Keep up to 10 moves backward (11 snapshots total)
    if (next.length > 11) {
      next = next.slice(next.length - 11);
    }

    historyRef.current = next;
    const newIdx = next.length - 1;
    historyIndexRef.current = newIdx;
    setHistoryCount(newIdx);
  }, []);

  const sharedState = { clips, tracks, subtitles, mediaAssets, currentTime, selectedClipId, aspectRatio };
  useEditorSync(sharedState, remote => {
    const normalized=normalizeTrackAssignments(remote.clips,remote.tracks);remote={...remote,...normalized};
    setClips(remote.clips); clipsRef.current = remote.clips; pushHistory(remote.clips,remote.tracks);
    setTracks(remote.tracks); setSubtitles(remote.subtitles); setMediaAssets(remote.mediaAssets);
    setCurrentTime(remote.currentTime); setSelectedClipId(remote.selectedClipId);
    setSelectedClipIds(remote.selectedClipId ? [remote.selectedClipId] : []);
    setAspectRatio(remote.aspectRatio);
  }, setClaudeConnected, setTrackConstraintWarning);
  useEffect(() => { setTotalDuration(Math.max(30, ...clips.map(c => c.startTime + c.duration))); }, [clips]);

  // Undo (Ctrl+Z): goes back 1 move, up to 10 moves
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const prevIdx = historyIndexRef.current - 1;
      historyIndexRef.current = prevIdx;
      setHistoryCount(prevIdx);
      const snapshot = historyRef.current[prevIdx];
      const targetClips = snapshot?.clips;
      if (targetClips) {
        setTracks(snapshot.tracks);tracksRef.current=snapshot.tracks;
        setSelectedClipId(id=>targetClips.some(c=>c.id===id)?id:null);
        setSelectedClipIds(ids=>ids.filter(id=>targetClips.some(c=>c.id===id)));
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
      const snapshot = historyRef.current[nextIdx];
      const targetClips = snapshot?.clips;
      if (targetClips) {
        setTracks(snapshot.tracks);tracksRef.current=snapshot.tracks;
        setSelectedClipId(id=>targetClips.some(c=>c.id===id)?id:null);
        setSelectedClipIds(ids=>ids.filter(id=>targetClips.some(c=>c.id===id)));
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

  useEffect(() => {
    window.addEventListener('pointerup', handleCommitHistory);
    window.addEventListener('mouseup', handleCommitHistory);
    return () => { window.removeEventListener('pointerup', handleCommitHistory); window.removeEventListener('mouseup', handleCommitHistory); };
  }, [handleCommitHistory]);

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
  const cloneAt = (source: TimelineClip[], time: number) => {
    if (!source.length) return;
    const ids = new Map(source.map(c => [c.id, crypto.randomUUID()]));
    const origin = source[0].startTime;
    const copies = source.map(c => ({ ...c, id: ids.get(c.id)!, startTime: time + c.startTime - origin,
      linkedClipId: c.linkedClipId ? ids.get(c.linkedClipId) : undefined, isLinked: Boolean(c.linkedClipId && ids.has(c.linkedClipId)), name: `${c.name} (Copia)` }));
    const normalized=normalizeTrackAssignments([...clips,...copies],tracks);
    const updated=normalized.clips;setTracks(normalized.tracks);tracksRef.current=normalized.tracks;setClips(updated);clipsRef.current=updated;pushHistory(updated,normalized.tracks);
    setSelectedClipId(copies[0].id); setSelectedClipIds([copies[0].id]);
  };
  const sourcePair = (id: string | null) => {
    const target = clips.find(c => c.id === id);
    if (!target) return [];
    const pair = target.isLinked && clips.find(c => c.id === target.linkedClipId);
    return pair ? [target, pair] : [target];
  };
  const handleDuplicateClip = () => {
    const source = sourcePair(selectedClipId);
    if (source.length) cloneAt(source, source[0].startTime + source[0].duration);
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
        if (data.appName !== 'TALEDIT' || !Array.isArray(data.tracks) || !Array.isArray(data.clips) || data.tracks.length > 100 || data.clips.length > 200 || data.clips.some((c: any) => !c.id || !['video','audio','image','effect'].includes(c.type) || !Number.isFinite(c.startTime) || c.startTime < 0 || !Number.isFinite(c.duration) || c.duration <= 0)) throw new Error('Progetto TALEDIT non valido.');
        const normalized=normalizeTrackAssignments(data.clips,data.tracks);data.clips=normalized.clips;data.tracks=normalized.tracks;
        if (data.tracks) setTracks(data.tracks);
        if (data.clips) {
          setClips(data.clips);
          pushHistory(data.clips,data.tracks || tracksRef.current);
        }
        if (data.markers) setMarkers(data.markers);
        if (data.subtitles) setSubtitles(data.subtitles);
        if (data.spokenLanguage) setSpokenLanguage(data.spokenLanguage);
        if (data.currentTime !== undefined) setCurrentTime(data.currentTime);
        if (data.mediaAssets) setMediaAssets(data.mediaAssets);
        if (data.aspectRatio) setAspectRatio(data.aspectRatio);
        if (data.bilingualCaptions !== undefined) setBilingualCaptions(data.bilingualCaptions);
        setSelectedClipId(null); setSelectedClipIds([]);
      } catch (err) {
        setTrackConstraintWarning((err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import Media Files into Stage (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg)
  const handleMediaFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    try {
      for (const file of files) {
        const asset = await importMediaFile(file);
        setMediaAssets(prev => [...prev, asset]);
      }
    } catch (error) { setTrackConstraintWarning((error as Error).message); }
  };

  // Delete Track and its clips
  const handleDeleteTrack = (trackId: string) => {
    const nextTracks=tracks.filter(t=>t.id!==trackId);
    const removed=new Set(clips.filter(c=>c.trackId===trackId).map(c=>c.id));
    const nextClips=clips.filter(c=>!removed.has(c.id)).map(c=>removed.has(c.linkedClipId || '')?{...c,linkedClipId:undefined,isLinked:false}:c);
    setTracks(nextTracks);tracksRef.current=nextTracks;setClips(nextClips);clipsRef.current=nextClips;pushHistory(nextClips,nextTracks);
  };



  // Helper: verifica restrizioni rigide su quale traccia può ospitare ciascun tipo di media
  // 1) Effetti -> solo timeline effetti
  // 2) Video -> solo timeline video
  // 3) Audio -> solo timeline audio
  // 4) Immagini -> solo timeline audio
  const isMediaAllowedOnTrack = (mediaType: 'effect' | 'video' | 'audio' | 'image', trackType: TrackType): boolean => {
    return allowedOnTrack(mediaType,trackType);
  };

  // Drag and drop asset directly from stage files into allowed timeline track
  const addAsset = (asset: MediaAsset, trackId: string, time: number, preparedTracks = tracks) => {
    try {
      const next = applyTimelineTool({ ...sharedState, tracks: preparedTracks }, 'add_clip', { assetId: asset.id, trackId, timeSeconds: Math.max(0, time) });
      setTracks(next.tracks); setClips(next.clips); pushHistory(next.clips,next.tracks);
      setSelectedClipId(next.selectedClipId); setSelectedClipIds(next.selectedClipId ? [next.selectedClipId] : []);
    } catch (error) { setTrackConstraintWarning((error as Error).message); }
  };
  const handleAddEffect = (type:VisualEffect, trackId?:string, time=currentTime) => {
    let nextTracks=tracks;
    let track=trackId?tracks.find(t=>t.id===trackId):tracks.find(t=>t.type==='effect');
    if(trackId && track?.type!=='effect'){setTrackConstraintWarning('Gli effetti vanno soltanto nella traccia EFFECTS.');return;}
    if(!track){track={id:crypto.randomUUID(),name:'EFFECTS',type:'effect',isMuted:false,isSolo:false,headerBg:'#35121b',laneBg:'#1e141a'};nextTracks=[...tracks,track];}
    try {
      const effect=makeEffectClip(type,track.id,time),next=[...clips,effect];
      setTracks(nextTracks);tracksRef.current=nextTracks;setClips(next);clipsRef.current=next;pushHistory(next,nextTracks);
      setSelectedClipId(effect.id);setSelectedClipIds([effect.id]);setActiveTab('');
    }catch(error){setTrackConstraintWarning((error as Error).message);}
  };
  const handleDropAssetOnTrack = (asset: any, trackId: string, dropTime: number) => {
    if(asset.type==='effect'){handleAddEffect(asset.effectType,trackId,dropTime);return;}
    addAsset(asset, trackId, dropTime);
  };

  // Keyboard Shortcuts (CTRL+X, CTRL+C, CTRL+V, CTRL+D, CTRL+S, Space, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('[data-stage="true"]'))) return;
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
      } else if (isCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault(); setIsPlaying(false); setIsExportModalOpen(true);
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
    fetch('/api/editor/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: nextState }) })
      .then(response => { if (!response.ok) throw new Error('Collegamento MCP non modificato.'); setClaudeConnected(nextState); })
      .catch(error => setTrackConstraintWarning(error.message));

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
        pushHistory(result.updatedClips,result.updatedTracks || tracks);
      }
      if (result.updatedTracks) { setTracks(result.updatedTracks);tracksRef.current=result.updatedTracks; }
      if (result.updatedTime !== undefined) {
        setCurrentTime(result.updatedTime);
      }
      if (result.selectedClipId !== undefined) {
        setSelectedClipId(result.selectedClipId);setSelectedClipIds(result.selectedClipId?[result.selectedClipId]:[]);
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
    try {
      const next = applyTimelineTool(sharedState, 'cut_clip_at_time', { timeSeconds: currentTime });
      setClips(next.clips); pushHistory(next.clips); setSelectedClipId(next.selectedClipId);
      setSelectedClipIds(next.selectedClipId ? [next.selectedClipId] : []);
    } catch (error) { setTrackConstraintWarning((error as Error).message); }
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
    for (const c of clips) if (idsSet.has(c.id) && c.isLinked && c.linkedClipId) idsSet.add(c.linkedClipId);
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
  const handleCopyClip = () => { const source = sourcePair(selectedClipId); if (source.length) setClipboardClip(source); };
  const handlePasteClip = () => { if (clipboardClip) cloneAt(clipboardClip, currentTime); };

  // Update specific clip properties
  const handleUpdateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    setClips(prev => {
      const target = prev.find(c => c.id === clipId);
      if (target && updates.duration !== undefined && ['video','audio'].includes(target.type)) {
        const asset=mediaAssets.find(a=>a.id===target.assetId);
        if(asset)updates={...updates,duration:Math.max(.04,Math.min(updates.duration,asset.durationSec-(updates.offset ?? target.offset ?? 0)))};
      }
      const linkedUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => ['startTime', 'duration', 'offset'].includes(key)));
      const next = prev.map(c => c.id === clipId ? { ...c, ...updates } : target?.isLinked && target.linkedClipId === c.id ? { ...c, ...linkedUpdates, ...(updates.offset!==undefined?{offset:Math.max(0,Math.round(((c.offset||0)+updates.offset-(target.offset||0))*1e6)/1e6)}:{}) } : c);
      clipsRef.current = next;
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
    const next=tracks.map(t=>t.id===trackId?{...t,isSolo:!t.isSolo}:t);
    setTracks(next);tracksRef.current=next;pushHistory(clips,next);
  };
  const handleToggleTrackMute = (trackId: string) => {
    const next=tracks.map(t=>t.id===trackId?{...t,isMuted:!t.isMuted}:t);
    setTracks(next);tracksRef.current=next;pushHistory(clips,next);
  };

  // Add media asset from stage library into timeline at exact vertical playhead position (doppio click)
  const handleAddMediaToTimeline = (asset: MediaAsset) => {
    const type = asset.type;
    let availableTracks = tracks;
    let track = tracks.find(t => t.type === type);
    if (!track) {
      track = { ...INITIAL_TRACKS.find(t => t.type === type)!, id: crypto.randomUUID() };
      availableTracks = [...availableTracks, track];
    }
    if (asset.type === 'video' && !availableTracks.some(t => t.type === 'audio')) availableTracks = [...availableTracks, { ...INITIAL_TRACKS.find(t => t.type === 'audio')!, id: crypto.randomUUID() }];
    addAsset(asset, track.id, currentTime, availableTracks);
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

    const next=[...tracks,newTrack];setTracks(next);tracksRef.current=next;pushHistory(clips,next);
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
  const handleGenerateCaptions = async () => {
    try {
      const durationSec = Math.max(0, ...clips.map(c => c.startTime + c.duration));
      const response = await fetch('/api/captions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips, tracks, durationSec, language: spokenLanguage, bilingual: bilingualCaptions }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      for (;;) {
        const statusResponse = await fetch(`/api/captions/${data.jobId}`);
        const job = await statusResponse.json();
        if (!statusResponse.ok || job.status === 'error') throw new Error(job.error || 'Trascrizione fallita.');
        if (job.status === 'complete') {
          setSubtitles(prev => deleteCurrentCaptions ? job.subtitles : [...prev, ...job.subtitles]);
          if (!job.subtitles.length) setTrackConstraintWarning('Whisper non ha rilevato parlato nella timeline.');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) { setTrackConstraintWarning((error as Error).message); }
  };

  const handleUpdateSubtitle = (id: string, text: string) => {
    setSubtitles(prev => prev.map(s => (s.id === id ? { ...s, text } : s)));
  };

  const handleDeleteSubtitle = (id: string) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  const handleToggleMic = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); setIsMicActive(false); return; }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setTrackConstraintWarning('Riconoscimento vocale non disponibile in questo browser. Usa la console comandi.'); return; }
    const recognition = new Recognition(); recognitionRef.current=recognition; recognition.lang = 'it-IT';
    recognition.onresult = (event: any) => handleSendPrompt(event.results[0][0].transcript);
    recognition.onend = () => { recognitionRef.current=null; setIsMicActive(false); };
    recognition.onerror = () => { recognitionRef.current=null; setIsMicActive(false); setTrackConstraintWarning('Microfono non disponibile o accesso negato.'); };
    recognition.start(); setIsMicActive(true);
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
        accept="video/*,audio/*,image/png,image/jpeg,image/webp,.mkv"
        multiple
        onChange={handleMediaFileImport}
        className="hidden"
      />

      {/* 1. Top Navigation Bar */}
      <TopNav
        hasSelection={clips.some(c=>c.id===selectedClipId || selectedClipIds.includes(c.id))}
        canUndo={historyCount>0}
        canRedo={historyIndexRef.current<historyRef.current.length-1}
        canPaste={Boolean(clipboardClip?.length)}
        claudeConnected={claudeConnected}
        onToggleClaude={handleToggleClaude}
        onOpenClaudeDialog={() => { setMcpProvider('claude'); handleOpenClaudeDialog(); }}
        onOpenChatGPT={() => { setMcpProvider('chatgpt'); setIsClaudeDialogOpen(true); }}
        onCut={handleCutClip}
        onDelete={() => handleDeleteClip()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopyClip}
        onPaste={handlePasteClip}
        onOpenProject={() => talFileInputRef.current?.click()}
        onImport={() => mediaFileInputRef.current?.click()}
        onSave={handleSaveTalProject}
        onExport={() => { setIsPlaying(false); setIsExportModalOpen(true); }}
        onAddMarker={() => handleAddMarker(currentTime)}
        markerCount={markers.length}
        activeTab={activeTab}
        setActiveTab={tab => setActiveTab(prev => prev===tab ? '' : tab)}
        onFullscreen={() => { const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); action.catch(() => setTrackConstraintWarning('Schermo intero non disponibile in questa finestra.')); }}
        isMicActive={isMicActive}
        onToggleMic={handleToggleMic}
      />

      <BGRemoverPanel open={activeTab==='BG Remover'} selected={selectedClip} onClose={()=>setActiveTab('')} onComplete={(asset,original)=>{
        setMediaAssets(prev=>[...prev,asset]);
        const next=clipsRef.current.map(c=>c.id===original.id && c.mediaUrl===original.mediaUrl && c.offset===original.offset && c.duration===original.duration?{...c,assetId:asset.id,mediaUrl:asset.fileUrl,mediaThumbnail:asset.thumbnailUrl,offset:0,name:asset.name}:c);
        if(next.some((c,i)=>c!==clipsRef.current[i])){setClips(next);clipsRef.current=next;pushHistory(next);}
      }}/>
      {activeTab && activeTab!=='BG Remover' && <EditingToolsPanel tab={activeTab} selected={selectedClip} onClose={() => setActiveTab('')}
        onUpdate={updates => { if (!selectedClipId) return; const next=clips.map(c=>c.id===selectedClipId?{...c,...updates}:c);setClips(next);clipsRef.current=next;pushHistory(next); }}
        onAddEffect={type=>handleAddEffect(type)}
        onCrossDissolve={duration => { try { const next=applyCrossDissolve(clips,selectedClipId || '',duration);setClips(next);clipsRef.current=next;pushHistory(next); } catch(error) {setTrackConstraintWarning((error as Error).message);} }}>
        <CaptionsPanel spokenLanguage={spokenLanguage} setSpokenLanguage={setSpokenLanguage} bilingualCaptions={bilingualCaptions} setBilingualCaptions={setBilingualCaptions} deleteCurrentCaptions={deleteCurrentCaptions} setDeleteCurrentCaptions={setDeleteCurrentCaptions} subtitles={subtitles} onGenerateCaptions={handleGenerateCaptions} onUpdateSubtitle={handleUpdateSubtitle} onDeleteSubtitle={handleDeleteSubtitle}/>
      </EditingToolsPanel>}

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
              clips={activeTimelineClips(clips, tracks)}
              subtitles={subtitles.map(s => bilingualCaptions && s.translation ? { ...s, text: `${s.text}\n${s.translation}` } : s)}
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
        provider={mcpProvider}
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
        subtitles={subtitles.map(s => bilingualCaptions && s.translation ? { ...s, text: `${s.text}\n${s.translation}` } : s)}
        aspectRatio={aspectRatio}
      />

      {/* Floating Track Constraint Warning Toast */}
      {trackConstraintWarning && (
        <div role="alert" onClick={() => setTrackConstraintWarning(null)} className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-[#4c0519] border-2 border-rose-500 text-rose-100 px-5 py-2.5 rounded-lg shadow-2xl z-50 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <span className="text-base">⛔</span>
          <span>{trackConstraintWarning}</span>
        </div>
      )}
    </div>
  );
}
