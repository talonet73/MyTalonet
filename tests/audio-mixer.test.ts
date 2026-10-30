import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {audioFilters,validateAudio,type AudioSettings} from '../src/services/audioMixer';
const exec=promisify(execFile);
async function render(settings:AudioSettings={},source='0.1*sin(2*PI*440*t)',duration=.8){
  const {stdout}=await exec('ffmpeg',['-v','error','-f','lavfi','-i',`aevalsrc=${source}:s=48000:d=${duration}`, '-af',['aformat=sample_fmts=fltp:channel_layouts=stereo',...audioFilters(settings)].join(','),'-t',String(duration),'-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:8*1024*1024});
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength));
}
function rms(a:Float32Array,channel=0,start=.1,end=.6){let n=0,sum=0;for(let i=Math.round(start*48000)*2+channel;i<Math.min(a.length,end*48000*2);i+=2){sum+=a[i]**2;n++;}return Math.sqrt(sum/n);}
test('mixer defaults, bypass and validated controls',async()=>{
  const original=await render(),bypass=await render({volume:-40,bass:12,delay:300,bypass:true});assert.deepEqual(original,bypass);
  for(const bad of [{volume:13},{pan:-101},{noise:NaN},{reverb:101},{bogus:1},{bypass:1},null])assert.throws(()=>validateAudio(bad));
  validateAudio({volume:-6,compression:75,ratio:4,mute:true});
});
test('real mixer volume and master mute alter PCM',async()=>{
  const base=rms(await render()),quiet=rms(await render({volume:-20}));assert.ok(Math.abs(quiet/base-.1)<.005);assert.equal(rms(await render({mute:true})),0);
});
test('real panorama isolates channels and stereo width collapses side signal',async()=>{
  const left=await render({pan:-100});assert.ok(rms(left)>0.06);assert.ok(rms(left,1)<.00001);
  const right=await render({pan:100});assert.ok(rms(right,0)<.00001);assert.ok(rms(right,1)>.06);
  const mono=await render({width:0},'0.1*sin(2*PI*440*t)|-0.1*sin(2*PI*440*t)');assert.ok(rms(mono)<.00001);
  const wide=await render({width:200},'0.1*sin(2*PI*440*t)|-0.1*sin(2*PI*440*t)');assert.ok(rms(wide)>.13);
});
test('real compressor reduces loud peaks with configurable dynamics',async()=>{
  const source='0.8*sin(2*PI*440*t)',base=rms(await render({},source));
  const processed=rms(await render({compression:100,threshold:-30,ratio:10,attack:2,release:100},source));assert.ok(processed<base*.3);
  const neutral=rms(await render({compression:0,threshold:-30,ratio:20},source));assert.ok(Math.abs(neutral-base)<.001);
});
for(const [key,freq,value,mode] of [['highpass',100,1000,'cut'],['lowpass',10000,1000,'cut'],['bass',100,12,'boost'],['mid',1000,12,'boost'],['treble',10000,12,'boost']] as const)test(`real ${key} filters change the expected frequencies`,async()=>{
  const source=`0.03*sin(2*PI*${freq}*t)`,base=rms(await render({},source)),processed=rms(await render({[key]:value},source));assert.ok(mode==='cut'?processed<base*.15:processed>base*2,`${key}: ${processed/base}`);
});
test('noise reduction attenuates quiet background while preserving louder speech-level signal',async()=>{
  const low='0.0005*sin(2*PI*440*t)',high='0.3*sin(2*PI*440*t)';assert.ok(rms(await render({noise:100},low))<rms(await render({},low))*.1);
  assert.ok(rms(await render({noise:100},high))>rms(await render({},high))*.9);
});
for(const key of ['delay','echo','reverb'] as const)test(`real ${key} produces sound at the expected later time`,async()=>{
  const burst='if(lt(t\\,0.015)\\,0.4*sin(2*PI*440*t)\\,0)',s=key==='delay'?{delay:250}:{[key]:100},a=await render(s,burst);
  const from=key==='delay'?.251:key==='echo'?.241:.038,to=from+.01;
  assert.ok(rms(a,0,from,to)>.0001);
  assert.ok(rms(await render({},burst),0,from,to)<.000001);
  if(key==='delay')assert.equal(rms(a,0,0,.24),0);
});
test('all mixer stages can be combined into finite stereo PCM',async()=>{
  const a=await render({volume:2,pan:15,width:130,compression:70,threshold:-18,ratio:3,attack:5,release:120,delay:10,echo:25,reverb:30,noise:35,highpass:80,lowpass:16000,bass:2,mid:-2,treble:3});assert.ok(a.every(Number.isFinite));assert.ok(rms(a)>.01);
});
