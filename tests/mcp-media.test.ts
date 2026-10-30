import {test} from 'node:test';import assert from 'node:assert/strict';
import {publicAddress,safeMediaName} from '../server/mcpMedia';
import {joinCutSeams} from '../src/services/timelineContinuity';
import type {TimelineClip} from '../src/types/editor';
test('public media downloads exclude local, mapped, link-local and reserved addresses',()=>{for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.5','169.254.169.254','100.64.1.2','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2001:0db8::1','2002:7f00:1::','3fff::1'])assert.equal(publicAddress(ip),false,ip);for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);assert.equal(safeMediaName('C:\\output\\video.mp4'),'video.mp4');assert.throws(()=>safeMediaName('secret.env'));});
test('cut joins snap floating point residue without removing intended timeline gaps',()=>{const c=(id:string,startTime:number,duration:number)=>({id,trackId:'v',startTime,duration} as TimelineClip);const result=joinCutSeams([c('a',0,.3),c('b',.30000000000000004,.4),c('gap',1,.2)]);assert.equal(result[1].startTime,result[0].startTime+result[0].duration);assert.equal(result[2].startTime,1);});
