import {clipRate} from '../src/services/clipSpeed';
import {cleanupCandidates,automaticCuts} from '../src/services/smartCut';
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
interface CaptionJob { id: string; status: 'running'|'complete'|'error'; subtitles?: any[]; error?: string; created: number; candidates?:import('../src/services/smartCut').CutRange[];phase?:string;warning?:string }
const jobs = new Map<string,CaptionJob>();
export function installCaptions(app: Express) {
  app.get('/api/captions/status', async (_req,res) => {
    const ready = await Promise.all([fs.access(path.join(modelDir(),'model.bin')).then(()=>true,()=>false),fs.access(python()).then(()=>true,()=>false)]);
    res.json({ ready: ready.every(Boolean), engine:'faster-whisper', model:'small multilingual', device:'cpu', computeType:'int8', free:true });
  });
  app.post(['/api/captions','/api/smart-cut'], async (req,res,next) => {
    try {
      const automatic=req.path==='/api/smart-cut'&&req.body?.mode==='automatic';
      if(automatic){if(typeof req.body.margin!=='number'||!Number.isFinite(req.body.margin)||req.body.margin<.5||req.body.margin>2)throw new InputError('Margine pause da 0,5 a 2 secondi.');}
      else if(req.path==='/api/smart-cut' && (typeof req.body.tolerance!=='number'||req.body.tolerance<.5||req.body.tolerance>2))throw new InputError('Tolleranza pause da 0,5 a 2 secondi.');
      if (!Object.hasOwn(languages,req.body?.language || 'Italian')) throw new InputError('Lingua non supportata.');
      try { if(!automatic){await fs.access(path.join(modelDir(),'model.bin')); await fs.access(python());} } catch { res.status(503).json({ error:'Whisper non pronto: installa il modello con scripts/setup-whisper.sh. Il download richiede accesso a Hugging Face.' }); return; }
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
    if(body.cleanup&&body.mode==='automatic'){await scanAutomatically(job,body);return;}
    // Transcribe the actual edited soundtrack, including offsets, delays, volume, mute and solo.
    const audio = await exportMedia({...body,format:'wav',resolution:'720p',weightPercentage:55,subtitles:[]});
    audioFile = path.join(downloadsDir,audio.fileName);
    const result=await transcribeAudio(audioFile,body);
    job.subtitles=JSON.parse(result).subtitles.map((s:any)=>({...s,id:randomUUID()}));
    if(body.cleanup){const {stderr}=await run('ffmpeg',['-hide_banner','-i',audioFile,'-af',`silencedetect=noise=-40dB:d=${body.tolerance}`,'-f','null','-']);const silences:{start:number;end:number}[]=[];let start:number|undefined;for(const line of stderr.split('\n')){const a=line.match(/silence_start: ([\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)start=Number(a[1]);if(b&&start!==undefined){silences.push({start,end:Number(b[1])});start=undefined;}}if(start!==undefined)silences.push({start,end:audio.durationSec});job.candidates=cleanupCandidates(silences,job.subtitles!,audio.durationSec,body.tolerance);}
    job.status='complete';
  } catch(error) {job.status='error';job.error=(error as Error).message;}
  finally {if(audioFile)await fs.rm(audioFile,{force:true});}
}

async function transcribeAudio(audioFile:string,body:any){
  return await new Promise<string>((resolve,reject)=>{
      const child=spawn(python(),[path.resolve('scripts/transcribe.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,WHISPER_MODEL_DIR:modelDir()}});
      let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGTERM'),30*60*1000);
      child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>5*1024*1024)child.kill('SIGTERM');});child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);});
      child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(new Error(stderr||'Trascrizione interrotta.'));});
      child.stdin.on('error',()=>{}); child.stdin.end(JSON.stringify({file:audioFile,language:languages[body.language || 'Italian'] || null,bilingual:body.bilingual===true}));
    });
}

