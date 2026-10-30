import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
const exec = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'taledit-test-'));
process.env.MEDIA_DIR = temp;
const { createApp } = await import('../server');
const { youtubeUrl } = await import('../server/youtube');
let server: Server, base: string, video: any, image: any, silent: any;
async function ff(args: string[]) { return exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 }); }
async function api(endpoint: string, body?: any, method = 'POST') {
  const response = await fetch(base + endpoint, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
async function upload(file: string, name = path.basename(file)) {
  const response = await fetch(base + '/api/upload-media', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(name) }, body: await fs.readFile(file) });
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data.asset;
}
function clip(asset: any, extra: any = {}) {
  return { id: 'v', name: asset.name, type: asset.type, trackId: 'video', mediaUrl: asset.fileUrl, startTime: 0, duration: 2, offset: 0, transparency: 100, volumeDb: 0, fadeIn: 0, fadeOut: 0, ...extra };
}
async function exported(body: any) {
  const result = await api('/api/export', { format: 'mp4', resolution: '720p', weightPercentage: 20, durationSec: 2, subtitles: [], ...body });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const file = path.join(temp, result.data.fileName);
  const { stdout } = await exec('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file]);
  return { file, info: JSON.parse(stdout), data: result.data };
}
async function pixel(file: string, t: number) {
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v','error',...(/\.(png|jpe?g|webp|bmp|tiff|gif)$/i.test(file)?[]:['-ss',String(t)]),'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'], { encoding: 'buffer' });
  return [...stdout];
}
async function samples(file: string) {
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v','error','-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','-'], { encoding: 'buffer', maxBuffer: 8*1024*1024 });
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
}
function rms(data: Float32Array, from = 0, to = data.length / 48000) {
  const segment = data.slice(Math.round(from*48000), Math.round(to*48000));
  return Math.sqrt(segment.reduce((sum, v) => sum + v*v, 0) / segment.length);
}
before(async () => {
  await ff(['-f','lavfi','-i','color=red:s=320x180:r=25:d=1','-f','lavfi','-i','color=blue:s=320x180:r=25:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',path.join(temp,'fixture.mp4')]);
  await ff(['-f','lavfi','-i','color=lime:s=320x180','-frames:v','1','-threads','1',path.join(temp,'green.png')]);
  await ff(['-f','lavfi','-i','color=yellow:s=320x180:r=25:d=2','-c:v','libx264','-threads','2',path.join(temp,'silent.mp4')]);
  const app = await createApp(true);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  video = await upload(path.join(temp,'fixture.mp4'));
  image = await upload(path.join(temp,'green.png'));
  silent = await upload(path.join(temp,'silent.mp4'));
});
after(async () => { server?.closeAllConnections(); await new Promise<void>(resolve => server?.close(() => resolve())); await fs.rm(temp, { recursive: true, force: true }); });

test('health, real metadata, unique uploads and malformed file errors', async () => {
  assert.equal((await api('/api/health')).status, 200);
  assert.equal(video.durationSec, 2); assert.equal(video.hasAudio, true);
  const sameName = await upload(path.join(temp,'fixture.mp4'), 'Video è uguale.mp4');
  assert.notEqual(sameName.fileUrl, video.fileUrl); assert.equal(sameName.name, 'Video è uguale.mp4');
  const bad = await fetch(base + '/api/upload-media', { method:'POST',headers:{'x-filename':'bad.mp4'},body:'not a video' });
  assert.equal(bad.status,400);
});
for (const format of ['mp4','mov','avi','mp3','wav']) test(`real ${format} export has correct container, duration and source audio`, async () => {
  const { file, info } = await exported({ format, clips: [clip(video)] });
  assert.ok(Math.abs(Number(info.format.duration) - 2) < .15);
  const audio = info.streams.find((s: any) => s.codec_type === 'audio');
  assert.equal(audio.codec_name, ['wav','avi'].includes(format) ? 'pcm_s16le' : format === 'mp3' ? 'mp3' : 'aac');
  const pcm = await samples(file); const source = await samples(path.join(temp,'fixture.mp4'));
  assert.ok(Math.abs(rms(pcm,.2,.8) / rms(source,.2,.8) - 1) < .05, `source audio level preserved: ${rms(pcm,.2,.8) / rms(source,.2,.8)}`);
  // A 440 Hz tone must dominate; random noise cannot pass this test.
  let re=0, im=0; const n=24000;
  for(let i=0;i<n;i++){ const v=pcm[i+4800]; re+=v*Math.cos(2*Math.PI*440*i/48000); im+=v*Math.sin(2*Math.PI*440*i/48000); }
  assert.ok(2*Math.hypot(re,im)/n > .1, 'source frequency preserved');
  if (!['mp3','wav'].includes(format)) {
    const red = await pixel(file,.4), blue = await pixel(file,1.4);
    assert.ok(red[0] > 200 && red[1]<20 && red[2]<20, `red content, got ${red}`);
    assert.ok(blue[2] > 200 && blue[0]<20, `blue content, got ${blue}`);
  }
});
test('offsets, timeline gaps, images, linked audio gain and no duplicated soundtrack', async () => {
  const clips = [clip(video,{duration:1,offset:1,startTime:.4,linkedClipId:'a',isLinked:true}),clip(video,{id:'a',type:'audio',trackId:'audio',duration:1,offset:1,startTime:.4,linkedClipId:'v',isLinked:true,volumeDb:-6}),clip(image,{id:'i',duration:.6,startTime:1.6})];
  const { file } = await exported({ durationSec:2.4, clips });
  assert.ok((await pixel(file,.2)).every(v=>v<5),'empty timeline is black');
  const blue = await pixel(file,.8); assert.ok(blue[2]>200 && blue[0]<20,'source trim selects blue');
  const green = await pixel(file,1.8); assert.ok(green[1]>200 && green[0]<20 && green[2]<20,'image rendered');
  const pcm = await samples(file), source = await samples(path.join(temp,'fixture.mp4'));
  const ratio = rms(pcm,.6,1.2)/rms(source,.2,.8);
  assert.ok(Math.abs(ratio - Math.pow(10,-6/20))<.03,`gain applied once, ratio=${ratio}`);
  assert.ok(rms(pcm,0,.3)<.001); assert.ok(rms(pcm,1.5,2.4)<.001,'no lingering or synthetic audio');
});
test('muted/solo tracks and silent video do not leak sound', async () => {
  const clips=[clip(video,{linkedClipId:'a'}),clip(video,{id:'a',type:'audio',trackId:'audio',linkedClipId:'v'})];
  const {file}=await exported({clips,tracks:[{id:'video',isMuted:false,isSolo:true},{id:'audio',isMuted:true,isSolo:false}]});
  assert.ok(rms(await samples(file))<.0001);
  const noAudio = await exported({clips:[clip(silent)]}); assert.ok(rms(await samples(noAudio.file))<.0001);
});
test('image-only export, portrait ratio, subtitles including shell metacharacters', async () => {
  const {file,info}=await exported({aspectRatio:'9:16',clips:[clip(image)],subtitles:[{startTime:0,endTime:2,text:'Ciao: 50% \' " ; $(touch /tmp/TALEDIT_INJECTION) [ok]'}]});
  const stream=info.streams.find((s:any)=>s.codec_type==='video'); assert.equal(stream.width,720); assert.equal(stream.height,1280);
  await assert.rejects(fs.access('/tmp/TALEDIT_INJECTION'));
  const rgb=await pixel(file,.5); assert.ok(rgb[1]>rgb[0],String(rgb));
});
test('missing media and invalid exports fail explicitly instead of producing black/silence substitutes', async () => {
  for(const body of [{clips:[clip(video,{mediaUrl:'/media_downloads/missing.mp4'})]},{clips:[]},{format:'mp4; touch /tmp/TALEDIT_INJECTION',clips:[clip(video)]},{clips:[clip(video,{mediaUrl:'/media_downloads/../server.ts'})]},{clips:[clip(video,{startTime:-1})]},{durationSec:601,clips:[clip(video)]},{format:'wav',clips:[clip(image)]}]) {
    assert.equal((await api('/api/export', {durationSec:2,...body})).status,400,JSON.stringify(body));
  }
});
test('all advertised effects can be encoded', async () => {
  for(const effectType of ['blur','glow','vintage','cinematic','glitch','camera_shake','zoom_in','zoom_out','monochrome','dissolvenza']) {
    await exported({durationSec:1,clips:[clip(video),{id:'e',type:'effect',effectType,startTime:0,duration:1,offset:0,fadeIn:.2,fadeOut:.2}]});
  }
});
test('YouTube accepts only single canonical YouTube video URLs and rejects injected commands', () => {
  assert.equal(youtubeUrl('https://youtu.be/6bdhpjT1JmA?t=1'),'https://www.youtube.com/watch?v=6bdhpjT1JmA');
  for (const url of ['file:///etc/passwd','http://localhost/video','https://youtube.com.evil.com/watch?v=6bdhpjT1JmA','https://youtube.com/playlist?list=123','https://youtube.com/watch?v=xx;touch','https://user:password@youtube.com/watch?v=6bdhpjT1JmA']) assert.throws(()=>youtubeUrl(url));
});
for(const mode of ['http','sse']) test(`MCP ${mode} SDK handshake, real tools, linked cuts, validation and manual OFF`,async()=>{
  const snap=await api('/api/editor/state');
  const state={ clips:[clip(video,{linkedClipId:'a',isLinked:true}),clip(video,{id:'a',type:'audio',trackId:'audio',linkedClipId:'v',isLinked:true})],tracks:[],subtitles:[],mediaAssets:[video],currentTime:0,selectedClipId:'v',aspectRatio:'16:9' };
  assert.equal((await api('/api/editor/state',{state,revision:snap.data.revision},'PUT')).status,200);
  await api('/api/editor/connection',{enabled:true});
  const client=new Client({name:'taledit-test',version:'1.0.0'});
  const transport=mode==='http'?new StreamableHTTPClientTransport(new URL(base+'/api/mcp')):new SSEClientTransport(new URL(base+'/api/mcp/sse'));
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length,13);
    const call=async(name:string,args:any={})=>client.callTool({name,arguments:args});
    const initial=await call('get_timeline_state'); assert.equal(initial.isError,undefined); assert.equal(JSON.parse((initial.content as any)[0].text).state.clips.length,2);
    assert.equal((await call('cut_clip_at_time',{timeSeconds:.75})).isError,undefined);
    const actual=(await api('/api/editor/state')).data.state;
    assert.equal(actual.clips.length,4);
    const right=actual.clips.find((c:any)=>c.id===actual.selectedClipId);
    const rightAudio=actual.clips.find((c:any)=>c.id===right.linkedClipId);
    assert.equal(right.offset,.75); assert.equal(rightAudio.offset,.75); assert.equal(rightAudio.linkedClipId,right.id);
    assert.equal((await call('set_audio_volume',{clipId:right.id,volumeDb:-9})).isError,undefined);
    assert.equal((await api('/api/editor/state')).data.state.clips.find((c:any)=>c.id===rightAudio.id).volumeDb,-9);
    assert.equal((await call('set_audio_volume',{clipId:right.id,volumeDb:999})).isError,true);
    assert.equal((await call('fake_tool')).isError,true);
    await api('/api/editor/connection',{enabled:false}); assert.equal((await call('seek_time',{timeSeconds:1})).isError,true);
  } finally {await client.close();}
});
test('simultaneous audio clips mix without normalizing away the selected volume',async()=>{
  const one=clip(video,{type:'audio',id:'a',duration:1,volumeDb:-12});
  const two=clip(video,{type:'audio',id:'b',duration:1,volumeDb:-12});
  const {file}=await exported({format:'wav',clips:[one,two]});
  const source=await samples(path.join(temp,'fixture.mp4'));
  const ratio=rms(await samples(file),.2,.8)/rms(source,.2,.8);
  assert.ok(Math.abs(ratio-2*Math.pow(10,-12/20))<.02,`two channels should sum: ${ratio}`);
});
test('video layers honor opacity and finish without freezing the last frame',async()=>{
  const {file}=await exported({durationSec:2,clips:[clip(video,{duration:1}),clip(image,{id:'image',startTime:0,duration:1,transparency:50})]});
  const mixed=await pixel(file,.4);assert.ok(mixed[0]>80 && mixed[1]>80 && mixed[2]<20,String(mixed));
  assert.ok((await pixel(file,1.4)).every(v=>v<5),'ended visuals leave black, not frozen content');
});
test('cross-origin uploads are rejected before writing files',async()=>{
  const response=await fetch(base+'/api/upload-media',{method:'POST',headers:{origin:'https://unrelated.example','x-filename':'bad.mp4'},body:'test'});assert.equal(response.status,403);
});
test('caption readiness accurately reports missing model and does not invent text',async()=>{
  const {data}=await api('/api/captions/status');assert.equal(data.engine,'faster-whisper');
  if(!data.ready){const response=await api('/api/captions',{clips:[clip(video)],language:'Italian',durationSec:2});assert.equal(response.status,503);assert.match(response.data.error,/Whisper non pronto/);}
});

