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
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'], { encoding: 'buffer' });
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
  for(const effectType of ['blur','glow','vintage','cinematic','glitch','camera_shake','dissolvenza']) {
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
    assert.equal((await client.listTools()).tools.length,8);
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
