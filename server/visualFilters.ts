import {clipRate} from '../src/services/clipSpeed';
import type { TimelineClip } from '../src/types/editor';
import { colorExpressions, colorSettings, effectAmount } from '../src/services/visualSettings';
export function visualFilters(clip: TimelineClip, width: number, height: number, global=false) {
  const parts=global?['fps=25']:[`setpts=(PTS-STARTPTS)/${clip.type==='video'?clipRate(clip):1}`,'fps=25'];
  const amount=effectAmount(clip);
  const colors=colorExpressions(clip);
  if(colors && global) {
    const a=colorSettings(clip),gain=2**(a.exposure/50)*(1+a.contrast/100),o=(.5-.5*(1+a.contrast/100)+a.brightness/400)*255,w=a.temperature/100*38.25,t=a.tint/100*12.75;
    parts.push('format=rgb24',`lutrgb=r='clip(val*${gain}+${o+w+t},0,255)':g='clip(val*${gain}+${o-2*t},0,255)':b='clip(val*${gain}+${o-w+t},0,255)'`,`hue=s=${1+a.saturation/100}`);
  } else if(colors)parts.push('format=gbrap',`geq=r='${colors[0]}':g='${colors[1]}':b='${colors[2]}':a='alpha(X,Y)'`);
  if(clip.adjustments?.sharpness)parts.push(`unsharp=3:3:${clip.adjustments.sharpness/100*1.5}`);
  parts.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`,'format=rgba',`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,'setsar=1');
  const effects=clip.effects || [];
  if(effects.includes('blur'))parts.push(`gblur=sigma=${height/90*amount}`);
  if(effects.includes('glitch'))parts.push(`rgbashift=rh=${Math.round(width*.004*amount)}:bh=-${Math.round(width*.004*amount)}`);
  const clock=`(((t${global?`-${clip.startTime}`:''}+${clip.animationOffset ?? 0})*${clipRate(clip)}+${clip.type==='effect'?(clip.offset||0):0})*${(clip.speed??5)/5})`;
  const progress=`min(1,max(0,${clock}/${clip.effectSpan ?? clip.duration*clipRate(clip)}))`;
  const zoom=[effects.includes('zoom_in')?`(1+${.25*amount}*${progress})`:'1',effects.includes('zoom_out')?`(1+${.25*amount}*(1-${progress}))`:'1',effects.includes('camera_shake')?String(1+.04*amount):'1'].join('*');
  if(effects.some(e=>['camera_shake','zoom_in','zoom_out'].includes(e))) {
    parts.push(`scale=w='ceil(iw*(${zoom})/2)*2':h='ceil(ih*(${zoom})/2)*2':eval=frame`);
    parts.push(`crop=${width}:${height}:x='(iw-ow)/2${effects.includes('camera_shake')?`+${width*.006*amount}*sin(${clock}*23)`:''}':y='(ih-oh)/2${effects.includes('camera_shake')?`+${height*.006*amount}*cos(${clock}*19)`:''}'`);
  }
  if(!global && clip.fadeIn)parts.push(`fade=t=in:d=${clip.fadeIn}:alpha=1`);
  if(!global && clip.fadeOut)parts.push(`fade=t=out:st=${Math.max(0,clip.duration-clip.fadeOut)}:d=${clip.fadeOut}:alpha=1`);
  if(!global)parts.push(`colorchannelmixer=aa=${(clip.transparency??100)/100}`,`setpts=PTS+${clip.startTime}/TB`);
  return parts.join(',');
}
