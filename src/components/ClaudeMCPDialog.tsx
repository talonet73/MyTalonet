import {DraggableWindow} from './DraggableWindow';
import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Send,
  X,
  Copy,
  Check,
  Terminal,
  Server,
  Zap,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ClaudePromptMessage } from '../types/editor';
import { getClaudeDesktopConfigJson, CLAUDE_MCP_CONFIG } from '../services/mcpEngine';

interface ClaudeMCPDialogProps {
  provider?: 'claude' | 'chatgpt';
  isOpen: boolean;
  onClose: () => void;
  claudeConnected: boolean;
  onToggleConnected: () => void;
  messages: ClaudePromptMessage[];
  onSendPrompt: (promptText: string) => void;
  isThinking: boolean;
}

export const ClaudeMCPDialog: React.FC<ClaudeMCPDialogProps> = ({
  provider = 'claude',
  isOpen,
  onClose,
  claudeConnected,
  onToggleConnected,
  messages,
  onSendPrompt,
  isThinking,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'prompt' | 'mcp_setup' | 'tools' | 'chatgpt'>('prompt');
  const [copiedConfig, setCopiedConfig] = useState(false);

  useEffect(() => { if (isOpen) setActiveTab(provider === 'chatgpt' ? 'chatgpt' : 'prompt'); }, [isOpen, provider]);

  if (!isOpen) return null;

  const currentHost = window.location.origin;
  const configSnippet = getClaudeDesktopConfigJson(currentHost);

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(configSnippet);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendPrompt(inputText.trim());
    setInputText('');
  };

  const samplePrompts = [
    "Taglia Intro01.mp4 al playhead",
    "Imposta trasparenza del video al 75%",
    "Alza il volume dell'audio a +3 dB",
    "Applica dissolvenza di 2 secondi all'effetto Camera Handed",

    "Aggiungi effetto Glitch Cyber a 00:20"
  ];

  return (
    <div role="dialog" aria-label="Collegamento MCP" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <DraggableWindow className="w-full max-w-2xl bg-[#0f1523] border border-[#2b3952] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div data-window-handle className="flex items-center justify-between px-4 py-3 bg-[#131b2d] border-b border-[#232f46]">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${claudeConnected ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-400'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Claude / ChatGPT • MCP Bridge</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  claudeConnected ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'bg-gray-800 text-gray-400'
                }`}>
                  {claudeConnected ? 'MCP ABILITATO' : 'MCP SPENTO'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                TALEDIT Video Editor connesso via Model Context Protocol
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Manual Toggle Switch requested by user: "Manualmente sono io a decidere quando accendere o spegnere il bottone del collegamento con Claude" */}
            <div className="flex items-center gap-2 bg-[#090d17] border border-[#232f46] px-2.5 py-1 rounded-lg">
              <span className="text-[11px] font-semibold text-gray-300">
                Collegamento:
              </span>
              <button
                type="button"
                onClick={onToggleConnected}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  claudeConnected
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'bg-[#1e293b] text-gray-300 hover:text-white'
                }`}
              >
                {claudeConnected ? 'ON (Acceso)' : 'OFF (Spento)'}
              </button>
            </div>

            <button
              aria-label="Chiudi collegamento MCP"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2b42] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1f2b42] bg-[#0c111c] px-4 pt-1 text-xs">
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'prompt'
                ? 'border-cyan-400 text-cyan-400 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Prompt Console TALEDIT</span>
          </button>

          <button
            onClick={() => setActiveTab('mcp_setup')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'mcp_setup'
                ? 'border-amber-400 text-amber-400 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Claude Desktop Setup (claude_desktop_config.json)</span>
          </button>

          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'tools'
                ? 'border-emerald-400 text-emerald-400 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>MCP Tools ({CLAUDE_MCP_CONFIG.availableTools.length})</span>
          </button>
        </div>

        <button onClick={() => setActiveTab('chatgpt')} className="text-xs px-4 py-2 text-emerald-300 bg-emerald-950/40">Configura ChatGPT MCP</button>
        {activeTab === 'chatgpt' && <div className="p-5 overflow-y-auto text-xs space-y-3">
          <h4 className="font-bold text-emerald-300 text-sm">Collega ChatGPT a TALEDIT</h4>
          <p>In ChatGPT, apri le impostazioni delle app e abilita la modalità sviluppatore se disponibile nel tuo account. Crea un’app MCP con questo URL:</p>
          <code className="block p-3 rounded bg-black/50 text-emerald-300 break-all">{currentHost}/api/mcp</code>
          <p>ChatGPT deve poter raggiungere un indirizzo HTTPS pubblico del server TALEDIT. Un indirizzo localhost non è raggiungibile da ChatGPT. Attiva il collegamento MCP in questa finestra prima di usare gli strumenti.</p>
          <p>Il server supporta Streamable HTTP. La connessione usa l’autenticazione configurata dal gestore del server; in locale nessun token è richiesto. Per pubblicarlo, proteggi l’accesso e configura MCP_AUTH_TOKEN o un gateway OAuth compatibile con il client.</p>
          <p>Prova: “Leggi lo stato della timeline”, poi “Taglia la clip selezionata a 3 secondi”. Le modifiche compaiono nell’editor. Il pulsante ON abilita gli strumenti: la connessione del client avviene in ChatGPT.</p>
        </div>}
        {/* Tab 1: Interactive Prompt Console */}
        {activeTab === 'prompt' && (
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {/* Notification banner if disconnected */}
            {!claudeConnected && (
              <div className="mb-3 p-2 bg-amber-950/40 border border-amber-800/60 rounded-md text-amber-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Il collegamento a Claude DT è attualmente SPENTO. Puoi comunque digitare comandi locali o accenderlo in alto.</span>
                </div>
                <button
                  onClick={onToggleConnected}
                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded text-[11px] shrink-0"
                >
                  Accendi Ora
                </button>
              </div>
            )}

            {/* Quick Suggestion Pills */}
            <div className="mb-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5 block">
                Prompt Rapidi per la Timeline:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputText(p);
                      onSendPrompt(p);
                    }}
                    className="text-[11px] bg-[#1a2336] hover:bg-[#25324d] text-cyan-300 border border-[#2b3a54] px-2.5 py-1 rounded-full transition-colors text-left"
                  >
                    ✦ {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages Chat Log */}
            <div className="flex-1 overflow-y-auto space-y-3 bg-[#0a0d16] border border-[#1e2a3f] rounded-lg p-3 my-2 text-xs font-mono">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1">
                    {msg.role === 'user' ? (
                      <span className="font-sans font-bold text-gray-300">Tu (Prompt)</span>
                    ) : (
                      <span className="font-sans font-bold text-amber-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Console locale
                      </span>
                    )}
                    <span>• {msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[85%] rounded-lg p-2.5 whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#161f30] border border-[#26354f] text-gray-200 shadow'
                    }`}
                  >
                    {msg.content}

                    {msg.actionExecuted && (
                      <div className="mt-2 pt-1.5 border-t border-[#2d3d5a] text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Azione eseguita: {msg.actionExecuted}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex items-center gap-2 text-xs text-amber-400 p-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Esecuzione del comando locale…</span>
                </div>
              )}
            </div>

            {/* Prompt Form */}
            <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Scrivi qui il prompt per Claude DT (es. Taglia la traccia video, metti trasparenza all'80%)..."
                className="flex-1 bg-[#162032] border border-[#2c3d5a] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 shadow-inner"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Invia</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Claude Desktop Configuration */}
        {activeTab === 'mcp_setup' && (
          <div className="p-4 flex-1 overflow-y-auto text-xs space-y-4">
            <div className="bg-[#141b2c] p-3.5 rounded-lg border border-[#232f46]">
              <h4 className="font-bold text-white text-sm mb-1.5 flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400" />
                Integrazione Diretta con Claude Desktop (Claude DT)
              </h4>
              <p className="text-gray-300 leading-relaxed">
                La console interna usa comandi locali. Puoi collegare anche l’applicazione ufficiale <strong>Claude Desktop</strong>.
                TALEDIT espone un endpoint standard MCP su protocollo SSE:
              </p>
              <div className="mt-2 font-mono text-[11px] bg-black/60 p-2 rounded text-cyan-300 border border-cyan-900/40">
                {currentHost}/api/mcp/sse
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-gray-200">
                  Snippet per <code className="text-amber-400">claude_desktop_config.json</code>:
                </span>
                <button
                  onClick={handleCopyConfig}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded text-xs transition-colors"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedConfig ? 'Copiato!' : 'Copia Configurazione'}</span>
                </button>
              </div>

              <pre className="bg-[#080c14] border border-[#202b3f] text-gray-300 p-3 rounded-lg overflow-x-auto font-mono text-[11px] leading-relaxed">
                {configSnippet}
              </pre>

              <div className="mt-3 text-[11px] text-gray-400 space-y-1">
                <p><strong>Posizione del file di configurazione Claude Desktop:</strong></p>
                <p>• macOS: <code className="text-gray-300">~/Library/Application Support/Claude/claude_desktop_config.json</code></p>
                <p>• Windows: <code className="text-gray-300">%APPDATA%\Claude\claude_desktop_config.json</code></p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: List of MCP Tools */}
        {activeTab === 'tools' && (
          <div className="p-4 flex-1 overflow-y-auto text-xs space-y-2">
            <div className="text-gray-300 mb-2">
              Strumenti MCP esposti da TALEDIT a disposizione dei prompt di Claude:
            </div>
            {CLAUDE_MCP_CONFIG.availableTools.map(tool => (
              <div
                key={tool.name}
                className="p-2.5 bg-[#121927] border border-[#212c40] rounded-lg flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-amber-400">{tool.name}</span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.2 rounded">
                    Tool Ready
                  </span>
                </div>
                <p className="text-gray-400 text-[11px]">{tool.description}</p>
              </div>
            ))}
          </div>
        )}
      </DraggableWindow>
    </div>
  );
};
