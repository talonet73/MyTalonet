import React, { useState } from 'react';
import {
  FolderOpen,
  Save,
  PlusSquare,
  Share2,
  Undo2,
  Redo2,
  Scissors,
  Trash2,
  Flag,
  Copy,
  Clipboard,
  Mic,
  Sparkles,
  ChevronDown,
  Download,
  ArrowRight,
  X
} from 'lucide-react';

interface TopNavProps {
  claudeConnected: boolean;
  onToggleClaude: () => void;
  onOpenClaudeDialog: () => void;
  onOpenChatGPT: () => void;
  onCut: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onOpenProject: () => void;
  onImport: () => void;
  onSave: () => void;
  onExport: () => void;
  onAddMarker: () => void;
  markerCount?: number;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMicActive: boolean;
  onToggleMic: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  claudeConnected,
  onToggleClaude,
  onOpenClaudeDialog,
  onOpenChatGPT,
  onCut,
  onDelete,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onOpenProject,
  onImport,
  onSave,
  onExport,
  onAddMarker,
  markerCount = 0,
  activeTab,
  setActiveTab,
  isMicActive,
  onToggleMic,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const menuItems = ['File', 'Edit', 'View', 'Help'];
  const tabs = ['Effects', 'Transitions', 'Captions', 'Adjustment'];

