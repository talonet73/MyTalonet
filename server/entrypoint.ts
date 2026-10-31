import {realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Windows TEMP may use an 8.3 alias; Node resolves import.meta.url to the long path.
export function isServerEntry(moduleUrl:string, scriptFile=process.argv[1]) {
  if(!scriptFile)return false;
  try{return realpathSync(path.resolve(scriptFile))===realpathSync(fileURLToPath(moduleUrl));}
  catch{return false;}
}
