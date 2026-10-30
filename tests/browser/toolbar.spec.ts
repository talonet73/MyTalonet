import { test,expect,type Page } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const tracks=[{id:'t',name:'TESTO',type:'text',headerBg:'#63300d',laneBg:'#301909'},{id:'v',name:'VIDEO',type:'video',headerBg:'#0f2942',laneBg:'#111d2e'},{id:'a',name:'AUDIO',type:'audio',headerBg:'#0d3324',laneBg:'#10251e'},{id:'i',name:'IMMAGINI',type:'image',headerBg:'#382a08',laneBg:'#1a1608'},{id:'fx',name:'EFFECTS',type:'effect',headerBg:'#35121b',laneBg:'#1e141a'}].map(t=>({...t,isMuted:false,isSolo:false}));
let pattern:any,red:any,blue:any,voice:any,video:any;
async function state(page:Page){return (await(await page.request.get('/api/editor/state')).json()).state;}
async function project(page:Page,clips:any[]=[],subtitles:any[]=[]){
  await page.goto('/');
  const data={appName:'TALEDIT',captionWorkflow:'timeline',tracks,clips,mediaAssets:[pattern,red,blue,voice,video],subtitles,markers:[],currentTime:0,aspectRatio:'16:9'};
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
  await panel.getByRole('button',{name:'Trascrivi audio',exact:true}).click();await expect(panel.getByLabel('Testo sottotitolo').first()).toBeVisible({timeout:90000});
  await expect.poll(async()=>(await state(page)).subtitles.map((s:any)=>s.text).join(' ').toLowerCase()).toContain('country');
  await panel.getByLabel('Testo sottotitolo').first().fill('Testo corretto');await expect.poll(async()=>(await state(page)).subtitles[0].text).toBe('Testo corretto');
  await panel.getByRole('button',{name:'GENERATE',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='text')[0]?.text).toBe('Testo corretto');
  const count=(await state(page)).subtitles.length;await panel.getByTitle('Elimina riga').first().click();await expect.poll(async()=>(await state(page)).subtitles.length).toBe(count-1);
  await panel.getByRole('button',{name:'GENERATE',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='text').length).toBe(count-1);
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
  for(const type of ['Video (Blu)','Audio (Verde)','Effetti (Rosso)','Immagini (Giallo)','Testo (Arancione)']){
    await page.getByTitle('Aggiungi una nuova traccia audio, video, effetto o immagine').click();const modal=page.getByRole('dialog',{name:'Nuova traccia'});await modal.getByRole('button',{name:type,exact:false}).click();await modal.getByRole('button',{name:'Aggiungi Pista',exact:true}).click();
  }
  await expect.poll(async()=>(await state(page)).tracks.length).toBe(10);
  await page.getByRole('button',{name:'+ Nuova Pista',exact:true}).click();await page.getByRole('button',{name:'Annulla',exact:true}).click();
  await page.getByTitle('Aggiungi una nuova traccia audio, video, effetto o immagine').click();await page.getByLabel('Chiudi nuova traccia').click();
  await page.getByTitle(/Elimina traccia/).last().click();await expect.poll(async()=>(await state(page)).tracks.length).toBe(9);
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
  for(const fmt of ['mp4','avi','mov','mp3','wav']){await modal.getByRole('group',{name:'Tipo di esportazione'}).getByRole('button',{name:['mp3','wav'].includes(fmt)?'Audio':'Video',exact:true}).click();await modal.getByRole('button',{name:new RegExp('^\\.'+fmt,'i')}).click();await expect(modal.getByRole('button',{name:new RegExp('^\\.'+fmt,'i')})).toHaveClass(/ring-1/);}
  await expect(modal.getByRole('slider',{name:'Peso del file'})).toBeDisabled();
  await modal.getByRole('group',{name:'Tipo di esportazione'}).getByRole('button',{name:'Video',exact:true}).click();await modal.getByRole('button',{name:/^\.mp4/i}).click();for(const res of ['4K Ultra HD','1080p Full HD','720p HD'])await modal.getByRole('button',{name:new RegExp(res)}).click();await slider(page,'Peso del file',80);
  const saved=page.waitForEvent('download');await modal.getByRole('button',{name:'Salva Progetto TALEDIT (.json)',exact:true}).click();await(await saved).saveAs('/tmp/toolbar-export-project.json');expect(JSON.parse(fs.readFileSync('/tmp/toolbar-export-project.json','utf8')).clips).toHaveLength(2);
  await modal.getByRole('button',{name:/Avvia Rendering/}).click();await expect(modal.getByText('Rendering completato con successo!')).toBeVisible({timeout:30000});await modal.getByRole('button',{name:'Esegui un’altra esportazione',exact:true}).count().then(async count=>{if(count)await modal.getByRole('button',{name:'Esegui un’altra esportazione',exact:true}).click();else await modal.getByRole('button',{name:"Esegui un'altra esportazione",exact:true}).click();});
  await modal.getByRole('group',{name:'Tipo di esportazione'}).getByRole('button',{name:'Audio',exact:true}).click();await modal.getByRole('button',{name:/^\.mp3/i}).click();await modal.getByRole('button',{name:/Avvia Rendering/}).click();await expect(modal.getByText('Rendering completato con successo!')).toBeVisible({timeout:30000});const exported=page.waitForEvent('download');await modal.getByRole('button',{name:/^Scarica TALEDIT/}).click();const audio='/tmp/toolbar-ui-audio.mp3';await(await exported).saveAs(audio);const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',audio],{encoding:'utf8'}));expect(probe.streams[0].codec_name).toBe('mp3');
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

test('all application windows move by their title bar',async({page})=>{
  await project(page,[clip(red)]);
  async function move(name:string){const dialog=page.getByRole('dialog',{name,exact:true});const win=await dialog.getAttribute('data-draggable-window')!==null?dialog:dialog.locator('[data-draggable-window]').first();const header=win.locator('[data-window-handle]').first();const before=(await win.boundingBox())!,bar=(await header.boundingBox())!;await page.mouse.move(bar.x+bar.width*.3,bar.y+bar.height/2);await page.mouse.down();await page.mouse.move(bar.x+bar.width*.3-60,bar.y+bar.height/2+30,{steps:5});await page.mouse.up();await expect.poll(async()=>Math.round((await win.boundingBox())!.x-before.x)).toBe(-60);await expect.poll(async()=>Math.round((await win.boundingBox())!.y-before.y)).toBe(30);}
  for(const name of ['Effects','Transitions','Captions','Adjustment']){await page.getByRole('button',{name,exact:true}).click();await move(`Pannello ${name}`);await page.getByLabel('Chiudi pannello',{exact:true}).click();}
  await page.getByRole('button',{name:'BG Remover',exact:true}).click();await move('Pannello BG Remover');await page.getByLabel('Chiudi BG Remover').click();
  await page.getByRole('button',{name:'ChatGPT MCP',exact:true}).click();await move('Collegamento MCP');await page.getByLabel('Chiudi collegamento MCP').click();
  await page.getByRole('button',{name:'Esporta',exact:true}).click();await move('Esportazione');await page.getByLabel('Chiudi esportazione').click();
  await page.getByRole('button',{name:'Importa da YouTube',exact:true}).click();await move('Importa da YouTube');await page.getByLabel('Chiudi YouTube').click();
  await page.getByTitle('Aggiungi una nuova traccia audio, video, effetto o immagine').click();await move('Nuova traccia');await page.getByLabel('Chiudi nuova traccia').click();
  await page.getByRole('button',{name:'Marker',exact:true}).click();await page.locator('[title^="Marker 1:"]').click();await move('Dettagli marker');await page.getByLabel('Chiudi marker').click();
});
test('corrected captions become timed orange text clips, editable and saved in the project',async({page})=>{
  const drafts=[{id:'line1',text:'Frase da correggere',startTime:.4,endTime:2.4},{id:'line2',text:'Seconda frase',startTime:2.5,endTime:3.5}];
  await project(page,[clip(video,'movie',{duration:4})],drafts);expect((await state(page)).clips.filter((c:any)=>c.type==='text')).toHaveLength(0);
  await page.getByRole('button',{name:'Captions',exact:true}).click();const panel=page.getByRole('dialog',{name:'Pannello Captions'});await panel.getByLabel('Testo sottotitolo').first().fill('Frase corretta');await panel.getByRole('button',{name:'GENERATE',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='text').length).toBe(2);
  const text=(await state(page)).clips.find((c:any)=>c.type==='text');expect(text.startTime).toBe(.4);expect(text.duration).toBe(2);expect(text.text).toBe('Frase corretta');expect(text.trackId).toBe('t');await panel.getByRole('button',{name:'Chiudi pannello'}).click();
  const block=page.locator(`[data-clip-id="${text.id}"]`);await block.click();await page.getByLabel('Testo della clip').fill('Titolo modificato');await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id===text.id).text).toBe('Titolo modificato');
  const box=(await block.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id===text.id).startTime).toBe(1.4);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/taledit-text-project.tal';await(await saved).saveAs(file);await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).selectedClipId).toBe(null);expect((await state(page)).clips.find((c:any)=>c.id===text.id).text).toBe('Titolo modificato');
});
test('player always fits, rows shrink with the timeline and track handles resize real audio waves',async({page})=>{
  await project(page,[clip(video,'vsize',{duration:3}),clip(voice,'asize',{duration:3})]);await expect(page.getByLabel('Onda audio')).toBeVisible();const points=await page.getByLabel('Onda audio').locator('polygon').getAttribute('points');expect(points!.length).toBeGreaterThan(1000);
  const lane=page.locator('[data-track-id=a]'),before=(await lane.boundingBox())!.height;
  const divider=page.getByTitle("Trascina per allargare o stringere l'altezza della timeline",{exact:true});let box=(await divider.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+100,{steps:5});await page.mouse.up();await expect.poll(async()=>(await lane.boundingBox())!.height).toBeLessThan(before);
  box=(await divider.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-250,{steps:5});await page.mouse.up();
  for(const ratio of ['9:16','1:1','4:3','16:9']){await page.locator('select').filter({has:page.locator('option[value="16:9"]')}).selectOption(ratio);await expect.poll(async()=>{const area=(await page.getByTestId('player-screen').boundingBox())!,frame=(await page.getByTestId('player-frame').boundingBox())!;return frame.y>=area.y && frame.y+frame.height<=area.y+area.height+1 && frame.x>=area.x && frame.x+frame.width<=area.x+area.width+1;}).toBe(true);}
  const height=(await lane.boundingBox())!.height,handle=page.locator('[data-track-resize=a]');box=(await handle.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+55,{steps:5});await page.mouse.up();await expect.poll(async()=>(await lane.boundingBox())!.height).toBeGreaterThan(height+40);expect(Math.abs((await lane.boundingBox())!.height-(await page.locator('[data-track-header=a]').boundingBox())!.height)).toBeLessThan(1);
});
test('export categories gate images, expose common formats and Screenshot downloads the cursor frame',async({page})=>{
  await project(page,[clip(video,'snap',{duration:3})]);await page.getByRole('button',{name:'Esporta',exact:true}).click();let modal=page.getByRole('dialog',{name:'Esportazione'}),group=modal.getByRole('group',{name:'Tipo di esportazione'});await expect(group.getByRole('button',{name:'Immagine',exact:true})).toBeDisabled();
  for(const [category,formats] of [['Video',['mp4','mov','avi','mkv','webm','m4v']],['Audio',['mp3','wav','m4a','aac','flac','ogg','opus','aiff']]] as const){await group.getByRole('button',{name:category,exact:true}).click();for(const format of formats)await expect(modal.getByRole('button',{name:new RegExp('^\\.'+format+'\\b','i')})).toBeVisible();}await page.getByLabel('Chiudi esportazione').click();
  await page.request.post('/api/editor/connection',{data:{enabled:true}});await page.request.post('/api/mcp',{headers:{Accept:'application/json, text/event-stream'},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seek_time',arguments:{timeSeconds:1}}}});await expect.poll(async()=>(await state(page)).currentTime).toBe(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Screenshot',exact:true}).click();const file='/tmp/taledit-screenshot.png';await(await download).saveAs(file);const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'}));expect(info.streams[0].codec_name).toBe('png');expect(info.streams[0].width).toBe(1920);expect(info.streams).toHaveLength(1);
  await project(page,[clip(red)]);await page.getByRole('button',{name:'Esporta',exact:true}).click();modal=page.getByRole('dialog',{name:'Esportazione'});group=modal.getByRole('group',{name:'Tipo di esportazione'});await group.getByRole('button',{name:'Immagine',exact:true}).click();for(const format of ['png','jpg','webp','bmp','tiff','gif'])await expect(modal.getByRole('button',{name:new RegExp('^\\.'+format+'\\b','i')})).toBeVisible();await modal.getByRole('button',{name:/^\.png/i}).click();await modal.getByRole('button',{name:'720p HD',exact:false}).click();await modal.getByRole('button',{name:/Avvia Rendering/}).click();await expect(modal.getByText('Rendering completato con successo!')).toBeVisible();
});

