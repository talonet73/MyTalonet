import fs from 'node:fs/promises';
import path from 'node:path';
import {downloadsDir} from './media';

export async function saveScreenshotToDownloads(result:{fileName:string}){
  if(!process.env.SCREENSHOT_DIR)return false;
  try{
    await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
    await fs.copyFile(path.join(downloadsDir,result.fileName),path.join(process.env.SCREENSHOT_DIR,path.basename(result.fileName)));
    return true;
  }catch(error){console.error('[TALEDIT] Screenshot: cartella Download non scrivibile, uso il download del browser.');return false;}
}
