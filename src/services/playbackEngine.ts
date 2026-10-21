/**
 * Real Media & Canvas Rendering Engine for TALEDIT
 * Supports playback of real imported HTML5 video, audio and images,
 * with volumeDb gain control, camera shake, transparency & effects.
 * NO synthetic oscillator drone sound!
 */

export interface VideoClipData {
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
  id: string;
  name: string;
  volumeDb: number;
  startTime: number;
  duration: number;
  offset?: number;
  mediaUrl?: string;
}

export interface EffectClipData {
  id: string;
  name: string;
  fadeIn: number;
  fadeOut: number;
  startTime: number;
  duration: number;
  effectType?: string;
}

export interface ImageClipData {
  layer?: number;
  id: string;
  name: string;
  transparency: number;
  startTime: number;
  duration: number;
  mediaUrl?: string;
}

export interface SubtitleData {
  text: string;
  startTime: number;
  endTime: number;
}

export class PlaybackEngine {
  private videoCache = new Map<string, HTMLVideoElement>();
  private audioCache = new Map<string, HTMLAudioElement>();
  private imageCache = new Map<string, HTMLImageElement>();
  private audioContext: AudioContext | null = null;
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
  private gain(element: HTMLMediaElement, db: number, muted: boolean, playing: boolean) {
    // Do not create an AudioContext until the user starts playback.
    if (!playing) return;
    if (!this.audioContext) this.audioContext = new AudioContext();
    let gain = this.gains.get(element);
    if (!gain) { gain = this.audioContext.createGain(); this.audioContext.createMediaElementSource(element).connect(gain); gain.connect(this.audioContext.destination); this.gains.set(element, gain); }
    gain.gain.value = muted || db <= -60 ? 0 : Math.pow(10, db / 20);
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
  }
  public syncMedia(time: number, playing: boolean, videos: VideoClipData[], audios: AudioClipData[], muted: boolean) {
    const videoIds = new Set<string>(), audioIds = new Set<string>();
    const sync = (element: HTMLMediaElement, target: number) => {
      if (Number.isFinite(element.duration) && target >= element.duration) { element.pause(); return; }
      if (!element.seeking && Math.abs(element.currentTime - target) > (playing ? .15 : .015)) element.currentTime = target;
      if (playing && element.paused) void element.play().catch(() => {});
      if (!playing && !element.paused) element.pause();
    };
    for (const clip of videos) if (clip.mediaUrl && time >= clip.startTime && time < clip.startTime + clip.duration) {
      videoIds.add(clip.id); const element = this.getVideoElement(clip.mediaUrl, clip.id);
      element.muted = muted || Boolean(clip.hasSeparateAudioClip);
      if (!clip.hasSeparateAudioClip) this.gain(element, clip.volumeDb || 0, muted, playing);
      sync(element, Math.max(0, time - clip.startTime + (clip.offset || 0)));
    }
    for (const clip of audios) if (clip.mediaUrl && time >= clip.startTime && time < clip.startTime + clip.duration) {
      audioIds.add(clip.id); const element = this.getAudioElement(clip.mediaUrl, clip.id);
      element.muted = muted; this.gain(element, clip.volumeDb, muted, playing);
      sync(element, Math.max(0, time - clip.startTime + (clip.offset || 0)));
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
  public async prepareAndRenderFrame(canvas: HTMLCanvasElement, time: number, videos: VideoClipData[], effects: EffectClipData[], images: ImageClipData[], subtitles: SubtitleData[]) {
    const active = videos.filter(v => time >= v.startTime && time < v.startTime + v.duration);
    await this.preloadVideos(active);
    await Promise.all(active.filter(c => c.mediaUrl).map(async c => {
      const element = this.getVideoElement(c.mediaUrl!, c.id);
      const target = Math.min(Math.max(0, element.duration - .001), time - c.startTime + (c.offset || 0));
      if (Number.isFinite(target) && Math.abs(element.currentTime - target) > .015) { element.currentTime = target; await this.waitFor(element, 'seeked', () => !element.seeking); }
    }));
    await Promise.all(images.filter(c => c.mediaUrl).map(c => this.getImageElement(c.mediaUrl!).decode().catch(() => {})));
    this.renderFrame(canvas, time, videos, effects, images, subtitles);
  }
  public renderFrame(canvas: HTMLCanvasElement, time: number, videos: VideoClipData[], effects: EffectClipData[], images: ImageClipData[], subtitles: SubtitleData[]) {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, width, height);
    const active = [...videos.map(c => ({...c, kind: 'video'})), ...images.map(c => ({...c, kind: 'image'}))].filter(c => time >= c.startTime && time < c.startTime + c.duration).sort((a,b) => (a.layer || 0)-(b.layer || 0));
    const draw = (source: CanvasImageSource, w: number, h: number, alpha: number) => {
      if (!w || !h) return;
      const ratio = Math.min(width / w, height / h); ctx.globalAlpha = alpha;
      ctx.drawImage(source, (width - w*ratio)/2, (height - h*ratio)/2, w*ratio, h*ratio);
    };
    ctx.save();
    for (const effect of effects.filter(e => time >= e.startTime && time < e.startTime + e.duration)) {
      const intensity = Math.max(0, Math.min(1, (time-effect.startTime)/Math.max(.04,effect.fadeIn), (effect.startTime+effect.duration-time)/Math.max(.04,effect.fadeOut)));
      if (effect.effectType === 'camera_shake') { ctx.translate(width/2,height/2); ctx.scale(1.02,1.02); ctx.translate(-width/2+Math.sin(time*23)*5*intensity,-height/2+Math.cos(time*19)*5*intensity); }
      if (effect.effectType === 'blur') ctx.filter = 'blur(4px)';
      if (effect.effectType === 'vintage') ctx.filter = 'saturate(.4) contrast(1.1)';
      if (effect.effectType === 'cinematic') ctx.filter = 'contrast(1.15) saturate(.8)';
      if (effect.effectType === 'glow') ctx.filter = 'brightness(1.08) saturate(1.2)';
    }
    for (const clip of active) {
      if (!clip.mediaUrl) continue;
      const alpha = Math.max(0, Math.min(1, (clip.transparency ?? 100)/100));
      if (clip.kind === 'video') {
        const v = this.getVideoElement(clip.mediaUrl, clip.id);
        if (v.readyState >= 2 && !v.seeking) draw(v, v.videoWidth, v.videoHeight, alpha);
        else if (v.error) { ctx.globalAlpha = 1; ctx.fillStyle = '#fda4af'; ctx.font = '14px sans-serif'; ctx.fillText(`Media non riproducibile: ${clip.name}`, 16, 30); }
        else if (v.readyState >= 2) draw(v, v.videoWidth, v.videoHeight, alpha);
      } else { const image = this.getImageElement(clip.mediaUrl); if (image.complete && image.naturalWidth) draw(image, image.naturalWidth, image.naturalHeight, alpha); }
    }
    ctx.restore();
    const subtitle = subtitles.find(s => time >= s.startTime && time < s.endTime);
    if (subtitle) {
      ctx.font = `bold ${Math.round(height/24)}px sans-serif`; ctx.textAlign = 'center';
      const w = Math.min(width - 20, ctx.measureText(subtitle.text).width + 16), h = height/20;
      ctx.fillStyle = '#000b'; ctx.fillRect((width-w)/2, height-h-18, w, h+8); ctx.fillStyle = 'yellow'; ctx.fillText(subtitle.text, width/2, height-18, width-24);
    }
  }
  public pauseAll() { this.videoCache.forEach(v => v.pause()); this.audioCache.forEach(a => a.pause()); }
  public dispose() {
    this.pauseAll(); this.onFrameReady = null;
    for (const element of [...this.videoCache.values(), ...this.audioCache.values()]) { element.removeAttribute('src'); element.load(); }
    this.videoCache.clear(); this.audioCache.clear(); this.imageCache.clear(); this.gains.clear();
    if (this.audioContext) void this.audioContext.close(); this.audioContext = null;
  }
}
export const playbackEngine = new PlaybackEngine();
