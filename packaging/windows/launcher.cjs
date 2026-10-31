// Bundled launcher: no npm, Python setup, global PATH edits or runtime downloads.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
function runtime(root = __dirname, cache = path.join(process.env.LOCALAPPDATA || os.homedir(), 'TALEDIT', 'data')) {
  const python = path.join(root, 'runtime', 'python', 'python.exe');
  const downloads = process.platform === 'win32' ? spawnSync('powershell.exe', ['-NoProfile', '-Command', "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $d=(Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'; if($d){[Environment]::ExpandEnvironmentVariables($d)}"], {encoding:'utf8', windowsHide:true}) : null;
  return {root, cache, origin:'http://127.0.0.1:3000', pipe:process.platform==='win32' ? `\\\\.\\pipe\\taledit-${crypto.createHash('sha256').update(cache.toLowerCase()).digest('hex').slice(0,20)}` : path.join(cache, 'control.sock'), env:{...process.env, NODE_ENV:'production', HOST:'127.0.0.1', PORT:'3000', PATH:[path.join(root,'tools'),path.join(root,'runtime'),process.env.PATH].join(path.delimiter), MEDIA_DIR:path.join(cache,'media_downloads'), WHISPER_PYTHON:python, BG_PYTHON:python, WHISPER_MODEL_DIR:path.join(root,'models','whisper-small'), BG_MODEL_DIR:path.join(root,'models','bg'), HF_HOME:path.join(cache,'huggingface'), NUMBA_CACHE_DIR:path.join(cache,'numba'), YT_DLP_PATH:path.join(root,'tools','yt-dlp.exe'), SCREENSHOT_DIR:downloads?.status===0 && downloads.stdout.trim() ? downloads.stdout.trim() : path.join(os.homedir(),'Downloads'), PYTHONNOUSERSITE:'1', PYTHONHOME:path.dirname(python), PYTHONUTF8:'1', PYTHONIOENCODING:'utf-8', PYTHONPATH:'', OMP_NUM_THREADS:'2'}};
}
function control(pipe, command) {
  return new Promise(resolve => {
    const socket=net.createConnection(pipe);let reply='';
    socket.setTimeout(5000,()=>socket.destroy());
    socket.on('connect',()=>socket.end(command+'\n'));
    socket.on('data',chunk=>reply+=chunk);
    socket.on('error',()=>resolve(false));socket.on('close',()=>resolve(reply.trim()==='ok'));
  });
}
function openBrowser(origin) {
  if(process.env.TALEDIT_NO_BROWSER==='1')return;
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',origin],{detached:true,stdio:'ignore',windowsHide:true});
  child.on('error',()=>{});child.unref();
}
async function main() {
  const config=runtime();
  fs.mkdirSync(config.cache,{recursive:true});
  if(process.argv.includes('--stop')) {await control(config.pipe,'stop');return;}
  if(await control(config.pipe,'open'))return;
  // Refuse to silently reuse the old ZIP server, or an unrelated service.
  await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(new Error('La porta di TALEDIT è già occupata. Chiudi la vecchia finestra di avvio e riprova.')));probe.listen(3000,'127.0.0.1',()=>probe.close(resolve));});
  if(process.platform!=='win32')try{fs.unlinkSync(config.pipe);}catch{}
  const log=fs.openSync(path.join(config.cache,'avvio.log'),'w');
  const child=spawn(path.join(config.root,'runtime','node.exe'),[path.join(config.root,'app','server.mjs')],{cwd:path.join(config.root,'app'),env:config.env,stdio:['ignore',log,log],windowsHide:true});
  fs.closeSync(log);
  const exited=new Promise(resolve=>child.once('close',resolve));
  let failure;child.once('error',error=>failure=error);
  const stop=()=>{if(child.exitCode===null)child.kill();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    const deadline=Date.now()+60000;let ready=false;
    while(Date.now()<deadline){
      if(failure)throw failure;
      if(child.exitCode!==null)throw new Error('TALEDIT si è fermato durante l’avvio.');
      try {const r=await fetch(config.origin+'/api/health',{signal:AbortSignal.timeout(1500)});const data=await r.json();if(r.ok && data.ffmpeg && data.ffprobe){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready)throw new Error('TALEDIT non ha risposto entro un minuto.');
    const controller=net.createServer({allowHalfOpen:true},socket=>{
      let command='';socket.setEncoding('utf8');socket.setTimeout(3000,()=>socket.destroy());
      socket.on('data',chunk=>{command+=chunk;if(command.length>64)socket.destroy();});
      socket.on('end',()=>{if(command.trim()==='stop'){stop();exited.then(()=>socket.end('ok'));}else if(command.trim()==='open'){openBrowser(config.origin);socket.end('ok');}else socket.end('error');});
    });
    await new Promise((resolve,reject)=>{controller.once('error',reject);controller.listen(config.pipe,resolve);});
    openBrowser(config.origin);
    await exited;
    await new Promise(resolve=>controller.close(resolve));
    if(child.exitCode && child.exitCode!==0)throw new Error('TALEDIT si è chiuso con un errore.');
  } finally {stop();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(error=>{
  const config=runtime();fs.mkdirSync(config.cache,{recursive:true});fs.appendFileSync(path.join(config.cache,'avvio.log'),'\n'+error.stack+'\n');
  console.error(error.message);process.exitCode=1;
});
module.exports={runtime,control};
