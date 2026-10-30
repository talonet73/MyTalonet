import type {SubtitleItem} from '../types/editor';
export function karaokeLayout(sub:SubtitleItem,width:number,height:number){
  const words=sub.words||[],chars=words.reduce((n,w)=>n+Array.from(w.text).length+1,0),font=Math.max(8,Math.floor(Math.min(height/24,(width-40)/Math.max(1,chars*.64)))),cell=font*.64,total=Math.max(0,chars-1)*cell;
  let x=(width-total)/2;const y=height-34-font-(sub.row||0)*font*2;
  return {font,y,words:words.map(w=>{const out={...w,x,y,width:Array.from(w.text).length*cell};x+=out.width+cell;return out;})};
}
export function validateWords(sub:SubtitleItem){if(sub.words!==undefined&&(!Array.isArray(sub.words)||sub.words.length>300||sub.words.some(w=>typeof w.text!=='string'||w.text.length>100||!Number.isFinite(w.startTime)||!Number.isFinite(w.endTime)||w.endTime<=w.startTime)))throw new Error('Tempi delle parole non validi.');}

export function validateCaptionClip(clip:{captionWords?:import('../types/editor').TimedWord[];captionStyle?:string}){if(clip.captionStyle!==undefined&&!['classic','karaoke'].includes(clip.captionStyle))throw new Error('Stile sottotitolo non valido.');validateWords({id:'validation',text:'',startTime:0,endTime:1,words:clip.captionWords});}
