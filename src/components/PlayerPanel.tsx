import React, { useRef, useEffect, useState } from 'react';
import {
  Menu,
  Play,
  Pause,
  Maximize2,
  Volume2,
  VolumeX,
  RotateCcw,
  Square
} from 'lucide-react';
import { playbackEngine } from '../services/playbackEngine';
import { TimelineClip, SubtitleItem } from '../types/editor';

interface PlayerPanelProps {
  tracks?: import('../types/editor').Track[];
  audioMaster?:import('../services/audioMixer').AudioSettings;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  setAspectRatio: (ratio: '16:9' | '9:16' | '1:1' | '4:3') => void;
  clips: TimelineClip[];
  subtitles: SubtitleItem[];
  isMuted: boolean;
  onToggleMute: () => void;
}

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  tracks=[],audioMaster,
  currentTime,
  totalDuration,
  isPlaying,
  onTogglePlay,
  onSeek,
  aspectRatio,
  setAspectRatio,
  clips,
  subtitles,
  isMuted,
  onToggleMute,
}) => {
  const [menuOpen,setMenuOpen]=useState(false);
  const [playerError,setPlayerError]=useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const screenRef=useRef<HTMLDivElement>(null);
  const [screen,setScreen]=useState({width:640,height:360});
  useEffect(()=>{if(!screenRef.current)return;const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setScreen({width,height});});observer.observe(screenRef.current);return()=>observer.disconnect();},[]);
  const ratio=aspectRatio==='9:16'?9/16:aspectRatio==='1:1'?1:aspectRatio==='4:3'?4/3:16/9;
  const fittedWidth=Math.max(1,Math.min(screen.width,screen.height*ratio));

  // Formatter for 00:01:22:15 style timecode
  const formatFullTimecode = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Convert timeline clips to engine formats
  const videoClips = clips
    .filter(c => c.type === 'video')
    .map(c => ({
      id: c.id,trackId:c.trackId,
      name: c.name,speedLevel:c.speedLevel,
      transparency: c.transparency,
      effects: c.effects, adjustments: c.adjustments,colorGrade:c.colorGrade,
      volumeDb: c.volumeDb,
      fadeIn:c.fadeIn,fadeOut:c.fadeOut,
      layer: clips.indexOf(c),
      startTime: c.startTime,
      duration: c.duration,
      offset: c.offset,
      mediaUrl: c.mediaUrl,
      hasSeparateAudioClip: Boolean(c.linkedClipId) || clips.some(
        other => other.type === 'audio' && other.linkedClipId === c.id
      )
    }));

  const audioClips = clips
    .filter(c => c.type === 'audio')
    .map(c => ({
      id: c.id,trackId:c.trackId,
      name: c.name,speedLevel:c.speedLevel,
      volumeDb: c.volumeDb,
      fadeIn:c.fadeIn,fadeOut:c.fadeOut,
      startTime: c.startTime,
      duration: c.duration,
      offset: c.offset,
      mediaUrl: c.mediaUrl,
    }));

  const effectClips = clips
    .filter(c => c.type === 'effect')
    .map(c => ({
      id: c.id,trackId:c.trackId,
      name: c.name,speedLevel:c.speedLevel,
      fadeIn: c.fadeIn,
      fadeOut: c.fadeOut,
      startTime: c.startTime,
      duration: c.duration,
      intensity:c.intensity,speed:c.speed,offset:c.offset,effectSpan:c.effectSpan,
      effectType: c.effectType
    }));

  const imageClips = clips
    .filter(c => c.type === 'image')
    .map(c => ({
      id: c.id,trackId:c.trackId,
      name: c.name,speedLevel:c.speedLevel,
      transparency: c.transparency,
      effects: c.effects, adjustments: c.adjustments,colorGrade:c.colorGrade,
      volumeDb: c.volumeDb,
      fadeIn:c.fadeIn,fadeOut:c.fadeOut,
      layer: clips.indexOf(c),
      startTime: c.startTime,
      duration: c.duration,
      mediaUrl: c.mediaUrl,
    }));

  // Re-render when frames are ready from video elements
  useEffect(() => {
    playbackEngine.setOnFrameReady(() => {
      if (canvasRef.current) {
        playbackEngine.renderFrame(canvasRef.current, currentTime, videoClips, effectClips, imageClips, subtitles);
      }
    });
    return () => playbackEngine.setOnFrameReady(null);
  }, [currentTime, videoClips, effectClips, imageClips, subtitles]);

  // Prepare paused frames explicitly as well as listening for decoder events.
  useEffect(() => {
    let cancelled=false;
    playbackEngine.syncMedia(currentTime, isPlaying, videoClips, audioClips, isMuted, tracks,audioMaster);
    const canvas=canvasRef.current;
    if(canvas){
      if(isPlaying)playbackEngine.renderFrame(canvas,currentTime,videoClips,effectClips,imageClips,subtitles);
      else void playbackEngine.prepareAndRenderFrame(canvas,currentTime,videoClips,effectClips,imageClips,subtitles,()=>!cancelled);
    }
    return()=>{cancelled=true;};
  }, [currentTime, isPlaying, clips, subtitles, isMuted,tracks,audioMaster]);

  // Pause everything on unmount
  useEffect(() => {
    return () => {
      playbackEngine.pauseAll();
    };
  }, []);

  // Aspect ratio classes
  const aspectClass =
    aspectRatio === '16:9'
      ? 'aspect-video'
      : aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-56'
      : aspectRatio === '1:1'
      ? 'aspect-square max-h-56'
      : 'aspect-[4/3]';

  const toggleFullscreen = async () => {
    try {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
    } catch { setPlayerError('Schermo intero non disponibile in questa finestra.'); }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col min-h-0 min-w-0 h-full bg-[#111622] text-white border-r border-[#1e293b] select-none"
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[#1e293b] text-xs">
        <span className="font-semibold text-gray-300">Player</span>
        <div className="relative"><button aria-label="Opzioni player" aria-expanded={menuOpen} onClick={()=>setMenuOpen(p=>!p)}><Menu className="w-3.5 h-3.5"/></button>{menuOpen && <div className="absolute right-0 top-5 z-20 bg-slate-800 border border-slate-600 rounded w-44 p-2 space-y-2"><button className="block" onClick={()=>{onSeek(0);setMenuOpen(false);}}>Vai all’inizio</button><button className="block" onClick={()=>{void toggleFullscreen();setMenuOpen(false);}}>Apri schermo intero</button></div>}</div>
      </div>

      {playerError && <button role="alert" onClick={()=>setPlayerError('')} className="text-xs text-rose-300 p-2">{playerError}</button>}
      {/* Video Screen Area */}
      <div ref={screenRef} data-testid="player-screen" className="flex-1 min-h-0 min-w-0 flex items-center justify-center p-2 bg-[#0a0d14] relative overflow-hidden">
        <div data-testid="player-frame" style={{width:fittedWidth,height:fittedWidth/ratio}} className="relative shrink-0 flex items-center justify-center shadow-2xl rounded border border-[#1e293b] bg-black overflow-hidden">
          <canvas data-testid="player-canvas"
            ref={canvasRef}
            width={aspectRatio === '9:16' ? 360 : aspectRatio === '1:1' ? 360 : aspectRatio === '4:3' ? 480 : 640}
            height={aspectRatio === '9:16' ? 640 : 360}
            className="w-full h-full object-contain"
          />

          {/* Quick Play Overlay Button if Paused */}
          {!isPlaying && (
            <button
              aria-label={isPlaying ? 'Pausa anteprima' : 'Riproduci anteprima'}
              onClick={onTogglePlay}
              className="absolute w-12 h-12 rounded-full bg-cyan-600/80 hover:bg-cyan-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
            >
              <Play className="w-5 h-5 ml-1 fill-white" />
            </button>
          )}
        </div>
      </div>

      {/* Player Bottom Bar matching screenshot */}
      <div className="shrink-0 flex flex-wrap gap-2 items-center justify-between px-3 py-2 bg-[#121826] border-t border-[#1e293b] text-xs text-gray-300">
        {/* Timecodes */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-cyan-400 font-semibold">{formatFullTimecode(currentTime)}</span>
          <span className="text-gray-500">/</span>
          <span className="text-gray-400">{formatFullTimecode(totalDuration)}</span>
        </div>

        {/* Center Controls: Play / Pause */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSeek(0)}
            title="Torna all'inizio"
            className="text-gray-400 hover:text-white"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onTogglePlay}
            className="w-7 h-7 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center font-bold transition-all shadow-md"
            title={isPlaying ? 'Pausa (Spazio)' : 'Riproduci (Spazio)'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-black" />}
          </button>

          <button
            onClick={onToggleMute}
            className={`text-gray-400 hover:text-white ${isMuted ? 'text-rose-400' : ''}`}
            title={isMuted ? 'Attiva audio' : 'Muto'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Right Controls: Full, Ratio, Fullscreen */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleFullscreen}
            className="px-1.5 py-0.5 rounded border border-[#2d3748] hover:border-cyan-500 text-[10px] text-gray-300 hover:text-white"
          >
            Full
          </button>

          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-gray-400">Ratio</span>
            <select
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value as any)}
              className="bg-[#1b2233] border border-[#2d3748] rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:outline-none"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
            </select>
          </div>

          <button
            onClick={toggleFullscreen}
            title="Schermo Intero"
            className="text-gray-400 hover:text-white"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
