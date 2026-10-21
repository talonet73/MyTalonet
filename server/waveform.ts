import type {Express} from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {localMediaPath,InputError} from './media';
const exec=promisify(execFile);
export function installWaveform(app:Express){
  const cache=new Map<string,number[]>();let running=0;
  app.get('/api/waveform',async(req,res,next)=>{
    try{
      const file=localMediaPath(String(req.query.mediaUrl || '')),offset=Number(req.query.offset||0),duration=Number(req.query.duration||1);
      if(!Number.isFinite(offset)||offset<0||!Number.isFinite(duration)||duration<=0||duration>600)throw new InputError('Intervallo audio non valido.');
      const stat=await fs.stat(file),key=JSON.stringify([file,stat.mtimeMs,offset,duration]);
      if(cache.has(key)){res.json({peaks:cache.get(key)});return;}
      if(running>=4){res.status(429).json({error:'Forma d’onda in preparazione. Riprova.'});return;}
      running++;
      try{
        const {stdout}=await exec('ffmpeg',['-v','error','-ss',String(offset),'-i',file,'-t',String(duration),'-vn','-af','apad','-ac','1','-ar','4000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:12*1024*1024,timeout:30000});
        const samples=new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength));
        const peaks=Array.from({length:Math.min(1024,Math.max(1,samples.length))},(_,i)=>{
          const from=Math.floor(i*samples.length/Math.min(1024,samples.length)),to=Math.floor((i+1)*samples.length/Math.min(1024,samples.length));let peak=0;
          for(let j=from;j<to;j++)peak=Math.max(peak,Math.abs(samples[j]));return Number(Math.min(1,peak).toFixed(5));
        });
        if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,peaks);res.json({peaks});
      }finally{running--;}
    }catch(error){next(error);}
  });
}
