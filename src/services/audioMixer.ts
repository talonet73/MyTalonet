/** Shared, validated mixer parameters. Neutral defaults preserve existing projects. */
export const AUDIO_CONTROLS = [
  ['volume','Volume',-60,12,0,1,'dB'],['pan','Panorama',-100,100,0,1,'%'],['width','Ampiezza stereo',0,200,100,1,'%'],
  ['compression','Compressione',0,100,0,1,'%'],['threshold','Soglia compressore',-60,0,-24,1,'dB'],['ratio','Rapporto compressore',1,20,4,.1,':1'],['attack','Attacco',1,100,10,1,'ms'],['release','Rilascio',20,1000,200,10,'ms'],
  ['delay','Ritardo',0,1000,0,10,'ms'],['echo','Eco',0,100,0,1,'%'],['reverb','Riverbero',0,100,0,1,'%'],['noise','Riduzione rumore',0,100,0,1,'%'],
  ['highpass','Filtro passa alto',20,1000,20,10,'Hz'],['lowpass','Filtro passa basso',1000,20000,20000,100,'Hz'],
  ['bass','Bassi',-18,18,0,1,'dB'],['mid','Medi',-18,18,0,1,'dB'],['treble','Alti',-18,18,0,1,'dB'],
] as const;
export type AudioKey=typeof AUDIO_CONTROLS[number][0];
export type AudioSettings=Partial<Record<AudioKey,number>> & {bypass?:boolean;mute?:boolean};
export function audioSettings(raw?:AudioSettings):Record<AudioKey,number>{return Object.fromEntries(AUDIO_CONTROLS.map(([k,,, ,v])=>[k,raw?.bypass?v:raw?.[k]??v])) as Record<AudioKey,number>;}
export function validateAudio(raw:unknown){
  if(raw===undefined)return;
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Regolazioni mixer non valide.');
  for(const [key,value] of Object.entries(raw)){
    if(key==='bypass'||key==='mute'){if(typeof value!=='boolean')throw new Error('Bypass mixer non valido.');continue;}
    const c=AUDIO_CONTROLS.find(c=>c[0]===key);
    if(!c || typeof value!=='number' || !Number.isFinite(value) || value<c[2] || value>c[3])throw new Error(`Regolazione audio non valida: ${key}.`);
  }
}
/** Non-recursive room taps: bounded gain, predictable length and matching live routing. */
export function roomTaps(s:Record<AudioKey,number>){return [...(s.echo?[{ms:240,gain:s.echo/100*.45},{ms:480,gain:s.echo/100*.22}]:[]),...(s.reverb?[37,61,89,127,181,251,337,421].map((ms,i)=>({ms,gain:s.reverb/100*.12*Math.exp(-i/3)})):[])];}
export function audioFilters(raw?:AudioSettings){
  const s=audioSettings(raw),f:string[]=[];
  if(s.highpass>20)f.push(`highpass=f=${s.highpass}`);if(s.lowpass<20000)f.push(`lowpass=f=${s.lowpass}`);
  if(s.bass)f.push(`bass=g=${s.bass}:f=200`);if(s.mid)f.push(`equalizer=f=1000:t=q:w=1:g=${s.mid}`);if(s.treble)f.push(`treble=g=${s.treble}:f=4000`);
  // Downward expansion removes low-level background between phrases, without AI dependencies.
  if(s.noise)f.push(`agate=threshold=${10**((-65+s.noise*.4)/20)}:ratio=${1+s.noise*.09}:attack=5:release=100:range=0.01`);
  if(s.compression)f.push(`acompressor=threshold=${10**(s.threshold/20)}:ratio=${1+(s.ratio-1)*s.compression/100}:attack=${s.attack}:release=${s.release}:knee=1:detection=peak:link=maximum`);
  const w=s.width/100,angle=(s.pan+100)/200*Math.PI/2,l=Math.cos(angle)*Math.SQRT2,r=Math.sin(angle)*Math.SQRT2;
  if(s.width!==100 || s.pan)f.push(`pan=stereo|c0=${(1+w)/2*l}*c0+${(1-w)/2*l}*c1|c1=${(1-w)/2*r}*c0+${(1+w)/2*r}*c1`);
  const taps=roomTaps(s);if(taps.length)f.push(`aecho=1:1:${taps.map(t=>t.ms).join('|')}:${taps.map(t=>t.gain).join('|')}`);
  if(s.delay)f.push(`adelay=${s.delay}:all=1`);
  if(raw?.mute)f.push('volume=0');
  else if(s.volume)f.push(`volume=${s.volume<=-60?'0':`${s.volume}dB`}`);
  return f;
}
