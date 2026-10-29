import {useEffect,useState} from 'react';
const cache=new Map<string,number[]>();
export function AudioWaveform({url,offset,duration,speedLevel=0}:{url?:string;offset:number;duration:number;speedLevel?:number}){
  const [peaks,setPeaks]=useState<number[]|null>(null),[error,setError]=useState(false);
  useEffect(()=>{
    setPeaks(null);setError(false);if(!url)return;
    const key=new URLSearchParams({mediaUrl:url,offset:String(offset),duration:String(duration),speedLevel:String(speedLevel)}).toString();
    if(cache.has(key)){setPeaks(cache.get(key)!);return;}
    const controller=new AbortController();const timer=setTimeout(()=>{
      (async()=>{for(let attempt=0;attempt<30;attempt++){if(controller.signal.aborted)throw new Error('Abort');const response=await fetch('/api/waveform?'+key,{signal:controller.signal});if(response.status===429){await new Promise(resolve=>setTimeout(resolve,Math.min(1500,200+attempt*100)));continue;}if(!response.ok)throw new Error('Waveform');return response.json();}throw new Error('Waveform occupata');})().then(data=>{if(cache.size>100)cache.delete(cache.keys().next().value!);cache.set(key,data.peaks);if(!controller.signal.aborted)setPeaks(data.peaks);}).catch(()=>{if(!controller.signal.aborted)setError(true);});
    },180);
    return()=>{clearTimeout(timer);controller.abort();};
  },[url,offset,duration,speedLevel]);
  if(error)return <span className="absolute bottom-1 right-2 text-[8px]">Onda non disponibile</span>;
  if(!peaks)return null;
  const max=Math.max(.02,...peaks),gain=Math.min(8,.85/max);
  const upper=peaks.map((v,i)=>`${i*1000/Math.max(1,peaks.length-1)},${50-v*gain*45}`).join(' ');
  const lower=[...peaks].reverse().map((v,i)=>`${(peaks.length-1-i)*1000/Math.max(1,peaks.length-1)},${50+v*gain*45}`).join(' ');
  return <svg aria-label="Onda audio" viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none opacity-60"><polygon points={`${upper} ${lower}`} fill="#dcfce7"/></svg>;
}
