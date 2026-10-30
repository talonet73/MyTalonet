import {cleanupCandidates} from '../src/services/smartCut';
import {run} from './media';
import type { Express } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { downloadsDir, exportMedia, InputError } from './media';
const languages: Record<string,string> = { Italian:'it',English:'en',Spanish:'es',French:'fr',German:'de',Japanese:'ja',Auto:'' };
const modelDir = () => process.env.WHISPER_MODEL_DIR || '/workspace/.cache/taledit/whisper-small';
const python = () => process.env.WHISPER_PYTHON || '/workspace/.venv-whisper/bin/python';
interface CaptionJob { id: string; status: 'running'|'complete'|'error'; subtitles?: any[]; error?: string; created: number; candidates?:import('../src/services/smartCut').CutRange[] }
const jobs = new Map<string,CaptionJob>();
export function installCaptions(app: Express) {
  app.get('/api/captions/status', async (_req,res) => {
    const ready = await Promise.all([fs.access(path.join(modelDir(),'model.bin')).then(()=>true,()=>false),fs.access(python()).then(()=>true,()=>false)]);
    res.json({ ready: ready.every(Boolean), engine:'faster-whisper', model:'small multilingual', device:'cpu', computeType:'int8', free:true });
  });
  app.post(['/api/captions','/api/smart-cut'], async (req,res,next) => {
    try {
      if(req.path==='/api/smart-cut' && (typeof req.body.tolerance!=='number'||req.body.tolerance<.5||req.body.tolerance>2))throw new InputError('Tolleranza pause da 0,5 a 2 secondi.');
      if (!Object.hasOwn(languages,req.body?.language || 'Italian')) throw new InputError('Lingua non supportata.');
      try { await fs.access(path.join(modelDir(),'model.bin')); await fs.access(python()); } catch { res.status(503).json({ error:'Whisper non pronto: installa il modello con scripts/setup-whisper.sh. Il download richiede accesso a Hugging Face.' }); return; }
      if ([...jobs.values()].some(j=>j.status==='running')) { res.status(429).json({error:'Una trascrizione è già in corso.'}); return; }
      for (const [id,j] of jobs) if (Date.now()-j.created>3600000) jobs.delete(id);
      const job:CaptionJob = {id:randomUUID(),status:'running',created:Date.now()};jobs.set(job.id,job);
      void transcribe(job,{...req.body,cleanup:req.path==='/api/smart-cut'});
      res.status(202).json({jobId:job.id});
    } catch(error) {next(error);}
  });
  app.get('/api/captions/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job){res.status(404).json({error:'Trascrizione non trovata.'});return;}res.json(job);});
}
async function transcribe(job: CaptionJob, body: any) {
  let audioFile: string | undefined;
  try {
    // Transcribe the actual edited soundtrack, including offsets, delays, volume, mute and solo.
    const audio = await exportMedia({...body,format:'wav',resolution:'720p',weightPercentage:55,subtitles:[]});
    audioFile = path.join(downloadsDir,audio.fileName);
    const result = await new Promise<string>((resolve,reject)=>{
      const child=spawn(python(),[path.resolve('scripts/transcribe.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,WHISPER_MODEL_DIR:modelDir()}});
      let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGTERM'),30*60*1000);
      child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>5*1024*1024)child.kill('SIGTERM');});child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);});
      child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(new Error(stderr||'Trascrizione interrotta.'));});
      child.stdin.on('error',()=>{}); child.stdin.end(JSON.stringify({file:audioFile,language:languages[body.language || 'Italian'] || null,bilingual:body.bilingual===true}));
    });
    job.subtitles=JSON.parse(result).subtitles.map((s:any)=>({...s,id:randomUUID()}));
    if(body.cleanup){const {stderr}=await run('ffmpeg',['-hide_banner','-i',audioFile,'-af',`silencedetect=noise=-40dB:d=${body.tolerance}`,'-f','null','-']);const silences:{start:number;end:number}[]=[];let start:number|undefined;for(const line of stderr.split('\n')){const a=line.match(/silence_start: ([\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)start=Number(a[1]);if(b&&start!==undefined){silences.push({start,end:Number(b[1])});start=undefined;}}if(start!==undefined)silences.push({start,end:audio.durationSec});job.candidates=cleanupCandidates(silences,job.subtitles!,audio.durationSec,body.tolerance);}
    job.status='complete';
  } catch(error) {job.status='error';job.error=(error as Error).message;}
  finally {if(audioFile)await fs.rm(audioFile,{force:true});}
}