test('right-click speed percentages preserve preview, linked audio, trims, cuts and saved settings',async({page})=>{
  await project(page,[clip(video,'rate-v',{duration:4,isLinked:true,linkedClipId:'rate-a'}),clip(video,'rate-a',{type:'audio',trackId:'a',duration:4,isLinked:true,linkedClipId:'rate-v'})]);
  await page.request.post('/api/editor/connection',{data:{enabled:true}});
  async function seek(time:number){await page.request.post('/api/mcp',{headers:{Accept:'application/json, text/event-stream'},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seek_time',arguments:{timeSeconds:time}}}});await expect.poll(async()=>(await state(page)).currentTime).toBe(time);}
  async function frame(){return page.getByTestId('player-canvas').evaluate((canvas:HTMLCanvasElement)=>{const small=document.createElement('canvas');small.width=80;small.height=45;const ctx=small.getContext('2d')!;ctx.drawImage(canvas,0,0,80,45);return [...ctx.getImageData(0,0,80,45).data];});}
  await seek(1.5);await expect.poll(async()=>{const f=await frame();return Math.max(...f.filter((_,i)=>i%4!==3));}).toBeGreaterThan(100);await page.waitForTimeout(200);const original=await frame();
  await page.locator('[data-clip-id=rate-v]').click({button:'right'});await page.getByRole('button',{name:/Velocità clip/}).click();const modal=page.getByRole('dialog',{name:'Velocità clip',exact:true});
  for(const [level,percentage] of [-5,-4,-3,-2,-1,0,1,2,3,4,5].map((l,i)=>[l,[25,40,50,65,80,100,125,150,200,300,400][i]])){await slider(page,'Livello velocità clip',level);await expect(modal.locator('output')).toHaveText(`${percentage}%`);}
  await slider(page,'Livello velocità clip',3);await modal.getByRole('button',{name:'Applica velocità',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='rate-v').duration).toBe(2);expect((await state(page)).clips.find((c:any)=>c.id==='rate-a').speedLevel).toBe(3);await expect.poll(async()=>(await state(page)).currentTime).toBe(.75);
  await expect.poll(async()=>{const actual=await frame();let diff=0;for(let i=0;i<actual.length;i++)diff+=Math.abs(actual[i]-original[i]);return diff/actual.length;}).toBeLessThan(3);
  await page.locator('[data-clip-id=rate-v]').click({button:'right'});await page.getByRole('button',{name:/Velocità clip/}).click();await modal.getByRole('button',{name:'Ripristina 100%',exact:true}).click();await expect(modal.locator('output')).toHaveText('100%');await modal.getByRole('button',{name:'Annulla',exact:true}).click();expect((await state(page)).clips.find((c:any)=>c.id==='rate-v').speedLevel).toBe(3);
  const visual=page.locator('[data-clip-id=rate-v]');await visual.hover();const edge=visual.getByTitle("Trascina per accorciare o allungare dall'inizio",{exact:true});const box=(await edge.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='rate-v').offset).toBe(1);expect((await state(page)).clips.find((c:any)=>c.id==='rate-a').offset).toBe(1);
  await seek(1);await visual.click();await page.getByRole('button',{name:'Cut',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.length).toBe(4);const right=(await state(page)).clips.find((c:any)=>c.type==='video' && c.id!=='rate-v');expect(right.offset).toBe(2);expect((await state(page)).clips.find((c:any)=>c.id===right.linkedClipId).offset).toBe(2);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/taledit-rate-project.tal';await(await saved).saveAs(file);await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).selectedClipId).toBe(null);expect((await state(page)).clips.every((c:any)=>c.speedLevel===3)).toBe(true);
  await project(page,[clip(video,'slow-v',{duration:4,speedLevel:-5,isLinked:true,linkedClipId:'slow-a'}),clip(video,'slow-a',{type:'audio',trackId:'a',duration:4,speedLevel:-5,isLinked:true,linkedClipId:'slow-v'})]);
  const slow=page.locator('[data-clip-id=slow-v]');await slow.hover();const slowEdge=slow.getByTitle("Trascina per accorciare o allungare dall'inizio",{exact:true}),slowBox=(await slowEdge.boundingBox())!;await page.mouse.move(slowBox.x+slowBox.width/2,slowBox.y+slowBox.height/2);await page.mouse.down();await page.mouse.move(slowBox.x+slowBox.width/2+12,slowBox.y+slowBox.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='slow-v').offset).toBe(.125);expect((await state(page)).clips.find((c:any)=>c.id==='slow-a').offset).toBe(.125);
});

test('complete track duplication and large projects scroll and zoom in both dimensions with Ctrl wheel',async({page})=>{
  const fx={id:'d-fx',name:'Zoom',type:'effect',trackId:'fx',effectType:'zoom_in',startTime:0,duration:2,offset:0,intensity:8,speed:2,fadeIn:0,fadeOut:0};
  await project(page,[clip(video,'d-v',{isLinked:true,linkedClipId:'d-a',speedLevel:3}),clip(video,'d-a',{type:'audio',trackId:'a',isLinked:true,linkedClipId:'d-v',speedLevel:3}),clip(red,'d-i'),fx]);
  for(const name of ['VIDEO','AUDIO','IMMAGINI','EFFECTS']){const previous=(await state(page)).tracks.length;await page.getByTitle(`Duplica pista "${name}"`,{exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.length).toBe(previous+(name==='VIDEO'?2:1));}
  const duplicated=(await state(page)).clips.filter((c:any)=>!['d-v','d-a','d-i','d-fx'].includes(c.id));expect(duplicated).toHaveLength(5);const copiedVideo=duplicated.find((c:any)=>c.type==='video');expect(duplicated.find((c:any)=>c.id===copiedVideo.linkedClipId).linkedClipId).toBe(copiedVideo.id);
  const many=Array.from({length:160},(_,i)=>({...tracks[[1,2,3,4][i%4]],id:`many-${i}`,name:`PISTA ${i}`}));const data={appName:'TALEDIT',captionWorkflow:'timeline',tracks:many,clips:[clip(red,'many-image',{trackId:'many-2'})],mediaAssets:[red],subtitles:[],markers:[],currentTime:0,aspectRatio:'16:9'};
  await page.locator('input[type=file]').first().setInputFiles({name:'many.tal',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect.poll(async()=>(await state(page)).tracks.length).toBe(161);
  const lanes=page.getByTestId('timeline-lanes'),headers=page.getByTestId('timeline-headers');await expect.poll(async()=>lanes.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  const bounds=(await lanes.boundingBox())!;await page.mouse.move(bounds.x+300,bounds.y+80);await page.mouse.wheel(0,3000);await expect.poll(async()=>lanes.evaluate(e=>e.scrollTop)).toBeGreaterThan(1000);await expect.poll(async()=>Math.abs(await lanes.evaluate(e=>e.scrollTop)-await headers.evaluate(e=>e.scrollTop))).toBeLessThan(2);
  await page.mouse.wheel(0,-10000);await expect.poll(async()=>lanes.evaluate(e=>e.scrollTop)).toBe(0);
  const block=page.locator('[data-clip-id=many-image]'),before=(await block.boundingBox())!,ratio=await page.evaluate(()=>devicePixelRatio);await page.keyboard.down('Control');await page.mouse.wheel(0,-240);await page.keyboard.up('Control');await expect.poll(async()=>(await block.boundingBox())!.width).toBeGreaterThan(before.width);await expect.poll(async()=>(await block.boundingBox())!.height).toBeGreaterThan(before.height);expect(await page.evaluate(()=>devicePixelRatio)).toBe(ratio);
  await expect.poll(async()=>Math.abs(await lanes.evaluate(e=>e.scrollTop)-await headers.evaluate(e=>e.scrollTop))).toBeLessThan(2);expect(await lanes.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
});

test('local-save Screenshot response confirms Downloads without a second browser download',async({page})=>{
  await project(page,[clip(video,'native-snapshot')]);let downloads=0;page.on('download',()=>downloads++);
  // Real rendering is exercised; the local-save response flag is controlled here.
  // Actual filesystem writing is separately verified by the API integration test.
  await page.route('**/api/screenshot',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.fulfill({response,json:{...(await response.json()),savedToDownloads:true}});});
  await page.getByRole('button',{name:'Screenshot',exact:true}).click();await expect(page.getByText(/^Screenshot salvato in Download:/)).toBeVisible();expect(downloads).toBe(0);
});

test('audio workspace has only audio lanes, working knobs, track controls and saved master',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await project(page,[clip(video,'picture'),clip(voice,'speech',{duration:voice.durationSec})]);
  await page.getByRole('tab',{name:'AUDIO',exact:true}).click();const mixer=page.getByRole('region',{name:'Mixer audio'});
  await expect(mixer).toBeVisible();await expect(page.locator('[data-track-id=v]')).toHaveCount(0);await expect(page.locator('[data-track-id=i]')).toHaveCount(0);await expect(page.locator('[data-track-id=a]')).toBeVisible();
  const values:any={Volume:-6,Panorama:20,'Ampiezza stereo':125,Compressione:65,'Soglia compressore':-20,'Rapporto compressore':3,Attacco:5,Rilascio:100,Ritardo:50,Eco:20,Riverbero:15,'Riduzione rumore':25,'Filtro passa alto':80,'Filtro passa basso':16000,Bassi:2,Medi:-2,Alti:3};
  const keys=['volume','pan','width','compression','threshold','ratio','attack','release','delay','echo','reverb','noise','highpass','lowpass','bass','mid','treble'];let i=0;
  for(const [label,value] of Object.entries(values)){await mixer.getByRole('spinbutton',{name:`AUDIO ${label} valore`,exact:true}).fill(String(value));const key=keys[i++];await expect.poll(async()=>(await state(page)).tracks.find((t:any)=>t.id==='a').audio?.[key]).toBe(value);}
  const knob=mixer.getByRole('slider',{name:'AUDIO Volume',exact:true});await knob.focus();await page.keyboard.press('ArrowDown');await expect(knob).toHaveAttribute('aria-valuenow','-7');
  await knob.dblclick();await expect(knob).toHaveAttribute('aria-valuenow','0');
  const box=(await knob.boundingBox())!;await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+22,box.y+37);await page.mouse.up();await expect.poll(async()=>Number(await knob.getAttribute('aria-valuenow'))).toBeLessThan(0);
  await mixer.getByRole('button',{name:'Bypass AUDIO',exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.find((t:any)=>t.id==='a').audio.bypass).toBe(true);
  await mixer.getByRole('button',{name:'Solo AUDIO',exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.find((t:any)=>t.id==='a').isSolo).toBe(true);await mixer.getByRole('button',{name:'Solo AUDIO',exact:true}).click();
  await mixer.getByRole('button',{name:'Mute AUDIO',exact:true}).click();await expect.poll(async()=>(await state(page)).tracks.find((t:any)=>t.id==='a').isMuted).toBe(true);await mixer.getByRole('button',{name:'Mute AUDIO',exact:true}).click();
  await mixer.getByRole('spinbutton',{name:'MASTER Volume valore',exact:true}).fill('-9');await expect.poll(async()=>(await state(page)).audioMaster?.volume).toBe(-9);
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).audioMaster?.volume).toBeUndefined();await page.getByRole('button',{name:'Avanti',exact:true}).click();await expect.poll(async()=>(await state(page)).audioMaster?.volume).toBe(-9);
  await mixer.getByRole('button',{name:'Mute MASTER',exact:true}).click();await expect.poll(async()=>(await state(page)).audioMaster.mute).toBe(true);await mixer.getByRole('button',{name:'Mute MASTER',exact:true}).click();
  await mixer.getByRole('button',{name:'Pista audio',exact:true}).click();await expect(mixer.getByRole('article')).toHaveCount(3);
  await page.getByRole('button',{name:'Duplica pista "AUDIO"',exact:true}).click();await expect(mixer.getByRole('article')).toHaveCount(4);await expect.poll(async()=>(await state(page)).tracks.find((t:any)=>t.name==='AUDIO (Copia)')?.audio?.volume).toBeLessThan(0);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/audio-mixer-saved.tal';await(await saved).saveAs(file);const data=JSON.parse(fs.readFileSync(file,'utf8'));expect(data.audioMaster.volume).toBe(-9);expect(data.tracks.find((t:any)=>t.id==='a').audio.highpass).toBe(80);
  await mixer.getByRole('button',{name:'Ripristina MASTER',exact:true}).click();await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).audioMaster?.volume).toBe(-9);
  await page.screenshot({path:'/tmp/taledit-audio-mixer.png'});await page.getByRole('tab',{name:'VIDEO',exact:true}).click();await expect(page.getByTestId('player-canvas')).toBeVisible();await expect(page.locator('[data-track-id=v]')).toBeVisible();await expect.poll(async()=>(await state(page)).clips.some((c:any)=>c.id==='picture')).toBe(true);expect(errors).toEqual([]);
});

test('live audio buses show actual signal, volume changes, bypass and master mute',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await project(page,[clip(video,'tone',{type:'audio',trackId:'a',duration:4})]);await page.getByRole('tab',{name:'AUDIO',exact:true}).click();const mixer=page.getByRole('region',{name:'Mixer audio'});
  const meter=mixer.getByRole('meter',{name:'Livello master',exact:true});
  await mixer.getByRole('button',{name:'Riproduci audio'}).click();await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(-30);
  await mixer.getByRole('button',{name:'Pausa audio'}).click();await mixer.getByRole('slider',{name:'Posizione audio'}).fill('0');
  await mixer.getByRole('spinbutton',{name:'MASTER Volume valore',exact:true}).fill('-30');await mixer.getByRole('button',{name:'Riproduci audio'}).click();await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBeLessThan(-40);
  await mixer.getByRole('button',{name:'Bypass MASTER'}).click();await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(-30);
  await mixer.getByRole('button',{name:'Mute MASTER'}).click();await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBe(-60);
  await mixer.getByRole('button',{name:'Pausa audio'}).click();await mixer.getByRole('button',{name:'Ripristina MASTER'}).click();
  // Exercise every live DSP node, including the real AudioWorklet noise processor.
  for(const [label,value] of [['Compressione',70],['Ritardo',20],['Eco',30],['Riverbero',25],['Riduzione rumore',40],['Filtro passa alto',80],['Filtro passa basso',16000],['Bassi',3],['Medi',-2],['Alti',2],['Ampiezza stereo',130],['Panorama',10]] as const)await mixer.getByRole('spinbutton',{name:`AUDIO ${label} valore`,exact:true}).fill(String(value));
  await mixer.getByRole('slider',{name:'Posizione audio'}).fill('0');await mixer.getByRole('button',{name:'Riproduci audio'}).click();await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(-45);await page.waitForTimeout(400);expect(errors).toEqual([]);
});

test('COLOR dual monitors, every primary and wheel, curves, scopes and saved corrections work',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await project(page,[clip(pattern)]);await page.getByRole('tab',{name:'COLOR',exact:true}).click();const panel=page.getByRole('region',{name:'Color grading'});await expect(panel).toBeVisible();
  await expect(panel.getByRole('button',{name:'Ripristina COLOR'})).toBeDisabled();await panel.getByLabel('Clip da correggere').selectOption('c');
  const sample=async(id:string)=>page.getByTestId(id).evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3));
  await expect.poll(async()=>(await sample('color-original'))[0]).toBeGreaterThan(240);const original=await sample('color-original');
  await panel.getByRole('tab',{name:'Primarie',exact:true}).click();await panel.getByRole('spinbutton',{name:'Esposizione valore',exact:true}).fill('-.75');
  await expect.poll(async()=>(await sample('color-corrected'))[0]).toBeLessThan(170);expect(await sample('color-original')).toEqual(original);await expect(panel.getByTestId('scope-stats')).toContainText('13 IRE');await panel.getByLabel('Sorgente scopes').selectOption('before');await expect(panel.getByTestId('scope-stats')).toContainText('21 IRE');await panel.getByLabel('Sorgente scopes').selectOption('after');
  await panel.getByRole('button',{name:'Bypass COLOR',exact:true}).click();await expect.poll(async()=>(await sample('color-corrected'))[0]).toBeGreaterThan(240);await panel.getByRole('button',{name:'Bypass COLOR',exact:true}).click();
  for(const [label,key,value] of [['Esposizione','exposure',.2],['Contrasto','contrast',1.2],['Pivot','pivot',.4],['Temperatura','temperature',10],['Tinta','tint',5],['Saturazione','saturation',110],['Vibrance','vibrance',20],['Tonalità','hue',10],['Ombre','shadows',8],['Alte luci','highlights',-10],['Neri','blacks',5],['Bianchi','whites',-5],['Nitidezza','sharpness',20]] as const){await panel.getByRole('spinbutton',{name:`${label} valore`,exact:true}).fill(String(value));await expect.poll(async()=>(await state(page)).clips[0].colorGrade?.[key]).toBe(value);}
  await panel.getByRole('tab',{name:'Ruote',exact:true}).click();
  for(const wheel of ['Lift','Gamma','Gain','Offset'])for(const channel of ['Y','R','G','B']){await panel.getByRole('spinbutton',{name:`${wheel} ${channel} valore`,exact:true}).fill('5');await expect.poll(async()=>(await state(page)).clips[0].colorGrade?.[wheel.toLowerCase()+channel]).toBe(5);}
  const wheel=panel.getByRole('slider',{name:'Ruota Lift',exact:true});await wheel.scrollIntoViewIfNeeded();const bounds=(await wheel.boundingBox())!;await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height*.3);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.75,bounds.y+bounds.height*.5);await page.mouse.up();await expect.poll(async()=>(await state(page)).clips[0].colorGrade?.liftR).not.toBe(5);
  await panel.getByRole('slider',{name:'Gamma Y',exact:true}).focus();await page.keyboard.press('ArrowUp');await expect.poll(async()=>(await state(page)).clips[0].colorGrade.gammaY).toBe(6);
  await panel.getByRole('slider',{name:'Gamma Y',exact:true}).dblclick();await expect.poll(async()=>(await state(page)).clips[0].colorGrade.gammaY).toBe(0);
  await panel.getByRole('tab',{name:'Curve',exact:true}).click();for(const channel of ['master','red','green','blue']){await panel.getByLabel('Canale curva').selectOption(channel);await panel.getByRole('spinbutton',{name:`Curva ${channel} punto 4`,exact:true}).fill('70');await expect.poll(async()=>(await state(page)).clips[0].colorGrade.curves?.[channel]?.[3]).toBe(.7);}
  const node=panel.getByRole('img',{name:'Curva personalizzata'}).locator('circle').nth(3);await node.scrollIntoViewIfNeeded();const cb=(await node.boundingBox())!;await page.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await page.mouse.down();await page.mouse.move(cb.x+cb.width/2,cb.y-12);await page.mouse.up();await expect.poll(async()=>(await state(page)).clips[0].colorGrade?.curves?.blue?.[3]).toBeGreaterThan(.7);await panel.getByRole('spinbutton',{name:'Curva blue punto 4',exact:true}).fill('70');
  for(let i=0;i<4;i++)await expect.poll(async()=>page.getByTestId(`scope-${i}`).evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let p=0;p<d.length;p+=4)if(d[p]>100||d[p+1]>100||d[p+2]>100)n++;return n;})).toBeGreaterThan(20);
  await panel.getByLabel('Sorgente scopes').selectOption('before');await expect(panel.getByTestId('scope-stats')).toContainText('IRE');await panel.getByLabel('Sorgente scopes').selectOption('after');
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/color-saved.tal';await(await saved).saveAs(file);const data=JSON.parse(fs.readFileSync(file,'utf8'));expect(data.clips[0].colorGrade.curves.blue[3]).toBe(.7);
  await panel.getByRole('button',{name:'Ripristina COLOR'}).click();await expect.poll(async()=>Object.keys((await state(page)).clips[0].colorGrade).length).toBe(0);await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).clips[0].colorGrade?.curves?.blue?.[3]).toBe(.7);
  await panel.getByLabel('Clip da correggere').selectOption('c');await page.screenshot({path:'/tmp/taledit-color.png'});await page.getByRole('tab',{name:'VIDEO',exact:true}).click();await expect(page.getByTestId('player-canvas')).toBeVisible();expect(errors).toEqual([]);
});
test('COLOR monitors follow the same video time, timeline selection and undo',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await project(page,[clip(video,'vid',{duration:3,offset:.5,speedLevel:2,colorGrade:{saturation:0}})]);
  await page.getByRole('tab',{name:'COLOR',exact:true}).click();const panel=page.getByRole('region',{name:'Color grading'});await page.locator('[data-clip-id=vid]').click();await expect(panel.getByLabel('Clip da correggere')).toHaveValue('vid');
  const image=async(id:string)=>page.getByTestId(id).evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let diff=0,sum=0;for(let i=0;i<d.length;i+=64){diff+=Math.abs(d[i]-d[i+1])+Math.abs(d[i+1]-d[i+2]);sum+=d[i]+d[i+1]+d[i+2];}return {diff,sum};});
  await expect.poll(async()=>(await image('color-original')).diff).toBeGreaterThan(10000);await expect.poll(async()=>(await image('color-corrected')).diff).toBeLessThan(1000);
  await slider(page,'Posizione COLOR',1);await expect.poll(async()=>(await state(page)).currentTime).toBe(1);await panel.getByRole('button',{name:'Bypass COLOR'}).click();await expect.poll(async()=>JSON.stringify(await image('color-corrected'))).toBe(JSON.stringify(await image('color-original')));
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>(await state(page)).clips[0].colorGrade.bypass).toBeUndefined();await expect.poll(async()=>(await image('color-corrected')).diff).toBeLessThan(1000);
  await panel.getByRole('button',{name:'Riproduci COLOR'}).click();await expect.poll(async()=>(await state(page)).currentTime).toBeGreaterThan(1.3);await panel.getByRole('button',{name:'Pausa COLOR'}).click();expect(errors).toEqual([]);
});

