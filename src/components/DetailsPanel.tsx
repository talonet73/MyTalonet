import React from 'react';
import { TimelineClip, Track } from '../types/editor';
import { Sliders, Volume2, Sparkles, Layers, Clock, Film } from 'lucide-react';

interface DetailsPanelProps {
  selectedClip: TimelineClip | null;
  tracks: Track[];
  onUpdateClip: (updated: Partial<TimelineClip>) => void;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  selectedClip,
  tracks,
  onUpdateClip,
}) => {
  const currentTrack = tracks.find(t => t.id === selectedClip?.trackId);

  return (
    <div className="w-64 bg-[#111622] text-white p-3.5 border-l border-[#1e293b] flex flex-col justify-between text-xs select-none">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#232c40] mb-3">
          <span className="font-bold tracking-wider text-xs text-gray-200">DETAILS</span>
          <Sliders className="w-3.5 h-3.5 text-gray-400" />
        </div>

        {selectedClip ? (
          <div className="space-y-3.5 text-gray-300">
            {/* NOME */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                NOME
              </span>
              <input
                type="text"
                value={selectedClip.name}
                onChange={e => onUpdateClip({ name: e.target.value })}
                className="w-full mt-1 px-2 py-1 bg-[#1a2030] border border-[#2d3748] rounded text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* TIPO */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                TIPO
              </span>
              <div className="mt-1 flex items-center gap-1.5 font-bold uppercase text-xs">
                {selectedClip.type === 'video' && (
                  <span className="text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800">
                    VIDEO
                  </span>
                )}
                {selectedClip.type === 'audio' && (
                  <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    AUDIO
                  </span>
                )}
                {selectedClip.type === 'effect' && (
                  <span className="text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                    EFFECT
                  </span>
                )}
                {selectedClip.type === 'image' && (
                  <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                    IMMAGINE
                  </span>
                )}
              </div>
            </div>

            {/* DURATA */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                DURATA
              </span>
              <div className="mt-1 flex items-center justify-between bg-[#1a2030] border border-[#2d3748] rounded px-2 py-1 font-mono text-gray-200">
                <span>{selectedClip.duration.toFixed(1).replace('.', ',')} secondi</span>
                <Clock className="w-3 h-3 text-gray-400" />
              </div>
            </div>

            {/* PISTA */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                PISTA
              </span>
              <div className="mt-1 font-semibold text-xs text-gray-200 bg-[#1a2030] border border-[#2d3748] rounded px-2 py-1">
                {currentTrack?.name || selectedClip.trackId}
              </div>
            </div>

            {/* OPACITÀ / VOLUME */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                OPACITÀ / VOLUME
              </span>
              {selectedClip.type === 'video' || selectedClip.type === 'image' ? (
                <div className="mt-1.5 space-y-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className={selectedClip.type === 'image' ? 'text-amber-400' : 'text-cyan-400'}>
                      Trasparenza:
                    </span>
                    <span className="font-bold text-white">{selectedClip.transparency}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedClip.transparency}
                    onChange={e => onUpdateClip({ transparency: parseInt(e.target.value, 10) })}
                    className={`w-full h-1.5 bg-[#253047] rounded cursor-pointer ${
                      selectedClip.type === 'image' ? 'accent-amber-400' : 'accent-cyan-400'
                    }`}
                  />
                </div>
              ) : selectedClip.type === 'audio' ? (
                <div className="mt-1.5 space-y-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-emerald-400">Volume:</span>
                    <span className="font-bold text-white">
                      {selectedClip.volumeDb >= 0 ? `+${selectedClip.volumeDb}` : selectedClip.volumeDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="12"
                    step="1"
                    value={selectedClip.volumeDb}
                    onChange={e => onUpdateClip({ volumeDb: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-400 h-1.5 bg-[#253047] rounded cursor-pointer"
                  />
                </div>
              ) : (
                <div className="mt-1 text-gray-400 text-[11px] italic">100% (Non applicabile ad effetti)</div>
              )}
            </div>

            {/* DISSOLVENZA IN / OUT */}
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                DISSOLVENZA IN / OUT
              </span>
              <div className="mt-1.5 space-y-2">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-gray-400">Fade In:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={selectedClip.duration / 2}
                      value={selectedClip.fadeIn}
                      onChange={e => onUpdateClip({ fadeIn: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-[#1a2030] border border-[#2d3748] rounded px-1.5 py-0.5 text-right text-xs text-white"
                    />
                    <span className="text-[10px] text-gray-400">s</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-gray-400">Fade Out:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={selectedClip.duration / 2}
                      value={selectedClip.fadeOut}
                      onChange={e => onUpdateClip({ fadeOut: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-[#1a2030] border border-[#2d3748] rounded px-1.5 py-0.5 text-right text-xs text-white"
                    />
                    <span className="text-[10px] text-gray-400">s</span>
                  </div>
                </div>

                <div className="text-[10px] text-rose-300 font-mono">
                  {selectedClip.fadeIn.toFixed(1)} s / {selectedClip.fadeOut.toFixed(1)} s
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500 text-xs">
            Nessun mattoncino selezionato.
            <div className="mt-2 text-[11px] text-gray-400">
              Clicca su una clip video, audio o effetto sulla timeline per visualizzare e regolare i dettagli.
            </div>
          </div>
        )}
      </div>

      {/* Selected Clip Indicator matching screenshot */}
      <div className="pt-3 border-t border-[#232c40] text-[11px] text-gray-400">
        <span>Selezionato: </span>
        <span className="font-semibold text-cyan-300">
          {selectedClip ? selectedClip.name : 'Nessuna selezione'}
        </span>
      </div>
    </div>
  );
};
