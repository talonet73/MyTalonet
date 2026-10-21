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

class PlaybackEngine {
  private videoCache: Map<string, HTMLVideoElement> = new Map();
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private onFrameReadyCallback: (() => void) | null = null;

  public setOnFrameReady(callback: () => void) {
    this.onFrameReadyCallback = callback;
  }

  public getVideoElement(url: string): HTMLVideoElement {
    if (!this.videoCache.has(url)) {
      const v = document.createElement('video');
      // Blob URLs should not have crossOrigin set as it can cause security/loading errors
      if (!url.startsWith('blob:')) {
        v.crossOrigin = 'anonymous';
      }
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      v.muted = true; // Video element is muted by default; audio handled through dedicated audio sync
      v.addEventListener('seeked', () => {
        if (this.onFrameReadyCallback) this.onFrameReadyCallback();
      });
      v.addEventListener('loadeddata', () => {
        if (this.onFrameReadyCallback) this.onFrameReadyCallback();
      });
      v.addEventListener('canplay', () => {
        if (this.onFrameReadyCallback) this.onFrameReadyCallback();
      });
      v.addEventListener('timeupdate', () => {
        if (this.onFrameReadyCallback) this.onFrameReadyCallback();
      });
      try {
        v.load();
      } catch (e) {
        // ignore
      }
      this.videoCache.set(url, v);
    }
    return this.videoCache.get(url)!;
  }

  /**
   * Preloads all video assets in clips to guarantee frames are immediately decodeable
   */
  public async preloadVideos(videoClips: VideoClipData[]): Promise<void> {
    const promises = videoClips.map(c => {
      if (!c.mediaUrl) return Promise.resolve();
      const v = this.getVideoElement(c.mediaUrl);
      if (v.readyState >= 2 && v.videoWidth > 0) return Promise.resolve();

      return new Promise<void>(resolve => {
        let isDone = false;
        const onDone = () => {
          if (isDone) return;
          isDone = true;
          v.removeEventListener('loadeddata', onDone);
          v.removeEventListener('canplay', onDone);
          v.removeEventListener('error', onDone);
          resolve();
        };
        v.addEventListener('loadeddata', onDone);
        v.addEventListener('canplay', onDone);
        v.addEventListener('error', onDone);
        try {
          v.load();
        } catch (e) {
          resolve();
        }
        setTimeout(onDone, 1500); // 1.5s timeout safety
      });
    });

    await Promise.all(promises);
  }

  public getAudioElement(url: string): HTMLAudioElement {
    if (!this.audioCache.has(url)) {
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.preload = 'auto';
      a.src = url;
      this.audioCache.set(url, a);
    }
    return this.audioCache.get(url)!;
  }