test('images enter only image tracks and cross-dissolve blends colors without a black dip',async()=>{
  const {applyTimelineTool}=await import('../src/services/timelineTools');
  const {applyCrossDissolve}=await import('../src/services/visualSettings');
  const state:any={clips:[],tracks:[{id:'image-track',type:'image'},{id:'video-track',type:'video'},{id:'effect-track',type:'effect'}],mediaAssets:[image],subtitles:[],currentTime:0,selectedClipId:null,aspectRatio:'16:9'};
  for(const trackId of ['image-track'])assert.equal(applyTimelineTool(state,'add_clip',{assetId:image.id,trackId,timeSeconds:0}).clips[0].type,'image');
  for(const trackId of ['effect-track','video-track'])assert.throws(()=>applyTimelineTool(state,'add_clip',{assetId:image.id,trackId,timeSeconds:0}));
  // red first second and blue second second are cut from the real video fixture.
  const sequence=[clip(video,{duration:1,offset:0}),clip(video,{id:'second',duration:1,offset:1,startTime:1})];
  const mixed=applyCrossDissolve(sequence,'second',.5);
  assert.equal(mixed[1].startTime,.5);assert.equal(mixed[1].offset,1);assert.equal(mixed[1].fadeIn,.5);
  for(const isLinked of [true,false]) {
    const pair=[...sequence.map(c=>c.id==='second'?{...c,linkedClipId:'audio',isLinked}:c),clip(video,{id:'audio',type:'audio',trackId:'audio',startTime:1,duration:1,linkedClipId:'second',isLinked})];
    const audio=applyCrossDissolve(pair,'second',.5).find(c=>c.id==='audio')!;
    assert.equal(audio.startTime,isLinked?.5:1);assert.equal(audio.fadeIn,isLinked?.5:0);
  }
  const {file}=await exported({durationSec:1.5,clips:mixed});
  const mid=await pixel(file,.76);
  assert.ok(mid[0]>90 && mid[2]>90 && mid[0]+mid[2]>230,`real crossfade, no black dip: ${mid}`);
});
test('all catalog effects change actual exported frames, including progressive zooms',async()=>{
  const {EFFECTS}=await import('../src/services/visualSettings');
  const source=path.join(temp,'pattern.png');
  await ff(['-f','lavfi','-i','color=blue:s=320x180,drawbox=x=120:y=50:w=80:h=80:color=red:t=fill','-frames:v','1','-threads','1',source]);
  const asset=await upload(source);
  async function frame(file:string,t:number){const r=await promisify(execFile)('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'});return r.stdout;}
  const normal=await exported({durationSec:1,clips:[clip(asset,{duration:1})]});const baseline=await frame(normal.file,.8);
  for(const effect of EFFECTS){
    const result=await exported({durationSec:1,clips:[clip(asset,{duration:1}),{id:'fx',name:effect.label,type:'effect',effectType:effect.type,trackId:'fx',startTime:0,duration:1,offset:0,intensity:5,speed:5,fadeIn:0,fadeOut:0}]});
    const actual=await frame(result.file,.8);
    let diff=0;for(let i=0;i<actual.length;i++)diff+=Math.abs(actual[i]-baseline[i]);
    assert.ok(diff/actual.length>.5,`${effect.type} must visibly change output, got mean diff ${diff/actual.length}`);
    if(['zoom_in','zoom_out','camera_shake'].includes(effect.type)){
      const early=await frame(result.file,.08);assert.notDeepEqual(early,actual,`${effect.type} must move over time`);
      assert.ok(actual[2]>180,'motion must not introduce black outer corners');
    }
  }
});
test('adjustment sliders change real colors, reject invalid settings, and visual fades render',async()=>{
  const source=path.join(temp,'grey.png');await ff(['-f','lavfi','-i','color=0x404040:s=320x180','-frames:v','1','-threads','1',source]);
  const asset=await upload(source);
  const baseline=await exported({durationSec:1,clips:[clip(asset,{duration:1})]});const grey=await pixel(baseline.file,.5);
  for(const [key,value] of [['brightness',60],['exposure',40],['contrast',50],['temperature',60],['tint',60]] as const){
    const result=await exported({durationSec:1,clips:[clip(asset,{duration:1,adjustments:{[key]:value}})]});const rgb=await pixel(result.file,.5);
    if(['brightness','exposure'].includes(key))assert.ok(rgb[0]>grey[0]+20,`${key}: ${rgb}`);
    if(key==='contrast')assert.ok(rgb[0]<grey[0]-15,`contrast: ${rgb}`);
    if(key==='temperature')assert.ok(rgb[0]>rgb[2]+30,`warmth: ${rgb}`);
    if(key==='tint')assert.ok(rgb[0]>rgb[1]+15,`tint: ${rgb}`);
  }
  const desaturated=await exported({durationSec:1,clips:[clip(video,{duration:1,adjustments:{saturation:-100,sharpness:50}})]});const rgb=await pixel(desaturated.file,.5);assert.ok(Math.max(...rgb)-Math.min(...rgb)<5,String(rgb));
  const faded=await exported({durationSec:1,clips:[clip(image,{duration:1,fadeIn:.5,fadeOut:.5})]});assert.ok((await pixel(faded.file,.04))[1]<80);assert.ok((await pixel(faded.file,.48))[1]>200);assert.ok((await pixel(faded.file,.96))[1]<80);
  for(const adjustments of [{brightness:101},{temperature:'oops'},{unknown:4}])assert.equal((await api('/api/export',{durationSec:1,clips:[clip(image,{adjustments})]})).status,400);
});
test('local prompt preset buttons target actual tracks, clip properties and valid media times',async()=>{
  const {executeClaudePrompt}=await import('../src/services/mcpEngine');
  const v=clip(video,{id:'vp',duration:25,trackId:'custom-video'}),a=clip(video,{id:'ap',type:'audio',trackId:'custom-audio',duration:25});
  const fx:any={id:'fp',name:'FX',type:'effect',trackId:'custom-fx',effectType:'camera_shake',startTime:0,duration:6,offset:0,fadeIn:1,fadeOut:1,transparency:100,volumeDb:0};
  const clips=[v,a,fx],tracks:any=[{id:'custom-video',type:'video'},{id:'custom-audio',type:'audio'},{id:'custom-fx',type:'effect'}];
  const run=(text:string)=>executeClaudePrompt(text,clips,tracks,5,'vp',[]);
  assert.equal(run('Taglia Intro01.mp4 al playhead').updatedClips?.find(c=>c.id==='vp')?.duration,5);
  assert.equal(run('Imposta trasparenza del video al 75%').updatedClips?.find(c=>c.id==='vp')?.transparency,75);
  assert.equal(run("Alza il volume dell'audio a +3 dB").updatedClips?.find(c=>c.id==='ap')?.volumeDb,3);
  assert.equal(run("Applica dissolvenza di 2 secondi all'effetto Camera Handed").updatedClips?.find(c=>c.id==='fp')?.fadeIn,2);
  const added=run('Aggiungi effetto Glitch Cyber a 00:20').updatedClips?.at(-1);assert.equal(added?.trackId,'custom-fx');assert.equal(added?.startTime,20);assert.equal(added?.duration,5);
  const rejected=executeClaudePrompt('Aggiungi effetto Glitch Cyber a 00:20',[clip(video)],tracks,0,'v',[]);assert.equal(rejected.updatedClips,undefined);
});
test('unlinking prevents MCP delete/cut from modifying the formerly linked audio',async()=>{
  const {applyTimelineTool}=await import('../src/services/timelineTools');
  const state:any={clips:[clip(video,{id:'v',linkedClipId:'a',isLinked:false}),clip(video,{id:'a',type:'audio',linkedClipId:'v',isLinked:false})],tracks:[],mediaAssets:[],subtitles:[],currentTime:1,selectedClipId:'v',aspectRatio:'16:9'};
  assert.deepEqual(applyTimelineTool(state,'delete_clip',{}).clips.map(c=>c.id),['a']);
  const cut=applyTimelineTool(state,'cut_clip_at_time',{timeSeconds:1});assert.equal(cut.clips.find(c=>c.id==='a')?.duration,2);assert.equal(cut.clips.length,3);
});

