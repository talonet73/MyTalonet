import {applyGrade,hasGrade} from './colorGrade';
import {LiveAudioMixer} from './liveAudioMixer';
import type {AudioSettings} from './audioMixer';
import type {Track} from '../types/editor';
import {clipRate,sourceTime} from './clipSpeed';
import { adjustPixels, clipAlpha, colorSettings, motionAt, effectAmount, effectMix, type VisualSettings } from './visualSettings';
/**
 * Real Media & Canvas Rendering Engine for TALEDIT
 * Supports playback of real imported HTML5 video, audio and images,
 * with volumeDb gain control, camera shake, transparency & effects.
 * NO synthetic oscillator drone sound!
 */

export interface VideoClipData extends Partial<VisualSettings> {
  trackId?:string;
  id: string;
  name: string;
  transparency: number;
  startTime: number;
  duration: number;
  offset?: number;
  mediaUrl?: string;
  hasSeparateAudioClip?: boolean;
  volumeDb?: number;
  layer?: number;
}

export interface AudioClipData {
  speedLevel?:number;
  trackId?:string;
  id: string;
  name: string;
  volumeDb: number;
  startTime: number;
  duration: number;
  offset?: number;
  mediaUrl?: string;
  fadeIn?: number;
  fadeOut?: number;
}

export interface EffectClipData extends Partial<VisualSettings> {
  id: string;
  name: string;
  fadeIn: number;
  fadeOut: number;
  startTime: number;
  duration: number;
  effectType?: string;
}

export interface ImageClipData extends Partial<VisualSettings> {
  layer?: number;
  id: string;
  name: string;
  transparency: number;
  startTime: number;
  duration: number;
  mediaUrl?: string;
}

export interface SubtitleData {
  row?:number;transparency?:number;fadeIn?:number;fadeOut?:number;
  text: string;
  startTime: number;
  endTime: number;
}