async function scanAutomatically(job:CaptionJob,body:any){
  let file:string|undefined;
  try{
    if(!Array.isArray(body.clips)||!body.clips.length||body.clips.some((c:any)=>!Number.isFinite(c.startTime)||c.startTime<0||!Number.isFinite(c.duration)||c.duration<=0))throw new InputError('Timeline audio non valida.');
    const duration=Math.max(body.durationSec??0,...body.clips.map((c:any)=>c.startTime+c.duration));
    if(!Number.isFinite(duration)||duration<.04||duration>86400)throw new InputError('Durata analisi non valida (massimo 24 ore).');
    const silences:{start:number;end:number}[]=[],subtitles:any[]=[];let voiceAvailable=true;
    if(body.fillers===true||body.retakes===true){try{await fs.access(path.join(modelDir(),'model.bin'));await fs.access(python());}catch{voiceAvailable=false;}}
    // Bounded temporary audio files let the scan cover the whole timeline, beyond the export limit.
    const windows=Math.ceil(duration/600);
    for(let from=0;from<duration;from+=600){
      const span=Math.min(600,duration-from),index=Math.floor(from/600)+1;
      job.phase=`Scansione audio ${index}/${windows}…`;
      const clips=body.clips.filter((c:any)=>['audio','video'].includes(c.type)&&c.startTime<from+span&&c.startTime+c.duration>from).map((c:any)=>{const start=Math.max(c.startTime,from),end=Math.min(c.startTime+c.duration,from+span);return {...c,startTime:start-from,duration:end-start,offset:(c.offset||0)+(start-c.startTime)*clipRate(c),volumeDb:0,fadeIn:0,fadeOut:0};});
      if(!clips.length){silences.push({start:from,end:from+span});continue;}
      const audio=await exportMedia({...body,durationSec:Math.max(.04,span),format:'wav',resolution:'720p',weightPercentage:55,audioMaster:{},subtitles:[],tracks:body.tracks?.map((t:any)=>({...t,isMuted:false,isSolo:false,audio:{}})),clips});
      file=path.join(downloadsDir,audio.fileName);
      const measured=await run('ffmpeg',['-hide_banner','-i',file,'-af','volumedetect','-f','null','-']);
      const peak=Number(measured.stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]??0),gain=Math.max(0,Math.min(60,-3-peak));
      const {stderr}=await run('ffmpeg',['-hide_banner','-i',file,'-af',`volume=${gain}dB,silencedetect=noise=-40dB:d=0.25`,'-f','null','-']);
      let start:number|undefined;
      for(const line of stderr.split('\n')){const a=line.match(/silence_start: (-?[\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)start=Math.max(0,Number(a[1]));if(b&&start!==undefined){silences.push({start:from+start,end:from+Number(b[1])});start=undefined;}}
      if(start!==undefined)silences.push({start:from+start,end:from+span});
      if(voiceAvailable&&(body.fillers===true||body.retakes===true)){
        job.phase=`Riconoscimento vocale ${index}/${windows}…`;
        try{const result=JSON.parse(await transcribeAudio(file,body));subtitles.push(...result.subtitles.map((s:any)=>({...s,id:randomUUID(),startTime:s.startTime+from,endTime:s.endTime+from,words:s.words?.map((w:any)=>({...w,startTime:w.startTime+from,endTime:w.endTime+from}))})));}catch{voiceAvailable=false;}
      }
      await fs.rm(file,{force:true});file=undefined;
    }
    job.candidates=automaticCuts(silences,duration,body.margin);job.subtitles=subtitles;
    if(body.fillers===true||body.retakes===true){
      const speechCuts=cleanupCandidates([],subtitles,duration,.5).filter(r=>r.reason==='filler'?body.fillers===true:r.reason==='retake'&&body.retakes===true).map(r=>({...r,selected:true}));job.candidates.push(...speechCuts);
      if(!voiceAvailable)job.warning='Pause elaborate. Riconoscimento vocale non disponibile su tutto l’audio: alcune esitazioni/ciak potrebbero essere rimasti.';
    }
    job.status='complete';job.phase='Scansione completata';
  }catch(error){job.status='error';job.error=(error as Error).message;}
  finally{if(file)await fs.rm(file,{force:true});}
}