test('each media is restricted to its own track and old projects are repaired',async()=>{
  const {applyTimelineTool}=await import('../src/services/timelineTools');
  const {normalizeTrackAssignments}=await import('../src/services/trackRules');
  const tracks=['image','video','audio','effect'].map(type=>({id:type,type}));
  for(const type of ['image','video','audio'])for(const track of tracks){
    const asset={...image,id:type,type,hasAudio:false};const state:any={clips:[],tracks,mediaAssets:[asset],subtitles:[],currentTime:0};
    const add=()=>applyTimelineTool(state,'add_clip',{assetId:type,trackId:track.id,timeSeconds:0});
    if(track.type===type)assert.equal(add().clips[0].trackId,type);else assert.throws(add);
  }
  const migrated=normalizeTrackAssignments([clip(image,{trackId:'video'}),clip(video,{id:'video',trackId:'audio'})],tracks as any);
  assert.equal(migrated.clips[0].trackId,'image');assert.equal(migrated.clips[1].trackId,'video');
});
test('effect clips have real time boundaries, strength and speed in encoded video',async()=>{
  const {makeEffectClip}=await import('../src/services/visualSettings');
  const source=path.join(temp,'fx-pattern.png');await ff(['-f','lavfi','-i','testsrc2=s=320x180:r=25','-frames:v','1','-threads','1',source]);const asset=await upload(source);
  const effect=makeEffectClip('zoom_in','fx',.4);effect.duration=.8;effect.effectSpan=.8;
  assert.equal(effect.intensity,5);assert.equal(effect.speed,5);
  async function frame(file:string,t:number){return (await promisify(execFile)('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'})).stdout;}
  const render=async(extra:any={})=>exported({durationSec:1.6,clips:[clip(asset,{duration:1.6}),{...effect,...extra}]});
  const normal=await render({intensity:0});const moving=await render();const strong=await render({intensity:10});const slow=await render({speed:2});
  const baseline=await frame(normal.file,.8),actual=await frame(moving.file,.8);
  assert.notDeepEqual(actual,baseline);assert.notDeepEqual(await frame(strong.file,.8),actual);assert.notDeepEqual(await frame(slow.file,.8),actual);
  const still=await exported({format:'png',frameTime:.8,durationSec:1.6,clips:[clip(asset,{duration:1.6}),effect]});
  const stillRGB=(await promisify(execFile)('ffmpeg',['-v','error','-i',still.file,'-frames:v','1','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'})).stdout;
  let snapshotDiff=0;for(let i=0;i<actual.length;i++)snapshotDiff+=Math.abs(actual[i]-stillRGB[i]);assert.ok(snapshotDiff/actual.length<4,`same frozen animation frame: ${snapshotDiff/actual.length}`);
  for(const t of [.16,1.4]){const a=await frame(normal.file,t),b=await frame(moving.file,t);let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);assert.ok(diff/a.length<2,`effect must stop outside its range: ${diff/a.length}`);}
  for(const extra of [{intensity:11},{speed:-1},{speed:'fast'}])assert.equal((await api('/api/export',{durationSec:1.6,clips:[clip(asset),{...effect,...extra}]})).status,400);
});
const extraFormats:Record<string,string>={mkv:'h264',webm:'vp9',m4v:'h264',m4a:'aac',aac:'aac',flac:'flac',ogg:'vorbis',opus:'opus',aiff:'pcm_s16be',png:'png',jpg:'mjpeg',webp:'webp',bmp:'bmp',tiff:'tiff',gif:'gif'};
for(const [format,codec] of Object.entries(extraFormats))test(`real ${format} export uses its advertised encoding`,async()=>{
  const imageFormat=['png','jpg','webp','bmp','tiff','gif'].includes(format),audioFormat=['m4a','aac','flac','ogg','opus','aiff'].includes(format);
  const {file,info}=await exported({format,durationSec:.4,frameTime:.16,clips:[clip(imageFormat?image:video,{duration:.4})]});
  assert.equal(info.streams.find((s:any)=>s.codec_type===(audioFormat?'audio':'video')).codec_name,codec);
  if(imageFormat){assert.ok((await pixel(file,0))[1]>180);assert.ok(!info.streams.some((s:any)=>s.codec_type==='audio'));}
  else if(audioFormat){assert.ok(rms(await samples(file))>.04);assert.ok(!info.streams.some((s:any)=>s.codec_type==='video'));}
});
test('screenshots capture the cursor frame and image export requires an image track',async()=>{
  assert.equal((await api('/api/export',{format:'png',durationSec:2,frameTime:1.2,clips:[clip(video)]})).status,400);
  const result=await api('/api/screenshot',{durationSec:2,frameTime:1.2,resolution:'720p',clips:[clip(video)]});assert.equal(result.status,200,JSON.stringify(result.data));
  const rgb=await pixel(path.join(temp,result.data.fileName),0);assert.ok(rgb[2]>220 && rgb[0]<30,`blue frame at cursor: ${rgb}`);
  assert.equal((await api('/api/screenshot',{durationSec:2,frameTime:1.2,clips:[clip(image)]})).status,400);
});
test('waveforms are real source amplitudes and reflect the requested source interval',async()=>{
  const query=(asset:any,offset:number,duration:number)=>`/api/waveform?${new URLSearchParams({mediaUrl:asset.fileUrl,offset:String(offset),duration:String(duration)})}`;
  const tone=await api(query(video,0,1)),silence=await api(query(silent,0,1));assert.equal(tone.status,200);assert.ok(tone.data.peaks.length>500);assert.ok(Math.max(...tone.data.peaks)>.1);
  // A video with no audio must report unavailable rather than draw a synthetic wave.
  assert.equal(silence.status,500);
  const changing=path.join(temp,'changing.wav');await ff(['-f','lavfi','-i',"aevalsrc='if(lt(t,0.5),0,0.5*sin(2*PI*440*t))':s=48000:d=1",changing]);const asset=await upload(changing);
  const quiet=await api(query(asset,0,.4)),loud=await api(query(asset,.6,.4));assert.ok(Math.max(...quiet.data.peaks)<.001);assert.ok(Math.max(...loud.data.peaks)>.4);
  const fast=await api(query(asset,0,.4)+'&speedLevel=3');assert.equal(fast.status,200);assert.ok(Math.max(...fast.data.peaks)>.4,'200% reaches the source sound within this shorter interval');
});
test('caption generation preserves corrected text and timestamps as editable orange clips',async()=>{
  const {captionClips,timelineSubtitles}=await import('../src/services/captionClips');
  const draft=[{id:'s1',text:'Testo corretto',startTime:.4,endTime:1.2},{id:'s2',text:'Seconda frase',startTime:1.3,endTime:1.8}];
  const generated=captionClips(draft,[clip(video)],[]);assert.equal(generated.tracks[0].type,'text');assert.equal(generated.tracks[0].name,'TESTO');
  const text=generated.clips.filter(c=>c.type==='text');assert.equal(text[0].text,'Testo corretto');assert.equal(text[0].startTime,.4);assert.ok(Math.abs(text[0].duration-.8)<1e-6);assert.equal(text[0].color,'#f97316');
  const updated=captionClips([{...draft[0],text:'Ancora corretto'}],generated.clips,generated.tracks);assert.equal(updated.clips.filter(c=>c.type==='text').length,1);assert.equal(updated.clips.find(c=>c.type==='text')!.id,text[0].id);
  const captions=timelineSubtitles(text.map(c=>({...c,startTime:c.startTime+2})));assert.equal(captions[0].startTime,2.4);
  const output=await exported({durationSec:2,clips:generated.clips});assert.ok(output.info.streams.some((s:any)=>s.codec_type==='video'));
  async function yellow(t:number){const result=await promisify(execFile)('ffmpeg',['-v','error','-ss',String(t),'-i',output.file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer',maxBuffer:8*1024*1024});let count=0;for(let i=0;i<result.stdout.length;i+=3)if(result.stdout[i]>180 && result.stdout[i+1]>180 && result.stdout[i+2]<100)count++;return count;}
  assert.equal(await yellow(.2),0);assert.ok(await yellow(.8)>100);assert.equal(await yellow(1.24),0);assert.ok(await yellow(1.5)>100);

});

for(const [level,percent] of [-5,-4,-3,-2,-1,0,1,2,3,4,5].map((level,i)=>[level,[25,40,50,65,80,100,125,150,200,300,400][i]]))test(`clip speed ${level} renders ${percent}% with synchronized picture and original audio pitch`,async()=>{
  const rate=percent/100,duration=2/rate;
  const {file,info}=await exported({durationSec:duration,clips:[clip(video,{duration,speedLevel:level})]});
  assert.ok(Math.abs(Number(info.format.duration)-duration)<.09);
  assert.ok((await pixel(file,.4/rate))[0]>220,'early source red');assert.ok((await pixel(file,1.5/rate))[2]>220,'late source blue');
  const audio=await samples(file),start=Math.round(.15*audio.length),end=Math.round(.85*audio.length);let crossings=0;
  for(let i=start+1;i<end;i++)if(audio[i-1]<0 && audio[i]>=0)crossings++;
  const hz=crossings/((end-start)/48000);assert.ok(Math.abs(hz-440)<6,`pitch must remain 440 Hz: ${hz}`);assert.ok(rms(audio)>.04);
});
test('speed edits preserve source span, linked audio and cut offsets; invalid rates fail',async()=>{
  const {changeClipSpeed,clipRate}=await import('../src/services/clipSpeed');const {applyTimelineTool}=await import('../src/services/timelineTools');
  const pair=[clip(video,{linkedClipId:'a',isLinked:true}),clip(video,{id:'a',type:'audio',trackId:'audio',linkedClipId:'v',isLinked:true})];
  const fast=changeClipSpeed(pair,'v',5);assert.equal(fast[0].duration,.5);assert.equal(fast[1].speedLevel,5);assert.equal(fast[1].duration,.5);
  const cut=applyTimelineTool({clips:fast,tracks:[],mediaAssets:[video],currentTime:.2,selectedClipId:'v',subtitles:[],aspectRatio:'16:9'},'cut_clip_at_time',{timeSeconds:.2});
  const right=cut.clips.find(c=>c.id===cut.selectedClipId)!;assert.equal(right.offset,.8);assert.equal(cut.clips.find(c=>c.id===right.linkedClipId)!.offset,.8);
  const result=await exported({durationSec:.5,clips:cut.clips});assert.ok((await pixel(result.file,.3))[2]>220);
  for(const type of ['image','effect','text'] as const){const before=clip(image,{type,duration:3,offset:.2,fadeIn:.4,fadeOut:.2,speed:5});const after=changeClipSpeed([before],'v',3)[0];assert.equal(after.duration,1.5);assert.equal(after.offset,.2);assert.equal(after.fadeIn,.2);assert.equal(after.speed,5);assert.equal(clipRate(after),2);}
  for(const speedLevel of [-6,6,.5,'fast'])assert.equal((await api('/api/export',{durationSec:1,clips:[clip(video,{speedLevel})]})).status,400);
});
test('whole tracks duplicate actual contents and video soundtrack pairs without reusing IDs',async()=>{
  const {duplicateTrack}=await import('../src/services/duplicateTrack');
  const tracks:any=[{id:'video',name:'VIDEO',type:'video',height:100},{id:'audio',name:'AUDIO',type:'audio'},{id:'image',name:'IMMAGINI',type:'image'},{id:'effect',name:'EFFECTS',type:'effect'}];
  const clips:any=[clip(video,{linkedClipId:'a',isLinked:true,speedLevel:3}),clip(video,{id:'a',type:'audio',trackId:'audio',linkedClipId:'v',isLinked:true,speedLevel:3}),clip(image,{id:'i',trackId:'image'}),{...clip(image),id:'fx',type:'effect',trackId:'effect',effectType:'zoom_in',intensity:8,speed:2}];
  for(const track of tracks){const next=duplicateTrack(tracks,clips,track.id),copies=next.clips.slice(clips.length);assert.equal(next.tracks.find(t=>t.id===next.newTrackId)!.type,track.type);assert.ok(copies.every(c=>!clips.some((old:any)=>old.id===c.id)));assert.equal(new Set(next.clips.map(c=>c.id)).size,next.clips.length);if(track.type==='video'){assert.equal(copies.length,2);assert.equal(copies[0].linkedClipId,copies[1].id);assert.equal(copies[1].linkedClipId,copies[0].id);assert.equal(copies[0].speedLevel,3);}else{assert.equal(copies.length,1);assert.equal(copies[0].isLinked,false);}}
  let many={tracks,clips};for(let i=0;i<120;i++)many=duplicateTrack(many.tracks,many.clips,'image');assert.equal(many.tracks.length,124);
});
test('projects beyond the old track limit synchronize and export active content without a clip-count cap',async()=>{
  const tracks:any=Array.from({length:251},(_,i)=>({id:`t${i}`,name:`IMMAGINI ${i}`,type:'image'}));tracks.push({id:'video',name:'VIDEO',type:'video'});
  const clips=[clip(video,{duration:.4}),...tracks.filter((t:any)=>t.type==='image').map((t:any,i:number)=>clip(image,{id:`late${i}`,trackId:t.id,startTime:10,duration:1}))];
  const snap=(await api('/api/editor/state')).data;const state={clips,tracks,subtitles:[],mediaAssets:[video,image],currentTime:0,selectedClipId:null,aspectRatio:'16:9'};
  assert.equal((await api('/api/editor/state',{state,revision:snap.revision},'PUT')).status,200);
  const result=await exported({durationSec:.4,clips,tracks});assert.ok((await pixel(result.file,.2))[0]>220);
});
test('local Screenshot saves a real PNG directly to Downloads and keeps browser fallback on write failure',async()=>{
  const original=process.env.SCREENSHOT_DIR,folder=path.join(temp,'Downloads');process.env.SCREENSHOT_DIR=folder;
  try{
    const result=await api('/api/screenshot',{durationSec:2,frameTime:1.2,resolution:'720p',clips:[clip(video)]});assert.equal(result.status,200);assert.equal(result.data.savedToDownloads,true);assert.match(result.data.fileName,/\.png$/);
    const saved=await fs.readFile(path.join(folder,result.data.fileName)),downloaded=await(await fetch(base+result.data.downloadUrl)).arrayBuffer();assert.deepEqual(saved,Buffer.from(downloaded));assert.deepEqual([...saved.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    const blocked=path.join(temp,'not-a-folder');await fs.writeFile(blocked,'x');process.env.SCREENSHOT_DIR=blocked;
    const fallback=await api('/api/screenshot',{durationSec:2,frameTime:.2,clips:[clip(video)]});assert.equal(fallback.status,200);assert.equal(fallback.data.savedToDownloads,false);assert.equal((await fetch(base+fallback.data.downloadUrl)).status,200);
  }finally{if(original===undefined)delete process.env.SCREENSHOT_DIR;else process.env.SCREENSHOT_DIR=original;}
});

test('mixer track and master settings process actual exported audio, including summed clips and mute',async()=>{
  const tracks=[{id:'mix',name:'Mix',type:'audio',isMuted:false,isSolo:false,audio:{volume:-6}}];
  const clips=[clip(video,{id:'a1',type:'audio',trackId:'mix'}),clip(video,{id:'a2',type:'audio',trackId:'mix'})];
  const plain=await exported({format:'wav',clips,tracks:tracks.map(t=>({...t,audio:{}}))});const baseline=rms(await samples(plain.file));
  const mixed=await exported({format:'wav',clips,tracks,audioMaster:{volume:-6}});assert.ok(Math.abs(rms(await samples(mixed.file))/baseline-10**(-12/20))<.015);
  const muted=await exported({format:'wav',clips,tracks,audioMaster:{mute:true}});assert.equal(rms(await samples(muted.file)),0);
  const bypassed=await exported({format:'wav',clips,tracks:tracks.map(t=>({...t,audio:{volume:-40,bypass:true}}))});assert.ok(Math.abs(rms(await samples(bypassed.file))/baseline-1)<.01);
  const invalid=await api('/api/export',{format:'wav',durationSec:2,clips,tracks,audioMaster:{volume:100}});assert.equal(invalid.status,400);
  const compressor=await exported({format:'wav',clips,tracks:tracks.map(t=>({...t,audio:{compression:100,threshold:-35,ratio:12,attack:2,release:100}}))});assert.ok(rms(await samples(compressor.file))<baseline*.4);
});

test('COLOR corrections survive real image, video and Screenshot rendering without changing source audio',async()=>{
  const {applyGrade}=await import('../src/services/colorGrade');const file=path.join(temp,'grade-grey.png');await ff(['-f','lavfi','-i','color=0x5080a0:s=320x180','-frames:v','1','-threads','1',file]);const asset=await upload(file);
  const raw=await pixel(file,0),grade={exposure:.25,contrast:1.15,saturation:70,temperature:15,liftR:4,gammaG:8,gainB:-10,curves:{master:[0,.14,.3,.55,.73,.9,1]}};
  const expected=new Uint8ClampedArray([...raw,255]);applyGrade(expected,grade);
  const output=await exported({format:'png',clips:[clip(asset,{colorGrade:grade})]});const actual=await pixel(output.file,0);for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-expected[i])<=3,`${actual} vs ${[...expected]}`);
  const bypassed=await exported({format:'png',clips:[clip(asset,{colorGrade:{...grade,bypass:true}})]});const same=await pixel(bypassed.file,0);for(let i=0;i<3;i++)assert.ok(Math.abs(same[i]-raw[i])<=2);
  const videoOut=await exported({clips:[clip(video,{colorGrade:{saturation:0}})]});const grey=await pixel(videoOut.file,.4);assert.ok(Math.max(...grey)-Math.min(...grey)<5);assert.ok(rms(await samples(videoOut.file))>.04);
  const shot=await api('/api/screenshot',{clips:[clip(video,{colorGrade:{exposure:-1}})],frameTime:.4,durationSec:2,resolution:'720p'});assert.equal(shot.status,200,JSON.stringify(shot.data));const frame=await pixel(path.join(temp,shot.data.fileName),0);assert.ok(frame[0]>110&&frame[0]<140,`${frame}`);
  const invalid=await api('/api/export',{clips:[clip(video,{colorGrade:{gammaY:999}})],durationSec:2});assert.equal(invalid.status,400);
});
test('COLOR LUT preserves image transparency when composited over another image',async()=>{
  const raw=Buffer.alloc(8*8*4);for(let y=2;y<6;y++)for(let x=2;x<6;x++)raw.set([255,0,0,255],(y*8+x)*4);await fs.writeFile(path.join(temp,'alpha.rgba'),raw);
  const file=path.join(temp,'alpha-grade.png');await ff(['-f','rawvideo','-pixel_format','rgba','-video_size','8x8','-i',path.join(temp,'alpha.rgba'),'-frames:v','1','-threads','1',file]);const asset=await upload(file);
  const result=await exported({format:'png',clips:[clip(image,{id:'bg'}),clip(asset,{id:'fg',colorGrade:{exposure:-1}})]});
  const sample=async(x:number,y:number)=>{const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-i',result.file,'-vf',`crop=1:1:${x}:${y}`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'});return [...stdout];};
  const corner=await sample(0,0),center=await sample(640,360);assert.ok(corner[1]>240&&corner[0]<10,`${corner}`);assert.ok(center[0]>110&&center[0]<140&&center[1]<10,`${center}`);
});

test('pen masks export actual matte, inverted matte, feather and video without losing soundtrack',async()=>{
  const mask={closed:true,points:[{x:.25,y:.25},{x:.75,y:.25},{x:.75,y:.75},{x:.25,y:.75}]};
  const result=await exported({clips:[clip(video,{mask})]});const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-ss','0.4','-i',result.file,'-vf','scale=4:4','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'});assert.ok(stdout[0]<25);const center=await promisify(execFile)('ffmpeg',['-v','error','-ss','0.4','-i',result.file,'-vf','format=rgb24,crop=1:1:640:360','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'});assert.ok(center.stdout[0]>240,JSON.stringify([...center.stdout]));assert.ok(rms(await samples(result.file))>.04);
  const inverted=await exported({format:'png',clips:[clip(image,{mask:{...mask,inverted:true,feather:20}})]});const corner=await promisify(execFile)('ffmpeg',['-v','error','-i',inverted.file,'-vf','crop=1:1:0:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'});assert.ok(corner.stdout[1]>230);
  const invalid=await api('/api/export',{clips:[clip(video,{mask:{...mask,feather:100}})],durationSec:2});assert.equal(invalid.status,400);
});
test('karaoke export moves actual teal highlight with word timestamps and respects hidden text',async()=>{
  const text=clip(image,{id:'txt',type:'text',text:'ciao mondo',trackId:'text',captionStyle:'karaoke',captionWords:[{text:'ciao',startTime:0,endTime:.8},{text:'mondo',startTime:1,endTime:1.8}],mediaUrl:undefined});
  const result=await exported({clips:[clip(video),text]});
  async function tealAt(t:number,file=result.file){const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:5*1024*1024});let sum=0,count=0;for(let i=0;i<stdout.length;i+=3)if(stdout[i]<50&&stdout[i+1]>90&&stdout[i+1]<175&&stdout[i+2]>95&&stdout[i+2]<185){sum+=(i/3)%1280;count++;}return {x:sum/Math.max(1,count),count};}
  const a=await tealAt(.4),b=await tealAt(1.4);assert.ok(a.count>200&&b.count>200);assert.ok(b.x-a.x>50,JSON.stringify({a,b}));
  const hidden=await exported({clips:[clip(video),{...text,transparency:0}]});assert.ok((await pixel(hidden.file,.4))[0]>240);assert.equal((await tealAt(.4,hidden.file)).count,0);
});
test('real smart-cut analysis finds known inserted silence and returns real word timings',async()=>{
  const speech=await upload(path.resolve('tests/fixtures/jfk.wav'));
  const start=await api('/api/smart-cut',{clips:[clip(speech,{id:'speech',type:'audio',startTime:1,duration:6})],durationSec:8,tolerance:.5,language:'English'});assert.equal(start.status,202,JSON.stringify(start.data));let job:any;
  for(let i=0;i<180;i++){job=(await api(`/api/captions/${start.data.jobId}`)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,300));}
  assert.equal(job.status,'complete',JSON.stringify(job));assert.ok(job.subtitles.flatMap((s:any)=>s.words||[]).length>4);assert.ok(job.candidates.some((r:any)=>r.reason==='pause'&&r.start<.3&&r.end>.7));assert.ok(job.candidates.some((r:any)=>r.reason==='pause'&&r.end>7.5));
  assert.equal((await api('/api/smart-cut',{tolerance:.2})).status,400);
});

