import type {Express} from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn, execFile, type ChildProcess} from 'node:child_process';
import {describeMedia, downloadsDir, InputError, localMediaPath, probe, run} from './media';

const python=()=>process.env.BG_PYTHON || '/workspace/.venv-bg/bin/python';
const modelDir=()=>process.env.BG_MODEL_DIR || '/workspace/.cache/taledit/rembg';
function stopChild(child?:ChildProcess){
  if(!child?.pid || child.exitCode!==null || child.signalCode!==null)return;
  if(process.platform==='win32')execFile('taskkill.exe',['/pid',String(child.pid),'/t','/f'],()=>{});else child.kill('SIGTERM');
}
interface Job {id:string;status:'running'|'complete'|'error'|'cancelled';progress:number;asset?:any;error?:string;child?:ChildProcess;created:number}
export function installBackgroundRemover(app:Express) {
  const jobs=new Map<string,Job>();
  const ready=async()=>{try{await fs.access(python());await fs.access(path.join(modelDir(),'models','u2netp','u2netp.onnx'));return true;}catch{return false;}};
  const snapshot=(job:Job)=>({id:job.id,status:job.status,progress:job.progress,asset:job.asset,error:job.error});
  app.get('/api/background/status',async(_req,res)=>res.json({ready:await ready(),engine:'rembg',model:'u2netp',free:true,local:true}));
  app.post('/api/background',async(req,res,next)=>{
    try {
      if(!await ready()){res.status(503).json({error:'BG Remover non pronto. Riapri l’app con 2-AVVIA-TALEDIT, oppure esegui scripts/setup-bg.sh su Linux.'});return;}
      if([...jobs.values()].some(j=>j.status==='running')){res.status(429).json({error:'Una rimozione dello sfondo è già in corso.'});return;}
      const {mediaUrl,type,offset=0,duration}=req.body || {};
      if(!['image','video'].includes(type) || !Number.isFinite(offset) || offset<0 || (type==='video' && (!Number.isFinite(duration)||duration<=0||duration>600)))throw new InputError('Seleziona una clip immagine o video valida, fino a 10 minuti.');
      const file=localMediaPath(mediaUrl),info=await probe(file);
      const stream=info.streams.find((s:any)=>s.codec_type==='video');
      if(!stream || stream.width*stream.height>33_177_600)throw new InputError('Dimensioni non supportate: massimo 33 megapixel.');
      const actual=await describeMedia(file,path.basename(file));
      if(actual.type!==type)throw new InputError('Il tipo del file non corrisponde alla clip.');
      const sourceDuration=Number(info.format.duration);
      if(type==='video' && (!Number.isFinite(sourceDuration)||offset>=sourceDuration||offset+duration>sourceDuration+.1))throw new InputError('La selezione supera la durata del video.');
      for(const [id,job] of jobs)if(job.status!=='running' && (Date.now()-job.created>3600000 || jobs.size>50))jobs.delete(id);
      if([...jobs.values()].some(j=>j.status==='running')){res.status(429).json({error:'Una rimozione dello sfondo è già in corso.'});return;}
      const job:Job={id:randomUUID(),status:'running',progress:0,created:Date.now()};jobs.set(job.id,job);
      void execute(job,{file,type,offset,duration:Math.min(duration,sourceDuration-offset),info});
      res.status(202).json({jobId:job.id});
    }catch(error){next(error);}
  });
  app.get('/api/background/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job){res.status(404).json({error:'Elaborazione non trovata.'});return;}res.json(snapshot(job));});
  app.delete('/api/background/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job){res.status(404).json({error:'Elaborazione non trovata.'});return;}if(job.status==='running'){job.status='cancelled';stopChild(job.child);}res.json(snapshot(job));});
}
async function execute(job:Job,data:any) {
  const output=path.join(downloadsDir,`bg_${randomUUID()}.${data.type==='image'?'png':'webm'}`);
  let temporary:string|undefined;
  const cancelled=()=>job.status==='cancelled';
  try {
    temporary=await fs.mkdtemp(path.join(os.tmpdir(),'taledit-bg-'));
    if(cancelled())return;
    const masked=data.type==='image'?output:path.join(temporary,'masked.webm');
    const video=data.info.streams.find((s:any)=>s.codec_type==='video');
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(python(),[path.resolve('scripts/remove-bg.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,BG_MODEL_DIR:modelDir(),NUMBA_CACHE_DIR:path.join(os.tmpdir(),'taledit-numba'),OMP_NUM_THREADS:'2'}});
      job.child=child;
      let stderr='',buffer='';const timer=setTimeout(()=>stopChild(child),30*60*1000);
      child.stdout.on('data',chunk=>{buffer+=chunk.toString();const lines=buffer.split('\n');buffer=lines.pop()!;for(const line of lines){try{job.progress=Math.min(95,JSON.parse(line).progress);}catch{/* Ignore diagnostics. */}}});
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.on('close',code=>{clearTimeout(timer);job.child=undefined;code===0?resolve():reject(new Error(stderr || 'Elaborazione interrotta.'));});
      child.stdin.on('error',()=>{});
      child.stdin.end(JSON.stringify({input:data.file,output:masked,type:data.type,offset:data.offset,duration:data.duration,width:Math.ceil(video.width/2)*2,height:Math.ceil(video.height/2)*2}));
    });
    if(cancelled())return;
    if(data.type==='video') {
      // Preserve source sound; the alpha video itself is copied without re-encoding.
      await run('ffmpeg',['-v','error','-y','-i',masked,'-ss',String(data.offset),'-i',data.file,'-t',String(data.duration),'-map','0:v:0','-map','1:a:0?','-c:v','copy','-c:a','libopus','-b:a','192k',output]);
    }
    if(cancelled())return;
    job.asset=await describeMedia(output,`Senza sfondo.${data.type==='image'?'png':'webm'}`);
    job.status='complete';job.progress=100;
  }catch(error){if(job.status!=='cancelled'){job.status='error';job.error=(error as Error).message;}}
  finally{if(job.status!=='complete')await fs.rm(output,{force:true});if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
}
