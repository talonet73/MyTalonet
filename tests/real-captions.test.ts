import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

test('real Whisper API preserves source trims, timeline delay and chronological timestamps', { timeout: 180000 }, async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'taledit-captions-real-'));
  process.env.MEDIA_DIR = folder;
  const { createApp } = await import('../server');
  const app = await createApp(true);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const upload = await fetch(base + '/api/upload-media', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': 'jfk.wav' }, body: await fs.readFile('tests/fixtures/jfk.wav') });
    assert.equal(upload.status, 200);
    const asset = (await upload.json()).asset;
    // Reference recognition of source seconds 2..9, without a timeline delay.
    const reference = path.join(folder, 'reference.wav');
    await exec('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', 'tests/fixtures/jfk.wav', '-t', '7', reference]);
    const python = process.env.WHISPER_PYTHON || '/workspace/.venv-whisper/bin/python';
    const pending = exec(python, ['scripts/transcribe.py'], { timeout: 90000, maxBuffer: 1024 * 1024 });
    pending.child.stdin!.end(JSON.stringify({ file: reference, language: 'en' }));
    const expected = JSON.parse((await pending).stdout).subtitles;
    assert.ok(expected.length > 0, 'reference speech must be recognized');
    const voice = { id:'voice', name:'jfk.wav', type:'audio', trackId:'voice-track', mediaUrl:asset.fileUrl, startTime:3, duration:7, offset:2, volumeDb:0, transparency:100, fadeIn:0, fadeOut:0 };
    const response = await fetch(base + '/api/captions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clips:[voice,{...voice,id:'muted',trackId:'muted-track',startTime:0,offset:0,duration:2}], tracks:[{id:'voice-track',isMuted:false,isSolo:false},{id:'muted-track',isMuted:true,isSolo:false}], durationSec:10, language:'English' }) });
    const started = await response.json(); assert.equal(response.status,202,JSON.stringify(started));
    let job:any; const deadline = Date.now()+90000;
    do {
      const status = await fetch(base+'/api/captions/'+started.jobId); assert.equal(status.status,200); job = await status.json();
      assert.notEqual(job.status,'error',job.error);
      if(job.status==='complete') break;
      await new Promise(resolve=>setTimeout(resolve,250));
    } while(Date.now()<deadline);
    assert.equal(job.status,'complete','recognition must finish, not just start');
    const actual=job.subtitles;
    assert.ok(actual.length>0,'API must return real speech');
    assert.match(actual.map((s:any)=>s.text).join(' ').toLowerCase(),/country/);
    for(let i=0;i<actual.length;i++) {
      const sub=actual[i]; assert.ok(sub.startTime>=2.75 && sub.endTime<=10.1 && sub.endTime>sub.startTime,JSON.stringify(sub));
      if(i) assert.ok(sub.startTime>=actual[i-1].endTime-.05,'timestamps must be chronological');
    }
    const firstDelta=actual[0].startTime-expected[0].startTime;
    const lastDelta=actual.at(-1).endTime-expected.at(-1).endTime;
    assert.ok(Math.abs(firstDelta-3)<.7,`expected 3s shift at start, got ${firstDelta}s`);
    assert.ok(Math.abs(lastDelta-3)<.7,`expected 3s shift at end, got ${lastDelta}s`);
    console.log('Real Whisper timeline result:',JSON.stringify({sourceOffset:2,timelineStart:3,firstDelta,lastDelta,subtitles:actual}));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