test('long karaoke timelines export through a filter script with source audio intact',async()=>{const texts=Array.from({length:30},(_,i)=>clip(image,{id:`text-${i}`,type:'text',trackId:'text',startTime:i/15,duration:1/15,text:'uno due tre quattro cinque',captionStyle:'karaoke',captionWords:['uno','due','tre','quattro','cinque'].map((text,j)=>({text,startTime:j/75,endTime:(j+1)/75})),mediaUrl:undefined}));const out=await exported({clips:[clip(video),...texts]});assert.ok(out.info.streams.some((s:any)=>s.codec_type==='video'));assert.ok(rms(await samples(out.file))>.04);});

test('automatic AI Cut scans every audio track without Whisper or review, preserves the chosen margin and ignores monitor mute',async()=>{
  const speech=await upload(path.resolve('tests/fixtures/jfk.wav'));const oldPython=process.env.WHISPER_PYTHON;process.env.WHISPER_PYTHON=path.join(temp,'missing-python');
  try{
    for(const margin of [.2,1]){
      const res=await api('/api/smart-cut',{mode:'automatic',margin,clips:[clip(speech,{type:'audio',id:'voice',trackId:'muted',startTime:2,duration:4,volumeDb:-60})],tracks:[{id:'muted',type:'audio',name:'AUDIO',isMuted:true,isSolo:false,audio:{volume:-60}}],audioMaster:{mute:true},durationSec:9});assert.equal(res.status,202,JSON.stringify(res.data));let job:any;
      for(let i=0;i<100;i++){job=(await api(`/api/captions/${res.data.jobId}`)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
      assert.equal(job.status,'complete',JSON.stringify(job));assert.ok(job.candidates.length>=1);assert.ok(job.candidates.every((r:any)=>r.selected));const tail=job.candidates.find((r:any)=>r.end>7);assert.ok(tail,JSON.stringify(job));assert.ok(Math.abs((9-6)-(tail.end-tail.start)-margin)<.1);
      const {rippleRemove}=await import('../src/services/smartCut');const cut=rippleRemove([clip(speech,{type:'audio',duration:9})],job.candidates);assert.ok(cut.duration<9);assert.equal(job.subtitles.length,0);
    }
    const invalid=await api('/api/smart-cut',{mode:'automatic',margin:3});assert.equal(invalid.status,400);
    const fallback=await api('/api/smart-cut',{mode:'automatic',margin:.5,fillers:true,clips:[clip(speech,{type:'audio',duration:2})],durationSec:4});assert.equal(fallback.status,202);let job:any;for(let i=0;i<100;i++){job=(await api(`/api/captions/${fallback.data.jobId}`)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}assert.equal(job.status,'complete');assert.ok(job.warning);assert.ok(job.candidates.length>0);
  }finally{if(oldPython===undefined)delete process.env.WHISPER_PYTHON;else process.env.WHISPER_PYTHON=oldPython;}
});

test('automatic scan reaches audio beyond ten minutes without truncating at the export limit',async()=>{
  for(const duration of [604,600.02]){
    const clips=duration===604?[clip(video,{type:'audio',startTime:601,duration:2})]:[clip(video,{type:'audio',startTime:600,duration:.02})];
    const request=await api('/api/smart-cut',{mode:'automatic',margin:1,clips,durationSec:duration});assert.equal(request.status,202);let job:any;
    for(let i=0;i<100;i++){job=(await api(`/api/captions/${request.data.jobId}`)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(job.status,'complete',JSON.stringify(job));const leading=job.candidates.find((r:any)=>r.start<1);assert.ok(leading&&leading.end>(duration===604?600:599),JSON.stringify(job));assert.ok(job.candidates.every((r:any)=>r.end<=duration));
  }
});

test('automatic AI Cut detects a real sub-quarter-second pause and retains exactly 0.2 seconds',async()=>{const file=path.join(temp,'short-pause.wav');await ff(['-f','lavfi','-i','aevalsrc=if(between(t\\,0.3\\,0.58)\\,0\\,0.1*sin(2*PI*440*t)):s=48000:d=0.9',file]);const asset=await upload(file);for(const margin of [.2,.3]){const res=await api('/api/smart-cut',{mode:'automatic',margin,clips:[clip(asset,{type:'audio',duration:.9})],durationSec:.9});assert.equal(res.status,202);let job:any;for(let i=0;i<100;i++){job=(await api(`/api/captions/${res.data.jobId}`)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}assert.equal(job.status,'complete',JSON.stringify(job));if(margin===.2){assert.equal(job.candidates.length,1);assert.ok(Math.abs(job.candidates[0].start-.4)<.005);assert.ok(Math.abs(job.candidates[0].end-.48)<.005);}else assert.equal(job.candidates.length,0);}});

test('cut seams never introduce black frames in an exported colored video',async()=>{const {rippleRemove}=await import('../src/services/smartCut');const result=rippleRemove([clip(video)],[{start:.11,end:.21},{start:.41,end:.52},{start:.81,end:.93},{start:1.21,end:1.34},{start:1.61,end:1.77}]);const out=await exported({clips:result.clips,durationSec:result.duration});const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-i',out.file,'-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'});let black=0;for(let i=0;i<stdout.length;i+=3)if(Math.max(stdout[i],stdout[i+1],stdout[i+2])<30)black++;assert.equal(black,0,`Black frames: ${black} / ${stdout.length/3}`);});

for(const mode of ['http','sse'])test(`MCP ${mode} imports generated local and transferred videos directly into the timeline`,async()=>{
  const previous=(await api('/api/editor/state')).data;await api('/api/editor/state',{revision:previous.revision,state:{clips:[],tracks:[],subtitles:[],mediaAssets:[],currentTime:0,selectedClipId:null,aspectRatio:'16:9'}},'PUT');await api('/api/editor/connection',{enabled:true});
  const client=new Client({name:'generated-video-test',version:'1'}),transport=mode==='http'?new StreamableHTTPClientTransport(new URL(base+'/api/mcp')):new SSEClientTransport(new URL(base+'/api/mcp/sse'));
  try{
    await client.connect(transport);const call=async(name:string,args:any={})=>{const r=await client.callTool({name,arguments:args});assert.equal(r.isError,undefined,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
    const local=await call('import_media',{sourcePath:path.join(temp,'fixture.mp4'),fileName:'Claude_generated.mp4'});assert.equal(local.state.mediaAssets.length,1);assert.equal(local.clipIds.length,2);const v=local.state.clips.find((c:any)=>c.type==='video');const a=local.state.clips.find((c:any)=>c.id===v.linkedClipId);assert.equal(a.linkedClipId,v.id);assert.equal(a.startTime,v.startTime);
    const bytes=await fs.readFile(path.join(temp,'fixture.mp4')),begin=await call('begin_media_upload',{fileName:'Claude_remote.mp4',totalBytes:bytes.length});
    const incomplete=await client.callTool({name:'finish_media_upload',arguments:{uploadId:begin.uploadId}});assert.equal(incomplete.isError,true);
    const half=Math.floor(bytes.length/2);await call('upload_media_chunk',{uploadId:begin.uploadId,offset:0,dataBase64:bytes.subarray(0,half).toString('base64')});
    assert.equal((await client.callTool({name:'upload_media_chunk',arguments:{uploadId:begin.uploadId,offset:0,dataBase64:bytes.subarray(half).toString('base64')}})).isError,true);
    await call('upload_media_chunk',{uploadId:begin.uploadId,offset:half,dataBase64:bytes.subarray(half).toString('base64')});const done=await call('finish_media_upload',{uploadId:begin.uploadId});assert.equal(done.state.clips.length,4);assert.equal(done.state.mediaAssets.length,2);assert.deepEqual(await fs.readFile(path.join(temp,path.basename(done.asset.fileUrl))),bytes);const second=done.state.clips.find((c:any)=>c.id===done.clipIds[0]);assert.equal(second.startTime,2);
    const again=await call('finish_media_upload',{uploadId:begin.uploadId});assert.equal(again.state.clips.length,4);assert.deepEqual(again.clipIds,done.clipIds);
    const inline=await call('import_media',{fileName:'Claude_small.mp4',dataBase64:bytes.toString('base64')});assert.equal(inline.state.clips.length,6);
    assert.equal((await client.callTool({name:'import_media',arguments:{fileName:'bad.mp4',dataBase64:Buffer.from('not video').toString('base64')}})).isError,true);assert.equal((await api('/api/editor/state')).data.state.clips.length,6);
    assert.equal((await client.callTool({name:'import_media',arguments:{url:'https://127.0.0.1/private.mp4'}})).isError,true);
    await api('/api/editor/connection',{enabled:false});assert.equal((await client.callTool({name:'import_media',arguments:{sourcePath:path.join(temp,'fixture.mp4')}})).isError,true);
  }finally{await client.close();}
});
test('MCP rendering creates a real video and imports it automatically with linked sound',async()=>{
  const old=(await api('/api/editor/state')).data;await api('/api/editor/state',{revision:old.revision,state:{clips:[clip(video)],tracks:[],subtitles:[],mediaAssets:[video],currentTime:0,selectedClipId:null,aspectRatio:'16:9'}},'PUT');await api('/api/editor/connection',{enabled:true});
  const client=new Client({name:'mcp-export-test',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp')));const result=await client.callTool({name:'export_video',arguments:{resolution:'720p'}});assert.equal(result.isError,undefined,JSON.stringify(result));const out=JSON.parse((result.content as any)[0].text);assert.equal(out.state.clips.length,3);assert.ok(out.asset.hasAudio);assert.equal(out.clipIds.length,2);assert.ok((await fetch(base+out.downloadUrl)).ok);const generated=out.state.clips.find((c:any)=>c.id===out.clipIds[0]);assert.equal(generated.startTime,2);}finally{await client.close();}
});
