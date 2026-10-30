/** SDR display-referred grading, full-range Rec.709 RGB. Neutral defaults are identity. */
export const COLOR_CONTROLS = [
  ['exposure','Esposizione',-4,4,0,.05,'stop'],['contrast','Contrasto',0,2,1,.01,'×'],['pivot','Pivot',.05,.95,.435,.005,''],
  ['temperature','Temperatura',-100,100,0,1,''],['tint','Tinta',-100,100,0,1,''],['saturation','Saturazione',0,200,100,1,'%'],['vibrance','Vibrance',-100,100,0,1,''],['hue','Tonalità',-180,180,0,1,'°'],
  ['shadows','Ombre',-100,100,0,1,''],['highlights','Alte luci',-100,100,0,1,''],['blacks','Neri',-100,100,0,1,''],['whites','Bianchi',-100,100,0,1,''],['sharpness','Nitidezza',0,100,0,1,''],
  ...(['lift','gamma','gain','offset'] as const).flatMap(wheel=>(['Y','R','G','B'] as const).map(channel=>[`${wheel}${channel}`,`${wheel[0].toUpperCase()+wheel.slice(1)} ${channel}`,-100,100,0,1,''] as const)),
] as const;
export type ColorKey=typeof COLOR_CONTROLS[number][0];
export type CurveChannel='master'|'red'|'green'|'blue';
export const CURVE_X=[0,1/6,2/6,.5,4/6,5/6,1] as const;
export interface ColorGrade extends Partial<Record<ColorKey,number>> {bypass?:boolean;curves?:Partial<Record<CurveChannel,number[]>>}
const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
export function validateGrade(raw:unknown){
  if(raw===undefined)return;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Regolazioni COLOR non valide.');
  for(const [key,value] of Object.entries(raw)){
    if(key==='bypass'){if(typeof value!=='boolean')throw new Error('Bypass COLOR non valido.');continue;}
    if(key==='curves'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Curve COLOR non valide.');
      for(const [channel,points] of Object.entries(value))if(!['master','red','green','blue'].includes(channel)||!Array.isArray(points)||points.length!==7||points.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw new Error('Servono sette punti di curva tra 0 e 1.');
      continue;
    }
    const c=COLOR_CONTROLS.find(c=>c[0]===key);if(!c||typeof value!=='number'||!Number.isFinite(value)||value<c[2]||value>c[3])throw new Error(`Regolazione COLOR non valida: ${key}.`);
  }
}
export function gradeValues(raw?:ColorGrade){return Object.fromEntries(COLOR_CONTROLS.map(c=>[c[0],raw?.[c[0]]??c[4]])) as Record<ColorKey,number>;}
export function hasGrade(raw?:ColorGrade){if(!raw||raw.bypass)return false;return COLOR_CONTROLS.some(c=>raw[c[0]]!==undefined&&raw[c[0]]!==c[4])||Object.values(raw.curves||{}).some(v=>v?.some((y,i)=>Math.abs(y-CURVE_X[i])>1e-8));}
/** Shape-preserving cubic interpolation. No overshoot between adjacent control points. */
export function curveValue(x:number,points:readonly number[]=CURVE_X){
  x=clamp(x);const i=Math.min(5,Math.floor(x*6)),t=x*6-i,d=points.slice(1).map((y,j)=>(y-points[j])*6);
  const slope=(k:number)=>k===0?d[0]:k===6?d[5]:d[k-1]*d[k]<=0?0:2*d[k-1]*d[k]/(d[k-1]+d[k]);
  return clamp((2*t**3-3*t*t+1)*points[i]+(t**3-2*t*t+t)*slope(i)/6+(-2*t**3+3*t*t)*points[i+1]+(t**3-t*t)*slope(i+1)/6,Math.min(points[i],points[i+1]),Math.max(points[i],points[i+1]));
}
function transformer(raw:ColorGrade){
  const s=gradeValues(raw),angle=s.hue*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return (r:number,g:number,b:number)=>{
    let rgb=[r,g,b].map((c,i)=>{const channel=(['R','G','B'] as const)[i],lift=(s.liftY+s[`lift${channel}`])/400,gamma=2**(-(s.gammaY+s[`gamma${channel}`])/100),gain=2**((s.gainY+s[`gain${channel}`])/100),offset=(s.offsetY+s[`offset${channel}`])/400;return Math.max(0,c+lift*(1-c))**gamma*gain+offset;});
    rgb=rgb.map(c=>(c*2**s.exposure-s.pivot)*s.contrast+s.pivot);
    rgb[0]+=s.temperature*.0015+s.tint*.0005;rgb[1]-=s.tint*.001;rgb[2]-=s.temperature*.0015-s.tint*.0005;
    const y=clamp(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]),tone=(s.shadows*(1-y)**2+s.highlights*y*y+s.blacks*(1-y)**6+s.whites*y**6)*.003;
    rgb=rgb.map(c=>c+tone);
    if(s.hue){const [rr,gg,bb]=rgb,yy=.299*rr+.587*gg+.114*bb,ii=.596*rr-.274*gg-.322*bb,qq=.211*rr-.523*gg+.312*bb,i=ii*cos-qq*sin,q=ii*sin+qq*cos;rgb=[yy+.956*i+.621*q,yy-.272*i-.647*q,yy-1.106*i+1.703*q];}
    const luma=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],chroma=clamp(Math.max(...rgb)-Math.min(...rgb)),sat=s.saturation/100*(1+s.vibrance/100*(1-chroma));
    rgb=rgb.map((c,i)=>{let value=clamp(luma+(c-luma)*sat);if(raw.curves?.master)value=curveValue(value,raw.curves.master);const points=raw.curves?.[(['red','green','blue'] as const)[i]];return points?curveValue(value,points):value;});
    return rgb;
  };
}
export const LUT_SIZE=33;
const cache=new Map<string,Float32Array>();
export function gradeLut(raw:ColorGrade){
  const key=JSON.stringify(raw);if(cache.has(key))return cache.get(key)!;
  const lut=new Float32Array(LUT_SIZE**3*3),transform=transformer(raw);let n=0;
  // .cube files use red as the fastest-changing index.
  for(let b=0;b<LUT_SIZE;b++)for(let g=0;g<LUT_SIZE;g++)for(let r=0;r<LUT_SIZE;r++)for(const v of transform(r/32,g/32,b/32))lut[n++]=v;
  if(cache.size>=6)cache.delete(cache.keys().next().value!);cache.set(key,lut);return lut;
}
export function gradeCube(raw:ColorGrade){const lut=gradeLut(raw),lines=['TITLE "TALEDIT SDR"',`LUT_3D_SIZE ${LUT_SIZE}`,'DOMAIN_MIN 0 0 0','DOMAIN_MAX 1 1 1'];for(let i=0;i<lut.length;i+=3)lines.push(`${lut[i].toFixed(7)} ${lut[i+1].toFixed(7)} ${lut[i+2].toFixed(7)}`);return lines.join('\n');}
/** Same trilinear interpolation as FFmpeg lut3d. Alpha is left untouched. */
export function applyGrade(data:Uint8ClampedArray,raw?:ColorGrade){
  if(!hasGrade(raw))return;const lut=gradeLut(raw!),n=LUT_SIZE;
  for(let p=0;p<data.length;p+=4){
    const r=data[p]/255*32,g=data[p+1]/255*32,b=data[p+2]/255*32,ri=Math.min(31,Math.floor(r)),gi=Math.min(31,Math.floor(g)),bi=Math.min(31,Math.floor(b)),rf=r-ri,gf=g-gi,bf=b-bi;
    for(let c=0;c<3;c++){let value=0;for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=lut[(((bi+dz)*n+gi+dy)*n+ri+dx)*3+c]*(dx?rf:1-rf)*(dy?gf:1-gf)*(dz?bf:1-bf);data[p+c]=value*255;}
  }
}
