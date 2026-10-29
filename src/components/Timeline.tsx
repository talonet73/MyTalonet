import {clipRate,SPEED_PERCENTAGES} from '../services/clipSpeed';
import {AudioWaveform} from './AudioWaveform';
import {DraggableWindow} from './DraggableWindow';
import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip, Track, TimelineMarker, TrackType } from '../types/editor';
import {
  Plus,
  Minus,
  Flag,
  Trash2,
  X,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sliders,
  Link2,
  Unlink,
  Scissors,
  Copy
} from 'lucide-react';

interface TimelineProps {
  tracks: Track[];
  clips: TimelineClip[];
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  zoom: number; // pixels per second
  setZoom: (zoom: number) => void;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string | null, isMulti?: boolean) => void;
  onSelectMultipleClips?: (clipIds: string[]) => void;
  onUpdateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  onToggleTrackSolo: (trackId: string) => void;
  onToggleTrackMute: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onAddTrack: (type: TrackType, name: string) => void;
  onDuplicateTrack:(id:string)=>void;
  onChangeSpeed:(id:string,level:number)=>void;
  markers: TimelineMarker[];
  onAddMarker: (time: number) => void;
  onUpdateMarker: (marker: TimelineMarker) => void;
  onDeleteMarker: (markerId: string) => void;
  onResizeTrack:(id:string,height:number)=>void;
  onDropAsset?: (asset: any, trackId: string, time: number) => void;
  onCommitHistory?: () => void;
  onCutClip?: () => void;
  onDuplicateClip?: () => void;
  onDeleteClip?: (clipId?: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  tracks,
  clips,
  currentTime,
  totalDuration,
  selectedClipId,
  selectedClipIds = [],
  zoom,
  setZoom,
  onSeek,
  onSelectClip,
  onSelectMultipleClips,
  onUpdateClip,
  onToggleTrackSolo,
  onToggleTrackMute,
  onDeleteTrack,
  onAddTrack,onDuplicateTrack,onChangeSpeed,
  markers,
  onAddMarker,
  onUpdateMarker,
  onDeleteMarker,
  onDropAsset,onResizeTrack,
  onCommitHistory,
  onCutClip,
  onDuplicateClip,
  onDeleteClip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const lanesContainerRef = useRef<HTMLDivElement>(null);

  // Marquee drag selection box
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Dragging states
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Clip body move drag (supports moving paired video+audio clips in lockstep when linked)
  const [draggingClip, setDraggingClip] = useState<{
    id: string;
    startX: number;
    originalStartTime: number;
    linkedId?: string;
    linkedOriginalStartTime?: number;
  } | null>(null);

  // Clip trim edge resize drag (left or right)
  const [trimmingClip, setTrimmingClip] = useState<{
    id: string;
    edge: 'start' | 'end';
    startX: number;
    originalStartTime: number;
    originalDuration: number;
    originalOffset: number;
  } | null>(null);

  // Property handles drag (transparency, volume, fadeIn, fadeOut)
  const [draggingHandle, setDraggingHandle] = useState<{
    clipId: string;
    type: 'transparency' | 'volume' | 'fadeIn' | 'fadeOut';
    startY: number;
    startX: number;
    originalVal: number;
  } | null>(null);

  // Right-click Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clip: TimelineClip;
  } | null>(null);

  // Close context menu on global click or scroll
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose);
    };
  }, []);

  // Separate Video from Audio
  const handleSeparateVideoAudio = (clip: TimelineClip) => {
    if (!clip.linkedClipId) return;
    const paired = clips.find(c => c.id === clip.linkedClipId);
    onUpdateClip(clip.id, { isLinked: false });
    if (paired) {
      onUpdateClip(paired.id, { isLinked: false });
    }
    if (onCommitHistory) onCommitHistory();
  };

  const linkCandidate = (clip: TimelineClip) => clips.find(c=>c.id===clip.linkedClipId && c.type!==clip.type && ['video','audio'].includes(c.type)) || clips.find(c=>c.type===(clip.type==='video'?'audio':'video') && c.mediaUrl===clip.mediaUrl && Math.abs(c.startTime-clip.startTime)<.1);
  const handleLinkVideoAudio = (clip: TimelineClip) => {
    const paired=linkCandidate(clip);
    if(paired) {
      onUpdateClip(clip.id,{isLinked:true,linkedClipId:paired.id});
      onUpdateClip(paired.id,{isLinked:true,linkedClipId:clip.id,startTime:clip.startTime});
      if(onCommitHistory)onCommitHistory();
    }
  };

  // Modals & popovers
  const [speedClip,setSpeedClip]=useState<TimelineClip|null>(null);
  const [speedLevel,setSpeedLevel]=useState(0);
  const [verticalZoom,setVerticalZoom]=useState(1);
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [newTrackType, setNewTrackType] = useState<TrackType>('video');
  const [newTrackName, setNewTrackName] = useState('');
  const [activeMarkerEdit, setActiveMarkerEdit] = useState<TimelineMarker | null>(null);

  // Fixed heights for 100% strict alignment between track headers and timeline lanes
  const HEADER_RULER_HEIGHT = 36; // px
  const [viewportHeight,setViewportHeight]=useState(360);
  useEffect(()=>{if(!containerRef.current)return;const observer=new ResizeObserver(entries=>setViewportHeight(entries[0].contentRect.height));observer.observe(containerRef.current);return()=>observer.disconnect();},[]);
  const density=Math.max(.4,Math.min(1,(viewportHeight-72)/300));
  const rowHeight=(track:Track)=>Math.max(24,(track.height || 58)*density*verticalZoom);
  const trackResize=useRef<{id:string;y:number;height:number}|null>(null);

  const durationSec = Math.max(totalDuration, 60);
  const timelinePixelWidth = durationSec * zoom;

  // Sync vertical scroll between headers and lanes
  const handleLanesScroll = () => {
    if (lanesRef.current && headersRef.current) {
      headersRef.current.scrollTop = lanesRef.current.scrollTop;
    }
  };

  // A non-passive listener stops the browser page zoom inside the timeline.
  const viewRef=useRef({zoom,verticalZoom,density,tracks});viewRef.current={zoom,verticalZoom,density,tracks};
  useEffect(()=>{
    const container=containerRef.current;if(!container)return;let frame=0;
    const wheel=(event:WheelEvent)=>{
      if((event.target as Element).closest('[role="dialog"],[data-draggable-window]'))return;
      const lanes=lanesRef.current;if(!lanes)return;
      const delta=(event.deltaY || event.deltaX)*(event.deltaMode===1?16:event.deltaMode===2?lanes.clientHeight:1);
      if(!delta)return;
      if(!event.ctrlKey){if(headersRef.current?.contains(event.target as Node)){event.preventDefault();lanes.scrollTop+=delta;handleLanesScroll();}return;}
      event.preventDefault();event.stopPropagation();
      const view=viewRef.current,factor=Math.exp(-Math.max(-500,Math.min(500,delta))/500);
      const nextZoom=Math.max(5,Math.min(480,Math.round(view.zoom*factor))),nextVertical=Math.max(.25,Math.min(4,view.verticalZoom*factor));
      const rect=lanes.getBoundingClientRect(),x=Math.max(0,Math.min(lanes.clientWidth,event.clientX-rect.left)),y=Math.max(0,event.clientY-rect.top);
      const left=(lanes.scrollLeft+x)/view.zoom*nextZoom-x;
      const sourceY=Math.max(0,lanes.scrollTop+y-HEADER_RULER_HEIGHT);
      let remaining=sourceY,trackIndex=0,top=0;
      while(trackIndex<view.tracks.length-1 && remaining>=Math.max(24,(view.tracks[trackIndex].height||58)*view.density*view.verticalZoom)){remaining-=Math.max(24,(view.tracks[trackIndex].height||58)*view.density*view.verticalZoom);trackIndex++;}
      for(let i=0;i<trackIndex;i++)top+=Math.max(24,(view.tracks[i].height||58)*view.density*nextVertical);
      const oldHeight=Math.max(24,(view.tracks[trackIndex]?.height||58)*view.density*view.verticalZoom),newHeight=Math.max(24,(view.tracks[trackIndex]?.height||58)*view.density*nextVertical);
      const scrollTop=HEADER_RULER_HEIGHT+top+remaining/oldHeight*newHeight-y;
      viewRef.current={...view,zoom:nextZoom,verticalZoom:nextVertical};setZoom(nextZoom);setVerticalZoom(nextVertical);
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{lanes.scrollLeft=Math.max(0,left);lanes.scrollTop=Math.max(0,scrollTop);handleLanesScroll();});
    };
    container.addEventListener('wheel',wheel,{passive:false});return()=>{container.removeEventListener('wheel',wheel);cancelAnimationFrame(frame);};
  },[setZoom]);

  // Global mouse move & up listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. Playhead scrubbing
      if (isScrubbing && lanesRef.current) {
        const rect = lanesRef.current.getBoundingClientRect();
        const scrollLeft = lanesRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft;
        const newTime = Math.max(0, Math.min(durationSec, clickX / zoom));
        onSeek(Math.round(newTime * 10) / 10);
      }

      // 2. Moving whole clip horizontally (moves paired linked clip simultaneously if linked!)
      if (draggingClip) {
        const deltaX = e.clientX - draggingClip.startX;
        const deltaTime = deltaX / zoom;
        const newStartTime = Math.max(0, draggingClip.originalStartTime + deltaTime);
        const actualDelta = newStartTime - draggingClip.originalStartTime;
        onUpdateClip(draggingClip.id, { startTime: Math.round(newStartTime * 10) / 10 });

        if (draggingClip.linkedId && draggingClip.linkedOriginalStartTime !== undefined) {
          const linkedNewStart = Math.max(0, draggingClip.linkedOriginalStartTime + actualDelta);
          onUpdateClip(draggingClip.linkedId, { startTime: Math.round(linkedNewStart * 10) / 10 });
        }
      }

      // 3. Trimming clip from left or right edge
      if (trimmingClip) {
        const deltaX = (e.clientX - trimmingClip.startX) / zoom;
        if (trimmingClip.edge === 'start') {
          // Adjust start time & duration
          const sourceClip=clips.find(c=>c.id===trimmingClip.id);
          const hasSourceTime=sourceClip && ['video','audio','effect'].includes(sourceClip.type);
          const maxLeftShift = hasSourceTime ? Math.min(trimmingClip.originalStartTime,trimmingClip.originalOffset/clipRate(sourceClip!)) : trimmingClip.originalStartTime;
          const maxRightShift = trimmingClip.originalDuration - .04; // at least 0.5s duration
          const clampedDelta = Math.max(-maxLeftShift, Math.min(maxRightShift, deltaX));
          const newStart = Math.round((trimmingClip.originalStartTime + clampedDelta) * 1e6) / 1e6;
          const newDuration = Math.round((trimmingClip.originalDuration - clampedDelta) * 1e6) / 1e6;
          onUpdateClip(trimmingClip.id, { startTime: newStart, duration: newDuration, ...(hasSourceTime?{offset:Math.max(0,Math.round((trimmingClip.originalOffset+clampedDelta*clipRate(sourceClip!))*1e6)/1e6)}:{}) });
        } else {
          // Adjust duration from right
          const newDuration = Math.max(.04, Math.round((trimmingClip.originalDuration + deltaX) * 1e6) / 1e6);
          onUpdateClip(trimmingClip.id, { duration: newDuration });
        }
      }

      // 4. Moving clip properties handles
      if (draggingHandle) {
        const { clipId, type, startY, startX, originalVal } = draggingHandle;
        const currentClip = clips.find(c => c.id === clipId);
        if (!currentClip) return;

        if (type === 'transparency') {
          const deltaY = startY - e.clientY;
          const deltaPercent = Math.round(deltaY * 1.5);
          const newVal = Math.min(100, Math.max(0, originalVal + deltaPercent));
          onUpdateClip(clipId, { transparency: newVal });
        } else if (type === 'volume') {
          const deltaY = startY - e.clientY;
          const deltaDb = Math.round((deltaY / 2) * 10) / 10;
          const newVal = Math.min(12, Math.max(-60, Math.round((originalVal + deltaDb) * 10) / 10));
          onUpdateClip(clipId, { volumeDb: newVal });
        } else if (type === 'fadeIn') {
          const deltaX = (e.clientX - startX) / zoom;
          const newVal = Math.min(currentClip.duration / 2, Math.max(0, originalVal + deltaX));
          onUpdateClip(clipId, { fadeIn: Math.round(newVal * 10) / 10 });
        } else if (type === 'fadeOut') {
          const deltaX = (startX - e.clientX) / zoom;
          const newVal = Math.min(currentClip.duration / 2, Math.max(0, originalVal + deltaX));
          onUpdateClip(clipId, { fadeOut: Math.round(newVal * 10) / 10 });
        }
      }

      // 5. Marquee rubber-band box selection
      if (selectionBox) {
        if (!lanesContainerRef.current) return;
        const rect = lanesContainerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        setSelectionBox(prev => (prev ? { ...prev, currentX, currentY } : null));

        const minX = Math.min(selectionBox.startX, currentX);
        const maxX = Math.max(selectionBox.startX, currentX);
        const minY = Math.min(selectionBox.startY, currentY);
        const maxY = Math.max(selectionBox.startY, currentY);

        if (Math.abs(maxX - minX) > 6 || Math.abs(maxY - minY) > 6) {
          const intersected = clips.filter(clip => {
            const clipLeft = clip.startTime * zoom;
            const clipRight = clipLeft + Math.max(35, clip.duration * zoom);
            const trackIdx = tracks.findIndex(t => t.id === clip.trackId);
            if (trackIdx === -1) return false;
            const trackTop = tracks.slice(0,trackIdx).reduce((sum,t)=>sum+rowHeight(t),0);
            const trackBottom = trackTop + rowHeight(tracks[trackIdx]);

            return clipLeft <= maxX && clipRight >= minX && trackTop <= maxY && trackBottom >= minY;
          }).map(c => c.id);

          if (onSelectMultipleClips) {
            onSelectMultipleClips(intersected);
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (draggingClip || trimmingClip || draggingHandle) {
        if (onCommitHistory) {
          onCommitHistory();
        }
      }
      setIsScrubbing(false);
      setDraggingClip(null);
      setTrimmingClip(null);
      setDraggingHandle(null);
      setSelectionBox(null);
    };

    if (isScrubbing || draggingClip || trimmingClip || draggingHandle || selectionBox) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, draggingClip, trimmingClip, draggingHandle, selectionBox, zoom, durationSec, density, onSeek, onUpdateClip, clips, tracks, onSelectMultipleClips]);

  // Handle CTRL + Mouse Wheel to zoom in / zoom out
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoom(Math.min(60, zoom + 3));
        } else if (e.deltaY > 0) {
          setZoom(Math.max(8, zoom - 3));
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, setZoom]);

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (!lanesRef.current) return;
    setIsScrubbing(true);
    const rect = lanesRef.current.getBoundingClientRect();
    const scrollLeft = lanesRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(durationSec, clickX / zoom));
    onSeek(Math.round(newTime * 10) / 10);
  };

  // Generate ruler markers every 5 seconds
  const rulerTicks = [];
  for (let s = 0; s <= durationSec; s += 5) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const label = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    rulerTicks.push({ time: s, label });
  }

  const playheadX = currentTime * zoom;

  const handleConfirmAddTrack = () => {
    const autoName =
      newTrackName.trim() ||
      `${newTrackType==='text'?'TESTO':newTrackType.toUpperCase()} ${(tracks.filter(t => t.type === newTrackType).length + 1)
        .toString()
        .padStart(2, '0')}`;
    onAddTrack(newTrackType, autoName);
    setIsAddTrackOpen(false);
    setNewTrackName('');
  };

  return (
    <div
      ref={containerRef}
      data-testid="timeline"
      className="flex flex-col bg-[#0b0e17] text-white select-none h-full relative"
    >
      {/* Timeline Rows Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Track Headers Column */}
        <div
          ref={headersRef}
          data-testid="timeline-headers"
          onScroll={()=>{const headers=headersRef.current,lanes=lanesRef.current;if(headers && lanes && Math.abs(headers.scrollTop-lanes.scrollTop)>1){lanes.scrollTop=headers.scrollTop;headers.scrollTop=lanes.scrollTop;}}}
          className="w-44 shrink-0 flex flex-col bg-[#0d111c] border-r border-[#1e293b] z-20 shadow-lg overflow-y-hidden"
        >
          {/* Header Corner aligned with ruler */}
          <div
            style={{ height: `${HEADER_RULER_HEIGHT}px` }}
            className="shrink-0 border-b border-[#1b2233] flex items-center justify-between px-2 bg-[#090d14] text-[10px] text-gray-400 font-mono box-border"
          >
            <span className="font-bold tracking-wider">TRACKS</span>
            <button
              onClick={() => setIsAddTrackOpen(true)}
              className="w-5 h-5 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white flex items-center justify-center transition-colors"
              title="Aggiungi una nuova traccia audio, video, effetto o immagine"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Track Headers with matching strict height */}
          {tracks.map(track => {
            const isEffects = track.type === 'effect';
            const isVideo = track.type === 'video';
            const isAudio = track.type === 'audio';
            const isImage = track.type === 'image';

            const headerStyle = track.type==='text' ? 'bg-orange-950 text-orange-200 border-orange-700' : isEffects
              ? 'bg-[#3b171e] text-rose-200 border-rose-900/50'
              : isVideo
              ? 'bg-[#0f2844] text-blue-200 border-blue-900/50'
              : isAudio
              ? 'bg-[#0c3222] text-emerald-200 border-emerald-900/50'
              : 'bg-[#382a08] text-amber-200 border-amber-900/50';

            return (
              <div
                key={track.id}
                data-track-header={track.id}
                style={{ height: `${rowHeight(track)}px`,'--track-row-height':`${rowHeight(track)}px` } as React.CSSProperties}
                className={`relative shrink-0 border-b border-[#1b2233] px-2 flex items-center justify-between box-border ${headerStyle}`}
              >
                <div role="separator" aria-orientation="horizontal" title={`Ridimensiona pista ${track.name}`} data-track-resize={track.id} className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-white/10 hover:bg-cyan-400 z-30"
                  onPointerDown={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);trackResize.current={id:track.id,y:e.clientY,height:track.height||58};}}
                  onPointerMove={e=>{const d=trackResize.current;if(d)onResizeTrack(d.id,Math.max(32,Math.min(360,d.height+(e.clientY-d.y)/(density*verticalZoom))));}}
                  onPointerUp={e=>{trackResize.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{trackResize.current=null;}}/>
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-bold text-[11px] truncate tracking-wide">
                    {track.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-white/50 font-mono">
                    {track.type}
                  </span>
                </div>

                {/* Pista duplicata con tutti i suoi mattoncini. */}

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={()=>onDuplicateTrack(track.id)} title={`Duplica pista "${track.name}"`} className="w-5 h-5 rounded border border-slate-600 text-gray-300 hover:bg-slate-700 flex items-center justify-center"><Copy className="w-3 h-3"/></button>
                  <button
                    onClick={() => onToggleTrackSolo(track.id)}
                    className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center ${
                      track.isSolo
                        ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                        : 'border-[#2f3e58] text-gray-300 hover:bg-[#1a2538]'
                    }`}
                    title="Solo pista"
                  >
                    S
                  </button>
                  <button
                    onClick={() => onToggleTrackMute(track.id)}
                    className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center ${
                      track.isMuted
                        ? 'bg-rose-500 text-white border-rose-400 shadow-sm'
                        : 'border-[#2f3e58] text-gray-300 hover:bg-[#1a2538]'
                    }`}
                    title="Muto pista"
                  >
                    M
                  </button>
                  <button
                    onClick={() => onDeleteTrack(track.id)}
                    className="w-5 h-5 rounded text-[10px] border border-[#2f3e58] text-gray-400 hover:text-rose-300 hover:border-rose-500 hover:bg-rose-950/60 flex items-center justify-center transition-colors"
                    title={`Elimina traccia "${track.name}"`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Quick Add Track Button at bottom of headers list */}
          <div className="shrink-0 p-2 border-b border-[#1b2233]">
            <button
              onClick={() => setIsAddTrackOpen(true)}
              className="w-full py-1 rounded bg-[#162032] hover:bg-[#1f2d45] border border-[#273852] text-[10px] font-bold text-cyan-300 flex items-center justify-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Nuova Pista</span>
            </button>
          </div>
        </div>

        {/* Right Scrollable Timeline Lanes */}
        <div
          ref={lanesRef}
          data-testid="timeline-lanes"
          onScroll={handleLanesScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#090c14]"
        >
          {/* Canvas container matching total width */}
          <div
            style={{ width: `${timelinePixelWidth}px`,minWidth:'100%' }}
            className="relative flex flex-col"
          >
            {/* Time Ruler */}
            <div
              style={{ height: `${HEADER_RULER_HEIGHT}px` }}
              onMouseDown={handleRulerMouseDown}
              className="border-b border-[#1e293b] bg-[#0c101a] relative cursor-pointer box-border"
            >
              {/* Ruler seconds ticks */}
              {rulerTicks.map(m => (
                <div
                  key={m.time}
                  style={{ left: `${m.time * zoom}px` }}
                  className="absolute top-0 bottom-0 flex flex-col items-start justify-end pb-1 border-l border-[#242f45] pl-1 pointer-events-none"
                >
                  <span className="text-[10px] font-mono text-gray-400 leading-none">
                    {m.label}
                  </span>
                </div>
              ))}

              {/* Real Marker flags displayed on ruler */}
              {markers.map(marker => (
                <div
                  key={marker.id}
                  style={{ left: `${marker.time * zoom}px` }}
                  onMouseDown={e=>e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onSeek(marker.time);
                    setActiveMarkerEdit(marker);
                  }}
                  className="absolute top-0 bottom-0 flex flex-col items-center cursor-pointer group z-50 -translate-x-1/2"
                  title={`${marker.name}: ${marker.description || 'Clicca per modificare la descrizione'}`}
                >
                  <div
                    style={{ backgroundColor: marker.color || '#f59e0b' }}
                    className="w-4 h-4 rounded-sm shadow-md flex items-center justify-center text-black font-extrabold text-[9px] group-hover:scale-125 transition-transform"
                  >
                    🚩
                  </div>
                  <div className="w-[1.5px] flex-1 bg-amber-400 opacity-80" />
                  <span className="absolute top-4 left-3 bg-[#0f172a] border border-amber-400/60 px-1 py-0.2 rounded text-[9px] font-mono text-amber-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-lg">
                    {marker.name} ({marker.time.toFixed(1)}s)
                  </span>
                </div>
              ))}
            </div>

            {/* Track Lanes with matching strict height */}
            <div ref={lanesContainerRef} className="relative">
              {/* Marquee selection box */}
              {selectionBox && Math.abs(selectionBox.currentX - selectionBox.startX) > 4 && (
                <div
                  className="absolute border-2 border-cyan-400 bg-cyan-500/20 z-40 pointer-events-none rounded"
                  style={{
                    left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                    top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                    width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                    height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
                  }}
                />
              )}

              {/* Floating Multi-Selection Badge */}
              {selectedClipIds && selectedClipIds.length > 1 && (
                <div className="absolute top-2 right-4 z-40 bg-[#162135] border border-cyan-400 text-cyan-200 px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs animate-in fade-in">
                  <span className="font-bold text-cyan-300">
                    {selectedClipIds.length} mattoncini selezionati
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    (Premi CANC per eliminarli)
                  </span>
                  <button
                    onClick={() => onDeleteClip && onDeleteClip()}
                    title="Elimina tutti i mattoncini selezionati (CANC)"
                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 shadow cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Elimina</span>
                  </button>
                </div>
              )}

              {tracks.map(track => {
                const trackClips = clips.filter(c => c.trackId === track.id);
                return (
                  <div
                    key={track.id}
                    data-track-id={track.id}
                    style={{ height: `${rowHeight(track)}px`,'--track-row-height':`${rowHeight(track)}px` } as React.CSSProperties}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      try {
                        const raw = e.dataTransfer.getData('application/json');
                        if (!raw) return;
                        const asset = JSON.parse(raw);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const scrollLeft = lanesRef.current ? lanesRef.current.scrollLeft : 0;
                        const dropX = e.clientX - rect.left + scrollLeft;
                        const dropTime = Math.max(0, Math.round((dropX / zoom) * 10) / 10);
                        if (onDropAsset) {
                          onDropAsset(asset, track.id, dropTime);
                        }
                      } catch (err) {
                        console.error('Error handling dropped asset on track:', err);
                      }
                    }}
                    onMouseDown={e => {
                      if (e.button !== 0) return;
                      if (e.target === e.currentTarget) {
                        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                          onSelectClip(null);
                        }
                        if (lanesContainerRef.current) {
                          const rect = lanesContainerRef.current.getBoundingClientRect();
                          const scrollLeft = lanesRef.current ? lanesRef.current.scrollLeft : 0;
                          const startX = e.clientX - rect.left + scrollLeft;
                          const startY = e.clientY - rect.top;
                          setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
                        }
                      }
                    }}
                    onContextMenu={e => {
                      if (e.target === e.currentTarget) {
                        // Se l'utente clicca col tasto destro sulla corsia della traccia
                        const unlinkedClip = trackClips.find(c => !c.isLinked && (c.type === 'video' || c.type === 'audio'));
                        if (unlinkedClip) {
                          e.preventDefault();
                          onSelectClip(unlinkedClip.id);
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            clip: unlinkedClip,
                          });
                        }
                      }
                    }}
                    className="border-b border-[#161d2d] relative bg-[#0c101a]/50 box-border"
                  >
                    {/* Render clips on this track */}
                    {trackClips.map(clip => {
                      const isSelected = (selectedClipIds && selectedClipIds.length > 0)
                        ? selectedClipIds.includes(clip.id)
                        : selectedClipId === clip.id;
                      const clipLeft = clip.startTime * zoom;
                      const clipWidth = Math.max(35, clip.duration * zoom);

                      if(clip.type==='text')return <div key={clip.id} data-clip-id={clip.id} style={{left:clipLeft,width:clipWidth}} className={`absolute top-1 bottom-1 rounded bg-orange-500 text-black p-1.5 cursor-grab overflow-hidden ${isSelected?'ring-2 ring-cyan-300 z-30':''}`}
                        onClick={e=>{e.stopPropagation();onSelectClip(clip.id,e.shiftKey||e.ctrlKey||e.metaKey);}}
                        onMouseDown={e=>{if(e.button!==0)return;e.stopPropagation();onSelectClip(clip.id);setDraggingClip({id:clip.id,startX:e.clientX,originalStartTime:clip.startTime});}}
                        onContextMenu={e=>{e.preventDefault();e.stopPropagation();onSelectClip(clip.id);setContextMenu({x:e.clientX,y:e.clientY,clip});}}>
                        <span className="text-xs font-bold whitespace-pre">{clip.text || clip.name}</span>
                        {(['start','end'] as const).map(edge=><div key={edge} data-handle={`trim-${edge}`} title={edge==='start'?"Trascina per accorciare o allungare dall'inizio":"Trascina per accorciare o allungare dalla fine"} className={`absolute top-0 bottom-0 w-2 cursor-ew-resize bg-black/20 hover:bg-white ${edge==='start'?'left-0':'right-0'}`} onMouseDown={e=>{e.stopPropagation();setTrimmingClip({id:clip.id,edge,startX:e.clientX,originalStartTime:clip.startTime,originalDuration:clip.duration,originalOffset:clip.offset || 0});}}/>)}
                      </div>;
                      // 1. EFFECTS TRACK (ROSSO)
                      if (clip.type === 'effect') {
                        const fadeInWidth = Math.min(clipWidth / 2, clip.fadeIn * zoom);
                        const fadeOutWidth = Math.min(clipWidth / 2, clip.fadeOut * zoom);

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            }}
                            onMouseDown={e => {
                              if (e.button !== 0) return;
                              if ((e.target as HTMLElement).dataset.handle) return;
                              e.stopPropagation();
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                onSelectClip(clip.id, true);
                              } else if (!isSelected) {
                                onSelectClip(clip.id, false);
                              }
                              setDraggingClip({
                                id: clip.id,
                                startX: e.clientX,
                                originalStartTime: clip.startTime,
                              });
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                clip,
                              });
                            }}
                            className={`group absolute top-1 bottom-1 rounded bg-[#cb5c5b] text-white p-1.5 cursor-pointer select-none flex flex-col justify-between overflow-visible shadow-md transition-all ${
                              isSelected
                                ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#1e141a] shadow-[0_0_15px_rgba(6,182,212,0.85)] z-30'
                                : 'hover:brightness-110'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute -top-2.5 right-1 bg-cyan-400 text-black font-extrabold text-[8px] px-1 py-0.2 rounded shadow pointer-events-none tracking-wider z-40">
                                SELEZIONATO
                              </span>
                            )}
                            {/* Edge trim handles for lengthening or shortening */}
                            <div
                              data-handle="trim-start"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'start',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-l"
                              title="Trascina per accorciare o allungare dall'inizio"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            <div
                              data-handle="trim-end"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'end',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-r"
                              title="Trascina per accorciare o allungare dalla fine"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            {/* Dissolvenza Curve visualization */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                              {fadeInWidth > 0 && (
                                <path
                                  d={`M 0 46 Q ${fadeInWidth * 0.5} 46, ${fadeInWidth} 0`}
                                  fill="none"
                                  stroke="rgba(255, 255, 255, 0.9)"
                                  strokeWidth="2"
                                  strokeDasharray="3,2"
                                />
                              )}
                              {fadeOutWidth > 0 && (
                                <path
                                  d={`M ${clipWidth - fadeOutWidth} 0 Q ${clipWidth - fadeOutWidth * 0.5} 46, ${clipWidth} 46`}
                                  fill="none"
                                  stroke="rgba(255, 255, 255, 0.9)"
                                  strokeWidth="2"
                                  strokeDasharray="3,2"
                                />
                              )}
                            </svg>

                            {/* Lateral vertical handles for Fade In & Fade Out */}
                            <div
                              data-handle="fadeIn"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDraggingHandle({
                                  clipId: clip.id,
                                  type: 'fadeIn',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  originalVal: clip.fadeIn,
                                });
                              }}
                              style={{ left: `${Math.max(6, fadeInWidth)}px` }}
                              title={`Fade In: ${clip.fadeIn.toFixed(1)}s (Trascina)`}
                              className="absolute top-0 w-3 h-full cursor-ew-resize flex items-center justify-center z-30"
                            >
                              <div className="w-2.5 h-2.5 bg-white rounded-full shadow border border-rose-900 hover:scale-125" />
                            </div>

                            <div
                              data-handle="fadeOut"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDraggingHandle({
                                  clipId: clip.id,
                                  type: 'fadeOut',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  originalVal: clip.fadeOut,
                                });
                              }}
                              style={{ right: `${Math.max(6, fadeOutWidth)}px` }}
                              title={`Fade Out: ${clip.fadeOut.toFixed(1)}s (Trascina)`}
                              className="absolute top-0 w-3 h-full cursor-ew-resize flex items-center justify-center z-30"
                            >
                              <div className="w-2.5 h-2.5 bg-white rounded-full shadow border border-rose-900 hover:scale-125" />
                            </div>

                            <div className="flex items-center justify-between text-[10px] font-bold text-white/95 z-10 pointer-events-none">
                              <span className="bg-black/50 px-1 py-0.2 rounded font-sans">
                                🎞 {clip.intensity ?? 5}/10 · {clip.speed ?? 5}/10
                              </span>
                            </div>

                            <span className="font-bold text-xs truncate z-10 pointer-events-none drop-shadow">
                              {clip.name}
                            </span>
                          </div>
                        );
                      }

                      // 2. VIDEO TRACK (BLU)
                      if (clip.type === 'video') {
                        const handleTopPercent = 100 - clip.transparency;

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            }}
                            onMouseDown={e => {
                              if (e.button !== 0) return;
                              if ((e.target as HTMLElement).dataset.handle) return;
                              e.stopPropagation();
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                onSelectClip(clip.id, true);
                              } else if (!isSelected) {
                                onSelectClip(clip.id, false);
                              }
                              const paired = clip.isLinked && clip.linkedClipId ? clips.find(c => c.id === clip.linkedClipId) : undefined;
                              setDraggingClip({
                                id: clip.id,
                                startX: e.clientX,
                                originalStartTime: clip.startTime,
                                linkedId: paired ? paired.id : undefined,
                                linkedOriginalStartTime: paired ? paired.startTime : undefined,
                              });
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                clip,
                              });
                            }}
                            className={`group absolute top-1 bottom-1 rounded bg-[#2563eb] text-white p-1.5 cursor-pointer select-none flex flex-col justify-between overflow-visible shadow-md transition-all ${
                              isSelected
                                ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#111d2e] shadow-[0_0_15px_rgba(6,182,212,0.85)] z-30'
                                : 'hover:brightness-110'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute -top-2.5 right-1 bg-cyan-400 text-black font-extrabold text-[8px] px-1 py-0.2 rounded shadow pointer-events-none tracking-wider z-40">
                                SELEZIONATO
                              </span>
                            )}
                            {/* Edge trim handles */}
                            <div
                              data-handle="trim-start"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'start',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-l"
                              title="Trascina per accorciare o allungare dall'inizio"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            <div
                              data-handle="trim-end"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'end',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-r"
                              title="Trascina per accorciare o allungare dalla fine"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            {/* Horizontal Handle for TRASPARENZA */}
                            <div
                              data-handle="transparency"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDraggingHandle({
                                  clipId: clip.id,
                                  type: 'transparency',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  originalVal: clip.transparency,
                                });
                              }}
                              style={{ top: `${Math.min(rowHeight(track)-16, Math.max(4, (handleTopPercent / 100) * Math.max(8,rowHeight(track)-20)))}px` }}
                              title={`Trasparenza: ${clip.transparency}% (Trascina in alto/basso)`}
                              className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize flex items-center justify-between px-1 z-30 group/handle"
                            >
                              <div className="w-full h-0.5 bg-white/90 shadow group-hover/handle:h-1 transition-all" />
                              <div className="absolute right-1 flex items-center gap-1 bg-[#1e293b] px-1.5 py-0.5 rounded shadow text-[9px] font-mono font-bold text-white whitespace-nowrap border border-white/40">
                                <div className="w-2 h-2 rounded-full bg-cyan-400 group-hover/handle:scale-125" />
                                <span>TRASPARENZA {clip.transparency}%</span>
                              </div>
                            </div>

                            <div className="z-10 pointer-events-none flex flex-col">
                              <div className="font-bold text-xs truncate leading-tight drop-shadow flex items-center gap-1">
                                <span className="truncate">{clip.name}</span>
                                {clip.isLinked && (
                                  <span className="text-[8px] bg-blue-950/80 border border-blue-400/40 text-blue-200 px-1 py-0.2 rounded font-sans flex items-center gap-0.5 shrink-0">
                                    🔗 Link
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] uppercase tracking-wider text-blue-200 font-semibold">
                                VIDEO
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // 3. AUDIO TRACK (VERDE)
                      if (clip.type === 'audio') {
                        const norm = Math.min(1, Math.max(0, (clip.volumeDb + 60) / 72));
                        const handleTopPercent = (1 - norm) * 100;

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            }}
                            onMouseDown={e => {
                              if (e.button !== 0) return;
                              if ((e.target as HTMLElement).dataset.handle) return;
                              e.stopPropagation();
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                onSelectClip(clip.id, true);
                              } else if (!isSelected) {
                                onSelectClip(clip.id, false);
                              }
                              const paired = clip.isLinked && clip.linkedClipId ? clips.find(c => c.id === clip.linkedClipId) : undefined;
                              setDraggingClip({
                                id: clip.id,
                                startX: e.clientX,
                                originalStartTime: clip.startTime,
                                linkedId: paired ? paired.id : undefined,
                                linkedOriginalStartTime: paired ? paired.startTime : undefined,
                              });
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                clip,
                              });
                            }}
                            className={`group absolute top-1 bottom-1 rounded bg-[#10b981] text-black p-1.5 cursor-pointer select-none flex flex-col justify-between overflow-visible shadow-md transition-all ${
                              isSelected
                                ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#10251e] shadow-[0_0_15px_rgba(6,182,212,0.85)] z-30'
                                : 'hover:brightness-110'
                            }`}
                          >
                            <AudioWaveform url={clip.mediaUrl} offset={clip.offset || 0} duration={clip.duration} speedLevel={clip.speedLevel}/>
                            {isSelected && (
                              <span className="absolute -top-2.5 right-1 bg-cyan-400 text-black font-extrabold text-[8px] px-1 py-0.2 rounded shadow pointer-events-none tracking-wider z-40">
                                SELEZIONATO
                              </span>
                            )}
                            {/* Edge trim handles */}
                            <div
                              data-handle="trim-start"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'start',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-l"
                              title="Trascina per accorciare o allungare dall'inizio"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            <div
                              data-handle="trim-end"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'end',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-white text-black opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-r"
                              title="Trascina per accorciare o allungare dalla fine"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            {/* Horizontal Handle for VOLUME */}
                            <div
                              data-handle="volume"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDraggingHandle({
                                  clipId: clip.id,
                                  type: 'volume',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  originalVal: clip.volumeDb,
                                });
                              }}
                              style={{ top: `${Math.min(rowHeight(track)-16, Math.max(4, (handleTopPercent / 100) * Math.max(8,rowHeight(track)-20)))}px` }}
                              title={`Volume: ${clip.volumeDb >= 0 ? `+${clip.volumeDb}` : clip.volumeDb} dB`}
                              className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize flex items-center justify-between px-1 z-30 group/handle"
                            >
                              <div className="w-full h-0.5 bg-white/90 shadow group-hover/handle:h-1 transition-all" />
                              <div className="absolute right-1 flex items-center gap-1 bg-[#064e3b] px-1.5 py-0.5 rounded shadow text-[9px] font-mono font-bold text-white whitespace-nowrap border border-white/40">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 group-hover/handle:scale-125" />
                                <span>
                                  VOLUME {clip.volumeDb >= 0 ? `+${clip.volumeDb}` : clip.volumeDb} dB
                                </span>
                              </div>
                            </div>

                            <div className="z-10 pointer-events-none flex flex-col">
                              <div className="font-bold text-xs truncate leading-tight text-white drop-shadow flex items-center gap-1">
                                <span className="truncate">{clip.name}</span>
                                {clip.isLinked && (
                                  <span className="text-[8px] bg-emerald-950/90 border border-emerald-400/50 text-emerald-200 px-1 py-0.2 rounded font-sans flex items-center gap-0.5 shrink-0">
                                    🔗 Link
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] uppercase tracking-wider text-emerald-950 font-extrabold">
                                AUDIO
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // 4. IMMAGINI TRACK (GIALLO)
                      if (clip.type === 'image') {
                        const handleTopPercent = 100 - clip.transparency;

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
                            }}
                            onMouseDown={e => {
                              if (e.button !== 0) return;
                              if ((e.target as HTMLElement).dataset.handle) return;
                              e.stopPropagation();
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                onSelectClip(clip.id, true);
                              } else if (!isSelected) {
                                onSelectClip(clip.id, false);
                              }
                              setDraggingClip({
                                id: clip.id,
                                startX: e.clientX,
                                originalStartTime: clip.startTime,
                              });
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                clip,
                              });
                            }}
                            className={`group absolute top-1 bottom-1 rounded bg-[#eab308] text-black p-1.5 cursor-pointer select-none flex flex-col justify-between overflow-visible shadow-md transition-all ${
                              isSelected
                                ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#10251e] shadow-[0_0_15px_rgba(6,182,212,0.85)] z-30'
                                : 'hover:brightness-110'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute -top-2.5 right-1 bg-cyan-400 text-black font-extrabold text-[8px] px-1 py-0.2 rounded shadow pointer-events-none tracking-wider z-40">
                                SELEZIONATO
                              </span>
                            )}
                            {/* Edge trim handles */}
                            <div
                              data-handle="trim-start"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'start',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-black text-white opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-l"
                              title="Trascina per accorciare o allungare dall'inizio"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            <div
                              data-handle="trim-end"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setTrimmingClip({
                                  id: clip.id,
                                  edge: 'end',
                                  startX: e.clientX,
                                  originalStartTime: clip.startTime,
                                  originalDuration: clip.duration,
                                  originalOffset: clip.offset || 0,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/40 hover:bg-black text-white opacity-0 group-hover:opacity-100 cursor-ew-resize flex items-center justify-center z-40 transition-opacity rounded-r"
                              title="Trascina per accorciare o allungare dalla fine"
                            >
                              <div className="w-0.5 h-4 bg-white rounded" />
                            </div>

                            {/* Horizontal Handle for TRASPARENZA */}
                            <div
                              data-handle="transparency"
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDraggingHandle({
                                  clipId: clip.id,
                                  type: 'transparency',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  originalVal: clip.transparency,
                                });
                              }}
                              style={{ top: `${Math.min(rowHeight(track)-16, Math.max(4, (handleTopPercent / 100) * Math.max(8,rowHeight(track)-20)))}px` }}
                              title={`Trasparenza: ${clip.transparency}%`}
                              className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize flex items-center justify-between px-1 z-30 group/handle"
                            >
                              <div className="w-full h-0.5 bg-black/80 shadow group-hover/handle:h-1 transition-all" />
                              <div className="absolute right-1 flex items-center gap-1 bg-[#713f12] px-1.5 py-0.5 rounded shadow text-[9px] font-mono font-bold text-white whitespace-nowrap border border-white/40">
                                <div className="w-2 h-2 rounded-full bg-amber-300 group-hover/handle:scale-125" />
                                <span>OPACITÀ {clip.transparency}%</span>
                              </div>
                            </div>

                            <div className="z-10 pointer-events-none">
                              <div className="font-extrabold text-xs truncate leading-tight text-black drop-shadow-sm">
                                {clip.name}
                              </div>
                              <span className="text-[9px] uppercase tracking-wider text-amber-950 font-black">
                                IMMAGINE
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                );
              })}

              {/* Draggable Playhead Needle & Handle */}
              <div
                style={{ left: `${playheadX}px` }}
                className="absolute top-0 bottom-0 w-[2px] bg-white z-40 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.9)]"
              >
                {/* Playhead Head Handle (Maniglietta) */}
                <div
                  onMouseDown={e => {
                    e.stopPropagation();
                    setIsScrubbing(true);
                  }}
                  className="absolute -top-7 -translate-x-1/2 w-8 h-7 bg-white text-black rounded-t-sm flex flex-col items-center justify-center font-mono text-[9px] font-extrabold shadow-2xl cursor-grab active:cursor-grabbing pointer-events-auto border-b-2 border-cyan-500 hover:scale-110 transition-transform"
                  title="Maniglietta del playhead: trascina per spostare il cursore"
                >
                  <GripVertical className="w-3.5 h-3.5 text-gray-700 -mb-1" />
                  <span>{Math.floor(currentTime)}s</span>
                  {/* Triangle needle tip */}
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-white -mb-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Zoom & Controls Bar */}
      <div className="h-8 bg-[#090c14] border-t border-[#1e293b] px-4 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onAddMarker(currentTime)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#162032] hover:bg-[#202d45] text-amber-300 border border-amber-500/30 text-[11px]"
            title="Aggiungi Marker al tempo corrente"
          >
            <Flag className="w-3 h-3 fill-amber-400" />
            <span>+ Aggiungi Marker a {currentTime.toFixed(1)}s</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400" title="Ctrl + rotella ingrandisce o riduce larghezza e altezza">Ctrl + rotella · Altezza {Math.round(verticalZoom*100)}%</span><span className="text-[11px] font-medium text-gray-300">Zoom</span>
          <button
            onClick={() => setZoom(Math.max(5, zoom - 5))}
            className="p-1 rounded bg-[#161f30] hover:bg-[#202b40] text-gray-200"
            title="Rimpicciolisci timeline"
          >
            <Minus className="w-3 h-3" />
          </button>

          <input
            type="range"
            aria-label="Zoom orizzontale timeline"
            min="5"
            max="480"
            value={zoom}
            onChange={e => setZoom(parseInt(e.target.value, 10))}
            className="w-32 accent-cyan-400 h-1 bg-[#253047] rounded cursor-pointer"
          />

          <button
            onClick={() => setZoom(Math.min(480, zoom + 5))}
            className="p-1 rounded bg-[#161f30] hover:bg-[#202b40] text-gray-200"
            title="Ingrandisci timeline"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {speedClip && <div role="dialog" aria-label="Velocità clip" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <DraggableWindow className="w-96 max-w-full rounded-xl border border-slate-600 bg-[#101625] p-4 shadow-xl">
          <header data-window-handle className="flex justify-between items-center border-b border-slate-700 pb-3"><strong>Velocità clip</strong><button aria-label="Chiudi velocità clip" onClick={()=>setSpeedClip(null)}><X size={18}/></button></header>
          <p className="my-3 text-xs text-gray-300">{speedClip.name}</p><label className="block text-sm">Livello {speedLevel>0?'+':''}{speedLevel} · <output>{SPEED_PERCENTAGES[speedLevel+5]}%</output><input aria-label="Livello velocità clip" type="range" min="-5" max="5" step="1" value={speedLevel} onChange={e=>setSpeedLevel(Number(e.target.value))} className="w-full mt-3 accent-cyan-400"/></label>
          <div className="flex justify-between text-[10px] text-gray-400"><span>−5 · 25%</span><span>0 · 100%</span><span>+5 · 400%</span></div>
          <p className="text-xs my-3 text-gray-400">La durata si adatta alla velocità. Video e audio collegato rimangono sincronizzati.</p>
          <div className="flex gap-2 justify-end"><button onClick={()=>setSpeedLevel(0)} className="p-2 border rounded border-slate-600">Ripristina 100%</button><button onClick={()=>setSpeedClip(null)} className="p-2">Annulla</button><button onClick={()=>{onChangeSpeed(speedClip.id,speedLevel);setSpeedClip(null);}} className="p-2 rounded bg-cyan-700">Applica velocità</button></div>
        </DraggableWindow>
      </div>}

      {/* Modal: Aggiungi Nuova Pista */}
      {isAddTrackOpen && (
        <div role="dialog" aria-label="Nuova traccia" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <DraggableWindow className="w-full max-w-sm bg-[#101625] border border-[#2d3b55] rounded-xl shadow-2xl p-4 text-white">
            <div data-window-handle className="flex items-center justify-between pb-2 border-b border-[#212d45] mb-3">
              <h4 className="font-bold text-sm text-cyan-300 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Aggiungi Nuova Pista
              </h4>
              <button aria-label="Chiudi nuova traccia" onClick={() => setIsAddTrackOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Seleziona Tipo di Pista:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTrackType('video')}
                    className={`p-2 rounded border text-left font-bold transition-all ${
                      newTrackType === 'video'
                        ? 'bg-blue-900/60 border-blue-400 text-blue-200 shadow'
                        : 'border-[#26354f] text-gray-400 hover:bg-[#162033]'
                    }`}
                  >
                    🔵 Video (Blu)
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewTrackType('audio')}
                    className={`p-2 rounded border text-left font-bold transition-all ${
                      newTrackType === 'audio'
                        ? 'bg-emerald-900/60 border-emerald-400 text-emerald-200 shadow'
                        : 'border-[#26354f] text-gray-400 hover:bg-[#162033]'
                    }`}
                  >
                    🟢 Audio (Verde)
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewTrackType('effect')}
                    className={`p-2 rounded border text-left font-bold transition-all ${
                      newTrackType === 'effect'
                        ? 'bg-rose-900/60 border-rose-400 text-rose-200 shadow'
                        : 'border-[#26354f] text-gray-400 hover:bg-[#162033]'
                    }`}
                  >
                    🔴 Effetti (Rosso)
                  </button>

                  <button type="button" onClick={()=>setNewTrackType('text')} className={`p-2 rounded border text-left font-bold ${newTrackType==='text'?'bg-orange-900 border-orange-400':'border-slate-600'}`}>🟠 Testo (Arancione)</button>
                  <button
                    type="button"
                    onClick={() => setNewTrackType('image')}
                    className={`p-2 rounded border text-left font-bold transition-all ${
                      newTrackType === 'image'
                        ? 'bg-amber-900/60 border-amber-400 text-amber-200 shadow'
                        : 'border-[#26354f] text-gray-400 hover:bg-[#162033]'
                    }`}
                  >
                    🟡 Immagini (Giallo)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Nome Pista (opzionale):
                </label>
                <input
                  type="text"
                  placeholder={`Es. ${newTrackType.toUpperCase()} 02`}
                  value={newTrackName}
                  onChange={e => setNewTrackName(e.target.value)}
                  className="w-full bg-[#182133] border border-[#2d3b55] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#212d45]">
                <button
                  type="button"
                  onClick={() => setIsAddTrackOpen(false)}
                  className="px-3 py-1.5 rounded bg-[#182133] hover:bg-[#202d45] text-gray-300 text-xs"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddTrack}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow"
                >
                  Aggiungi Pista
                </button>
              </div>
            </div>
          </DraggableWindow>
        </div>
      )}

      {/* Modal: Modifica / Descrizione Marker */}
      {activeMarkerEdit && (
        <div role="dialog" aria-label="Dettagli marker" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <DraggableWindow className="w-full max-w-sm bg-[#101625] border border-[#2d3b55] rounded-xl shadow-2xl p-4 text-white">
            <div data-window-handle className="flex items-center justify-between pb-2 border-b border-[#212d45] mb-3">
              <h4 className="font-bold text-sm text-amber-400 flex items-center gap-1.5">
                <Flag className="w-4 h-4 fill-amber-400" />
                Dettagli Marker ({activeMarkerEdit.time.toFixed(1)}s)
              </h4>
              <button aria-label="Chiudi marker" onClick={() => setActiveMarkerEdit(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Nome Marker:</label>
                <input
                  type="text"
                  value={activeMarkerEdit.name}
                  onChange={e => setActiveMarkerEdit({ ...activeMarkerEdit, name: e.target.value })}
                  className="w-full bg-[#182133] border border-[#2d3b55] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Descrizione / Note per il montaggio:
                </label>
                <textarea
                  rows={3}
                  value={activeMarkerEdit.description}
                  onChange={e => setActiveMarkerEdit({ ...activeMarkerEdit, description: e.target.value })}
                  placeholder="Scrivi qui la descrizione per questo punto della timeline..."
                  className="w-full bg-[#182133] border border-[#2d3b55] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Colore Bandierina:</label>
                <div className="flex gap-2">
                  {['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6'].map(col => (
                    <button
                      key={col}
                      aria-label={`Colore ${col}`}
                      type="button"
                      onClick={() => setActiveMarkerEdit({ ...activeMarkerEdit, color: col })}
                      style={{ backgroundColor: col }}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        activeMarkerEdit.color === col ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-[#212d45]">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMarker(activeMarkerEdit.id);
                    setActiveMarkerEdit(null);
                  }}
                  className="px-2.5 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveMarkerEdit(null)}
                    className="px-3 py-1.5 rounded bg-[#182133] hover:bg-[#202d45] text-gray-300 text-xs"
                  >
                    Chiudi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMarker(activeMarkerEdit);
                      setActiveMarkerEdit(null);
                    }}
                    className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow"
                  >
                    Salva Modifiche
                  </button>
                </div>
              </div>
            </div>
          </DraggableWindow>
        </div>
      )}

      {/* Right-Click Context Menu for Mattoncini (Separazione / Unione / Eliminazione) */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 240, Math.max(10, contextMenu.x))}px`,
            top: `${Math.min(window.innerHeight - 200, Math.max(10, contextMenu.y))}px`,
          }}
          className="z-50 bg-[#101726] border border-[#2b3a54] rounded-lg shadow-2xl p-1.5 text-xs text-white min-w-[220px] backdrop-blur-md animate-in fade-in select-none"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 border-b border-[#1f2b40] mb-1 font-semibold text-gray-300 text-[11px] truncate flex items-center justify-between">
            <span className="truncate max-w-[130px]" title={contextMenu.clip.name}>
              {contextMenu.clip.name}
            </span>
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#1c263b] text-cyan-300 font-mono">
              {contextMenu.clip.type}
            </span>
          </div>

          <button onClick={()=>{setSpeedClip(contextMenu.clip);setSpeedLevel(contextMenu.clip.speedLevel ?? 0);setContextMenu(null);}} className="w-full px-2.5 py-2 rounded text-left hover:bg-slate-700 flex justify-between"><span>Velocità clip…</span><span>{Math.round(clipRate(contextMenu.clip)*100)}%</span></button>
          {(contextMenu.clip.type === 'video' || contextMenu.clip.type === 'audio') && (
            <>
              {contextMenu.clip.isLinked ? (
                <button
                  type="button"
                  onClick={() => {
                    handleSeparateVideoAudio(contextMenu.clip);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1a253a] text-amber-300 hover:text-amber-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5 text-amber-400" />
                  <span>Separa il video dall'audio</span>
                </button>
              ) : (
                <button
                  disabled={!linkCandidate(contextMenu.clip)}
                  title={linkCandidate(contextMenu.clip)?'Collega video e audio':'Nessuna clip audio/video compatibile'}
                  type="button"
                  onClick={() => {
                    handleLinkVideoAudio(contextMenu.clip);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1a253a] text-cyan-300 hover:text-cyan-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Unisci video e audio</span>
                </button>
              )}
            </>
          )}

          {onDeleteClip && (
            <button
              type="button"
              onClick={() => {
                onDeleteClip(contextMenu.clip.id);
                setContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/70 text-rose-400 hover:text-rose-200 flex items-center gap-2 transition-colors cursor-pointer mt-0.5"
              title="Elimina questo mattoncino dalla timeline (il file originale nello stage resta intatto)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Elimina mattoncino</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