  public getImageElement(url: string): HTMLImageElement {
    if (!this.imageCache.has(url)) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      img.onload = () => {
        if (this.onFrameReadyCallback) this.onFrameReadyCallback();
      };
      this.imageCache.set(url, img);
    }
    return this.imageCache.get(url)!;
  }

  /**
   * Sync active media playback with timeline state
   */
  public syncMedia(
    currentTime: number,
    isPlaying: boolean,
    videoClips: VideoClipData[],
    audioClips: AudioClipData[],
    isMutedMaster: boolean
  ) {
    // 1. Sync Active Video
    const activeVideo = videoClips.find(
      v => currentTime >= v.startTime && currentTime <= v.startTime + v.duration
    );

    const activeVideoUrls = new Set<string>();
    if (activeVideo && activeVideo.mediaUrl) {
      activeVideoUrls.add(activeVideo.mediaUrl);
      const vEl = this.getVideoElement(activeVideo.mediaUrl);
      const targetTime = Math.max(0, (currentTime - activeVideo.startTime) + (activeVideo.offset || 0));

      if (vEl.duration && targetTime >= vEl.duration) {
        vEl.pause();
      } else {
        if (Math.abs(vEl.currentTime - targetTime) > 0.15) {
          try {
            vEl.currentTime = targetTime;
          } catch (e) {
            // ignore seek error
          }
        }

        // If this video has NO separate audio clip on the timeline, play audio directly from video
        if (!activeVideo.hasSeparateAudioClip) {
          vEl.muted = isMutedMaster;
        } else {
          vEl.muted = true; // Audio is handled by the audio clip!
        }

        if (isPlaying) {
          if (vEl.paused) {
            vEl.play().catch(() => {});
          }
        } else {
          if (!vEl.paused) {
            vEl.pause();
          }
        }
      }
    }

    // Pause all other video elements
    this.videoCache.forEach((vEl, url) => {
      if (!activeVideoUrls.has(url)) {
        if (!vEl.paused) vEl.pause();
      }
    });

    // 2. Sync Active Audio Clips
    const activeAudio = audioClips.find(
      a => currentTime >= a.startTime && currentTime <= a.startTime + a.duration
    );
    const activeAudioUrls = new Set<string>();

    if (activeAudio && activeAudio.mediaUrl) {
      activeAudioUrls.add(activeAudio.mediaUrl);
      const aEl = this.getAudioElement(activeAudio.mediaUrl);
      const targetTime = Math.max(0, (currentTime - activeAudio.startTime) + (activeAudio.offset || 0));

      // Calculate linear gain from dB: 0 dB = 1.0, -60 dB = 0
      const linearGain = Math.max(0, Math.min(1, Math.pow(10, activeAudio.volumeDb / 20)));
      aEl.volume = (isMutedMaster || activeAudio.volumeDb <= -55) ? 0 : linearGain;

      if (aEl.duration && targetTime >= aEl.duration) {
        aEl.pause();
      } else {
        if (Math.abs(aEl.currentTime - targetTime) > 0.15) {
          try {
            aEl.currentTime = targetTime;
          } catch (e) {
            // ignore
          }
        }

        if (isPlaying) {
          if (aEl.paused) {
            aEl.play().catch(() => {});
          }
        } else {
          if (!aEl.paused) {
            aEl.pause();
          }
        }
      }
    }

    // Pause all other audio elements
    this.audioCache.forEach((aEl, url) => {
      if (!activeAudioUrls.has(url)) {
        if (!aEl.paused) aEl.pause();
      }
    });
  }

  public pauseAll() {
    this.videoCache.forEach(v => {
      if (!v.paused) v.pause();
    });
    this.audioCache.forEach(a => {
      if (!a.paused) a.pause();
    });
  }

  /**
   * Prepares video element position and waits for seek before rendering.
   * Crucial for offline/export rendering so that real video frames are decoded!
   */
  public async prepareAndRenderFrame(
    canvas: HTMLCanvasElement,
    timeSec: number,
    videoClips: VideoClipData[],
    effectClips: EffectClipData[],
    imageClips: ImageClipData[],
    subtitles: SubtitleData[]
  ): Promise<void> {
    const activeVideo = videoClips.find(v => timeSec >= v.startTime && timeSec <= v.startTime + v.duration);
    if (activeVideo && activeVideo.mediaUrl) {
      const vEl = this.getVideoElement(activeVideo.mediaUrl);
      if (vEl.readyState === 0) {
        try {
          vEl.load();
        } catch (e) {
          // ignore
        }
      }

      const targetTime = Math.max(0, (timeSec - activeVideo.startTime) + (activeVideo.offset || 0));
      const dur = vEl.duration && Number.isFinite(vEl.duration) ? vEl.duration : targetTime;
      const clampedTarget = Math.min(dur, targetTime);

      if (Math.abs(vEl.currentTime - clampedTarget) > 0.03) {
        try {
          vEl.currentTime = clampedTarget;
          // Wait for seek to complete (with timeout safety)
          await new Promise<void>(resolve => {
            let resolved = false;
            const onSeeked = () => {
              if (resolved) return;
              resolved = true;
              vEl.removeEventListener('seeked', onSeeked);
              resolve();
            };
            vEl.addEventListener('seeked', onSeeked, { once: true });
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                vEl.removeEventListener('seeked', onSeeked);
                resolve();
              }
            }, 85);
          });
        } catch (e) {
          // ignore
        }
      }
    }

    this.renderFrame(canvas, timeSec, videoClips, effectClips, imageClips, subtitles);
  }

  /**
   * Render composite frame onto canvas:
   * Real video frame -> Real image -> Effects (shake, alpha, overlay) -> Subtitles
   */
  public renderFrame(
    canvas: HTMLCanvasElement,
    timeSec: number,
    videoClips: VideoClipData[],
    effectClips: EffectClipData[],
    imageClips: ImageClipData[],
    subtitles: SubtitleData[]
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, width, height);

    const activeVideo = videoClips.find(v => timeSec >= v.startTime && timeSec <= v.startTime + v.duration);
    const activeImage = imageClips.find(img => timeSec >= img.startTime && timeSec <= img.startTime + img.duration);
    const activeEffect = effectClips.find(e => timeSec >= e.startTime && timeSec <= e.startTime + e.duration);

    let shakeX = 0;
    let shakeY = 0;
    let effectIntensity = 1;

    if (activeEffect) {
      const elapsed = timeSec - activeEffect.startTime;
      const remaining = activeEffect.startTime + activeEffect.duration - timeSec;

      if (activeEffect.fadeIn > 0 && elapsed < activeEffect.fadeIn) {
        effectIntensity = elapsed / activeEffect.fadeIn;
      } else if (activeEffect.fadeOut > 0 && remaining < activeEffect.fadeOut) {
        effectIntensity = remaining / activeEffect.fadeOut;
      } else {
        effectIntensity = 1;
      }

      if (activeEffect.effectType === 'camera_shake') {
        shakeX = Math.sin(timeSec * 35) * 8 * effectIntensity;
        shakeY = Math.cos(timeSec * 28) * 6 * effectIntensity;
      }
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    if (activeVideo) {
      const alpha = Math.max(0, Math.min(1, (activeVideo.transparency ?? 100) / 100));
      ctx.globalAlpha = alpha;

      let renderedRealVideo = false;

      if (activeVideo.mediaUrl) {
        const vEl = this.getVideoElement(activeVideo.mediaUrl);
        if (vEl.videoWidth > 0 && (vEl.readyState >= 1 || vEl.currentTime >= 0)) {
          // Draw real video with aspect ratio containment
          const vw = vEl.videoWidth;
          const vh = vEl.videoHeight;
          const vAspect = vw / vh;
          const cAspect = width / height;

          let dw = width;
          let dh = height;
          let dx = 0;
          let dy = 0;

          if (vAspect > cAspect) {
            dh = width / vAspect;
            dy = (height - dh) / 2;
          } else {
            dw = height * vAspect;
            dx = (width - dw) / 2;
          }

          try {
            ctx.drawImage(vEl, dx, dy, dw, dh);
            renderedRealVideo = true;
          } catch (err) {
            // ignore drawImage exception
          }
        }
      }

      if (!renderedRealVideo) {
        // Fallback indicator while video frame decodes
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`▶ ${activeVideo.name}`, width / 2, height / 2 - 12);

        ctx.font = '13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Fotogramma in caricamento (${timeSec.toFixed(1)}s)`, width / 2, height / 2 + 16);
      }

      // Draw effect badge if active
      if (activeEffect) {
        ctx.fillStyle = 'rgba(203, 92, 91, 0.9)';
        ctx.fillRect(width / 2 - 130, 20, 260, 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`FX: ${activeEffect.name} (${Math.round(effectIntensity * 100)}%)`, width / 2, 37);
      }
    } else if (activeImage) {
      const alpha = Math.max(0, Math.min(1, (activeImage.transparency ?? 100) / 100));
      ctx.globalAlpha = alpha;

      let renderedRealImage = false;

      if (activeImage.mediaUrl) {
        const imgEl = this.getImageElement(activeImage.mediaUrl);
        if (imgEl.complete && imgEl.naturalWidth > 0) {
          const iw = imgEl.naturalWidth;
          const ih = imgEl.naturalHeight;
          const iAspect = iw / ih;
          const cAspect = width / height;

          let dw = width;
          let dh = height;
          let dx = 0;
          let dy = 0;

          if (iAspect > cAspect) {
            dh = width / iAspect;
            dy = (height - dh) / 2;
          } else {
            dw = height * iAspect;
            dx = (width - dw) / 2;
          }

          ctx.drawImage(imgEl, dx, dy, dw, dh);
          renderedRealImage = true;
        }
      }

      if (!renderedRealImage) {
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(30, 20, width - 60, height - 40);

        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`📷 ${activeImage.name}`, width / 2, height / 2);
      }
    } else {
      // Empty timeline
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#475569';
      ctx.font = '14px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nessuna clip video o immagine a questo timestamp', width / 2, height / 2 - 10);
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#334155';
      ctx.fillText('Trascina o posiziona una clip video nella traccia blu', width / 2, height / 2 + 15);
    }

    ctx.restore();

    // Render subtitle if active
    const activeSub = subtitles.find(s => timeSec >= s.startTime && timeSec <= s.endTime);
    if (activeSub) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
      const textMetrics = ctx.measureText(activeSub.text);
      const subWidth = Math.min(width - 40, textMetrics.width + 32);
      ctx.fillRect((width - subWidth) / 2, height - 56, subWidth, 32);

      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'center';
      ctx.fillText(activeSub.text, width / 2, height - 35);
    }
  }
}

export const playbackEngine = new PlaybackEngine();
