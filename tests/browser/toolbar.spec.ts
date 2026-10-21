import { test,expect,type Page } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const tracks=[{id:'v',name:'VIDEO',type:'video',headerBg:'#0f2942',laneBg:'#111d2e'},{id:'a',name:'AUDIO',type:'audio',headerBg:'#0d3324',laneBg:'#10251e'},{id:'i',name:'IMMAGINI',type:'image',headerBg:'#382a08',laneBg:'#1a1608'},{id:'fx',name:'EFFECTS',type:'effect',headerBg:'#35121b',laneBg:'#1e141a'}].map(t=>({...t,isMuted:false,isSolo:false}));
let pattern:any,red:any,blue:any,voice:any,video:any;
async function state(page:Page){return (await(await page.request.get('/api/editor/state')).json()).state;}
async function project(page:Page,clips:any[]=[],subtitles:any[]=[]){
  await page.goto('/');
  const data={appName:'TALEDIT',tracks,clips,mediaAssets:[pattern,red,blue,voice,video],subtitles,markers:[],currentTime:0,aspectRatio:'16:9'};
  await page.locator('input[type=file]').first().setInputFiles({name:'toolbar.tal',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect.poll(async()=>JSON.stringify((await state(page)).clips)).toBe(JSON.stringify(clips));
}
function clip(asset:any,id='c',extra:any={}){return {id,name:asset.name,assetId:asset.id,type:asset.type,trackId:asset.type==='audio'?'a':asset.type==='image'?'i':'v',mediaUrl:asset.fileUrl,startTime:0,duration:2,offset:0,transparency:100,volumeDb:0,fadeIn:0,fadeOut:0,color:'#2563eb',...extra};}
async function slider(page:Page,label:string,value:number){await page.getByRole('slider',{name:label,exact:true}).evaluate((node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function rgb(page:Page,x=.5,y=.5){return page.getByTestId('player-canvas').evaluate((c:HTMLCanvasElement,p)=>[...c.getContext('2d')!.getImageData(c.width*p[0],c.height*p[1],1,1).data].slice(0,3),[x,y]);}
test.beforeAll(async({request})=>{
  for(const [name,filter] of [['pattern','color=blue:s=320x180,drawbox=x=120:y=50:w=80:h=80:color=red:t=fill'],['red','color=red:s=320x180'],['blue','color=blue:s=320x180']]){
    const file=`/tmp/taledit-toolbar-${name}.png`;execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',filter,'-frames:v','1','-threads','1',file]);
    const response=await request.post('/api/upload-media',{headers:{'Content-Type':'application/octet-stream','x-filename':`${name}.png`},data:fs.readFileSync(file)});expect(response.ok()).toBe(true);
    const asset=(await response.json()).asset;if(name==='pattern')pattern=asset;if(name==='red')red=asset;if(name==='blue')blue=asset;
  }
  const videoFile='/tmp/taledit-toolbar-video.mp4';execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=320x180:r=25:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest',videoFile]);
  const uploaded=await request.post('/api/upload-media',{headers:{'Content-Type':'application/octet-stream','x-filename':'toolbar-video.mp4'},data:fs.readFileSync(videoFile)});video=(await uploaded.json()).asset;
  const response=await request.post('/api/upload-media',{headers:{'Content-Type':'application/octet-stream','x-filename':'speech.wav'},data:fs.readFileSync('tests/fixtures/jfk.wav')});voice=(await response.json()).asset;
});
test('Adjustment and strict image drop apply visible changes and survive save/reopen',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await project(page,[clip(pattern)]);await page.locator('[data-clip-id=c]').click();
  await page.getByRole('button',{name:'Adjustment',exact:true}).click();
  for(const [label,key] of [['Luminosità','brightness'],['Contrasto','contrast'],['Saturazione','saturation'],['Esposizione','exposure'],['Temperatura','temperature'],['Tinta','tint'],['Nitidezza','sharpness']]){await slider(page,label,25);await expect.poll(async()=>(await state(page)).clips[0].adjustments?.[key]).toBe(25);}
  await page.getByRole('button',{name:'Ripristina regolazioni'}).click();await expect.poll(async()=>Object.keys((await state(page)).clips[0].adjustments).length).toBe(0);
  await slider(page,'Saturazione',-100);await expect.poll(async()=>{const v=await rgb(page);return Math.max(...v)-Math.min(...v);}).toBeLessThan(5);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/toolbar-saved.tal';await(await saved).saveAs(file);expect(JSON.parse(fs.readFileSync(file,'utf8')).clips[0].adjustments.saturation).toBe(-100);
  await page.getByRole('button',{name:'Chiudi pannello'}).click();
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect.poll(async()=>(await state(page)).selectedClipId).toBe(null);
  // Images must be rejected on video lanes and accepted only on image lanes.
  const transfer=await page.evaluateHandle(asset=>{const dt=new DataTransfer();dt.setData('application/json',JSON.stringify(asset));return dt;},blue);
  await page.locator('[data-track-id=v]').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.getByRole('alert')).toContainText('Ogni file va');await page.getByRole('alert').click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.locator('[data-track-id=i]').dispatchEvent('drop',{dataTransfer:transfer});
  await expect.poll(async()=>(await state(page)).clips.length).toBe(2);expect((await state(page)).clips.every((c:any)=>c.trackId==='i')).toBe(true);await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('Transitions make an actual smooth overlap in preview',async({page})=>{
  await project(page,[clip(red,'first'),clip(blue,'second',{startTime:2})]);await page.locator('[data-clip-id=second]').click();
  await page.getByRole('button',{name:'Transitions',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Pannello Transitions'});
  await panel.getByLabel('Durata dissolvenza (secondi)').fill('1');
  await panel.getByRole('button',{name:'Dissolvenza in entrata',exact:true}).click();await expect.poll(async()=>(await state(page)).clips[1].fadeIn).toBe(1);
  await panel.getByRole('button',{name:'Dissolvenza in uscita',exact:true}).click();await expect.poll(async()=>(await state(page)).clips[1].fadeOut).toBe(1);
  await panel.getByRole('button',{name:'Rimuovi dissolvenze'}).click();
  await panel.getByRole('button',{name:'Dissolvenza incrociata con precedente'}).click();await expect.poll(async()=>(await state(page)).clips[1].startTime).toBe(1);
  await panel.getByRole('button',{name:'Chiudi pannello'}).click();
  // Seek through the actual MCP path to the center of the overlap.
  await page.getByRole('button',{name:'ChatGPT MCP',exact:true}).click();if(await page.getByRole('button',{name:'OFF (Spento)',exact:true}).count())await page.getByRole('button',{name:'OFF (Spento)',exact:true}).click();
  await page.getByRole('button',{name:'Chiudi collegamento MCP'}).click();
  const response=await page.request.post('/api/mcp',{headers:{Accept:'application/json, text/event-stream'},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seek_time',arguments:{timeSeconds:1.5}}}});expect(response.ok()).toBe(true);expect((await response.json()).result.isError).not.toBe(true);
  await expect.poll(async()=>{const p=await rgb(page);return p[0]>100 && p[2]>100 && p[0]+p[2]>230;}).toBe(true);
});
test('Captions opens its panel, recognizes real speech, edits, translates toggle and deletes',async({page})=>{
  test.setTimeout(120000);
  await project(page,[clip(voice,'speech',{duration:voice.durationSec})]);
  await page.getByRole('button',{name:'Captions',exact:true}).click();const panel=page.getByRole('dialog',{name:'Pannello Captions'});await expect(panel).toBeVisible();
  await panel.getByLabel('Lingua parlata').selectOption('English');await panel.getByRole('button',{name:'Traduzione in inglese'}).click();await expect(panel.getByRole('button',{name:'Traduzione in inglese'})).toHaveAttribute('aria-pressed','true');
  await panel.getByRole('button',{name:'Traduzione in inglese'}).click();await panel.getByLabel('Delete current captions').check();
  await panel.getByRole('button',{name:'GENERATE',exact:true}).click();await expect(panel.getByLabel('Testo sottotitolo').first()).toBeVisible({timeout:90000});
  await expect.poll(async()=>(await state(page)).subtitles.map((s:any)=>s.text).join(' ').toLowerCase()).toContain('country');
  await panel.getByLabel('Testo sottotitolo').first().fill('Testo corretto');await expect.poll(async()=>(await state(page)).subtitles[0].text).toBe('Testo corretto');
  const count=(await state(page)).subtitles.length;await panel.getByTitle('Elimina riga').first().click();await expect.poll(async()=>(await state(page)).subtitles.length).toBe(count-1);
  await panel.getByRole('button',{name:'Chiudi pannello'}).click();
});
test('toolbar edit buttons and File menus perform their actions',async({page})=>{
  await project(page,[clip(red,'original')]);await page.locator('[data-clip-id=original]').click();
  await page.getByRole('button',{name:'Copia',exact:true}).click();await page.getByRole('button',{name:'Incolla',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(2);
  await page.getByRole('button',{name:'Cestino',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(2);
  await page.getByRole('button',{name:'Avanti',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.locator('[data-clip-id=original]').click();
  // Move to the middle with the local command console, then exercise the Cut button.
  await page.getByRole('button',{name:/✦ Claude/}).click();
  const mcp=page.getByRole('dialog',{name:'Collegamento MCP'});
  await mcp.locator('input[type=text]').fill('Vai a 00:01');await mcp.getByRole('button',{name:'Invia',exact:true}).click();await expect.poll(async()=>(await state(page)).currentTime).toBe(1);await mcp.getByRole('button',{name:'Chiudi collegamento MCP'}).click();
  await page.getByRole('button',{name:'Cut',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(2);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Indietro (Undo)',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.locator('[data-clip-id=original]').click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Taglia (Cut al playhead)',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(2);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Avanti (Redo)',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(2);
  await page.locator('[data-clip-id]').last().click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Elimina Selezionato',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(1);
  await page.getByRole('button',{name:'File',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:/^Salva Progetto/}).click();const file='/tmp/toolbar-menu-project.tal';await(await download).saveAs(file);
  await page.getByRole('button',{name:'File',exact:true}).click();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:/Apri Progetto \(.tal, .json\)/}).click();await(await chooser).setFiles(file);
  await page.getByRole('button',{name:'File',exact:true}).click();const importer=page.waitForEvent('filechooser');await page.getByRole('button',{name:/Importa Media nello Stage/}).click();await(await importer).setFiles('/tmp/taledit-toolbar-pattern.png');await expect.poll(async()=>(await state(page)).mediaAssets.length).toBe(6);
  const topImport=page.waitForEvent('filechooser');await page.getByRole('button',{name:'+ Importa',exact:true}).click();await(await topImport).setFiles('/tmp/taledit-toolbar-blue.png');await expect.poll(async()=>(await state(page)).mediaAssets.length).toBe(7);
  const stageImport=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import',exact:true}).click();await(await stageImport).setFiles('/tmp/taledit-toolbar-red.png');await expect.poll(async()=>(await state(page)).mediaAssets.length).toBe(8);
  const topOpen=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Apri',exact:true}).click();await(await topOpen).setFiles(file);await expect.poll(async()=>(await state(page)).mediaAssets.length).toBe(5);
  await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('button',{name:/Esporta Video\.\.\./}).click();await expect(page.getByRole('dialog',{name:'Esportazione'})).toBeVisible();await page.getByLabel('Chiudi esportazione').click();
});
test('track controls, zoom and marker dialogs persist changes',async({page})=>{
  await project(page,[clip(red)]);
  const solo=page.getByTitle('Solo pista').first();await solo.click();await expect.poll(async()=>(await state(page)).tracks[0].isSolo).toBe(true);await solo.click();
  const mute=page.getByTitle('Muto pista').first();await mute.click();await expect.poll(async()=>(await state(page)).tracks[0].isMuted).toBe(true);await mute.click();
  const before=await page.locator('[data-clip-id=c]').evaluate(e=>e.getBoundingClientRect().width);await page.getByTitle('Ingrandisci timeline').click();await expect.poll(async()=>page.locator('[data-clip-id=c]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(before);await page.getByTitle('Rimpicciolisci timeline').click();
  for(const type of ['Video (Blu)','Audio (Verde)','Effetti (Rosso)','Immagini (Giallo)']){
    await page.getByTitle('Aggiungi una nuova traccia audio, video, effetto o immagine').click();const modal=page.getByRole('dialog',{name:'Nuova traccia'});await modal.getByRole('button',{name:type,exact:false}).click();await modal.getByRole('button',{name:'Aggiungi Pista',exact:true}).click();
  }
  await expect.poll(async()=>(await state(page)).tracks.length).toBe(8);
  await page.getByRole('button',{name:'+ Nuova Pista',exact:true}).click();await page.getByRole('button',{name:'Annulla',exact:true}).click();
  await page.getByTitle('Aggiungi una nuova traccia audio, video, effetto o immagine').click();await page.getByLabel('Chiudi nuova traccia').click();
  await page.getByTitle(/Elimina traccia/).last().click();await expect.poll(async()=>(await state(page)).tracks.length).toBe(7);
  await page.getByRole('button',{name:'Marker',exact:true}).click();await page.locator('[title^="Marker 1:"]').click();const marker=page.getByRole('dialog',{name:'Dettagli marker'});await marker.locator('input[type=text]').fill('Nota verificata');await marker.locator('textarea').fill('Cambio scena');for(const color of ['#f59e0b','#ef4444','#10b981','#3b82f6','#8b5cf6'])await marker.getByLabel(`Colore ${color}`,{exact:true}).click();await marker.getByRole('button',{name:'Salva Modifiche'}).click();await page.locator('[title^="Nota verificata:"]').click();await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.locator('[title^="Nota verificata:"]').click();await page.getByRole('dialog',{name:'Dettagli marker'}).getByRole('button',{name:'Elimina',exact:true}).click();await expect(page.locator('[title^="Nota verificata:"]')).toHaveCount(0);
  await page.getByTitle('Aggiungi Marker al tempo corrente',{exact:true}).click();await page.locator('[title^="Marker 1:"]').click();await page.getByLabel('Chiudi marker').click();
});
test('player, fullscreen, menus, MCP and microphone controls have real or explicit capability outcomes',async({page,context})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await project(page,[clip(red)]);
  await page.getByTitle('Riproduci (Spazio)',{exact:true}).click();await expect.poll(async()=>(await state(page)).currentTime).toBeGreaterThan(.1);await page.getByTitle('Pausa (Spazio)',{exact:true}).click();await page.getByTitle("Torna all'inizio",{exact:true}).click();await expect.poll(async()=>(await state(page)).currentTime).toBe(0);
  await page.getByTitle('Muto',{exact:true}).click();await expect(page.getByTitle('Attiva audio',{exact:true})).toBeVisible();await page.getByTitle('Attiva audio',{exact:true}).click();
  await page.getByLabel('Opzioni player').click();await page.getByRole('button',{name:'Vai all’inizio',exact:true}).click();
  for(const ratio of ['9:16','1:1','4:3','16:9']){await page.locator('select').filter({has:page.locator('option[value="16:9"]')}).selectOption(ratio);await expect.poll(async()=>(await state(page)).aspectRatio).toBe(ratio);}
  for(const title of ['Full','Schermo Intero']){
    const button=title==='Full'?page.getByRole('button',{name:'Full',exact:true}):page.getByTitle(title,{exact:true});await button.click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);await button.click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
  }
  await page.getByRole('button',{name:'View',exact:true}).click();await page.getByText('Schermo Intero',{exact:true}).click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);await page.evaluate(()=>document.exitFullscreen());
  await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('button',{name:'Console Claude DT MCP'}).click();await page.getByLabel('Chiudi collegamento MCP').click();
  await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Guida Connessione Claude DT'}).click();const mcp=page.getByRole('dialog',{name:'Collegamento MCP'});await mcp.getByRole('button',{name:/Claude Desktop Setup/}).click();await context.grantPermissions(['clipboard-read','clipboard-write']);await mcp.getByRole('button',{name:'Copia Configurazione'}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('mcpServers');
  await mcp.getByRole('button',{name:/MCP Tools/}).click();await expect(mcp.getByText('get_timeline_state',{exact:true})).toBeVisible();await mcp.getByRole('button',{name:'Configura ChatGPT MCP'}).click();await expect(mcp.getByText('Collega ChatGPT a TALEDIT')).toBeVisible();await mcp.getByLabel('Chiudi collegamento MCP').click();
  for(let i=0;i<2;i++){const previous=(await(await page.request.get('/api/mcp/status')).json()).enabled;await page.getByTitle('Accendi o spegni manualmente il collegamento MCP con Claude').click();await expect.poll(async()=>(await(await page.request.get('/api/mcp/status')).json()).enabled).toBe(!previous);if(await page.getByLabel('Chiudi collegamento MCP').count())await page.getByLabel('Chiudi collegamento MCP').click();}
  await page.getByRole('button',{name:'MIC',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Riconoscimento vocale non disponibile');await page.getByRole('alert').click();expect(errors).toEqual([]);
});
test('trim handles update source offset and linked audio; track delete can be undone',async({page})=>{
  await project(page,[clip(video,'vclip',{type:'video',duration:3,isLinked:true,linkedClipId:'aclip'}),clip(video,'aclip',{type:'audio',trackId:'a',duration:3,isLinked:true,linkedClipId:'vclip'})]);
  const visual=page.locator('[data-clip-id=vclip]');await visual.hover();
  const edge=visual.getByTitle("Trascina per accorciare o allungare dall'inizio",{exact:true});const box=(await edge.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='vclip').offset).toBe(1);
  const snapshot=await state(page);expect(snapshot.clips.find((c:any)=>c.id==='aclip').offset).toBe(1);expect(snapshot.clips.find((c:any)=>c.id==='aclip').duration).toBe(2);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='vclip').offset).toBe(0);
  await page.getByTitle('Elimina traccia "VIDEO"',{exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.some((t:any)=>t.id==='v')).toBe(false);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.some((t:any)=>t.id==='v')).toBe(true);await expect(page.locator('[data-clip-id=vclip]')).toBeVisible();
});
test('export format/resolution/weight controls, JSON, repeat export and download work',async({page})=>{
  await project(page,[clip(red,'img',{duration:1}),clip(voice,'sound',{duration:1})]);await page.getByRole('button',{name:'Esporta',exact:true}).click();const modal=page.getByRole('dialog',{name:'Esportazione'});
  for(const fmt of ['mp4','avi','mov','mp3','wav']){await modal.getByRole('button',{name:new RegExp('^\\.'+fmt,'i')}).click();await expect(modal.getByRole('button',{name:new RegExp('^\\.'+fmt,'i')})).toHaveClass(/ring-1/);}
  await expect(modal.getByRole('slider',{name:'Peso del file'})).toBeDisabled();
  await modal.getByRole('button',{name:/^\.mp4/i}).click();for(const res of ['4K Ultra HD','1080p Full HD','720p HD'])await modal.getByRole('button',{name:new RegExp(res)}).click();await slider(page,'Peso del file',80);
  const saved=page.waitForEvent('download');await modal.getByRole('button',{name:'Salva Progetto TALEDIT (.json)',exact:true}).click();await(await saved).saveAs('/tmp/toolbar-export-project.json');expect(JSON.parse(fs.readFileSync('/tmp/toolbar-export-project.json','utf8')).clips).toHaveLength(2);
  await modal.getByRole('button',{name:/Avvia Rendering/}).click();await expect(modal.getByText('Rendering completato con successo!')).toBeVisible({timeout:30000});await modal.getByRole('button',{name:'Esegui un’altra esportazione',exact:true}).count().then(async count=>{if(count)await modal.getByRole('button',{name:'Esegui un’altra esportazione',exact:true}).click();else await modal.getByRole('button',{name:"Esegui un'altra esportazione",exact:true}).click();});
  await modal.getByRole('button',{name:/^\.mp3/i}).click();await modal.getByRole('button',{name:/Avvia Rendering/}).click();await expect(modal.getByText('Rendering completato con successo!')).toBeVisible({timeout:30000});const exported=page.waitForEvent('download');await modal.getByRole('button',{name:/^Scarica TALEDIT/}).click();const audio='/tmp/toolbar-ui-audio.mp3';await(await exported).saveAs(audio);const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',audio],{encoding:'utf8'}));expect(probe.streams[0].codec_name).toBe('mp3');
  await page.getByRole('button',{name:'Esporta',exact:true}).click();await expect(page.getByRole('button',{name:/Avvia Rendering/})).toBeVisible();await page.getByLabel('Chiudi esportazione').click();
});
test('stage filters and timeline context linking/unlinking/delete buttons are consistent',async({page})=>{
  await project(page,[clip(video,'vv',{type:'video',duration:2,isLinked:true,linkedClipId:'aa'}),clip(video,'aa',{type:'audio',trackId:'a',duration:2,isLinked:true,linkedClipId:'vv'})]);
  const filter=page.locator('select').filter({has:page.locator('option[value="All"]')});for(const type of ['video','audio','image','All']){await filter.selectOption(type);await expect(page.locator('[draggable=true]')).toHaveCount(type==='All'?5:type==='image'?3:1);}
  const search=page.getByPlaceholder('Cerca nei file dello stage...');await search.fill('pattern');await expect(page.locator('[draggable=true]')).toHaveCount(1);await search.fill('');
  await page.locator('[data-clip-id=vv]').click({button:'right'});await page.getByRole('button',{name:"Separa il video dall'audio",exact:true}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='vv').isLinked).toBe(false);
  await page.locator('[data-clip-id=vv]').click({button:'right'});await page.getByRole('button',{name:'Unisci video e audio',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='vv').isLinked).toBe(true);
  await page.locator('[data-clip-id=vv]').click({button:'right'});await page.getByRole('button',{name:'Elimina mattoncino',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(0);await expect(page.locator('[draggable=true]')).toHaveCount(5);
  await page.locator('[draggable=true]').filter({hasText:'pattern.png'}).click();await page.getByTitle('Cancella questo file dallo stage').first().click();await expect.poll(async()=>(await state(page)).mediaAssets.length).toBe(4);
});

test('effect film previews create only effects clips with controls, trims, cuts and clipboard history',async({page})=>{
  await project(page,[clip(video,'source',{duration:4})]);
  await page.getByRole('button',{name:'Effects',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Pannello Effects'});await expect(panel.locator('canvas')).toHaveCount(9);
  const card=panel.getByRole('button',{name:'Inserisci Camera a mano',exact:true});
  await expect.poll(async()=>card.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(80,45,1,1).data[3])).toBe(255);
  const transfer=await page.evaluateHandle(()=>new DataTransfer());await card.dispatchEvent('dragstart',{dataTransfer:transfer});
  await page.locator('[data-track-id=i]').dispatchEvent('drop',{dataTransfer:transfer});await expect(page.getByRole('alert')).toContainText('EFFECTS');await page.getByRole('alert').click();
  await page.locator('[data-track-id=fx]').dispatchEvent('drop',{dataTransfer:transfer});
  await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(1);
  let effect=(await state(page)).clips.find((c:any)=>c.type==='effect');expect(effect.trackId).toBe('fx');expect(effect.intensity).toBe(5);expect(effect.speed).toBe(5);
  await expect(page.getByRole('slider',{name:'Intensità',exact:true})).toHaveValue('5');await expect(page.getByRole('slider',{name:'Velocità',exact:true})).toHaveValue('5');
  await slider(page,'Intensità',8);await slider(page,'Velocità',2);await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id===effect.id).speed).toBe(2);
  const block=page.locator(`[data-clip-id="${effect.id}"]`);await block.hover();const edge=block.getByTitle('Trascina per accorciare o allungare dalla fine',{exact:true});const box=(await edge.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id===effect.id).duration).toBe(4);
  await page.request.post('/api/editor/connection',{data:{enabled:true}});await page.request.post('/api/mcp',{headers:{Accept:'application/json, text/event-stream'},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seek_time',arguments:{timeSeconds:1}}}});await expect.poll(async()=>(await state(page)).currentTime).toBe(1);
  await block.click();await page.getByRole('button',{name:'Cut',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(2);
  const right=(await state(page)).clips.find((c:any)=>c.type==='effect' && c.id!==effect.id);expect(right.offset).toBe(1);expect(right.intensity).toBe(8);expect(right.speed).toBe(2);
  await page.getByRole('button',{name:'Copia',exact:true}).click();await page.getByRole('button',{name:'Incolla',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(3);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(2);
  await page.getByRole('button',{name:'Avanti',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(3);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/toolbar-effects.tal';await(await saved).saveAs(file);await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).selectedClipId).toBe(null);
  for(const c of (await state(page)).clips.filter((c:any)=>c.type==='effect')){expect(c.speed).toBe(2);expect(c.intensity).toBe(8);expect(c.trackId).toBe('fx');}
  await page.locator(`[data-clip-id="${effect.id}"]`).click();await expect(page.getByRole('slider',{name:'Intensità',exact:true})).toHaveValue('8');
  for(const label of ['Zoom in','Zoom out','Luce morbida','Vintage','Cinema','Bianco e nero','Sfocatura','Glitch']){await page.getByRole('button',{name:'Effects',exact:true}).click();await page.getByRole('button',{name:`Inserisci ${label}`,exact:true}).click();}
  await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='effect').length).toBe(11);
});
test('BG Remover segments a real image through the panel and preserves undo',async({page})=>{
  await project(page);
  await page.locator('input[type=file]').nth(1).setInputFiles('tests/fixtures/bg-animal.jpg');const card=page.locator('[draggable=true]').filter({hasText:'bg-animal.jpg'});await expect(card).toBeVisible();await card.dblclick();
  await expect.poll(async()=>(await state(page)).clips.length).toBe(1);const original=(await state(page)).clips[0];expect(original.trackId).toBe('i');
  const buttons=await page.locator('button').allTextContents();expect(buttons.indexOf('BG Remover')).toBeGreaterThan(buttons.indexOf('Adjustment'));
  await page.getByRole('button',{name:'BG Remover',exact:true}).click();const panel=page.getByRole('dialog',{name:'Pannello BG Remover'});await expect(panel.getByRole('button',{name:'Rimuovi sfondo',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'Rimuovi sfondo',exact:true}).click();
  await expect(panel.getByRole('status').filter({hasText:'Sfondo rimosso'})).toBeVisible({timeout:90000});
  await expect.poll(async()=>(await state(page)).clips[0].mediaUrl).toMatch(/bg_.*\.png$/);
  const modified=(await state(page)).clips[0];expect(modified.trackId).toBe('i');expect(modified.id).toBe(original.id);expect(modified.offset).toBe(0);expect((await state(page)).mediaAssets).toHaveLength(7);
  await panel.getByRole('button',{name:'Chiudi BG Remover',exact:true}).click();await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips[0].mediaUrl).toBe(original.mediaUrl);
  await page.locator(`[data-clip-id="${original.id}"]`).click();await page.getByRole('button',{name:'BG Remover',exact:true}).click();await panel.getByRole('button',{name:'Rimuovi sfondo',exact:true}).click();await panel.getByRole('button',{name:'Annulla elaborazione',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Elaborazione annullata.'})).toBeVisible();expect((await state(page)).clips[0].mediaUrl).toBe(original.mediaUrl);
});
test('BG Remover replaces trimmed video while linked source audio stays synchronized on further trims',async({page})=>{
  const file='/tmp/taledit-browser-bg-video.mp4';execFileSync('ffmpeg',['-v','error','-y','-loop','1','-i','tests/fixtures/bg-animal.jpg','-f','lavfi','-i','sine=frequency=440:duration=3','-vf','scale=320:214','-t','3','-r','25','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',file]);
  const response=await page.request.post('/api/upload-media',{headers:{'Content-Type':'application/octet-stream','x-filename':'bg-video.mp4'},data:fs.readFileSync(file)});const asset=(await response.json()).asset;
  await project(page,[clip(asset,'bg-video',{duration:2,offset:.4,linkedClipId:'bg-audio',isLinked:true}),clip(asset,'bg-audio',{type:'audio',trackId:'a',duration:2,offset:.4,linkedClipId:'bg-video',isLinked:true})]);await page.locator('[data-clip-id=bg-video]').click();
  await page.getByRole('button',{name:'BG Remover',exact:true}).click();const panel=page.getByRole('dialog',{name:'Pannello BG Remover'});await expect(panel.getByRole('button',{name:'Rimuovi sfondo',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'Rimuovi sfondo',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Sfondo rimosso'})).toBeVisible({timeout:90000});await panel.getByRole('button',{name:'Chiudi BG Remover',exact:true}).click();
  await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='bg-video').mediaUrl).toMatch(/bg_.*\.webm$/);
  const processed=(await state(page)).clips.find((c:any)=>c.id==='bg-video'),audio=(await state(page)).clips.find((c:any)=>c.id==='bg-audio');expect(processed.mediaUrl).toMatch(/bg_.*\.webm$/);expect(processed.offset).toBe(0);expect(audio.offset).toBe(.4);expect(audio.mediaUrl).toBe(asset.fileUrl);
  const block=page.locator('[data-clip-id=bg-video]');await block.hover();const edge=block.getByTitle("Trascina per accorciare o allungare dall'inizio",{exact:true});const box=(await edge.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='bg-video').offset).toBe(1);await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='bg-audio').offset).toBeCloseTo(1.4);
});
