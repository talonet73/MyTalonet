import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:['src/services/liveAudioMixer.ts'],bundle:true,write:false,format:'iife',globalName:'MixerUnderTest',platform:'browser'})).outputFiles[0].text;});
test('real Web Audio processing: dynamics, stereo, filters and noise worklet',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const ctx=new AudioContext({sampleRate:48000});await ctx.resume();
    const mixer=new (window as any).MixerUnderTest.LiveAudioMixer(ctx);
    const channel=ctx.createAnalyser(),split=ctx.createChannelSplitter(2);channel.fftSize=1024;(mixer as any).master.output.connect(split);split.connect(channel,0);
    const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));await wait(150);
    const render=async(settings:any,amplitude=.1,frequency=440,invert=false)=>{
      mixer.configure([{id:'a',audio:settings}],{},true,false);
      const buffer=ctx.createBuffer(2,48000,48000);for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=Math.sin(2*Math.PI*frequency*i/48000)*amplitude*(invert&&ch===1?-1:1);}
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(mixer.input('a'));source.start();await wait(550);const data=new Float32Array(channel.fftSize);channel.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);source.stop();source.disconnect();await wait(100);return rms;
    };
    const base=await render({}),quiet=await render({volume:-20}),compressed=await render({compression:100,threshold:-30,ratio:10,attack:2,release:100},.8),loud=await render({},.8);
    const stereo=await render({},.1,440,true),mono=await render({width:0},.1,440,true),wide=await render({width:200},.1,440,true);
    const low=await render({},.0005),denoised=await render({noise:100},.0005),high=await render({noise:100},.3);
    const bass=await render({},.1,100),filtered=await render({highpass:1000},.1,100);
    await ctx.close();return {base,quiet,compressed,loud,stereo,mono,wide,low,denoised,high,bass,filtered,gateReady:(mixer as any).gateReady};
  });
  expect(result.gateReady).toBe(true);expect(result.quiet/result.base).toBeCloseTo(.1,1);expect(result.compressed).toBeLessThan(result.loud*.3);
  expect(result.stereo).toBeGreaterThan(.06);expect(result.wide/result.stereo).toBeCloseTo(2,1);expect(result.mono).toBeLessThan(.00001);
  expect(result.denoised).toBeLessThan(result.low*.1);expect(result.high).toBeGreaterThan(.1);expect(result.filtered).toBeLessThan(result.bass*.15);
});
