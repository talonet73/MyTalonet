import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import https from 'node:https';
import {createWriteStream} from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {downloadsDir,describeMedia,exportMedia} from './media';
import {applyTimelineTool,type TimelineState} from '../src/services/timelineTools';
import type {MediaAsset,Track} from '../src/types/editor';
const reserved6=new BlockList();reserved6.addSubnet('2001::',23,'ipv6');reserved6.addSubnet('2001:db8::',32,'ipv6');reserved6.addSubnet('2002::',16,'ipv6');reserved6.addSubnet('3fff::',20,'ipv6');
const MAX_BYTES=500*1024*1024,CHUNK_BYTES=1024*1024;
const extensions=['.mp4','.mov','.avi','.mkv','.webm','.mp3','.wav','.m4a','.ogg','.png','.jpg','.jpeg','.webp'];
export function safeMediaName(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>240)throw new Error('Nome del file multimediale non valido.');const name=path.basename(value.replaceAll('\\','/'));if(!extensions.includes(path.extname(name).toLowerCase()))throw new Error('Formato multimediale non supportato.');return name;}
export function publicAddress(address:string){
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
  return isIP(address)===6&&/^[23]/i.test(address)&&!reserved6.check(address,'ipv6');
}
export async function mediaDownload(url:string,file:string,redirects=0):Promise<void>{
  const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port&&parsed.port!=='443')throw new Error('Usa un URL HTTPS pubblico scaricabile, senza credenziali nel link.');
  const host=parsed.hostname.replace(/^\[|\]$/g,''),addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Il collegamento deve puntare a un server pubblico, non a indirizzi locali o riservati.');
  const pinned=addresses[0];
  const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
    const request=https.get(parsed,{lookup:((_host:any,opts:any,callback:any)=>opts?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)) as any,headers:{'User-Agent':'TALEDIT-MCP/2.1'}},resolve);
    request.setTimeout(60000,()=>request.destroy(new Error('Download scaduto.')));request.on('error',reject);
  });
  if([301,302,303,307,308].includes(response.statusCode||0)){response.resume();if(redirects>=5||!response.headers.location)throw new Error('Troppi reindirizzamenti del file.');return mediaDownload(new URL(response.headers.location,parsed).href,file,redirects+1);}
  if(response.statusCode!==200){response.resume();throw new Error(`Il file non è scaricabile (HTTP ${response.statusCode}). Fornisci i byte del video con il caricamento MCP.`);}
  if(Number(response.headers['content-length'])>MAX_BYTES){response.destroy();throw new Error('File oltre 500 MB.');}
  let size=0;const limit=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;callback(size>MAX_BYTES?new Error('File oltre 500 MB.'):null,chunk);}});
  await pipeline(response,limit,createWriteStream(file,{flags:'wx'}));if(!size)throw new Error('File scaricato vuoto.');
}
function decode(value:unknown,max:number){if(typeof value!=='string'||!value.length||value.length>Math.ceil(max/3)*4||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Byte Base64 non validi o blocco troppo grande.');const data=Buffer.from(value,'base64');if(!data.length||data.length>max||data.toString('base64')!==value)throw new Error('Byte Base64 non validi.');return data;}
function time(value:unknown){if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>86400))throw new Error('Posizione in timeline non valida.');}
interface Upload {file:string;name:string;total:number;received:number;created:number;args:any;asset?:MediaAsset;clipIds?:string[];busy?:boolean}
export function createMediaToolHandler(get:()=>TimelineState,commit:(state:TimelineState)=>void,isEnabled:()=>boolean){
  const uploads=new Map<string,Upload>();
  const attach=(asset:MediaAsset,args:any)=>{
    if(!isEnabled())throw new Error('MCP è stato disattivato durante il trasferimento.');time(args.timeSeconds);
    const current=get(),tracks=[...current.tracks];let track=args.trackId?tracks.find(t=>t.id===args.trackId):tracks.find(t=>t.type===asset.type);
    if(args.trackId&&(!track||track.type!==asset.type))throw new Error('La pista indicata non corrisponde al tipo del file.');
    const addTrack=(type:Track['type'],name:string)=>{const t:Track={id:randomUUID(),type,name,isMuted:false,isSolo:false,headerBg:type==='audio'?'#0d3324':type==='image'?'#382a08':'#0f2942',laneBg:'#101725'};tracks.push(t);return t;};
    if(!track)track=addTrack(asset.type,asset.type==='video'?'VIDEO':asset.type==='audio'?'AUDIO':'IMMAGINI');
    if(asset.type==='video'&&asset.hasAudio&&!tracks.some(t=>t.type==='audio'))addTrack('audio','AUDIO');
    const start=args.timeSeconds??Math.max(0,...current.clips.map(c=>c.startTime+c.duration));
    const next=applyTimelineTool({...current,tracks,mediaAssets:[...current.mediaAssets,asset]},'add_clip',{assetId:asset.id,trackId:track.id,timeSeconds:start});
    commit({...next,currentTime:start});return {asset,clipIds:next.clips.filter(c=>!current.clips.some(old=>old.id===c.id)).map(c=>c.id)};
  };
  return async(name:string,args:any)=>{
    for(const [id,u] of uploads)if(Date.now()-u.created>3600000&&!u.busy){if(!u.asset)await fs.rm(u.file,{force:true});uploads.delete(id);}
    if(name==='import_media'){
      time(args.timeSeconds);if([args.sourcePath,args.url,args.dataBase64].filter(v=>v!==undefined).length!==1)throw new Error('Fornisci una sola sorgente: sourcePath, url oppure dataBase64.');
      const fileName=safeMediaName(args.fileName||(args.sourcePath?path.basename(args.sourcePath):args.url?(extensions.includes(path.extname(new URL(args.url).pathname).toLowerCase())?path.basename(new URL(args.url).pathname):'video.mp4'):'video.mp4')),file=path.join(downloadsDir,`mcp_${randomUUID()}${path.extname(fileName).toLowerCase()}`);
      try{
        if(args.sourcePath){if(typeof args.sourcePath!=='string'||!path.isAbsolute(args.sourcePath))throw new Error('sourcePath deve essere un percorso assoluto sul PC di TALEDIT. Per il sandbox di Claude usa il caricamento dei byte.');const stat=await fs.stat(args.sourcePath);if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('File mancante o oltre 500 MB.');await fs.copyFile(args.sourcePath,file,fs.constants.COPYFILE_EXCL);}
        else if(args.url){try{await mediaDownload(args.url,file);}catch(error){throw new Error(`Download non riuscito: ${(error as Error).message}. Se il link richiede l’accesso alla chat, trasferisci i byte con il caricamento MCP.`);}}
        else await fs.writeFile(file,decode(args.dataBase64,2*1024*1024),{flag:'wx'});
        const asset=await describeMedia(file,fileName);return attach(asset,args);
      }catch(error){await fs.rm(file,{force:true});throw error;}
    }
    if(name==='begin_media_upload'){
      time(args.timeSeconds);const fileName=safeMediaName(args.fileName);if(!Number.isInteger(args.totalBytes)||args.totalBytes<1||args.totalBytes>MAX_BYTES)throw new Error('Dimensione file da 1 byte a 500 MB.');if([...uploads.values()].filter(u=>!u.asset).length>=4)throw new Error('Completa i trasferimenti già aperti prima di iniziarne un altro.');
      const id=randomUUID(),file=path.join(downloadsDir,`mcp_${id}${path.extname(fileName).toLowerCase()}`);await fs.writeFile(file,Buffer.alloc(0),{flag:'wx'});uploads.set(id,{file,name:fileName,total:args.totalBytes,received:0,created:Date.now(),args});return {uploadId:id,maxChunkBytes:CHUNK_BYTES};
    }
    if(name==='upload_media_chunk'||name==='finish_media_upload'){
      const u=uploads.get(args.uploadId);if(!u)throw new Error('Trasferimento inesistente o scaduto.');if(u.busy)throw new Error('Un blocco è già in elaborazione.');
      if(u.asset)return {asset:u.asset,clipIds:u.clipIds,bytesReceived:u.received};u.busy=true;
      try{
        if(name==='upload_media_chunk'){const data=decode(args.dataBase64,CHUNK_BYTES);if(args.offset!==u.received)throw new Error(`Riprendi il trasferimento dal byte ${u.received}.`);if(u.received+data.length>u.total)throw new Error('Il blocco supera la dimensione dichiarata.');await fs.appendFile(u.file,data);u.received+=data.length;return {uploadId:args.uploadId,bytesReceived:u.received};}
        if(u.received!==u.total)throw new Error(`File incompleto: ricevuti ${u.received} byte su ${u.total}.`);
        const asset=await describeMedia(u.file,u.name),result=attach(asset,u.args);u.asset=asset;u.clipIds=result.clipIds;return result;
      }finally{u.busy=false;}
    }
    if(name==='export_video'){
      const current=get(),duration=Math.max(0,...current.clips.map(c=>c.startTime+c.duration));const exported=await exportMedia({...current,format:'mp4',resolution:args.resolution||'1080p',durationSec:duration});
      if(args.addToTimeline===false)return exported;const asset=await describeMedia(path.join(downloadsDir,exported.fileName),exported.fileName);return {...exported,...attach(asset,args)};
    }
    throw new Error('Strumento multimediale non supportato.');
  };
}
