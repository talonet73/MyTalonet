import {validateCaptionClip} from '../src/services/karaoke';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {cleanupCandidates,rippleRemove,mergeRanges} from '../src/services/smartCut';
import {maskAlpha,validateMask,type PenMask} from '../src/services/penMask';
import {maskPng} from '../server/maskPng';
import {captionClips,timelineSubtitles} from '../src/services/captionClips';
import type {TimelineClip} from '../src/types/editor';
const rect:PenMask={closed:true,points:[{x:.25,y:.25},{x:.75,y:.25},{x:.75,y:.75},{x:.25,y:.75}]};
const clip=(extra:any={}):TimelineClip=>({id:'v',type:'video',name:'Video',trackId:'v',startTime:0,duration:10,offset:1,fadeIn:0,fadeOut:0,volumeDb:0,transparency:100,color:'blue',...extra});
test('smart-cut pause threshold and padding are exact; fillers and retakes always require review',()=>{
  const s:any=[{id:'s',startTime:1,endTime:3,text:'ehm stop rifacciamo',words:[{text:'ehm',startTime:1,endTime:1.3}]}];
  const c=cleanupCandidates([{start:4,end:4.8},{start:6,end:8.5}],s,10,1);assert.equal(c.filter(r=>r.reason==='pause').length,1);assert.equal(c[0].selected,false);const pause=c.find(r=>r.reason==='pause')!;assert.equal(pause.start,6.12);assert.equal(pause.end,8.38);assert.equal(pause.selected,true);assert.equal(c.find(r=>r.reason==='retake')!.selected,false);
  assert.equal(cleanupCandidates([{start:4,end:4.8}],s,10,.5).filter(r=>r.reason==='pause').length,1);assert.throws(()=>cleanupCandidates([],[],10,.4));assert.equal(cleanupCandidates([{start:0,end:4}],[],4,1)[0].selected,false);
});
test('ripple removal cuts every layer, preserves linked source offsets and supports changed playback rate',()=>{
  const clips=[clip({isLinked:true,linkedClipId:'a',speedLevel:3}),clip({id:'a',type:'audio',trackId:'a',isLinked:true,linkedClipId:'v',speedLevel:3}),clip({id:'image',type:'image'}),clip({id:'fx',type:'effect',effectType:'zoom_in'})];
  const result=rippleRemove(clips,[{start:2,end:4},{start:3,end:5},{start:7,end:8}]);assert.equal(result.duration,6);assert.equal(result.mapTime(9),5);assert.equal(result.clips.filter(c=>c.type==='video').length,3);
  const v=result.clips.find(c=>c.type==='video'&&c.startTime===2)!,a=result.clips.find(c=>c.id===v.linkedClipId)!;assert.equal(v.offset,11);assert.equal(a.offset,11);assert.equal(a.linkedClipId,v.id);assert.equal(v.duration,2);assert.equal(result.clips.find(c=>c.type==='effect')!.effectSpan,10);
  assert.throws(()=>rippleRemove(clips,[{start:0,end:10}]));assert.deepEqual(mergeRanges([{start:2,end:3},{start:3,end:5}],10),[{start:2,end:5}]);
});
test('ripple removal never links an orphan audio to an unrelated video',()=>{const c=clip({isLinked:true,linkedClipId:'missing'}),r=rippleRemove([c],[{start:2,end:3}]);assert.ok(r.clips.every(c=>!c.isLinked&&!c.linkedClipId));});
test('pen mask raster, inversion, disable, open paths and feathering produce actual expected alpha',()=>{
  const a=maskAlpha(rect,100,100);assert.equal(a[50*100+50],255);assert.equal(a[0],0);assert.equal(a.reduce((s,n)=>s+n,0),2500*255);assert.equal(maskAlpha({...rect,inverted:true},100,100)[0],255);assert.ok(maskAlpha({...rect,enabled:false},100,100).every(v=>v===255));assert.ok(maskAlpha({...rect,closed:false},100,100).every(v=>v===255));
  const f=maskAlpha({...rect,feather:50},108,108);assert.ok(f.some(n=>n>0&&n<255));assert.deepEqual([...maskPng(rect,100,100).subarray(0,8)],[137,80,78,71,13,10,26,10]);
});
test('Bezier mask handles change the actual matte and invalid masks are rejected',()=>{
  const curve={...rect,points:rect.points.map((p,i)=>i===0?{...p,out:{x:.5,y:.05}}:p)};assert.notDeepEqual(maskAlpha(curve,100,100),maskAlpha(rect,100,100));for(const m of [null,{closed:true,points:[]},{...rect,feather:51},{...rect,points:[{x:NaN,y:0}]}])assert.throws(()=>validateMask(m));validateMask(curve);
});
test('karaoke captions keep real word timing through chunking, cuts and clip speeds',()=>{
  const words=Array.from({length:8},(_,i)=>({text:`parola${i}`,startTime:2+i*.4,endTime:2+i*.4+.3})),sub={id:'s',startTime:2,endTime:5.2,text:words.map(w=>w.text).join(' '),words};
  const result=captionClips([sub],[],[],false,false,true);assert.equal(result.clips.length,2);assert.ok(result.clips.every(c=>c.captionStyle==='karaoke'));assert.equal(result.clips[0].captionWords![0].startTime,0);
  const cut={...result.clips[0],startTime:10,offset:.4,duration:.8,speedLevel:3};const mapped=timelineSubtitles([cut])[0];assert.ok(mapped.words!.some(w=>Math.abs(w.startTime-10)<1e-7));assert.ok(mapped.words!.every(w=>w.endTime>10&&w.startTime<10.8));
  assert.equal(captionClips([sub],[],[],false,true,true).clips[0].captionStyle,undefined);
});

test('quiet recognized words are protected from silence trimming and repeated takes stay unchecked',()=>{const subtitles:any=[{id:'a',startTime:1,endTime:3,text:'questa è una frase ripetuta',words:[{text:'voce',startTime:1,endTime:2}]},{id:'b',startTime:4,endTime:6,text:'questa è una frase ripetuta'}];const candidates=cleanupCandidates([{start:0,end:3}],subtitles,6,.5);assert.ok(candidates.filter(r=>r.reason==='pause').every(r=>r.end<1||r.start>2));assert.ok(candidates.some(r=>r.reason==='retake'&&!r.selected));});

test('malformed caption word arrays and unknown styles are rejected before rendering or loading',()=>{for(const c of [{captionStyle:'other'},{captionWords:{}},{captionWords:[{text:'ciao',startTime:2,endTime:1}]}])assert.throws(()=>validateCaptionClip(c as any));validateCaptionClip({captionStyle:'karaoke',captionWords:[{text:'ciao',startTime:0,endTime:.4}]});});
