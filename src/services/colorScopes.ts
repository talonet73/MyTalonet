/** Analysis of actual displayed 8-bit full-range pixels; no generated/random traces. */
export function scopeData(data:Uint8ClampedArray,width:number,height:number){
  const columns=160,bins=128,wave=new Uint32Array(columns*bins),parade=new Uint32Array(columns*bins*3),hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)],vector=new Uint32Array(160*160);
  let min=255,max=0,sum=0,black=0,white=0,count=0;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){const p=(y*width+x)*4;if(!data[p+3])continue;const r=data[p],g=data[p+1],b=data[p+2],luma=.2126*r+.7152*g+.0722*b,col=Math.min(columns-1,Math.floor(x/width*columns));
    wave[Math.min(127,Math.floor(luma/256*128))*columns+col]++;
    [r,g,b].forEach((v,c)=>{hist[c][v]++;parade[c*columns*bins+Math.min(127,Math.floor(v/256*128))*columns+col]++;});
    const u=(b-luma)/1.8556/255,v=(r-luma)/1.5748/255,vx=Math.max(0,Math.min(159,Math.round(79.5+u*144))),vy=Math.max(0,Math.min(159,Math.round(79.5-v*144)));vector[vy*160+vx]++;
    min=Math.min(min,luma);max=Math.max(max,luma);sum+=luma;black+=Number(luma<=1);white+=Number(luma>=254);count++;
  }
  return {columns,bins,wave,parade,hist,vector,min:count?min:0,max:count?max:0,mean:count?sum/count:0,black:count?black/count*100:0,white:count?white/count*100:0,count};
}
export type ScopeData=ReturnType<typeof scopeData>;
export function drawScope(canvas:HTMLCanvasElement,type:'wave'|'parade'|'hist'|'vector',s:ScopeData){
  const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,left=22,top=8,pw=w-left-6,ph=h-top-16;
  ctx.fillStyle='#080b12';ctx.fillRect(0,0,w,h);ctx.font='9px monospace';ctx.strokeStyle='#29303e';ctx.fillStyle='#8390a4';ctx.lineWidth=1;
  if(type==='vector'){
    const cx=w/2,cy=h/2,r=Math.min(w,h)*.43;for(const f of [.5,1]){ctx.beginPath();ctx.arc(cx,cy,r*f,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();
    for(let y=0;y<160;y++)for(let x=0;x<160;x++){const n=s.vector[y*160+x];if(n){ctx.fillStyle=`rgba(225,230,245,${Math.min(1,.18+Math.log1p(n)/6)})`;ctx.fillRect(cx+(x-79.5)/72*r,cy+(y-79.5)/72*r,1.5,1.5);}}
    for(const [label,rgb] of [['R',[.75,0,0]],['Y',[.75,.75,0]],['G',[0,.75,0]],['C',[0,.75,.75]],['B',[0,0,.75]],['M',[.75,0,.75]]] as const){const [rr,gg,bb]=rgb,y=.2126*rr+.7152*gg+.0722*bb,x=cx+(bb-y)/1.8556*2*r,py=cy-(rr-y)/1.5748*2*r;ctx.strokeStyle='#738097';ctx.strokeRect(x-3,py-3,6,6);ctx.fillStyle='#b7bfce';ctx.fillText(label,x+5,py+3);}
    ctx.strokeStyle='#75594b';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx-r*.5,cy-r*.85);ctx.stroke();return;
  }
  for(let i=0;i<=4;i++){const y=top+ph*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-5,y);ctx.stroke();if(type!=='hist')ctx.fillText(String(100-i*25),0,y+3);}
  const colors=['#f26d75','#65df93','#6b9dff'];
  if(type==='hist'){const peak=Math.max(1,...s.hist.flatMap(a=>[...a]));ctx.globalCompositeOperation='screen';s.hist.forEach((hist,c)=>{ctx.strokeStyle=colors[c];ctx.beginPath();for(let i=0;i<256;i++){const x=left+i/255*pw,y=top+ph*(1-Math.log1p(hist[i])/Math.log1p(peak));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();});ctx.globalCompositeOperation='source-over';ctx.fillStyle='#8390a4';ctx.fillText('0',left,h-2);ctx.fillText('255',w-25,h-2);return;}
  const channels=type==='parade'?3:1,source=type==='parade'?s.parade:s.wave;
  for(let c=0;c<channels;c++){ctx.fillStyle=channels===3?colors[c]:'#d5e4dd';for(let y=0;y<s.bins;y++)for(let x=0;x<s.columns;x++){const n=source[(c*s.bins+y)*s.columns+x];if(n){ctx.globalAlpha=Math.min(.95,.18+Math.log1p(n)/5);ctx.fillRect(left+(c+x/s.columns)/channels*pw,top+(1-y/(s.bins-1))*ph,Math.max(1,pw/s.columns/channels),1.5);}}}
  ctx.globalAlpha=1;if(channels===3)for(let c=0;c<3;c++){ctx.fillStyle=colors[c];ctx.fillText(['R','G','B'][c],left+(c+.5)/3*pw,h-2);}
}
