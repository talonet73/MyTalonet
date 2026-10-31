import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
const {runtime,control}=createRequire(import.meta.url)('../packaging/windows/launcher.cjs');
test('packaged Windows runtime uses only private executables and separates user media from program updates',()=>{
  const root=path.resolve('App con spazi'),cache=path.resolve('Dati personali');
  const config=runtime(root,cache);
  assert.equal(config.env.WHISPER_PYTHON,path.join(root,'runtime/python/python.exe'));
  assert.equal(config.env.BG_PYTHON,config.env.WHISPER_PYTHON);
  assert.equal(config.env.MEDIA_DIR,path.join(cache,'media_downloads'));
  assert.equal(config.env.WHISPER_MODEL_DIR,path.join(root,'models/whisper-small'));
  assert.equal(config.env.BG_MODEL_DIR,path.join(root,'models/bg'));
  assert.equal(config.env.HOST,'127.0.0.1');assert.equal(config.env.NODE_ENV,'production');
  assert.equal(config.env.YT_DLP_PATH,path.join(root,'tools/yt-dlp.exe'));
  assert.ok(config.env.PATH.startsWith(path.join(root,'tools')+path.delimiter));
  assert.equal(config.env.PYTHONNOUSERSITE,'1');assert.equal(config.env.PYTHONPATH,'');
});
test('packaged launcher control waits for the reply, and treats a missing instance as stopped',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'taledit-control-'));
  const pipe=process.platform==='win32'?`\\\\.\\pipe\\taledit-test-${Date.now()}`:path.join(temp,'control.sock');
  const received:string[]=[];
  const server=net.createServer({allowHalfOpen:true},socket=>{
    let command='';socket.setEncoding('utf8');socket.on('data',chunk=>command+=chunk);
    socket.on('end',()=>{received.push(command.trim());setTimeout(()=>socket.end('ok'),50);});
  });
  await new Promise<void>(resolve=>server.listen(pipe,resolve));
  try{assert.equal(await control(pipe,'open'),true);assert.equal(await control(pipe,'stop'),true);assert.deepEqual(received,['open','stop']);}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert.equal(await control(pipe,'stop'),false);
  await fs.rm(temp,{recursive:true,force:true});
});
