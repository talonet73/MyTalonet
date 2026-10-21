import type { TimelineClip } from '../types/editor';
export type VisualEffect = 'camera_shake' | 'zoom_in' | 'zoom_out' | 'glow' | 'vintage' | 'cinematic' | 'monochrome' | 'blur' | 'glitch';
export const EFFECTS: { type: VisualEffect; label: string; description: string }[] = [
  { type:'camera_shake', label:'Camera a mano', description:'Movimento leggero e continuo, senza bordi neri.' },
  { type:'zoom_in', label:'Zoom in', description:'Avvicinamento progressivo al centro della clip.' },
  { type:'zoom_out', label:'Zoom out', description:'Allontanamento progressivo dal centro della clip.' },
  { type:'glow', label:'Luce morbida', description:'Più luce e colori leggermente più intensi.' },
  { type:'vintage', label:'Vintage', description:'Colori attenuati e contrasto più deciso.' },
  { type:'cinematic', label:'Cinema', description:'Contrasto e colori per un aspetto cinematografico.' },
  { type:'monochrome', label:'Bianco e nero', description:'Elimina il colore mantenendo la luminosità.' },
  { type:'blur', label:'Sfocatura', description:'Sfocatura morbida del fotogramma.' },
  { type:'glitch', label:'Glitch', description:'Separazione dei canali colore.' },
];
export const ADJUSTMENTS = [
  { key:'brightness', label:'Luminosità' }, { key:'contrast', label:'Contrasto' },
  { key:'saturation', label:'Saturazione' }, { key:'exposure', label:'Esposizione' },
  { key:'temperature', label:'Temperatura' }, { key:'tint', label:'Tinta' },
  { key:'sharpness', label:'Nitidezza' },
] as const;
export type Adjustments = Partial<Record<typeof ADJUSTMENTS[number]['key'], number>>;
export interface VisualSettings { effects?: VisualEffect[]; adjustments?: Adjustments; fadeIn?: number; fadeOut?: number; duration: number; transparency?: number; intensity?: number; speed?: number; offset?: number; effectSpan?: number }
export const effectAmount = (settings: VisualSettings) => (settings.intensity ?? 5)/5;
export function colorSettings(settings: VisualSettings) {
  const a = { brightness:0, contrast:0, saturation:0, exposure:0, temperature:0, tint:0, sharpness:0, ...settings.adjustments };
  const effects = settings.effects || [];
  const amount=effectAmount(settings);
  if (effects.includes('glow')) { a.brightness += 24*amount; a.saturation += 8*amount; }
  if (effects.includes('vintage')) { a.saturation -= 60*amount; a.contrast += 10*amount; a.temperature += 15*amount; }
  if (effects.includes('cinematic')) { a.saturation -= 20*amount; a.contrast += 15*amount; }
  if (effects.includes('monochrome')) a.saturation = -100*Math.min(1,amount);
  a.saturation=Math.max(-100,a.saturation);
  return a;
}
export function motionAt(settings: VisualSettings, elapsed: number) {
  const clock=(elapsed+(settings.offset || 0))*(settings.speed ?? 5)/5;
  const p = Math.max(0, Math.min(1, clock / Math.max(.04,settings.effectSpan ?? settings.duration)));
  const fx = settings.effects || [];
  const amount=effectAmount(settings);
  let zoom = (fx.includes('zoom_in') ? 1+.25*amount*p : 1) * (fx.includes('zoom_out') ? 1+.25*amount*(1-p) : 1);
  if(fx.includes('camera_shake')) zoom *= 1+.04*amount;
  return { zoom, x:fx.includes('camera_shake') ? .006*amount*Math.sin(clock*23) : 0, y:fx.includes('camera_shake') ? .006*amount*Math.cos(clock*19) : 0 };
}
export function makeEffectClip(type:VisualEffect, trackId:string, time:number):TimelineClip {
  const effect=EFFECTS.find(e=>e.type===type);
  if(!effect)throw new Error('Effetto non valido.');
  return {id:globalThis.crypto.randomUUID(),name:effect.label,type:'effect',effectType:type,trackId,startTime:Math.max(0,time),duration:3,effectSpan:3,offset:0,intensity:5,speed:5,transparency:100,volumeDb:0,fadeIn:0,fadeOut:0,color:'#cb5c5b'};
}
export function clipAlpha(settings: VisualSettings, elapsed: number) {
  return Math.max(0,Math.min(1,(settings.transparency ?? 100)/100)) * Math.max(0,Math.min(1,settings.fadeIn ? elapsed/settings.fadeIn : 1, settings.fadeOut ? (settings.duration-elapsed)/settings.fadeOut : 1));
}
export function effectMix(settings:VisualSettings, elapsed:number, type?:string) {
  const fade=clipAlpha({...settings,transparency:100},elapsed);
  if(type==='dissolvenza')return Math.max(0,Math.min(1,fade*effectAmount(settings)));
  const moving=['camera_shake','zoom_in','zoom_out'].includes(type || '');
  const clock=(elapsed+(settings.offset||0))*(settings.speed??5)/5;
  return fade*(moving?1:.9+.1*Math.cos(clock*Math.PI*2));
}
export function adjustPixels(data: Uint8ClampedArray, settings: VisualSettings) {
  const a = colorSettings(settings), gain = 2**(a.exposure/50), contrast=1+a.contrast/100, saturation=1+a.saturation/100;
  const offset=(.5-.5*contrast+a.brightness/400)*255;
  const warm=a.temperature/100*38.25,tint=a.tint/100*12.75;
  if (![a.brightness,a.contrast,a.saturation,a.exposure,a.temperature,a.tint].some(Boolean)) return;
  for(let i=0;i<data.length;i+=4) {
    const r=data[i]*gain*contrast+offset+warm+tint, g=data[i+1]*gain*contrast+offset-2*tint, b=data[i+2]*gain*contrast+offset-warm+tint;
    const y=.2126*r+.7152*g+.0722*b;
    data[i]=y+(r-y)*saturation; data[i+1]=y+(g-y)*saturation;data[i+2]=y+(b-y)*saturation;
  }
}
export function colorExpressions(settings: VisualSettings) {
  const a=colorSettings(settings), gain=2**(a.exposure/50), c=1+a.contrast/100,s=1+a.saturation/100;
  if(![a.brightness,a.contrast,a.saturation,a.exposure,a.temperature,a.tint].some(Boolean)) return null;
  const o=(.5-.5*c+a.brightness/400)*255,w=a.temperature/100*38.25,t=a.tint/100*12.75;
  const rgb=[`(r(X,Y)*${gain*c}+${o+w+t})`,`(g(X,Y)*${gain*c}+${o-2*t})`,`(b(X,Y)*${gain*c}+${o-w+t})`];
  const y=`(.2126*${rgb[0]}+.7152*${rgb[1]}+.0722*${rgb[2]})`;
  return rgb.map(value=>`clip(${y}+(${value}-${y})*${s},0,255)`);
}
export function applyCrossDissolve(clips: TimelineClip[], selectedId: string, requested: number): TimelineClip[] {
  const target=clips.find(c=>c.id===selectedId && ['video','image'].includes(c.type));
  if(!target)throw new Error('Seleziona la seconda clip video o immagine della transizione.');
  const previous=clips.filter(c=>c.trackId===target.trackId && ['video','image'].includes(c.type) && c.id!==target.id && c.startTime<target.startTime).sort((a,b)=>b.startTime-a.startTime)[0];
  if(!previous || Math.abs(previous.startTime+previous.duration-target.startTime)>.05)throw new Error('Accosta due clip sulla stessa traccia e seleziona la seconda.');
  const duration=Math.min(Math.max(.1,requested),target.duration/2,previous.duration/2);
  const shifted=new Set(clips.filter(c=>c.trackId===target.trackId && c.startTime>=target.startTime).map(c=>c.id));
  const linkedTo=(c:TimelineClip)=>c.isLinked!==false ? clips.find(other=>other.id===c.linkedClipId && other.linkedClipId===c.id && other.isLinked!==false)?.id : undefined;
  for(const c of clips)if(shifted.has(c.id)){const linked=linkedTo(c);if(linked)shifted.add(linked);}
  return clips.map(c=>({ ...c, startTime:shifted.has(c.id)?c.startTime-duration:c.startTime,
    fadeIn:c.id===target.id || c.id===linkedTo(target) ? duration : c.fadeIn,
    // Only the incoming visual fades: fading both layers would create a black dip.
    fadeOut:c.id===previous.id ? 0 : c.id===linkedTo(previous) ? duration : c.fadeOut }));
}