  return (
    <div className="bg-[#0b0f19] border-b border-[#1e293b] select-none text-[#e2e8f0] text-xs">
      {/* Top Menu Bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#182234]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-sm text-cyan-400">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            TALEDIT
          </div>
          <div className="flex items-center gap-1">
            {menuItems.map(menu => (
              <div key={menu} className="relative">
                <button
                  onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
                  className={`px-2.5 py-1 rounded text-[#94a3b8] hover:text-white hover:bg-[#1e293b] transition-colors ${
                    activeMenu === menu ? 'bg-[#1e293b] text-white' : ''
                  }`}
                >
                  {menu}
                </button>
                {activeMenu === menu && (
                  <div
                    className="absolute left-0 top-full mt-1 w-48 bg-[#0f172a] border border-[#334155] rounded-md shadow-2xl py-1 z-50 text-xs text-[#cbd5e1]"
                    onMouseLeave={() => setActiveMenu(null)}
                  >
                    {menu === 'File' && (
                      <>
                        <button onClick={() => { onOpenProject(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b] flex items-center justify-between">
                          <span>Apri Progetto (.tal, .json)...</span>
                          <span className="text-[10px] text-gray-500">Ctrl+O</span>
                        </button>
                        <button onClick={() => { onImport(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b] flex items-center justify-between">
                          <span>Importa Media nello Stage...</span>
                          <span className="text-[10px] text-gray-500">Ctrl+I</span>
                        </button>
                        <button onClick={() => { onSave(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b] flex items-center justify-between">
                          <span>Salva Progetto</span>
                          <span className="text-[10px] text-gray-500">Ctrl+S</span>
                        </button>
                        <button onClick={() => { onExport(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b] flex items-center justify-between">
                          <span>Esporta Video...</span>
                          <span className="text-[10px] text-gray-500">Ctrl+E</span>
                        </button>
                      </>
                    )}
                    {menu === 'Edit' && (
                      <>
                        <button onClick={() => { onUndo(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Indietro (Undo)</button>
                        <button onClick={() => { onRedo(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Avanti (Redo)</button>
                        <button onClick={() => { onCut(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Taglia (Cut al playhead)</button>
                        <button onClick={() => { onDelete(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Elimina Selezionato</button>
                      </>
                    )}
                    {menu === 'View' && (
                      <>
                        <button onClick={() => { onOpenClaudeDialog(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Console Claude DT MCP</button>
                        <button onClick={() => setActiveMenu(null)} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Schermo Intero</button>
                      </>
                    )}
                    {menu === 'Help' && (
                      <>
                        <button onClick={() => { onOpenClaudeDialog(); setActiveMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#1e293b]">Guida Connessione Claude DT</button>
                        <div className="px-3 py-1.5 text-[11px] text-gray-400 border-t border-[#1e293b]">TALEDIT v1.0.0</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right side connection indicator */}
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${claudeConnected ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            <span>MCP Protocol: {claudeConnected ? 'Attivo (Port 3000)' : 'Disconnesso'}</span>
          </div>
        </div>
      </div>

      {/* Main Action Tool Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e1424] overflow-x-auto gap-2">
        <button onClick={onOpenChatGPT} title="ChatGPT MCP" className="px-3 py-2 rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 whitespace-nowrap font-bold">ChatGPT MCP</button>
        {/* Actions Left */}
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenProject}
            title="Apri Progetto (.tal, .json)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 mb-0.5 text-amber-400" />
            <span className="text-[10px]">Apri</span>
          </button>

          <button
            onClick={onSave}
            title="Salva Progetto (.tal)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Salva</span>
          </button>

          <button
            onClick={onImport}
            title="Importa Media nello Stage (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-cyan-300 hover:text-white transition-colors cursor-pointer"
          >
            <PlusSquare className="w-4 h-4 mb-0.5 text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-300">+ Importa</span>
          </button>

          <button
            onClick={onExport}
            title="Esporta Video"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Share2 className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Esporta</span>
          </button>

          <div className="h-6 w-[1px] bg-[#1e293b] mx-1" />

          <button
            onClick={onUndo}
            title="Indietro (Undo)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Undo2 className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Indietro</span>
          </button>

          <button
            onClick={onRedo}
            title="Avanti (Redo)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Redo2 className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Avanti</span>
          </button>

          <button
            onClick={onCut}
            title="Taglia clip al playhead"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Scissors className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Cut</span>
          </button>

          <button
            onClick={onDelete}
            title="Elimina clip selezionata"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4 mb-0.5 text-rose-400" />
            <span className="text-[10px]">Cestino</span>
          </button>

          <button
            onClick={onAddMarker}
            title="Aggiungi Marker al tempo corrente (con descrizione)"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors relative"
          >
            <div className="relative">
              <Flag className="w-4 h-4 mb-0.5 text-amber-400 fill-amber-400" />
              {markerCount !== undefined && markerCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-black font-extrabold text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {markerCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Marker</span>
          </button>

          <button
            onClick={onCopy}
            title="Copia clip"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Copy className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Copia</span>
          </button>

          <button
            onClick={onPaste}
            title="Incolla clip"
            className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-[#1b263b] text-gray-300 hover:text-white transition-colors"
          >
            <Clipboard className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Incolla</span>
          </button>

          <div className="h-6 w-[1px] bg-[#1e293b] mx-2" />

          {/* Mode Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === tab
                    ? 'bg-[#1e293b] text-cyan-400 font-semibold border border-[#334155]'
                    : 'text-gray-400 hover:text-white hover:bg-[#162032]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: Claude toggle and Mic */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Claude Connection Toggle Button */}
          <div className="flex items-center rounded border border-[#2d3748] bg-[#141b2d] p-0.5">
            <button
              onClick={onOpenClaudeDialog}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                claudeConnected
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-[0_0_12px_rgba(217,119,6,0.5)]'
                  : 'bg-[#1e293b] text-gray-300 hover:bg-[#2d3748]'
              }`}
              title="Clicca per aprire la finestra di dialogo del prompt Claude DT"
            >
              <Sparkles className={`w-3.5 h-3.5 ${claudeConnected ? 'text-amber-200 animate-spin-slow' : 'text-gray-400'}`} />
              <span>✦ Claude {claudeConnected ? 'ON' : 'OFF'}</span>
            </button>

            {/* Manual Switch */}
            <button
              onClick={onToggleClaude}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                claudeConnected ? 'text-emerald-400 hover:bg-emerald-950/30' : 'text-gray-400 hover:bg-gray-800'
              }`}
              title="Accendi o spegni manualmente il collegamento MCP con Claude"
            >
              {claudeConnected ? 'DISCONNETTI' : 'COLLEGA'}
            </button>
          </div>

          {/* MIC Button */}
          <button
            onClick={onToggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors ${
              isMicActive
                ? 'bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse'
                : 'bg-[#141b2d] border-[#2d3748] text-gray-300 hover:bg-[#1e293b]'
            }`}
            title="Microfono / Comandi vocali"
          >
            <span className={`w-2 h-2 rounded-full ${isMicActive ? 'bg-rose-500 animate-ping' : 'bg-gray-400'}`} />
            <span className="text-xs font-medium">MIC</span>
          </button>
        </div>
      </div>
    </div>
  );
};
