import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Music, Film, Image as ImageIcon, Trash2, Layers, CheckCircle2 } from 'lucide-react';
import { MediaAsset } from '../types/editor';

interface MediaLibraryPanelProps {
  onAddMediaToTimeline: (asset: MediaAsset) => void;
  onCustomFileImported: (file: File) => void;
  assets: MediaAsset[];
  onDeleteAsset: (id: string) => void;
  onAddAsset: (asset: MediaAsset) => void;
}

// Initial media assets strictly matching ONLY the files present in the stage
export const initialMediaAssets: MediaAsset[] = [
  {
    id: 'stage_video_1',
    name: 'Intro01.mp4',
    type: 'video',
    duration: '00:14',
    durationSec: 14,
    fileUrl: '/media_downloads/yt_1792223085761_ebms.mp4',
    isLost: false,
  },
  {
    id: 'stage_audio_1',
    name: 'Musica.wav',
    type: 'audio',
    duration: '00:14',
    durationSec: 14,
    fileUrl: '/media_downloads/yt_1792223106892_js0e.mp4',
    isLost: false,
  },
  {
    id: 'stage_image_1',
    name: 'Overlay_Grafica.png',
    type: 'image',
    duration: '00:09',
    durationSec: 9,
    isLost: false,
  },
];

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({
  onAddMediaToTimeline,
  onCustomFileImported,
  assets,
  onDeleteAsset,
  onAddAsset,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'video' | 'audio' | 'image'>('All');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter stage files
  const filteredAssets = assets.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === 'All' ? true : item.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleDeleteAsset = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onDeleteAsset(id);
    if (selectedAssetId === id) setSelectedAssetId(null);
  };

  // Keyboard shortcut: Delete or Backspace removes the selected stage file
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAssetId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteAsset(selectedAssetId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAssetId, assets]);

  const [importNotice, setImportNotice] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allowedExts = ['.mp4', '.mov', '.avi', '.mp3', '.wav', '.png', '.jpg', '.jpeg'];
      const files = Array.from(e.target.files);

      let rejectedCount = 0;

      files.forEach(file => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!allowedExts.includes(ext)) {
          rejectedCount++;
          return;
        }

        const type: 'video' | 'audio' | 'image' =
          file.type.startsWith('video') || ['.mp4', '.mov', '.avi'].includes(ext)
            ? 'video'
            : file.type.startsWith('audio') || ['.mp3', '.wav'].includes(ext)
            ? 'audio'
            : 'image';

        const fileUrl = URL.createObjectURL(file);
        const assetId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        if (type === 'video') {
          // Asynchronously read real video duration and capture thumbnail
          const tempVideo = document.createElement('video');
          tempVideo.preload = 'metadata';
          tempVideo.src = fileUrl;

          let isResolved = false;
          const finalizeVideo = (sec: number, thumb?: string) => {
            if (isResolved) return;
            isResolved = true;
            const validSec = Math.max(1, Math.round(sec) || 12);
            const mins = Math.floor(validSec / 60);
            const remainderSecs = validSec % 60;
            const duration = `${mins.toString().padStart(2, '0')}:${remainderSecs.toString().padStart(2, '0')}`;

            const newAsset: MediaAsset = {
              id: assetId,
              name: file.name,
              type: 'video',
              duration,
              durationSec: validSec,
              fileUrl,
              thumbnailUrl: thumb,
              isLost: false,
            };
            onAddAsset(newAsset);
            onCustomFileImported(file);

            // Upload to server so FFmpeg has the file for high quality export
            fetch('/api/upload-media', {
              method: 'POST',
              headers: { 'x-filename': file.name },
              body: file,
            })
              .then(r => r.json())
              .then(res => {
                if (res && res.url) {
                  newAsset.fileUrl = res.url;
                }
              })
              .catch(() => {});
          };

          tempVideo.onloadedmetadata = () => {
            const sec = tempVideo.duration;
            // Seek forward slightly to capture a representative thumbnail
            tempVideo.currentTime = Math.min(1.0, sec > 2 ? 1.0 : sec / 2);
          };

          tempVideo.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 160;
              canvas.height = 90;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempVideo, 0, 0, 160, 90);
                const thumb = canvas.toDataURL('image/jpeg', 0.7);
                finalizeVideo(tempVideo.duration, thumb);
                return;
              }
            } catch (err) {
              // ignore
            }
            finalizeVideo(tempVideo.duration);
          };

          tempVideo.onerror = () => {
            finalizeVideo(15);
          };

          // Fallback timeout in case browser takes too long to load metadata
          setTimeout(() => {
            if (!isResolved) finalizeVideo(15);
          }, 1500);

        } else if (type === 'audio') {
          // Asynchronously read real audio duration
          const tempAudio = document.createElement('audio');
          tempAudio.preload = 'metadata';
          tempAudio.src = fileUrl;

          let isResolved = false;
          const finalizeAudio = (sec: number) => {
            if (isResolved) return;
            isResolved = true;
            const validSec = Math.max(1, Math.round(sec) || 20);
            const mins = Math.floor(validSec / 60);
            const remainderSecs = validSec % 60;
            const duration = `${mins.toString().padStart(2, '0')}:${remainderSecs.toString().padStart(2, '0')}`;

            const newAsset: MediaAsset = {
              id: assetId,
              name: file.name,
              type: 'audio',
              duration,
              durationSec: validSec,
              fileUrl,
              isLost: false,
            };
            onAddAsset(newAsset);
            onCustomFileImported(file);

            fetch('/api/upload-media', {
              method: 'POST',
              headers: { 'x-filename': file.name },
              body: file,
            })
              .then(r => r.json())
              .then(res => {
                if (res && res.url) {
                  newAsset.fileUrl = res.url;
                }
              })
              .catch(() => {});
          };

          tempAudio.onloadedmetadata = () => {
            finalizeAudio(tempAudio.duration);
          };

          tempAudio.onerror = () => {
            finalizeAudio(20);
          };

          setTimeout(() => {
            if (!isResolved) finalizeAudio(20);
          }, 1500);

        } else {
          // Image
          const newAsset: MediaAsset = {
            id: assetId,
            name: file.name,
            type: 'image',
            duration: '00:08',
            durationSec: 8,
            fileUrl,
            thumbnailUrl: fileUrl,
            isLost: false,
          };
          onAddAsset(newAsset);
          onCustomFileImported(file);

          fetch('/api/upload-media', {
            method: 'POST',
            headers: { 'x-filename': file.name },
            body: file,
          })
            .then(r => r.json())
            .then(res => {
              if (res && res.url) {
                newAsset.fileUrl = res.url;
                newAsset.thumbnailUrl = res.url;
              }
            })
            .catch(() => {});
        }
      });

      if (rejectedCount > 0) {
        setImportNotice(`⚠️ ${rejectedCount} file scartato. Import accetta solo .mp4, .mov, .avi, .mp3, .wav, .png, .jpg.`);
        setTimeout(() => setImportNotice(null), 4000);
      }

      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121622] border-r border-[#1e293b] text-white p-3 select-none">
      {/* Stage Files Title & Counter */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1c2438]">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold tracking-wider text-cyan-300">
            FILE DELLO STAGE
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
            {assets.length}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 italic">
          Solo file presenti nello stage
        </span>
      </div>

      {/* Top Controls: + Import, Search, Filter */}
      <div className="flex items-center gap-2 mb-2.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Importa file multimediale nello stage"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded text-xs font-semibold shadow-sm transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.avi,.mp3,.wav,.png,.jpg,.jpeg,video/mp4,video/quicktime,video/x-msvideo,audio/mpeg,audio/wav,image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca nei file dello stage..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-2 py-1 bg-[#1a2030] border border-[#2d3748] rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter dropdown */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          className="bg-[#1a2030] border border-[#2d3748] text-xs text-gray-300 rounded px-2 py-1 focus:outline-none shrink-0"
        >
          <option value="All">Tutti</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Immagini</option>
        </select>
      </div>

      {importNotice && (
        <div className="mb-2 p-1.5 rounded bg-amber-950/80 border border-amber-600/60 text-[11px] text-amber-200">
          {importNotice}
        </div>
      )}

      {/* Grid of media cards strictly matching files present in the stage */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-gray-500 px-4 border border-dashed border-[#232f45] rounded-lg mt-2">
            <Layers className="w-6 h-6 mb-2 text-gray-600" />
            <span className="text-xs text-gray-400 font-medium">Nessun file nello stage</span>
            <span className="text-[10px] text-gray-500 mt-1">
              Usa il tasto "+ Import" per caricare video, audio o immagini nello stage.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map(item => {
              const isSelected = selectedAssetId === item.id;
              const isAudio = item.type === 'audio';
              const isVideo = item.type === 'video';
              const isImage = item.type === 'image';

              const cardBg = isAudio
                ? 'bg-[#0f2e22]'
                : isVideo
                ? 'bg-[#0f2642]'
                : isImage
                ? 'bg-[#3b2b09]'
                : 'bg-[#4a151d]';

              const borderColor = isAudio
                ? 'border-emerald-700/60'
                : isVideo
                ? 'border-blue-700/60'
                : isImage
                ? 'border-amber-700/60'
                : 'border-red-700/60';

              return (
                <div
                  key={item.id}
                  draggable={true}
                  onDragStart={e => {
                    e.dataTransfer.setData('application/json', JSON.stringify(item));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => setSelectedAssetId(item.id)}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onAddMediaToTimeline(item);
                  }}
                  title={`Clicca per selezionare. Doppio clic per aggiungere al playhead. Trascina sulla traccia desiderata.`}
                  className={`group flex flex-col cursor-pointer active:cursor-grabbing relative select-none rounded-lg p-1 transition-all ${
                    isSelected
                      ? 'bg-[#15233b] ring-2 ring-cyan-400 shadow-md'
                      : 'hover:bg-[#161d2d]'
                  }`}
                >
                  <div
                    className={`relative aspect-video ${cardBg} rounded-lg border ${borderColor} transition-all shadow-sm flex items-center justify-center overflow-hidden ${
                      isSelected
                        ? 'border-cyan-400'
                        : 'hover:border-cyan-400/80'
                    }`}
                  >
                    {item.isLost ? (
                      <span className="text-[11px] text-red-300 font-medium">Media lost</span>
                    ) : item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : isAudio ? (
                      <div className="flex flex-col items-center justify-center text-emerald-400">
                        <Music className="w-6 h-6 mb-1" />
                        <span className="text-[9px] text-emerald-200 font-medium tracking-wide">
                          Audio Track
                        </span>
                      </div>
                    ) : isVideo ? (
                      <div className="flex flex-col items-center justify-center text-blue-400">
                        <Film className="w-6 h-6 mb-1" />
                        <span className="text-[9px] text-blue-200 font-medium tracking-wide">
                          Video Clip
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-amber-400">
                        <ImageIcon className="w-6 h-6 mb-1" />
                        <span className="text-[9px] text-amber-200 font-medium tracking-wide">
                          Immagine
                        </span>
                      </div>
                    )}

                    {/* Duration Badge */}
                    {item.duration && (
                      <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 rounded text-[9px] font-mono text-gray-200 pointer-events-none border border-white/10">
                        {item.duration}
                      </span>
                    )}

                    {/* Type badge on bottom left */}
                    <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded text-[8px] font-mono uppercase bg-black/60 text-gray-300 pointer-events-none">
                      {item.type}
                    </span>

                    {/* Cestino per cancellare il file quando selezionato */}
                    {isSelected ? (
                      <button
                        onClick={e => handleDeleteAsset(item.id, e)}
                        title="Cancella questo file dallo stage"
                        className="absolute top-1.5 right-1.5 px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white shadow-xl flex items-center gap-1 text-[10px] font-bold z-20 cursor-pointer transition-all border border-rose-400/40 animate-pulse"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Elimina</span>
                      </button>
                    ) : (
                      <button
                        onClick={e => handleDeleteAsset(item.id, e)}
                        title="Elimina file dallo stage"
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/80 hover:bg-rose-600 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-20 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Badge "Selezionato" sul lato superiore sinistro */}
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 bg-cyan-400 text-black px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider uppercase shadow pointer-events-none">
                        Selezionato
                      </span>
                    )}
                  </div>

                  {/* Title and delete action */}
                  <div className="flex items-center justify-between mt-1 px-0.5">
                    <span
                      className={`text-[10px] truncate max-w-[110px] ${
                        isSelected ? 'text-cyan-300 font-bold' : 'text-gray-300 group-hover:text-cyan-200'
                      }`}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    {isSelected && (
                      <button
                        onClick={e => handleDeleteAsset(item.id, e)}
                        title="Cancella questo file dallo stage"
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 p-1 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Helper hint at bottom */}
      <div className="mt-2 pt-2 border-t border-[#1c2438] text-[10px] text-gray-400 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-cyan-300 font-medium">💡 Doppio clic:</span>
          <span className="text-gray-300 text-[9px]">Aggiungi al playhead</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-cyan-300 font-medium">🖱️ Trascina:</span>
          <span className="text-gray-300 text-[9px]">Posiziona su qualsiasi traccia</span>
        </div>
      </div>
    </div>
  );
};
