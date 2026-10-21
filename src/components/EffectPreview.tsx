import {useEffect,useRef} from 'react';
import {PlaybackEngine} from '../services/playbackEngine';
import type {VisualEffect} from '../services/visualSettings';

// A shared sample scene: each card shows the actual renderer, not a static icon.
const demo='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#287bb8"/><stop offset="1" stop-color="#f5b46d"/></linearGradient></defs><path fill="url(#s)" d="M0 0h320v180H0z"/><circle cx="245" cy="45" r="20" fill="#fff0b3"/><path fill="#315c69" d="m0 120 75-76 75 76 65-45 105 70v35H0z"/><path fill="#193c3c" d="m0 150 55-30 90 35 88-20 87 25v20H0z"/><path fill="#d08261" d="M118 97h68v52h-68z"/><path fill="#592f3f" d="m107 98 45-35 45 35z"/><path fill="#fbe3a5" d="M129 108h16v17h-16zm28 0h16v17h-16z"/><path fill="#243b49" d="M148 130h12v19h-12z"/></svg>`);
export function EffectPreview({type}:{type:VisualEffect}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const engine=new PlaybackEngine();let frame=0;const started=performance.now();
    function draw(){if(ref.current)engine.renderFrame(ref.current,((performance.now()-started)/1000)%3,[],[{id:'fx',name:'FX',startTime:0,duration:3,fadeIn:0,fadeOut:0,effectType:type,intensity:5,speed:5}],[{id:'demo',name:'Anteprima',startTime:0,duration:3,mediaUrl:demo,transparency:100}],[]);frame=requestAnimationFrame(draw);}
    draw();return()=>{cancelAnimationFrame(frame);engine.dispose();};
  },[type]);
  return <div className="relative rounded overflow-hidden border-y-4 border-dashed border-slate-500 bg-black"><canvas ref={ref} width={160} height={90} aria-label={`Anteprima ${type}`} className="w-full aspect-video pointer-events-none"/></div>;
}
