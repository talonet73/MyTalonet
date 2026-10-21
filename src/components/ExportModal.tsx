import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Film,
  Music,
  CheckCircle,
  FileCode,
  Sliders,
  HardDrive,
  Gauge,
  Sparkles,
  Info,
  Play
} from 'lucide-react';
import { TimelineClip, Track, SubtitleItem } from '../types/editor';
import {
  ExportFormat,
  estimateExportFileSizeMB,
  executeProjectExport,
  ExportProgress
} from '../services/exportService';
import { PlaybackEngine, playbackEngine } from '../services/playbackEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: TimelineClip[];
  tracks: Track[];
  subtitles: SubtitleItem[];
  aspectRatio: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  clips,
  tracks,
  subtitles,
  aspectRatio,
}) => {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<'1080p' | '720p' | '4K'>('1080p');
  // Horizontal slider for file weight/bitrate (1 = lightest, 100 = heaviest/max quality)
  const [weightPercentage, setWeightPercentage] = useState<number>(55);
  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportedResult, setExportedResult] = useState<{
    blob: Blob;
    fileName: string;
    actualSizeBytes: number;
  } | null>(null);

  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  // Content duration
  const contentDuration = useMemo(() => {
    if (clips.length === 0) return 0;
    const maxEnd = Math.max(...clips.map(c => c.startTime + c.duration));
    return maxEnd;
  }, [clips]);

  // Dynamic file size and bitrate calculation based on horizontal slider
  const sizeEstimate = useMemo(() => {
    return estimateExportFileSizeMB(format, contentDuration, weightPercentage, resolution);
  }, [format, contentDuration, weightPercentage, resolution]);

  useEffect(() => { if(isOpen){setExportedResult(null);setExportError('');setProgress(null);} },[isOpen]);

  // When modal opens, draw current initial frame on canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = exportCanvasRef.current;
    if (!canvas) return;

    const videoClips = clips
      .filter(c => c.type === 'video')
      .map(c => ({
        id: c.id,
        name: c.name,
        transparency: c.transparency,
      effects: c.effects, adjustments: c.adjustments, fadeIn:c.fadeIn, fadeOut:c.fadeOut,
        layer: clips.indexOf(c),
        startTime: c.startTime,
        duration: c.duration,
        offset: c.offset,
        mediaUrl: c.mediaUrl,
      }));

    const effectClips = clips
      .filter(c => c.type === 'effect')
      .map(c => ({
        id: c.id,
        name: c.name,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        startTime: c.startTime,
        duration: c.duration,
        effectType: c.effectType,
      }));

    const imageClips = clips
      .filter(c => c.type === 'image')
      .map(c => ({
        id: c.id,
        name: c.name,
        transparency: c.transparency,
      effects: c.effects, adjustments: c.adjustments, fadeIn:c.fadeIn, fadeOut:c.fadeOut,
        layer: clips.indexOf(c),
        startTime: c.startTime,
        duration: c.duration,
        mediaUrl: c.mediaUrl,
      }));

    const subItems = subtitles.map(s => ({
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    // Draw first frame preview
    const previewStartTime = videoClips.length > 0 ? videoClips[0].startTime : 0;
    const previewEngine = new PlaybackEngine();
    previewEngine.prepareAndRenderFrame(canvas, previewStartTime, videoClips, effectClips, imageClips, subItems);
    return () => previewEngine.dispose();
  }, [isOpen, clips, subtitles]);

  if (!isOpen) return null;

  const isAudioFormat = format === 'mp3' || format === 'wav';

  const handleStartExport = async () => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;

    setIsExporting(true);
    setExportError('');
    setExportedResult(null);

    try {
      const result = await executeProjectExport(
        {
          format,
          resolution,
          weightPercentage,
          durationSec: contentDuration,
          aspectRatio,
        },
        clips,
        subtitles,
        canvas,
        p => setProgress(p),
        tracks
      );

      setExportedResult(result);
    } catch (err) {
      setExportError((err as Error).message);
      setProgress(null);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFile = () => {
    if (!exportedResult) return;
    const url = URL.createObjectURL(exportedResult.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportedResult.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleDownloadProjectJSON = () => {
    const projectData = {
      appName: 'TALEDIT',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      aspectRatio,
      tracks,
      clips,
      subtitles,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TALEDIT_Progetto_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div role="dialog" aria-label="Esportazione" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-xl bg-[#0e1422] border border-[#2b3a54] rounded-2xl shadow-2xl p-5 text-white flex flex-col max-h-[94vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2a3f] mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              {isAudioFormat ? <Music className="w-4 h-4" /> : <Film className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-cyan-300">Esporta Video ed Audio TALEDIT</h3>
              <p className="text-[10px] text-gray-400">Codifica FFmpeg con anteprima e controllo peso file</p>
            </div>
          </div>
          <button
            aria-label="Chiudi esportazione"
            onClick={onClose}
            disabled={isExporting}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-[#1a2334] transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 text-xs">
          {/* LIVE RENDERING PREVIEW CANVAS - "ottima l'idea di far vedere in anteprima tutta l'esportazione" */}
          <div className="relative aspect-video w-full max-h-52 bg-[#060810] rounded-xl overflow-hidden border border-[#26354d] shadow-lg flex items-center justify-center">
            <canvas
              ref={exportCanvasRef}
              width={640}
              height={360}
              className="w-full h-full object-contain"
            />
            {isExporting && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-600/90 text-white font-mono text-[10px] font-bold flex items-center gap-1.5 shadow">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>CODIFICA IN CORSO</span>
              </div>
            )}
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-gray-300 font-mono text-[10px] border border-white/10">
              Durata: {contentDuration}s • {resolution}
            </div>
          </div>

          {exportError && <p role="alert" className="text-rose-300 border border-rose-700 rounded p-2">{exportError}</p>}
          {!exportedResult ? (
            <>
              {/* 1. Formato file selector (mp4, avi, mov, mp3, wav) */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Formato di Esportazione</span>
                  <span className="text-[10px] text-gray-400">Video (.mp4, .avi, .mov) o Audio (.mp3, .wav)</span>
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['mp4', 'avi', 'mov', 'mp3', 'wav'] as ExportFormat[]).map(fmt => {
                    const isFmtAudio = fmt === 'mp3' || fmt === 'wav';
                    const isSelected = format === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormat(fmt)}
                        disabled={isExporting}
                        className={`py-2 px-1 rounded-lg border font-mono font-bold uppercase transition-all flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? isFmtAudio
                              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300 shadow-md ring-1 ring-emerald-400'
                              : 'bg-cyan-600/30 border-cyan-400 text-cyan-300 shadow-md ring-1 ring-cyan-400'
                            : 'border-[#233045] bg-[#131b29] text-gray-400 hover:bg-[#1a2436] hover:text-gray-200'
                        }`}
                      >
                        <span className="text-xs">.{fmt}</span>
                        <span className="text-[8px] font-sans font-normal opacity-75">
                          {isFmtAudio ? 'Audio' : 'Video'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Risoluzione (Only for Video formats) */}
              {!isAudioFormat && (
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Risoluzione Video</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '720p', label: '720p HD', sub: '1280x720' },
                      { id: '1080p', label: '1080p Full HD', sub: '1920x1080' },
                      { id: '4K', label: '4K Ultra HD', sub: '3840x2160' },
                    ].map(res => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => setResolution(res.id as any)}
                        disabled={isExporting}
                        className={`py-1.5 px-2 rounded-lg border text-left transition-all ${
                          resolution === res.id
                            ? 'bg-cyan-950/60 border-cyan-400 text-white ring-1 ring-cyan-400'
                            : 'border-[#233045] bg-[#131b29] text-gray-400 hover:bg-[#1a2436]'
                        }`}
                      >
                        <div className="font-bold text-xs">{res.label}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{res.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. BARRA ORIZZONTALE PESO FILE (Slider per decidere il peso del file) */}
              <div className="p-3 bg-[#121927] border border-[#233148] rounded-xl space-y-2 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>{format==='wav'?'WAV PCM: qualità e peso fissi':'Barra Regolazione Peso File ed Encoding'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-mono text-[11px] font-bold border border-cyan-800">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Peso stimato: ~{sizeEstimate.estimatedMB} MB</span>
                  </div>
                </div>

                {/* The Horizontal Slider */}
                <div className="space-y-1 pt-1">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={weightPercentage}
                    aria-label="Peso del file"
                    onChange={e => setWeightPercentage(Number(e.target.value))}
                    disabled={isExporting || format==='wav'}
                    className="w-full h-2.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                    <span className="text-gray-400">
                      ◀ File Leggero (Minore dimensione)
                    </span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {weightPercentage}%
                    </span>
                    <span className="text-gray-400">
                      Massima Qualità (File più pesante) ▶
                    </span>
                  </div>
                </div>

                {/* Estimate details card */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1b263b] text-[11px]">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bitrate:</span>
                    <span className="font-mono font-bold text-white">{sizeEstimate.bitrateFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Profilo:</span>
                    <span className="font-medium text-cyan-200 truncate">{sizeEstimate.qualityLabel}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar during Exporting */}
              {isExporting && progress && (
                <div className="space-y-2 p-3 bg-[#111827] border border-cyan-800/60 rounded-xl animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-cyan-300 font-bold truncate max-w-[360px] animate-pulse">
                      {progress.statusText}
                    </span>
                    <span className="font-mono font-bold text-cyan-400">{progress.percentage}%</span>
                  </div>

                  <div className="w-full bg-[#1e293b] rounded-full h-2.5 overflow-hidden p-0.5">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-150"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={handleStartExport}
                  disabled={isExporting || clips.length === 0}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 cursor-pointer"
                >
                  {isExporting ? (
                    <span>Rendering ed esportazione in corso ({progress ? progress.percentage : 0}%)...</span>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Avvia Rendering ed Esporta in .{format.toUpperCase()} (~{sizeEstimate.estimatedMB} MB)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadProjectJSON}
                  disabled={isExporting}
                  className="w-full py-1.5 bg-[#172030] hover:bg-[#202c42] disabled:opacity-40 text-gray-300 hover:text-white rounded-xl transition-colors flex items-center justify-center gap-2 border border-[#29374e]"
                >
                  <FileCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>Salva Progetto TALEDIT (.json)</span>
                </button>
              </div>
            </>
          ) : (
            /* 4. Complete / Ready to Download Screen */
            <div className="py-4 text-center space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-950/50">
                <CheckCircle className="w-7 h-7" />
              </div>

              <div>
                <h4 className="font-bold text-white text-base">Rendering completato con successo!</h4>
                <p className="text-gray-300 text-xs mt-1">
                  Il file reale è stato generato e contiene tutti i dati video/audio montati.
                </p>
              </div>

              <div className="p-3 bg-[#131c2d] border border-[#233148] rounded-xl text-left space-y-1.5 font-mono text-xs max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-gray-400">File:</span>
                  <span className="text-cyan-300 font-bold truncate max-w-[200px]">
                    {exportedResult.fileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dimensione reale generata:</span>
                  <span className="text-emerald-400 font-bold">
                    {(exportedResult.actualSizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Formato:</span>
                  <span className="text-white font-bold uppercase">.{format}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadFile}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-cyan-950/60 cursor-pointer text-sm"
              >
                <Download className="w-5 h-5" />
                <span>Scarica {exportedResult.fileName} ({(exportedResult.actualSizeBytes / (1024 * 1024)).toFixed(2)} MB)</span>
              </button>

              <button
                type="button"
                onClick={() => setExportedResult(null)}
                className="text-xs text-gray-400 hover:text-white underline cursor-pointer pt-1"
              >
                Esegui un'altra esportazione
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
