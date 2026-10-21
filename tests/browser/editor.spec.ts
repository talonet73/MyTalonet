import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const fixture='/tmp/taledit-browser-fixture.mp4';
const green='/tmp/taledit-browser-image.png';
test.beforeAll(()=>{
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=320x180:r=25:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest',fixture]);
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=lime:s=320x180','-frames:v','1','-threads','1',green]);
});
test('real import, preview, MCP changes, linked cut/undo, project save/reopen and video export',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Nessun file nello stage')).toBeVisible();
  // Top toolbar import uses the App file input, not the stage-specific one.
  await page.locator('input[type=file]').nth(1).setInputFiles(fixture);
  const card=page.locator('[draggable=true]').filter({hasText:'taledit-browser-fixture.mp4'});
  await expect(card).toBeVisible(); await card.dblclick();
  await expect.poll(async()=> (await (await request.get('/api/editor/state')).json()).state.clips.length).toBe(2);
  const canvas=page.locator('canvas').first();
  await expect.poll(async()=>canvas.evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(c.width/2,c.height/2,1,1).data].slice(0,3))).toEqual([254,0,0]);
  await page.getByTitle('ChatGPT MCP',{exact:true}).click();
  await expect(page.getByText('Collega ChatGPT a TALEDIT')).toBeVisible();
  await expect(page.getByText('http://127.0.0.1:3100/api/mcp',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'OFF (Spento)',exact:true}).click();
  await expect.poll(async()=> (await (await request.get('/api/mcp/status')).json()).enabled).toBe(true);
  const client=new Client({name:'browser-mcp-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3100/api/mcp')));
  const cut=await client.callTool({name:'cut_clip_at_time',arguments:{timeSeconds:1}});expect(cut.isError).toBeUndefined();
  await expect.poll(async()=> (await (await request.get('/api/editor/state')).json()).state.clips.length).toBe(4);
  // Close MCP modal using its close button (last icon button in its header).
  await page.locator('.fixed.inset-0').getByRole('button').filter({has:page.locator('svg.lucide-x')}).click();
  await page.keyboard.press('Control+z');
  await expect.poll(async()=> (await (await request.get('/api/editor/state')).json()).state.clips.length).toBe(2);
  await page.keyboard.press('Control+y');
  await expect.poll(async()=> (await (await request.get('/api/editor/state')).json()).state.clips.length).toBe(4);
  // Save/reopen keeps persistent URLs and exact aspect ratio.
  const projectDownload=page.waitForEvent('download'); await page.keyboard.press('Control+s');
  const project=await projectDownload; const saved='/tmp/taledit-browser-project.tal';await project.saveAs(saved);
  const data=JSON.parse(fs.readFileSync(saved,'utf8'));expect(data.clips.length).toBe(4); expect(data.mediaAssets[0].fileUrl).toMatch(/^\/media_downloads\/upload_/);
  await page.locator('input[type=file]').first().setInputFiles(saved);
  await client.close();
  await page.keyboard.press('Control+e');
  await page.getByRole('button',{name:'720p HD'}).click();
  await page.getByRole('button',{name:/Avvia Rendering/}).click();
  await expect(page.getByText('Rendering completato con successo!')).toBeVisible({timeout:30000});
  const output=page.waitForEvent('download');await page.getByRole('button',{name:/^Scarica TALEDIT/}).click();
  const download=await output;const file='/tmp/taledit-browser-output.mp4';await download.saveAs(file);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
  expect(info.streams.find((s:any)=>s.codec_type==='video').width).toBe(1280);
  const rgb=execFileSync('ffmpeg',['-v','error','-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);expect(rgb[0]).toBeGreaterThan(240);
  expect(errors).toEqual([]);
});
test('YouTube dialog imports a completed job automatically and shows actual failures',async({page})=>{
  // Deterministic UI contract test; the real YouTube network check is separate.
  await page.goto('/');
  await page.route('**/api/youtube/download',route=>route.fulfill({status:202,json:{jobId:'test-download'}}));
  await page.route('**/api/youtube/download/test-download',route=>route.fulfill({json:{status:'complete',progress:100,asset:{id:'yt-test',type:'video',name:'YouTube test.mp4',durationSec:2,duration:'00:02',fileUrl:'/media_downloads/test.mp4'}}}));
  await page.getByRole('button',{name:'Importa da YouTube',exact:true}).click();
  await page.getByLabel('Link del video').fill('https://youtu.be/6bdhpjT1JmA');
  await page.getByRole('button',{name:'Scarica e importa nello stage'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[draggable=true]').filter({hasText:'YouTube test.mp4'})).toBeVisible();
  await page.unroute('**/api/youtube/download/test-download');
  await page.route('**/api/youtube/download/test-download',route=>route.fulfill({json:{status:'error',error:'Accesso YouTube rifiutato (403).'}}));
  await page.getByRole('button',{name:'Importa da YouTube',exact:true}).click();
  await page.getByLabel('Link del video').fill('https://youtu.be/6bdhpjT1JmA');
  await page.getByRole('button',{name:'Scarica e importa nello stage'}).click();
  await expect(page.getByRole('alert')).toContainText('403');
  // Real fallback upload, not a mocked download: verify stored bytes and preview.
  await expect.poll(async () => (await (await page.request.get('/api/editor/state')).json()).state.mediaAssets.some((a:any) => a.id === 'yt-test')).toBe(true);
  const before = (await (await page.request.get('/api/editor/state')).json()).state.mediaAssets.length;
  await page.getByLabel('File video locale', {exact:true}).setInputFiles(fixture);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get('/api/editor/state')).json()).state.mediaAssets.length).toBe(before + 1);
  const snapshot = (await (await page.request.get('/api/editor/state')).json()).state;
  const asset = snapshot.mediaAssets.find((a:any) => a.name === 'taledit-browser-fixture.mp4');
  expect(asset.fileUrl).toMatch(/^\/media_downloads\/upload_/);
  const mediaResponse = await page.request.get(asset.fileUrl);
  expect(mediaResponse.ok()).toBe(true);
  expect(await mediaResponse.body()).toEqual(fs.readFileSync(fixture));

});
test('stage import, image overlay, linked duplication, deletion and undo preserve the real project',async({page,request})=>{
  await page.goto('/');
  await page.locator('input[type=file]').nth(2).setInputFiles(green);
  const imageCard=page.locator('[draggable=true]').filter({hasText:'taledit-browser-image.png'});
  await expect(imageCard).toBeVisible();await imageCard.dblclick();
  await expect.poll(async()=>{const s=(await(await request.get('/api/editor/state')).json()).state;return s.clips.some((c:any)=>c.type==='image');}).toBe(true);
  const canvas=page.locator('canvas').first();
  await expect.poll(async()=>canvas.evaluate((c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(c.width/2,c.height/2,1,1).data[1])).toBeGreaterThan(240);
  await page.keyboard.press('Control+d');
  await expect.poll(async()=>{const s=(await(await request.get('/api/editor/state')).json()).state;return s.clips.filter((c:any)=>c.type==='image').length;}).toBe(2);
  await page.keyboard.press('Delete');
  await expect.poll(async()=>{const s=(await(await request.get('/api/editor/state')).json()).state;return s.clips.filter((c:any)=>c.type==='image').length;}).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(async()=>{const s=(await(await request.get('/api/editor/state')).json()).state;return s.clips.filter((c:any)=>c.type==='image').length;}).toBe(2);
  // Missing media produces a visible error, never a bogus successful export.
  const project={appName:'TALEDIT',tracks:[{id:'v',type:'video'}],clips:[{id:'bad',name:'missing.mp4',type:'video',trackId:'v',mediaUrl:'/media_downloads/missing.mp4',startTime:0,duration:1,offset:0}],mediaAssets:[]};
  await page.locator('input[type=file]').first().setInputFiles({name:'missing.tal',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.getByRole('button',{name:'Esporta',exact:true}).click();
  await page.getByRole('button',{name:/Avvia Rendering/}).click();
  await expect(page.getByRole('alert')).toContainText('Media non disponibile');
  await expect(page.getByText('Rendering completato con successo!')).toHaveCount(0);
});
