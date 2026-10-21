import React, { useEffect, useRef, useState } from 'react';
import { Youtube, X } from 'lucide-react';
import { importMediaFile } from '../services/mediaService';
import type { MediaAsset } from '../types/editor';
export function YouTubeDialog({ onClose, onImported }: { onClose: () => void; onImported: (asset: MediaAsset) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const localFile = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  async function importLocal(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setLocalBusy(true); setError('');
    try {
      const asset = await importMediaFile(file);
      if (asset.type !== 'video') throw new Error('Scegli un file video locale.');
      if (mounted.current) { onImported(asset); onClose(); }
    } catch (error) { if (mounted.current) setError((error as Error).message); }
    finally { if (mounted.current) setLocalBusy(false); }
  }
  async function download(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/youtube/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossibile avviare il download.');
      while (mounted.current) {
        const statusResponse = await fetch(`/api/youtube/download/${result.jobId}`);
        const status = await statusResponse.json();
        if (!statusResponse.ok || status.status === 'error') throw new Error(status.error || 'Download fallito.');
        setProgress(status.progress);
        if (status.status === 'complete') { onImported(status.asset); onClose(); return; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) { if (mounted.current) setError((error as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="youtube-title">
    <form onSubmit={download} className="bg-[#101827] border border-slate-600 rounded-xl p-6 w-full max-w-lg space-y-4 text-sm">
      <div className="flex items-center justify-between"><h2 id="youtube-title" className="font-bold flex items-center gap-2"><Youtube className="text-red-500" /> Importa da YouTube</h2><button type="button" aria-label="Chiudi YouTube" onClick={onClose} disabled={busy || localBusy}><X /></button></div>
      <p className="text-slate-300">Scarica la migliore qualità video e audio disponibile su YouTube, senza ricompressione. Al termine il file viene aggiunto automaticamente allo stage.</p>
      <label className="block">Link del video<input autoFocus type="url" required value={url} onChange={e => setUrl(e.target.value)} disabled={busy || localBusy} placeholder="https://youtu.be/..." className="mt-2 w-full rounded bg-slate-900 border border-slate-600 px-3 py-2" /></label>
      {busy && <div role="status"><progress max="100" value={progress} className="w-full" />{progress > 0 ? `${progress.toFixed(0)}% — download e unione audio/video…` : 'Connessione a YouTube…'}</div>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="border-t border-slate-700 pt-3 space-y-2">
        <p className="text-slate-300">Se YouTube non è raggiungibile, puoi importare un video già presente sul tuo dispositivo.</p>
        <input ref={localFile} type="file" aria-label="File video locale" accept="video/*,.mkv,.mov,.avi" className="hidden" onChange={importLocal} />
        <button type="button" onClick={() => localFile.current?.click()} disabled={busy || localBusy} className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded py-2 font-bold">{localBusy ? 'Caricamento locale…' : 'Carica video locale'}</button>
      </div>
      <button disabled={busy || localBusy} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded py-2 font-bold">{busy ? 'Download in corso…' : 'Scarica e importa nello stage'}</button>
    </form>
  </div>;
}
