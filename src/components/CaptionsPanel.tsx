import React, { useState } from 'react';
import { SubtitleItem } from '../types/editor';
import { Languages, Wand2, Trash2, CheckCircle2 } from 'lucide-react';

interface CaptionsPanelProps {
  animated?:boolean;onAnimatedChange?:(v:boolean)=>void;
  spokenLanguage: string;
  setSpokenLanguage: (lang: string) => void;
  bilingualCaptions: boolean;
  setBilingualCaptions: (enabled: boolean) => void;
  deleteCurrentCaptions: boolean;
  setDeleteCurrentCaptions: (del: boolean) => void;
  subtitles: SubtitleItem[];
  onGenerateCaptions: () => Promise<void>;
  onInsertCaptions:()=>void;
  hasGeneratedCaptions:boolean;
  onUpdateSubtitle: (id: string, text: string) => void;
  onDeleteSubtitle: (id: string) => void;
}

export const CaptionsPanel: React.FC<CaptionsPanelProps> = ({
  animated=false,onAnimatedChange,
  spokenLanguage,
  setSpokenLanguage,
  bilingualCaptions,
  setBilingualCaptions,
  deleteCurrentCaptions,
  setDeleteCurrentCaptions,
  subtitles,
  onGenerateCaptions, onInsertCaptions,hasGeneratedCaptions,
  onUpdateSubtitle,
  onDeleteSubtitle,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try { await onGenerateCaptions(); } finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#151a27] border-r border-[#1e293b] text-white p-3.5 select-none justify-between">
      {/* Top Controls */}
      <div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-300 mb-1.5 flex items-center justify-between">
            <span>Spoken language</span>
            <Languages className="w-3.5 h-3.5 text-gray-400" />
          </label>
          <select
            aria-label="Lingua parlata"
            value={spokenLanguage}
            onChange={e => setSpokenLanguage(e.target.value)}
            className="w-full bg-[#1f2638] border border-[#2e384d] text-xs text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="Italian">Italian</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Japanese">Japanese</option>
          </select>
        </div>

        {/* Bilingual Captions Switch */}
        <div className="flex items-center justify-between py-2 border-b border-[#232c40] mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-200">Traduzione in inglese</span>
            <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold px-1.5 py-0.2 rounded">
              Locale
            </span>
          </div>
          <button
            type="button"
            aria-label="Traduzione in inglese"
            aria-pressed={bilingualCaptions}
            onClick={() => setBilingualCaptions(!bilingualCaptions)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              bilingualCaptions ? 'bg-cyan-500' : 'bg-[#2b354c]'
            }`}
          >
            <span
              className={`block w-3.5 h-3.5 bg-white rounded-full transition-transform transform mt-0.5 ml-0.5 ${
                bilingualCaptions ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {onAnimatedChange&&<label className="block text-xs my-2"><input type="checkbox" aria-label="Parola evidenziata ottanio" checked={animated} disabled={bilingualCaptions} onChange={e=>onAnimatedChange(e.target.checked)}/> Parola evidenziata ottanio (frasi brevi)<span className="block text-[10px] text-gray-400">Richiede i tempi parola di una nuova trascrizione. Se aggiungi/togli parole, il testo corretto usa lo stile classico. La traduzione usa lo stile classico.</span></label>}
        {/* Subtitles list or empty state */}
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
          {subtitles.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-xs flex flex-col items-center">
              <span className="text-gray-500 mb-1">Nessun sottotitolo presente</span>
              <span className="text-[11px] text-gray-400">Clicca "Trascrivi audio", correggi i testi e poi premi GENERATE.</span>
            </div>
          ) : (
            subtitles.map(sub => (
              <div
                key={sub.id}
                className="bg-[#1b2233] border border-[#2a3449] rounded p-2 text-xs flex flex-col gap-1 hover:border-cyan-500/50 transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span className="font-mono text-cyan-400">
                    {sub.startTime}s - {sub.endTime}s
                  </span>
                  <button
                    onClick={() => onDeleteSubtitle(sub.id)}
                    className="text-gray-500 hover:text-rose-400"
                    title="Elimina riga"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="text"
                  aria-label="Testo sottotitolo"
                  value={sub.text}
                  onChange={e => onUpdateSubtitle(sub.id, e.target.value)}
                  className="bg-transparent border-b border-transparent focus:border-cyan-500 text-gray-200 text-xs focus:outline-none"
                />
                {bilingualCaptions && sub.translation && (
                  <span className="text-[10px] text-amber-300 italic">{sub.translation}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={handleGenerate} disabled={isGenerating} className="my-2 p-2 rounded bg-slate-700 disabled:opacity-40">{isGenerating?'Trascrizione…':'Trascrivi audio'}</button>
      {/* Bottom Controls */}
      <div className="pt-3 border-t border-[#232c40] flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteCurrentCaptions}
            onChange={e => setDeleteCurrentCaptions(e.target.checked)}
            className="rounded border-[#2e384d] bg-[#1a2030] text-cyan-500 focus:ring-0"
          />
          <span className="text-[11px]">Delete current captions</span>
        </label>

        <button
          onClick={onInsertCaptions}
          disabled={isGenerating || (subtitles.length===0 && !hasGeneratedCaptions)}
          className="px-4 py-2 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded text-xs font-bold tracking-wide transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>GENERATE</span>
        </button>
      </div>
    </div>
  );
};
