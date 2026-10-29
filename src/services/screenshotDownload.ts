/** Browser fallback for online/manual startup; the Windows launcher saves locally. */
export async function downloadScreenshot(result:{fileName:string;downloadUrl:string;savedToDownloads?:boolean}){
  if(result.savedToDownloads)return;
  const response=await fetch(result.downloadUrl);
  if(!response.ok)throw new Error('Download dello Screenshot non riuscito.');
  const blob=await response.blob();
  if(blob.type!=='image/png' || !blob.size)throw new Error('Lo Screenshot ricevuto non è un PNG valido.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=result.fileName.replace(/\.[^.]+$/,'')+'.png';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