test('pen mask draws Bezier matte, remains editable in fullscreen, and saves the actual path',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await project(page,[clip(blue,'bg'),clip(red,'fg')]);await page.locator('[data-clip-id=fg]').click();await page.getByRole('button',{name:'Pen Mask',exact:true}).click();const overlay=page.getByTestId('pen-overlay');await expect(overlay).toBeVisible();
  const b=(await overlay.boundingBox())!;for(const [x,y] of [[.25,.25],[.75,.25],[.75,.75],[.25,.75]])await page.mouse.click(b.x+b.width*x,b.y+b.height*y);
  await page.getByRole('button',{name:'Chiudi tracciato',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='fg').mask?.closed).toBe(true);await expect.poll(async()=>(await rgb(page,.05,.05))[2]).toBeGreaterThan(240);await expect.poll(async()=>(await rgb(page))[0]).toBeGreaterThan(240);
  await page.getByRole('button',{name:'Full',exact:true}).click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);await expect(overlay).toBeVisible();await expect(page.getByRole('toolbar',{name:'Controlli maschera'})).toBeVisible();
  const node=overlay.getByLabel('Nodo 1'),nb=(await node.boundingBox())!,full=(await overlay.boundingBox())!;await page.mouse.move(nb.x+nb.width/2,nb.y+nb.height/2);await page.mouse.down();await page.mouse.move(nb.x+nb.width/2+full.width*.05,nb.y+nb.height/2);await page.mouse.up();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='fg').mask.points[0].x).toBeCloseTo(.3,1);
  await page.getByRole('spinbutton',{name:'Sfumatura maschera'}).fill('15');await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='fg').mask.feather).toBe(15);await page.getByRole('button',{name:'Full',exact:true}).click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
  await page.getByLabel('Inverti',{exact:true}).check();await expect.poll(async()=>(await rgb(page,.05,.05))[0]).toBeGreaterThan(240);await page.getByLabel('Inverti',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Nuova maschera',exact:true}).click();const box=(await overlay.boundingBox())!;await page.mouse.click(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.move(box.x+box.width*.8,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.83,box.y+box.height*.3);await page.mouse.up();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.8);await page.getByRole('button',{name:'Chiudi tracciato'}).click();await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='fg').mask?.points[1]?.out?.y).toBeCloseTo(.3,1);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salva',exact:true}).click();const file='/tmp/pen-saved.tal';await(await saved).saveAs(file);expect(JSON.parse(fs.readFileSync(file,'utf8')).clips.find((c:any)=>c.id==='fg').mask?.closed).toBe(true);await page.getByRole('button',{name:'Rimuovi maschera'}).click();await page.locator('input[type=file]').first().setInputFiles(file);await expect.poll(async()=>(await state(page)).clips.find((c:any)=>c.id==='fg').mask?.points.length).toBe(3);expect(errors).toEqual([]);
});
test('animated captions generate short phrases and actual teal highlight follows word timing',async({page})=>{
  const words=['ciao','mondo','questa','è','una','prova'].map((text,i)=>({text,startTime:i*.3,endTime:i*.3+.25}));await project(page,[clip(pattern)], [{id:'phrase',text:'ciao mondo questa è una prova',startTime:0,endTime:2,words}]);await page.getByRole('button',{name:'Captions',exact:true}).click();const captions=page.getByRole('dialog',{name:'Pannello Captions'});await expect(captions.getByRole('checkbox',{name:'Parola evidenziata ottanio'})).toBeChecked();await captions.getByRole('button',{name:'GENERATE',exact:true}).click();await expect.poll(async()=>(await state(page)).clips.filter((c:any)=>c.type==='text').length).toBe(2);await captions.getByRole('button',{name:'Chiudi pannello'}).click();
  const teal=()=>page.getByTestId('player-canvas').evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let count=0,sum=0;for(let i=0;i<d.length;i+=4)if(d[i]<40&&d[i+1]>90&&d[i+1]<175&&d[i+2]>95&&d[i+2]<185){count++;sum+=(i/4)%c.width;}return {count,x:sum/Math.max(1,count)};});
  await expect.poll(async()=>(await teal()).count).toBeGreaterThan(30);const first=await teal();await page.request.post('/api/editor/connection',{data:{enabled:true}});await page.request.post('/api/mcp',{headers:{Accept:'application/json, text/event-stream'},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'seek_time',arguments:{timeSeconds:.65}}}});await expect.poll(async()=>(await teal()).x).toBeGreaterThan(first.x+40);
  const c=(await state(page)).clips.find((c:any)=>c.type==='text');expect(c.captionWords[0].startTime).toBe(0);expect(c.captionStyle).toBe('karaoke');
});
test('smart-cut automatically scans all audio and applies cuts with one click, with undo',async({page})=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const originals=[clip(video,'v',{startTime:1,duration:4,isLinked:true,linkedClipId:'a'}),clip(voice,'a',{startTime:1,duration:4,isLinked:true,linkedClipId:'v'}),clip(pattern,'image',{duration:7})];await project(page,originals);await page.getByRole('button',{name:'AI Cut',exact:true}).click();const panel=page.getByRole('dialog',{name:'Montaggio intelligente'});await expect(panel).toBeVisible();await expect(panel.getByRole('slider',{name:'Margine pause'})).toHaveValue('0.3');await expect(panel.getByRole('slider',{name:'Margine pause'})).toHaveAttribute('min','0.2');await expect(panel.getByRole('slider',{name:'Margine pause'})).toHaveAttribute('max','1');await panel.getByRole('slider',{name:'Margine pause'}).fill('0.2');await expect(panel.getByRole('button',{name:'Applica tagli selezionati'})).toHaveCount(0);await panel.getByRole('button',{name:'Scansiona e taglia automaticamente',exact:true}).click();await expect(panel).toHaveCount(0,{timeout:60000});await expect.poll(async()=>Math.max(...(await state(page)).clips.map((c:any)=>c.startTime+c.duration))).toBeLessThan(7);
  const next=(await state(page)).clips;for(const c of next.filter((c:any)=>c.type==='video')){const a=next.find((x:any)=>x.id===c.linkedClipId);expect(a.linkedClipId).toBe(c.id);expect(a.startTime).toBeCloseTo(c.startTime,6);expect(a.offset).toBeCloseTo(c.offset,6);}
  await page.getByRole('button',{name:'Indietro',exact:true}).click();await expect.poll(async()=>JSON.stringify((await state(page)).clips)).toBe(JSON.stringify(originals));expect(errors).toEqual([]);
});

