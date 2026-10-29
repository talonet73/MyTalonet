import {clipRate} from '../services/clipSpeed';
import {DraggableWindow} from './DraggableWindow';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {MediaAsset,TimelineClip} from '../types/editor';

export function BGRemoverPanel({open,selected,onClose,onComplete}:{open:boolean;selected:TimelineClip|null;onClose:()=>void;onComplete:(asset:MediaAsset,original:TimelineClip)=>void}) {
  const [ready,setReady]=useState<boolean|null>(null),[job,setJob]=useState<any>(null),[error,setError]=useState('');
  const completionRef=useRef(onComplete);completionRef.current=onComplete;
  const originalRef=useRef<TimelineClip|null>(null);
  useEffect(()=>{if(open)fetch('/api/background/status').then(r=>r.json()).then(data=>setReady(data.ready===true)).catch(()=>{setReady(false);setError('Impossibile verificare BG Remover.');});},[open]);
  useEffect(()=>{
    if(!job?.id || job.status!=='running')return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const response=await fetch(`/api/background/${job.id}`);const result=await response.json();if(!response.ok)throw new Error(result.error || 'Elaborazione non disponibile.');if(stopped)return;setJob(result);if(result.status==='complete' && originalRef.current)completionRef.current(result.asset,originalRef.current);if(result.status==='error')setError(result.error);if(result.status==='running')timer=setTimeout(poll,1000);}catch(e){if(!stopped){setError((e as Error).message);setJob((old:any)=>({...old,status:'error'}));}}}
    timer=setTimeout(poll,300);return()=>{stopped=true;clearTimeout(timer);};
  },[job?.id,job?.status]);
  async function start(){if(!selected)return;setError('');originalRef.current={...selected};setJob({status:'starting',progress:0});try{const response=await fetch('/api/background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mediaUrl:selected.mediaUrl,type:selected.type,offset:selected.offset || 0,duration:selected.duration*clipRate(selected)})});const result=await response.json();if(!response.ok)throw new Error(result.error || 'Rimozione non avviata.');setJob({id:result.jobId,status:'running',progress:0});}catch(e){setError((e as Error).message);setJob(null);}}
  async function cancel(){try{const response=await fetch(`/api/background/${job.id}`,{method:'DELETE'});const result=await response.json();if(!response.ok)throw new Error(result.error || 'Annullamento non riuscito.');setJob(result);}catch(e){setError((e as Error).message);}}
  if(!open)return null;
  const running=job?.status==='running'||job?.status==='starting';
  const visual=selected && ['image','video'].includes(selected.type);
  return <DraggableWindow as="section" role="dialog" aria-label="Pannello BG Remover" className="absolute top-[105px] right-4 z-40 w-[360px] max-h-[calc(100vh-150px)] overflow-y-auto rounded-xl border border-slate-600 bg-[#111a2b] shadow-2xl text-sm text-slate-200">
    <header data-window-handle className="flex justify-between items-center p-3 border-b border-slate-700"><h2 className="font-bold text-cyan-300">BG Remover</h2><button aria-label="Chiudi BG Remover" onClick={onClose}><X size={18}/></button></header>
    <div className="p-4 space-y-4"><p>Rimuovi lo sfondo e conserva il soggetto principale, dando priorità a quello centrale. Il riconoscimento automatico può richiedere una scena più chiara.</p>
      <p className="text-xs text-slate-400">Gratuito con rembg, sul tuo computer. Le immagini diventano PNG trasparenti; i video WebM con trasparenza, mantenendo l’audio. L’elaborazione dei video può richiedere tempo.</p>
      <p>{visual?`Clip: ${selected.name}`:'Seleziona un video o un’immagine nella timeline.'}</p>
      {ready===false && <p role="status">BG Remover non è pronto. Chiudi e riapri con 2-AVVIA-TALEDIT per prepararlo.</p>}
      {running && <div role="status"><p>Elaborazione: {job.progress}%</p><progress aria-label="Avanzamento rimozione sfondo" max="100" value={job.progress} className="w-full"/><p className="text-xs">Puoi chiudere il pannello: l’elaborazione continua.</p></div>}
      {error && <p role="alert" className="text-red-300 whitespace-pre-wrap">{error}</p>}
      {job?.status==='complete' && <p role="status" className="text-green-300">Sfondo rimosso. Il file è nello stage; la clip originale è sostituita se ancora presente. Puoi usare Annulla per ripristinarla.</p>}
      {job?.status==='cancelled' && <p role="status">Elaborazione annullata.</p>}
      <button disabled={!visual || !ready || running} onClick={start} className="w-full rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 p-3">Rimuovi sfondo</button>
      {job?.status==='running' && <button onClick={cancel} className="w-full rounded border border-slate-600 p-2">Annulla elaborazione</button>}
    </div>
  </DraggableWindow>;
}
