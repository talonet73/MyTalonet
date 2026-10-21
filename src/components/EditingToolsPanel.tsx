import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { TimelineClip } from '../types/editor';
import { ADJUSTMENTS, EFFECTS, type VisualEffect } from '../services/visualSettings';
import {EffectPreview} from './EffectPreview';
export function EditingToolsPanel({ tab, selected, onClose, onUpdate, onCrossDissolve, onAddEffect, children }: {
  tab:string; selected:TimelineClip|null; onClose:()=>void; onUpdate:(updates:Partial<TimelineClip>)=>void;
  onCrossDissolve:(duration:number)=>void; children?:React.ReactNode;
  onAddEffect:(type:VisualEffect)=>void;
}) {
  const [transitionDuration,setTransitionDuration]=useState(.8);
  const visual=selected && ['video','image'].includes(selected.type);
  return <section role="dialog" aria-label={`Pannello ${tab}`} className="absolute top-[105px] left-[300px] z-40 w-[360px] max-h-[calc(100vh-150px)] overflow-y-auto rounded-xl border border-slate-600 bg-[#111a2b] shadow-2xl text-sm">
    <header className="sticky top-0 z-10 bg-[#111a2b] flex items-center justify-between p-3 border-b border-slate-700"><h2 className="font-bold text-cyan-300">{tab}</h2><button aria-label="Chiudi pannello" onClick={onClose} className="p-1 rounded hover:bg-slate-700"><X size={18}/></button></header>
    {tab==='Captions' ? <div className="h-[440px]">{children}</div> : <div className="p-4 space-y-4">
      <p className="text-xs text-slate-300">{tab==='Effects' ? 'Trascina un’anteprima sulla traccia EFFECTS, oppure cliccala per inserirla al cursore. Seleziona poi il mattoncino per regolare intensità e velocità.' : visual ? `Clip: ${selected.name}` : 'Seleziona una clip video o un’immagine nella timeline.'}</p>
      {tab==='Effects' && <>
        <div className="grid grid-cols-2 gap-2">{EFFECTS.map(effect=><button key={effect.type} draggable aria-label={`Inserisci ${effect.label}`} data-effect-type={effect.type} title={effect.description} onDragStart={e=>{e.dataTransfer.setData('application/json',JSON.stringify({type:'effect',effectType:effect.type}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>onAddEffect(effect.type)} className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 p-2 text-left cursor-grab"><EffectPreview type={effect.type}/><strong className="block text-xs mt-2">{effect.label}</strong><span className="block text-[10px] mt-1 text-slate-300">{effect.description}</span></button>)}</div>
      </>}
      {tab==='Transitions' && <>
        <label className="block text-xs">Durata dissolvenza (secondi)<input type="number" min="0.1" max="5" step="0.1" value={transitionDuration} onChange={e=>setTransitionDuration(Math.max(.1,Math.min(5,Number(e.target.value)||.1)))} className="block mt-2 w-full p-2 bg-slate-900 rounded border border-slate-600"/></label>
        <button disabled={!visual} onClick={()=>onUpdate({fadeIn:Math.min(transitionDuration,selected!.duration/2)})} className="block w-full p-3 bg-slate-800 hover:bg-slate-700 rounded disabled:opacity-40">Dissolvenza in entrata</button>
        <button disabled={!visual} onClick={()=>onUpdate({fadeOut:Math.min(transitionDuration,selected!.duration/2)})} className="block w-full p-3 bg-slate-800 hover:bg-slate-700 rounded disabled:opacity-40">Dissolvenza in uscita</button>
        <button disabled={!visual} onClick={()=>onCrossDissolve(transitionDuration)} className="block w-full p-3 bg-cyan-900 hover:bg-cyan-800 rounded disabled:opacity-40">Dissolvenza incrociata con precedente</button>
        <p className="text-xs text-slate-400">Accosta due clip sulla stessa traccia e seleziona la seconda. La dissolvenza incrociata le sovrappone e anticipa le clip successive della stessa traccia, insieme al loro audio collegato.</p>
        <button disabled={!visual} onClick={()=>onUpdate({fadeIn:0,fadeOut:0})} className="w-full p-2 rounded border border-slate-600 disabled:opacity-40">Rimuovi dissolvenze</button>
      </>}
      {tab==='Adjustment' && <>
        {ADJUSTMENTS.map(({key,label})=><label key={key} className="block text-xs"><span className="flex justify-between"><span>{label}</span><output>{selected?.adjustments?.[key] || 0}</output></span><input aria-label={label} disabled={!visual} type="range" min={key==='sharpness'?0:-100} max="100" step="1" value={selected?.adjustments?.[key] || 0} onChange={e=>onUpdate({adjustments:{...selected!.adjustments,[key]:Number(e.target.value)}})} className="w-full mt-2 accent-cyan-400 disabled:opacity-40"/></label>)}
        <button disabled={!visual} onClick={()=>onUpdate({adjustments:{}})} className="w-full p-2 rounded border border-slate-600 disabled:opacity-40">Ripristina regolazioni</button>
      </>}
    </div>}
  </section>;
}