test('fullscreen keeps the previously open Adjustment tool mounted and usable',async({page})=>{await project(page,[clip(pattern)]);await page.locator('[data-clip-id=c]').click();await page.getByRole('button',{name:'Adjustment',exact:true}).click();const panel=page.getByRole('dialog',{name:'Pannello Adjustment'});await slider(page,'Luminosità',10);await page.getByRole('button',{name:'Full',exact:true}).click();await expect.poll(async()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);await expect(panel).toBeVisible();await slider(page,'Luminosità',35);await expect.poll(async()=>(await state(page)).clips[0].adjustments?.brightness).toBe(35);await page.evaluate(()=>document.exitFullscreen());await expect(panel).toBeVisible();await expect(panel.getByRole('slider',{name:'Luminosità',exact:true})).toHaveValue('35');});

test('every toolbar editing command has a distinct graphic button',async({page})=>{await project(page);for(const name of ['Apri','Salva','Esporta','Screenshot','Effects','Transitions','Captions','Adjustment','BG Remover','AI Cut','Pen Mask']){const button=page.getByRole('button',{name,exact:true});await expect(button).toHaveCount(1);await expect(button.locator('svg')).toHaveCount(1);}const icons=await Promise.all(['Effects','Transitions','Captions','Adjustment','BG Remover','AI Cut','Pen Mask'].map(name=>page.getByRole('button',{name,exact:true}).locator('svg').getAttribute('class')));expect(new Set(icons).size).toBe(7);await page.screenshot({path:'/tmp/taledit-toolbar-auto.png'});});
