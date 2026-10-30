export interface MaskPoint {x:number;y:number;in?:{x:number;y:number};out?:{x:number;y:number}}
export interface PenMask {points:MaskPoint[];closed:boolean;inverted?:boolean;feather?:number;enabled?:boolean}
export function validateMask(raw:unknown){
  if(raw===undefined)return;const m=raw as PenMask;
  if(!m||typeof m!=='object'||!Array.isArray(m.points)||m.points.length>128||typeof m.closed!=='boolean'||(m.closed&&m.points.length<3)||m.enabled!==undefined&&typeof m.enabled!=='boolean'||m.inverted!==undefined&&typeof m.inverted!=='boolean'||m.feather!==undefined&&(!Number.isFinite(m.feather)||m.feather<0||m.feather>50))throw new Error('Maschera penna non valida.');
  for(const p of m.points){for(const v of [p,p.in,p.out].filter(Boolean))if(!v||typeof v.x!=='number'||typeof v.y!=='number'||!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.x<-.5||v.x>1.5||v.y<-.5||v.y>1.5)throw new Error('Punto maschera non valido.');}
}
export function maskPath(mask:PenMask){const p=mask.points;if(!p.length)return '';return `M${p[0].x} ${p[0].y} `+p.slice(1).map((b,i)=>segment(p[i],b)).join(' ')+(mask.closed?segment(p.at(-1)!,p[0])+' Z':'');}
function segment(a:MaskPoint,b:MaskPoint){return `C${a.out?.x??a.x} ${a.out?.y??a.y} ${b.in?.x??b.x} ${b.in?.y??b.y} ${b.x} ${b.y}`;}
const cache=new Map<string,Uint8Array>();
export function maskAlpha(mask:PenMask,width:number,height:number){
  const key=JSON.stringify([mask,width,height]);if(cache.has(key))return cache.get(key)!;
  let alpha=new Uint8Array(width*height);if(!mask.closed||mask.enabled===false){alpha.fill(255);return alpha;}
  const vertices:{x:number;y:number}[]=[];
  for(let i=0;i<mask.points.length;i++){const a=mask.points[i],b=mask.points[(i+1)%mask.points.length],c=a.out||a,d=b.in||b,steps=a.out||b.in?Math.min(192,Math.max(24,Math.ceil(Math.sqrt(Math.max(width,height))*1.8))):1;
    for(let j=0;j<steps;j++){const t=j/steps,q=1-t;vertices.push({x:(q*q*q*a.x+3*q*q*t*c.x+3*q*t*t*d.x+t*t*t*b.x)*width,y:(q*q*q*a.y+3*q*q*t*c.y+3*q*t*t*d.y+t*t*t*b.y)*height});}}
  for(let y=0;y<height;y++){const intersections:number[]=[],scan=y+.5;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];if((a.y<=scan&&b.y>scan)||(b.y<=scan&&a.y>scan))intersections.push(a.x+(scan-a.y)/(b.y-a.y)*(b.x-a.x));}intersections.sort((a,b)=>a-b);for(let j=0;j+1<intersections.length;j+=2){const left=Math.max(0,intersections[j]),right=Math.min(width,intersections[j+1]);for(let x=Math.floor(left);x<Math.ceil(right);x++)if(x>=0&&x<width)alpha[y*width+x]=Math.round(Math.max(0,Math.min(x+1,right)-Math.max(x,left))*255);}}
  const radius=Math.round((mask.feather||0)*height/1080/2);
  if(radius>0)for(let pass=0;pass<3;pass++)for(const horizontal of [true,false]){
    const out=new Uint8Array(alpha.length),rows=horizontal?height:width,cols=horizontal?width:height,index=(row:number,col:number)=>horizontal?row*width+col:col*width+row;
    for(let row=0;row<rows;row++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=alpha[index(row,Math.max(0,Math.min(cols-1,k)))];for(let col=0;col<cols;col++){out[index(row,col)]=Math.round(sum/(radius*2+1));sum+=alpha[index(row,Math.min(cols-1,col+radius+1))]-alpha[index(row,Math.max(0,col-radius))];}}alpha=out;
  }
  if(mask.inverted)for(let i=0;i<alpha.length;i++)alpha[i]=255-alpha[i];if(cache.size>=4)cache.delete(cache.keys().next().value!);cache.set(key,alpha);return alpha;
}
