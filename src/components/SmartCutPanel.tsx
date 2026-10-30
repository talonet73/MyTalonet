import React,{useState,useEffect,useRef} from 'react';
import {Scissors,AudioLines,LoaderCircle,X,Undo2} from 'lucide-react';
import {DraggableWindow} from './DraggableWindow';
import type {TimelineClip,Track} from '../types/editor';
import type {AudioSettings} from '../services/audioMixer';
import type {CutRange} from '../services/smartCut';
export function SmartCutPanel({clips,tracks,master,language,onClose,onApply}:{clips:TimelineClip[];tracks:Track[];master:AudioSettings;language:string;onClose:()=>void;onApply:(ranges:CutRange[],warning?:string)=>void}){
  const [margin,setMargin]=useState(1),[fillers,setFillers]=useState(false),[retakes,setRetakes]=useState(false),[analysisLanguage,setAnalysisLanguage]=useState(language);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const version=JSON.stringify([clips,tracks,master]),currentVersion=useRef(version),alive=useRef(true),running=useRef(false);currentVersion.current=version;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const run=async()=>{
    if(running.current)return;running.current=true;setBusy(true);setError('');setStatus('Scansione di tutto l’audio…');const basis=currentVersion.current;
    try{
      const response=await fetch('/api/smart-cut',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips,tracks,audioMaster:master,language:analysisLanguage,mode:'automatic',margin,fillers,retakes,durationSec:Math.max(0,...clips.map(c=>c.startTime+c.duration))})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Analisi non riuscita.');
      while(alive.current){
        const r=await fetch(`/api/captions/${result.jobId}`),j=await r.json();if(!r.ok||j.status==='error')throw new Error(j.error||'Analisi non riuscita.');
        if(j.status==='complete'){
          if(currentVersion.current!==basis)throw new Error('Il montaggio è cambiato durante la scansione. Premi di nuovo il pulsante per analizzare la versione aggiornata.');
          const ranges=(j.candidates||[]) as CutRange[];
          if(ranges.length){setStatus('Taglio automatico in corso…');onApply(ranges,j.warning);}else setStatus('Scansione completata: nessuna pausa supera il margine impostato.');
          if(j.warning)setError(j.warning);break;
        }
        setStatus(j.phase||'Scansione di tutto l’audio…');await new Promise(resolve=>setTimeout(resolve,500));
      }
    }catch(e){if(alive.current){setError((e as Error).message);setStatus('');}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  };
  return <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center"><DraggableWindow as="section" role="dialog" aria-label="Montaggio intelligente" className="smart-cut-panel">
    <header data-window-handle><strong className="flex items-center gap-2"><Scissors size={18}/> AI Cut · taglio automatico</strong><button aria-label="Chiudi montaggio intelligente" onClick={onClose} disabled={busy}><X size={16}/></button></header>
    <div className="p-4 space-y-4">
      <label className="block">Pausa da conservare: <output>{margin.toFixed(1)} secondi</output><input aria-label="Margine pause" type="range" min="0.5" max="2" step="0.1" value={margin} disabled={busy} onChange={e=>setMargin(Number(e.target.value))}/></label>
      <p>Ogni pausa più lunga viene accorciata al valore scelto, distribuendo il margine ai due lati. Viene analizzato tutto l’audio delle piste, anche quelle in Mute, senza dipendere dal volume di ascolto.</p>
      <label className="block"><input type="checkbox" aria-label="Elimina esitazioni" checked={fillers} disabled={busy} onChange={e=>setFillers(e.target.checked)}/> Elimina anche ehm/uhm riconosciuti</label>
      <label className="block"><input type="checkbox" aria-label="Elimina ciak e ripetizioni" checked={retakes} disabled={busy} onChange={e=>setRetakes(e.target.checked)}/> Elimina anche ciak e ripetizioni riconosciuti</label>
      {(fillers||retakes)&&<><label>Lingua <select aria-label="Lingua analisi" disabled={busy} value={analysisLanguage} onChange={e=>setAnalysisLanguage(e.target.value)}>{['Italian','English','Spanish','French','German','Japanese','Auto'].map(l=><option key={l}>{l}</option>)}</select></label><p>Queste opzioni usano Whisper e richiedono più tempo. Le parole possono essere riconosciute male: i tagli vengono applicati direttamente e sono annullabili.</p></>}
      <button className="flex items-center justify-center gap-2 w-full bg-cyan-900 font-bold" disabled={busy||!clips.some(c=>c.type==='audio'||c.type==='video')} onClick={run}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<AudioLines size={18}/>} {busy?'Scansione e taglio in corso…':'Scansiona e taglia automaticamente'}</button>
      {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
      <p className="flex items-center gap-2"><Undo2 size={15}/> Nessuna conferma aggiuntiva. Video e audio rimangono sincronizzati; Indietro annulla i tagli. I file originali restano invariati.</p>
    </div>
  </DraggableWindow></div>;
}
