import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {COLOR_CONTROLS,CURVE_X,applyGrade,gradeCube,validateGrade,curveValue,hasGrade,type ColorGrade} from '../src/services/colorGrade';
import {scopeData} from '../src/services/colorScopes';
const exec=promisify(execFile);
function pixel(s:ColorGrade,r=80,g=120,b=160){const data=new Uint8ClampedArray([r,g,b,137]);applyGrade(data,s);assert.equal(data[3],137);return [...data].slice(0,3);}
test('neutral and bypass grades preserve pixels, alpha and legacy projects',()=>{assert.deepEqual(pixel({}),[80,120,160]);assert.deepEqual(pixel({exposure:3,bypass:true}),[80,120,160]);assert.equal(hasGrade(undefined),false);validateGrade(undefined);});
test('every grading control validates its documented limits and rejects malformed data',()=>{
  for(const [key,,min,max] of COLOR_CONTROLS){validateGrade({[key]:min});validateGrade({[key]:max});assert.throws(()=>validateGrade({[key]:max+1}));}
  for(const value of [null,[],{bogus:5},{exposure:NaN},{bypass:1},{curves:{red:[0,1]}},{curves:{cyan:[...CURVE_X]}},{curves:{red:[0,.1,.2,.3,.4,.5,Infinity]}}])assert.throws(()=>validateGrade(value));
});
test('all LGGO channel and luminance controls alter the intended actual pixels',()=>{
  for(const wheel of ['lift','gamma','gain','offset'])for(const channel of ['Y','R','G','B']){const p=pixel({[`${wheel}${channel}`]:30});assert.notDeepEqual(p,[80,120,160],`${wheel}${channel}`);if(channel!=='Y')for(let c=0;c<3;c++)if(['R','G','B'][c]!==channel)assert.ok(Math.abs(p[c]-[80,120,160][c])<=1);}
});
test('primaries, white balance, tonal ranges and hue produce finite visible corrections',()=>{
  for(const [key,value] of [['exposure',1],['contrast',1.4],['temperature',50],['tint',50],['saturation',0],['vibrance',75],['hue',90],['shadows',50],['highlights',50],['blacks',75]] as const)assert.notDeepEqual(pixel({[key]:value}),[80,120,160],key);
  assert.notDeepEqual(pixel({whites:75},200,210,220),[200,210,220]);
  const grey=pixel({saturation:0});assert.ok(Math.max(...grey)-Math.min(...grey)<=1);assert.ok(pixel({exposure:1})[0]>150);
  assert.notDeepEqual(pixel({contrast:1.5,pivot:.2}),pixel({contrast:1.5,pivot:.7}));
});
test('cubic curves hit all points, stay bounded and survive descending segments',()=>{
  const points=[0,.1,.4,.7,.75,.9,1];for(let i=0;i<7;i++)assert.ok(Math.abs(curveValue(CURVE_X[i],points)-points[i])<1e-8);
  for(let x=0;x<=1;x+=.001){const v=curveValue(x,points);assert.ok(v>=0&&v<=1);}
  const inverted=[1,.9,.7,.5,.3,.1,0];assert.ok(curveValue(.25,inverted)>.7);
  assert.notDeepEqual(pixel({curves:{red:[0,.3,.5,.7,.85,.95,1]}}),[80,120,160]);
});
test('real full-range scopes identify black, white, red and actual spatial positions',()=>{
  const pixels=new Uint8ClampedArray(8*2*4);for(let y=0;y<2;y++)for(let x=0;x<8;x++){const p=(y*8+x)*4;pixels.set(x<2?[0,0,0,255]:x<4?[255,255,255,255]:x<6?[255,0,0,255]:[0,0,255,255],p);}
  const s=scopeData(pixels,8,2);assert.equal(s.count,4);assert.equal(s.min,0);assert.ok(Math.abs(s.max-255)<1e-8);assert.equal(s.black,25);assert.equal(s.white,25);assert.equal(s.hist[0][255],2);assert.equal(s.wave[0],1);assert.equal(s.wave[127*160+40],1);assert.equal(s.vector.reduce((sum,n)=>sum+n,0),4);
});
test('browser trilinear grading agrees with real FFmpeg lut3d on a multicolor raster',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'taledit-grade-'));
  try{
    const data=Buffer.alloc(32*32*3);for(let i=0;i<1024;i++){data[i*3]=(i*7)%256;data[i*3+1]=(i*13)%256;data[i*3+2]=(i*29)%256;}await fs.writeFile(path.join(temp,'input.rgb'),data);
    const settings:ColorGrade={exposure:.4,contrast:1.2,pivot:.4,temperature:15,tint:-10,saturation:120,vibrance:20,hue:8,liftR:5,gammaB:8,gainG:-5,offsetY:2,shadows:5,highlights:-10,curves:{master:[0,.12,.28,.53,.72,.88,1],blue:[0,.2,.4,.58,.75,.9,1]}};
    await fs.writeFile(path.join(temp,'grade.cube'),gradeCube(settings));
    const {stdout}=await exec('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size','32x32','-i',path.join(temp,'input.rgb'),'-vf',"lut3d=file='grade.cube':interp=trilinear",'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{cwd:temp,encoding:'buffer'});
    const rgba=new Uint8ClampedArray(1024*4);for(let i=0;i<1024;i++)rgba.set([...data.subarray(i*3,i*3+3),255],i*4);applyGrade(rgba,settings);
    let worst=0,total=0;for(let i=0;i<1024;i++)for(let c=0;c<3;c++){const d=Math.abs(rgba[i*4+c]-stdout[i*3+c]);worst=Math.max(worst,d);total+=d;}assert.ok(worst<=2,`Worst RGB difference ${worst}`);assert.ok(total/(1024*3)<1);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
