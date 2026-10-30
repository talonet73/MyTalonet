import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,RotateCcw,Volume2,VolumeX,Plus,Headphones} from 'lucide-react';
import type {Track} from '../types/editor';
import {AUDIO_CONTROLS,audioSettings,type AudioSettings,type AudioKey} from '../services/audioMixer';
import {playbackEngine} from '../services/playbackEngine';

type Control=typeof AUDIO_CONTROLS[number];
function Knob({control,value,onChange,label}:{control:Control;value:number;onChange:(n:number)=>void;label:string}){
  const [key,title,min,max,initial,step,unit]=control;
  const drag=useRef<{y:number;value:number}|null>(null);
  const update=(n:number)=>onChange(Math.min(max,Math.max(min,Math.round(n/step)*step)));
  const angle=-135+(value-min)/(max-min)*270;
  return <div className="audio-knob-control"><span>{title}</span><div className="audio-knob" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} ${unit}`} title="Trascina su/giù, usa le frecce o fai doppio clic per ripristinare"
    onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,value};}}
    onPointerMove={e=>{if(drag.current)update(drag.current.value+(drag.current.y-e.clientY)*(max-min)/180);}}
    onPointerUp={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onDoubleClick={()=>onChange(initial)}
    onKeyDown={e=>{if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();update(e.key==='Home'?min:e.key==='End'?max:value+(['ArrowUp','ArrowRight'].includes(e.key)?step:-step)*(e.shiftKey?10:1));}}}>
    <i style={{transform:`rotate(${angle}deg)`}}/></div>
    <label className="audio-knob-value"><input aria-label={`${label} valore`} type="number" min={min} max={max} step={step} value={Number(value.toFixed(2))} onChange={e=>{if(e.target.value!=='')update(Number(e.target.value));}}/>{unit}</label>
  </div>;
}
function Meter({id,playing}:{id:string;playing:boolean}){
  const [level,setLevel]=useState({peak:0,rms:0});
  useEffect(()=>{const timer=setInterval(()=>setLevel(playing?playbackEngine.audioLevel(id):{peak:0,rms:0}),100);return()=>clearInterval(timer);},[id,playing]);
  const db=level.peak>0?20*Math.log10(level.peak):-60;
  return <div className="audio-meter" role="meter" aria-label={`Livello ${id}`} aria-valuemin={-60} aria-valuemax={12} aria-valuenow={Math.min(12,Math.max(-60,db))}><div style={{width:`${Math.min(100,Math.max(0,(db+60)/60*100))}%`,background:db>=0?'#fb7185':db>-6?'#facc15':'#34d399'}}/><output>{db<=-60?'−∞':db.toFixed(1)} dB{db>=0?' · PICCO':''}</output></div>;
}
interface Props {
  tracks:Track[];master:AudioSettings;playing:boolean;muted:boolean;currentTime:number;duration:number;
  onPlay:()=>void;onMuteMaster:()=>void;onSeek:(n:number)=>void;onUpdate:(id:string,settings:AudioSettings)=>void;
  onSolo:(id:string)=>void;onMute:(id:string)=>void;onAdd:()=>void;
}
export function AudioMixer({tracks,master,playing,muted,currentTime,duration,onPlay,onMuteMaster,onSeek,onUpdate,onSolo,onMute,onAdd}:Props){
  return <section aria-label="Mixer audio" className="audio-workspace">
    <header className="audio-transport"><Headphones size={18}/><strong>MIXER AUDIO</strong><button aria-label={playing?'Pausa audio':'Riproduci audio'} onClick={onPlay}>{playing?<Pause size={18}/>:<Play size={18}/>}</button><output>{currentTime.toFixed(2)} s</output><input aria-label="Posizione audio" type="range" min={0} max={duration} step={.01} value={currentTime} onChange={e=>onSeek(Number(e.target.value))}/><button onClick={onAdd}><Plus size={14}/> Pista audio</button></header>
    <p className="audio-help">Trascina le manopole su/giù · doppio clic per ripristinare · i controlli si applicano anche all’esportazione. Riduzione rumore: attenua il fondo nelle pause.</p>
    <div className="audio-strips">{[...tracks.map(t=>({id:t.id,name:t.name,settings:t.audio||{},track:t})),{id:'master',name:'MASTER',settings:master,track:null}].map(strip=>{
      const s=audioSettings({...strip.settings,bypass:false});
      return <article key={strip.id} aria-label={`Canale ${strip.name}`} className={`audio-strip ${strip.id==='master'?'audio-master':''}`}>
        <header><strong title={strip.name}>{strip.name}</strong><div className="audio-channel-buttons">
          {strip.track&&<button aria-label={`Solo ${strip.name}`} aria-pressed={strip.track.isSolo} onClick={()=>onSolo(strip.id)}>S</button>}
          <button aria-label={`Mute ${strip.name}`} aria-pressed={strip.track?strip.track.isMuted:muted} onClick={()=>strip.track?onMute(strip.id):onMuteMaster()}>{(strip.track?strip.track.isMuted:muted)?<VolumeX size={14}/>:<Volume2 size={14}/>}</button>
          <button aria-label={`Bypass ${strip.name}`} aria-pressed={!!strip.settings.bypass} onClick={()=>onUpdate(strip.id,{...strip.settings,bypass:!strip.settings.bypass})}>FX</button>
          <button aria-label={`Ripristina ${strip.name}`} onClick={()=>onUpdate(strip.id,{})}><RotateCcw size={13}/></button>
        </div><Meter id={strip.id} playing={playing&&!muted&&!strip.track?.isMuted}/></header>
        <div className="audio-knobs">{AUDIO_CONTROLS.map(c=><Knob key={c[0]} control={c} label={`${strip.name} ${c[1]}`} value={s[c[0]]} onChange={value=>onUpdate(strip.id,{...strip.settings,[c[0] as AudioKey]:value,bypass:false})}/>)}</div>
      </article>;
    })}</div>
  </section>;
}
