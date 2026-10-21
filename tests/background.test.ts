import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Server} from 'node:http';
const exec=promisify(execFile),temp=await fs.mkdtemp(path.join(os.tmpdir(),'taledit-bg-test-'));
process.env.MEDIA_DIR=temp;
const {createApp}=await import('../server');
let server:Server,base:string;
before(async()=>{server=(await createApp(true)).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(temp,{recursive:true,force:true});});
async function upload(file:string){const response=await fetch(base+'/api/upload-media',{method:'POST',headers:{'x-filename':path.basename(file),'Content-Type':'application/octet-stream'},body:await fs.readFile(file)});assert.equal(response.status,200);return (await response.json()).asset;}
async function start(body:any){const response=await fetch(base+'/api/background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,202,JSON.stringify(await response.clone().json()));return (await response.json()).jobId;}
async function finished(id:string){const deadline=Date.now()+180000;while(Date.now()<deadline){const job=await(await fetch(base+'/api/background/'+id)).json();if(job.status!=='running'){assert.equal(job.status,'complete',job.error);return job;}await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('BG Remover timeout');}
test('real rembg image segmentation preserves the central subject with transparent corners',async()=>{
  const status=await(await fetch(base+'/api/background/status')).json();assert.equal(status.ready,true);assert.equal(status.engine,'rembg');
  const asset=await upload('tests/fixtures/bg-animal.jpg');
  const job=await finished(await start({mediaUrl:asset.fileUrl,type:'image'}));
  assert.equal(job.asset.type,'image');assert.equal(job.progress,100);
  const file=path.join(temp,path.basename(job.asset.fileUrl));
  const {stdout}=await exec(process.env.BG_PYTHON || '/workspace/.venv-bg/bin/python',['-c',"from PIL import Image; import numpy as np,sys,json; a=np.asarray(Image.open(sys.argv[1])); print(json.dumps([int(a[0,0,3]),int(a[a.shape[0]//2,a.shape[1]//2,3]),float((a[:,:,3]<10).mean())]))",file]);
  const [corner,center,fraction]=JSON.parse(stdout);assert.equal(corner,0);assert.ok(center>200);assert.ok(fraction>.4 && fraction<.95);
});
test('real rembg video keeps alpha, trimmed sound, and composites over an image in MP4 export',async()=>{
  const video=path.join(temp,'subject.mp4');
  await exec('ffmpeg',['-v','error','-y','-loop','1','-i','tests/fixtures/bg-animal.jpg','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-vf','scale=320:214','-t','1','-r','25','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',video]);
  const asset=await upload(video),job=await finished(await start({mediaUrl:asset.fileUrl,type:'video',offset:.2,duration:.4}));
  assert.equal(job.asset.type,'video');assert.equal(job.asset.hasAudio,true);
  const file=path.join(temp,path.basename(job.asset.fileUrl));
  const info=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).stdout);
  assert.ok(Math.abs(Number(info.format.duration)-.4)<.1);assert.equal(String(info.streams[0].tags.alpha_mode ?? info.streams[0].tags.ALPHA_MODE),'1');assert.equal(info.streams[1].codec_name,'opus');
  const alpha=await exec('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-frames:v','1','-vf','alphaextract,scale=1:1','-pix_fmt','gray','-f','rawvideo','-'],{encoding:'buffer'});assert.ok(alpha.stdout[0]>20 && alpha.stdout[0]<180);
  const bg=path.join(temp,'background.png');await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=320x214','-frames:v','1','-threads','1',bg]);const background=await upload(bg);
  const response=await fetch(base+'/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'mp4',resolution:'720p',durationSec:.4,clips:[{id:'back',name:'Background',type:'image',trackId:'image',mediaUrl:background.fileUrl,startTime:0,duration:.4,offset:0,transparency:100},{id:'front',name:'Subject',type:'video',trackId:'video',mediaUrl:job.asset.fileUrl,startTime:0,duration:.4,offset:0,transparency:100}]})});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const result=await response.json();
  const exported=path.join(temp,result.fileName);
  const corner=(await exec('ffmpeg',['-v','error','-i',exported,'-frames:v','1','-vf','crop=8:8:140:20,scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'})).stdout;
  assert.ok(corner[0]>200 && corner[1]<40 && corner[2]<40,`alpha must reveal red background: ${[...corner]}`);
  const audio=(await exec('ffmpeg',['-v','error','-i',exported,'-vn','-ac','1','-ar','48000','-f','f32le','-'],{encoding:'buffer'})).stdout;
  const samples=new Float32Array(audio.buffer.slice(audio.byteOffset,audio.byteOffset+audio.byteLength));const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);assert.ok(rms>.04 && rms<.14,`real source sound: ${rms}`);
});
test('BG Remover reports missing prerequisites and rejects external or mismatched sources',async()=>{
  const original=process.env.BG_MODEL_DIR;process.env.BG_MODEL_DIR=path.join(temp,'missing-model');
  try{assert.equal((await(await fetch(base+'/api/background/status')).json()).ready,false);assert.equal((await fetch(base+'/api/background',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);}finally{if(original===undefined)delete process.env.BG_MODEL_DIR;else process.env.BG_MODEL_DIR=original;}
  const asset=await upload('tests/fixtures/bg-animal.jpg');
  for(const body of [{mediaUrl:'https://example.org/video.mp4',type:'video',duration:1},{mediaUrl:asset.fileUrl,type:'video',duration:1},{mediaUrl:asset.fileUrl,type:'audio'}])assert.equal((await fetch(base+'/api/background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,400);
});
