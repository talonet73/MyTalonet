// Windows launcher. Package installation keeps normal TLS/signature verification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Operazione interrotta (${command}, codice ${code}).`)));
  });
}
function npmCommand(action) {
  // Fixed command strings only: no paths or user input interpolated into a shell.
  const commands = { install: 'npm.cmd ci --no-audit --no-fund', start: 'npm.cmd run dev' };
  return ['cmd.exe', ['/d', '/s', '/c', commands[action]]];
}
async function main() {
  if (process.platform !== 'win32') throw new Error('Questo avvio guidato e destinato a Windows.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Aggiorna Node.js alla versione LTS dal sito nodejs.org, poi riapri TALEDIT.');
  for (const command of ['ffmpeg', 'ffprobe']) {
    if (spawnSync(command, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('Manca uno strumento video. Esegui 1-PREPARA-TALEDIT.cmd.');
  }
  const python = [['py.exe', ['-3.12']], ['python.exe', []]].find(([command, args]) => spawnSync(command, [...args, '-c', 'import sys; assert sys.version_info[:2] == (3,12)'], { stdio:'ignore' }).status === 0);
  if (!python) throw new Error('Manca Python 3.12. Esegui 1-PREPARA-TALEDIT.cmd.');
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error('Non trovo la cartella personale di Windows.');
  const cache = path.join(local, 'TALEDIT');
  const env = { ...process.env, WHISPER_PYTHON: path.join(cache, 'whisper-env', 'Scripts', 'python.exe'), WHISPER_MODEL_DIR: path.join(cache, 'whisper-small'), HF_HOME: path.join(cache, 'huggingface'), HF_XET_CACHE: path.join(cache, 'huggingface', 'xet'), BG_PYTHON:path.join(cache,'bg-env','Scripts','python.exe'),BG_MODEL_DIR:path.join(cache,'bg-models'),npm_config_cache: path.join(cache, 'npm') };
  fs.mkdirSync(cache, {recursive:true});
  const lockHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
  const marker = path.join(root, 'node_modules', '.taledit-lock');
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== lockHash) {
    console.log('Preparo TALEDIT. Al primo avvio possono servire alcuni minuti...');
    const [command, args] = npmCommand('install'); await run(command, args, env);
    fs.writeFileSync(marker, lockHash);
  }
  if (!fs.existsSync(env.WHISPER_PYTHON)) await run(python[0], [...python[1], '-m', 'venv', path.join(cache,'whisper-env')], env);
  const requirements = path.join(root, 'scripts', 'requirements-whisper.lock');
  const pythonHash = crypto.createHash('sha256').update(fs.readFileSync(requirements)).digest('hex');
  const pythonMarker = path.join(cache, 'whisper-packages');
  if (!fs.existsSync(pythonMarker) || fs.readFileSync(pythonMarker, 'utf8') !== pythonHash) {
    console.log('Preparo il riconoscimento vocale gratuito...');
    await run(env.WHISPER_PYTHON, ['-m','pip','install','--cache-dir',path.join(cache,'pip'),'-r',requirements], env);
    fs.writeFileSync(pythonMarker, pythonHash);
  }
  if (!fs.existsSync(path.join(env.WHISPER_MODEL_DIR,'model.bin'))) {
    console.log('Scarico il modello vocale gratuito. Questa operazione richiede Internet solo al primo avvio...');
    await run(env.WHISPER_PYTHON, [path.join(root,'scripts','download-whisper.py')], env);
  }
  try {
    if(!fs.existsSync(env.BG_PYTHON))await run(python[0],[...python[1],'-m','venv',path.join(cache,'bg-env')],env);
    const bgRequirements=path.join(root,'scripts','requirements-bg.lock');
    const bgHash=crypto.createHash('sha256').update(fs.readFileSync(bgRequirements)).digest('hex'),bgMarker=path.join(cache,'bg-packages');
    if(!fs.existsSync(bgMarker)||fs.readFileSync(bgMarker,'utf8')!==bgHash){
      console.log('Preparo BG Remover gratuito...');
      await run(env.BG_PYTHON,['-m','pip','install','--cache-dir',path.join(cache,'pip'),'-r',bgRequirements],env);
      fs.writeFileSync(bgMarker,bgHash);
    }
    if(!fs.existsSync(path.join(env.BG_MODEL_DIR,'models','u2netp','u2netp.onnx')))await run(env.BG_PYTHON,[path.join(root,'scripts','download-bg-model.py')],env);
  }catch(error){console.error('BG Remover non pronto:',error.message);console.error('TALEDIT si avvia comunque. Riapri l’app per riprovare la preparazione.');}
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Impostazione di avvio non valida.');
  const origin = `http://127.0.0.1:${port}`;
  async function healthy() {
    try { const response = await fetch(origin+'/api/health', {signal:AbortSignal.timeout(2000)}); const data=await response.json(); return response.ok && data.ffmpeg === true && data.ffprobe === true; } catch {return false;}
  }
  function openBrowser() { const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',origin],{detached:true,stdio:'ignore'});child.on('error',()=>console.error('Apri il browser e digita:',origin));child.unref(); }
  if (await healthy()) { console.log('TALEDIT e gia avviato. Apro il browser.');openBrowser();return; }
  const [command,args] = npmCommand('start');
  const child = spawn(command,args,{cwd:root,env,stdio:'inherit'});
  let startupError;
  child.on('error',error=>{startupError=error;});
  const deadline=Date.now()+60000;
  while(Date.now()<deadline) {
    if(startupError)throw startupError;
    if(child.exitCode !== null)throw new Error('TALEDIT si e fermato durante l’avvio. Controlla il messaggio sopra.');
    if(await healthy()) {
      console.log('TALEDIT e pronto. Apro il browser. Lascia aperta questa finestra mentre lavori.');
      openBrowser();
      await new Promise(resolve=>child.once('exit',resolve));return;
    }
    await wait(500);
  }
  child.kill();throw new Error('TALEDIT non ha risposto entro un minuto. Controlla il messaggio sopra.');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
