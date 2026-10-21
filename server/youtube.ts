import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { downloadsDir, describeMedia, InputError } from './media';
export function youtubeUrl(value: unknown) {
  if (typeof value !== 'string') throw new InputError('Incolla un link YouTube valido.');
  let u: URL;
  try { u = new URL(value); } catch { throw new InputError('Link YouTube non valido.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) throw new InputError('Link YouTube non valido.');
  let id: string | undefined | null;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(u.hostname)) id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1];
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new InputError('Usa il link di un singolo video YouTube.');
  return `https://www.youtube.com/watch?v=${id}`;
}
export interface DownloadJob { id: string; status: 'downloading' | 'complete' | 'error'; progress: number; asset?: Awaited<ReturnType<typeof describeMedia>>; error?: string; errorCode?: 'PROXY_FORBIDDEN' | 'REMOTE_FORBIDDEN' | 'AUTH_REQUIRED' | 'DOWNLOAD_FAILED'; created: number }
export const jobs = new Map<string, DownloadJob>();
export function startYoutubeDownload(value: unknown) {
  const url = youtubeUrl(value);
  if ([...jobs.values()].filter(j => j.status === 'downloading').length >= 2) throw new InputError('Attendi il completamento dei download in corso.');
  for (const [id, j] of jobs) if (Date.now() - j.created > 3600000 && j.status !== 'downloading') jobs.delete(id);
  const job: DownloadJob = { id: randomUUID(), status: 'downloading', progress: 0, created: Date.now() };
  jobs.set(job.id, job);
  void download(job, url);
  return job;
}
async function download(job: DownloadJob, url: string) {
  const prefix = `youtube_${job.id}`;
  try {
    await fs.mkdir(downloadsDir, { recursive: true });
    // Best available streams; merge/remux only, with no lossy transcoding or artificial upscaling.
    const command = process.env.YT_DLP_PATH || 'python3';
    const args = process.env.YT_DLP_PATH ? [] : [path.resolve('yt-dlp')];
    args.push('--no-playlist', '--no-overwrites', '--newline', '--no-colors', '--socket-timeout', '20', '--retries', '1', '--fragment-retries', '1', '--extractor-retries', '1', '--js-runtimes', 'node', '-f', 'bv*+ba/b', '--merge-output-format', 'mp4/mkv', '--write-info-json', '--progress-template', 'download:%(progress._percent_str)s', '-o', path.join(downloadsDir, `${prefix}.%(ext)s`), '--', url);
    let errors = '';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const timer = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
      child.stdout.on('data', data => {
        for (const match of data.toString().matchAll(/download:\s*(\d+(?:\.\d+)?)%/g)) job.progress = Math.min(99, Number(match[1]));
      });
      child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-8000); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errors || 'Download interrotto.')); });
    });
    const files = await fs.readdir(downloadsDir);
    const file = files.find(f => f.startsWith(prefix + '.') && /\.(mp4|mkv|webm)$/.test(f));
    if (!file) throw new Error('Download terminato senza un file video.');
    const info = JSON.parse(await fs.readFile(path.join(downloadsDir, `${prefix}.info.json`), 'utf8'));
    const asset = await describeMedia(path.join(downloadsDir, file), `${info.title || 'Video YouTube'}${path.extname(file)}`);
    job.asset = { ...asset, sourceUrl: url } as typeof asset;
    job.progress = 100; job.status = 'complete';
  } catch (error) {
    const message = (error as Error).message;
    if (/Tunnel connection failed:\s*403/i.test(message)) {
      job.errorCode = 'PROXY_FORBIDDEN';
      job.error = 'Il proxy dell’ambiente blocca YouTube (403). Puoi importare un file video locale.';
    } else if (/403|Forbidden/.test(message)) {
      job.errorCode = 'REMOTE_FORBIDDEN';
      job.error = 'Il server remoto ha rifiutato il download (403). Puoi importare un file video locale.';
    } else if (/Sign in|cookies|bot/.test(message)) {
      job.errorCode = 'AUTH_REQUIRED';
      job.error = 'YouTube richiede autenticazione o verifica anti-bot. Il video non è scaricabile in questa sessione.';
    } else {
      job.errorCode = 'DOWNLOAD_FAILED';
      job.error = `Download non riuscito: ${message.slice(-1000)}`;
    }
    job.status = 'error';
    for (const f of await fs.readdir(downloadsDir)) if (f.startsWith(prefix + '.')) await fs.rm(path.join(downloadsDir, f), { force: true });
  }
}