export class PlaybackEngine {
  private frameCache = new Map<string, HTMLCanvasElement>();
  private videoCache = new Map<string, HTMLVideoElement>();
  private audioCache = new Map<string, HTMLAudioElement>();
  private imageCache = new Map<string, HTMLImageElement>();
  private audioContext: AudioContext | null = null;
  private mixer:LiveAudioMixer|null=null;
  private gainRoutes=new Map<HTMLMediaElement,AudioNode>();
  public audioLevel(id:string){return this.mixer?.level(id) || {peak:0,rms:0};}
  private gains = new Map<HTMLMediaElement, GainNode>();
  private onFrameReady: (() => void) | null = null;
  private notify = () => this.onFrameReady?.();
  public setOnFrameReady(callback: (() => void) | null) { this.onFrameReady = callback; }
  public getVideoElement(url: string, key = url) {
    let element = this.videoCache.get(key);
    if (element && element.getAttribute('src') !== url) { element.pause(); element.src = url; }
    if (!element) {
      element = document.createElement('video');
      element.crossOrigin = 'anonymous'; element.playsInline = true; element.preload = 'auto'; element.muted = true;
      for (const event of ['loadeddata','seeked','canplay','timeupdate']) element.addEventListener(event, this.notify);
      element.src = url; this.videoCache.set(key, element);
    }
    return element;
  }
  public getAudioElement(url: string, key = url) {
    let element = this.audioCache.get(key);
    if (element && element.getAttribute('src') !== url) { element.pause(); element.src = url; }
    if (!element) { element = new Audio(); element.crossOrigin = 'anonymous'; element.preload = 'auto'; element.src = url; this.audioCache.set(key, element); }
    return element;
  }
  public getImageElement(url: string) {
    let image = this.imageCache.get(url);
    if (!image) { image = new Image(); image.crossOrigin = 'anonymous'; image.onload = this.notify; image.src = url; this.imageCache.set(url, image); }
    return image;
  }
  private gain(element: HTMLMediaElement, db: number, muted: boolean, playing: boolean, amplitude = 1,trackId="") {
    // Do not create an AudioContext until the user starts playback.
    if (!playing) return;
    if (!this.audioContext) this.audioContext = new AudioContext();
    let gain = this.gains.get(element);
    if (!gain) { gain = this.audioContext.createGain(); this.audioContext.createMediaElementSource(element).connect(gain); this.gains.set(element, gain); }
    const destination=this.mixer?.input(trackId)||this.audioContext.destination;
    if(this.gainRoutes.get(element)!==destination){gain.disconnect();gain.connect(destination);this.gainRoutes.set(element,destination);}
    gain.gain.value = muted || db <= -60 ? 0 : Math.pow(10, db / 20) * amplitude;
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
  }
  public syncMedia(time: number, playing: boolean, videos: VideoClipData[], audios: AudioClipData[], muted: boolean, tracks:Track[]=[], master?:AudioSettings) {
    if(playing&&!this.audioContext)this.audioContext=new AudioContext();
    if(this.audioContext){if(!this.mixer)this.mixer=new LiveAudioMixer(this.audioContext);this.mixer.configure(tracks,master,playing,muted);}
    const videoIds = new Set<string>(), audioIds = new Set<string>();
    const sync = (element: HTMLMediaElement, target: number,rate:number) => {
      element.playbackRate=rate;element.preservesPitch=true;
      if (Number.isFinite(element.duration) && target >= element.duration) { element.pause(); return; }
      if (!element.seeking && Math.abs(element.currentTime - target) > (playing ? .15 : .015)) element.currentTime = target;
      if (playing && element.paused) void element.play().catch(() => {});
      if (!playing && !element.paused) element.pause();
    };
    for (const clip of videos) if (clip.mediaUrl && time >= clip.startTime && time < clip.startTime + clip.duration) {
      videoIds.add(clip.id); const element = this.getVideoElement(clip.mediaUrl, clip.id);
      element.muted = muted || Boolean(clip.hasSeparateAudioClip);
      if (!clip.hasSeparateAudioClip) this.gain(element, clip.volumeDb || 0, muted, playing, clipAlpha({...clip,transparency:100},time-clip.startTime),clip.trackId);
      sync(element, Math.max(0, sourceTime(clip,time)),clipRate(clip));
    }
    for (const clip of audios) if (clip.mediaUrl && time >= clip.startTime && time < clip.startTime + clip.duration) {
      audioIds.add(clip.id); const element = this.getAudioElement(clip.mediaUrl, clip.id);
      element.muted = muted; this.gain(element, clip.volumeDb, muted, playing, clipAlpha({...clip,transparency:100},time-clip.startTime),clip.trackId);
      sync(element, Math.max(0, sourceTime(clip,time)),clipRate(clip));
    }
    for (const [key, element] of this.videoCache) if (!videoIds.has(key)) element.pause();
    for (const [key, element] of this.audioCache) if (!audioIds.has(key)) element.pause();
  }
  private async waitFor(element: HTMLMediaElement, event: string, ready: () => boolean) {
    if (ready()) return;
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener('error', done); resolve(); };
      const timer = setTimeout(done, 10000);
      element.addEventListener(event, done); element.addEventListener('error', done);
    });
  }
  public async preloadVideos(videos: VideoClipData[]) {
    await Promise.all(videos.filter(c => c.mediaUrl).map(c => { const element = this.getVideoElement(c.mediaUrl!, c.id); return this.waitFor(element, 'loadeddata', () => element.readyState >= 2 || Boolean(element.error)); }));
  }
  public async prepareAndRenderFrame(canvas: HTMLCanvasElement, time: number, videos: VideoClipData[], effects: EffectClipData[], images: ImageClipData[], subtitles: SubtitleData[], shouldRender=()=>true) {
    const active = videos.filter(v => time >= v.startTime && time < v.startTime + v.duration);
    await this.preloadVideos(active);
    if(!shouldRender())return;
    await Promise.all(active.filter(c => c.mediaUrl).map(async c => {
      if(!shouldRender())return;
      const element = this.getVideoElement(c.mediaUrl!, c.id);
      const target = Math.min(Math.max(0, element.duration - .001), sourceTime(c,time));
      if (Number.isFinite(target) && Math.abs(element.currentTime - target) > .015) { element.currentTime = target; await this.waitFor(element, 'seeked', () => !element.seeking); }
    }));
    await Promise.all(images.filter(c => c.mediaUrl).map(c => this.getImageElement(c.mediaUrl!).decode().catch(() => {})));
    if(shouldRender())this.renderFrame(canvas, time, videos, effects, images, subtitles);
  }
  public renderFrame(canvas: HTMLCanvasElement, time: number, videos: VideoClipData[], effects: EffectClipData[], images: ImageClipData[], subtitles: SubtitleData[]) {
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const width=canvas.width,height=canvas.height;
    ctx.clearRect(0,0,width,height);ctx.fillStyle='black';ctx.fillRect(0,0,width,height);
    const global=effects.filter(e=>time>=e.startTime && time<e.startTime+e.duration);
    const active=[...videos.map(c=>({...c,kind:'video'})),...images.map(c=>({...c,kind:'image'}))].filter(c=>time>=c.startTime && time<c.startTime+c.duration).sort((a,b)=>a.startTime-b.startTime || (a.layer||0)-(b.layer||0));
    for(const clip of active) {
      if(!clip.mediaUrl)continue;
      const source=clip.kind==='video'?this.getVideoElement(clip.mediaUrl,clip.id):this.getImageElement(clip.mediaUrl);
      const w=source instanceof HTMLVideoElement?source.videoWidth:source.naturalWidth;
      const h=source instanceof HTMLVideoElement?source.videoHeight:source.naturalHeight;
      if(!w || !h || (source instanceof HTMLVideoElement && source.readyState<2))continue;
      let frame=this.frameCache.get(clip.id);
      if(!frame){frame=document.createElement('canvas');this.frameCache.set(clip.id,frame);}
      if(frame.width!==width || frame.height!==height){frame.width=width;frame.height=height;}
      const target=frame.getContext('2d',{willReadFrequently:true})!;
      target.clearRect(0,0,width,height);
      const settings:VisualSettings=clip;
      const ratio=Math.min(width/w,height/h);
      target.drawImage(source,(width-w*ratio)/2,(height-h*ratio)/2,w*ratio,h*ratio);
      const color=colorSettings(settings);
      if(Object.values(color).some(Boolean) || hasGrade(settings.colorGrade) || settings.effects?.includes('glitch')) {
        const pixels=target.getImageData(0,0,width,height);adjustPixels(pixels.data,settings);applyGrade(pixels.data,settings.colorGrade);
        if(color.sharpness || (!settings.colorGrade?.bypass && settings.colorGrade?.sharpness)) {
          const original=new Uint8ClampedArray(pixels.data),amount=Math.min(100,color.sharpness+(settings.colorGrade?.bypass?0:settings.colorGrade?.sharpness||0))/100*1.5;
          for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)for(let c=0;c<3;c++) {
            const i=(y*width+x)*4+c;let blur=0;
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)blur+=original[i+(dy*width+dx)*4]*(dx===0?2:1)*(dy===0?2:1)/16;
            pixels.data[i]=original[i]+amount*(original[i]-blur);
          }
        }
        if(settings.effects?.includes('glitch')) {
          const original=new Uint8ClampedArray(pixels.data),shift=Math.max(1,Math.round(width*.004));
          for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
            const i=(y*width+x)*4;
            pixels.data[i]=original[(y*width+Math.max(0,x-shift))*4];pixels.data[i+2]=original[(y*width+Math.min(width-1,x+shift))*4+2];
          }
        }
        target.putImageData(pixels,0,0);
      }
      const elapsed=time-clip.startTime,motion=motionAt({...settings,offset:0},elapsed);
      ctx.save();
      ctx.globalAlpha=clipAlpha(settings,elapsed);
      if(settings.effects?.includes('blur'))ctx.filter=`blur(${height/90*effectAmount(settings)}px)`;
      ctx.translate(width/2-motion.x*width,height/2-motion.y*height);ctx.scale(motion.zoom,motion.zoom);
      ctx.drawImage(frame,-width/2,-height/2);ctx.restore();
    }
    for(const effect of global) {
      if(effect.intensity===0)continue;
      const elapsed=time-effect.startTime;
      if(effect.effectType==='dissolvenza') {ctx.save();ctx.globalAlpha=1-effectMix(effect,elapsed,effect.effectType);ctx.fillStyle='black';ctx.fillRect(0,0,width,height);ctx.restore();continue;}
      const settings:VisualSettings={...effect,effects:[effect.effectType as any]};
      let frame=this.frameCache.get('effect:'+effect.id);
      if(!frame){frame=document.createElement('canvas');this.frameCache.set('effect:'+effect.id,frame);}
      frame.width=width;frame.height=height;
      const target=frame.getContext('2d',{willReadFrequently:true})!;target.drawImage(canvas,0,0);
      const pixels=target.getImageData(0,0,width,height);adjustPixels(pixels.data,settings);
      if(effect.effectType==='glitch') {
        const original=new Uint8ClampedArray(pixels.data),shift=Math.round(width*.004*effectAmount(effect));
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels.data[i]=original[(y*width+Math.max(0,x-shift))*4];pixels.data[i+2]=original[(y*width+Math.min(width-1,x+shift))*4+2];}
      }
      target.putImageData(pixels,0,0);
      const motion=motionAt(settings,elapsed);
      ctx.save();ctx.globalAlpha=effectMix(effect,elapsed,effect.effectType);
      if(effect.effectType==='blur')ctx.filter=`blur(${height/90*effectAmount(effect)}px)`;
      ctx.translate(width/2-motion.x*width,height/2-motion.y*height);ctx.scale(motion.zoom,motion.zoom);ctx.drawImage(frame,-width/2,-height/2);ctx.restore();
    }
    for(const subtitle of subtitles.filter(s=>time>=s.startTime && time<s.endTime)) {
      ctx.save();ctx.globalAlpha=clipAlpha({...subtitle,duration:subtitle.endTime-subtitle.startTime},time-subtitle.startTime);
      const font=Math.round(height/24),lines=subtitle.text.split('\n');
      ctx.font=`bold ${font}px sans-serif`;ctx.textAlign='center';
      const w=Math.min(width-20,Math.max(...lines.map(line=>ctx.measureText(line).width))+16),h=lines.length*(font+4),row=(subtitle.row||0)*font*2;
      ctx.fillStyle='#000b';ctx.fillRect((width-w)/2,height-h-24-row,w,h+10);ctx.fillStyle='yellow';
      lines.forEach((line,i)=>ctx.fillText(line,width/2,height-h-14-row+(i+1)*(font+4),width-24));ctx.restore();
    }
  }
  public pauseAll() { this.mixer?.configure([],undefined,false,true); this.videoCache.forEach(v => v.pause()); this.audioCache.forEach(a => a.pause()); }
  public dispose() {
    this.pauseAll(); this.onFrameReady = null;
    for (const element of [...this.videoCache.values(), ...this.audioCache.values()]) { element.removeAttribute('src'); element.load(); }
    this.videoCache.clear(); this.audioCache.clear(); this.imageCache.clear(); this.frameCache.clear(); this.gains.clear();this.gainRoutes.clear();this.mixer=null;
    if (this.audioContext) void this.audioContext.close(); this.audioContext = null;
  }
}
export const playbackEngine = new PlaybackEngine();
