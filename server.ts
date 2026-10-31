import 'dotenv/config';
import {saveScreenshotToDownloads} from './server/screenshot';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { downloadsDir, describeMedia, exportMedia, InputError, run } from './server/media';
import { installMcp } from './server/mcp';
import { installCaptions } from './server/captions';
import { jobs, startYoutubeDownload } from './server/youtube';
import {installBackgroundRemover} from './server/background';
import {installWaveform} from './server/waveform';

export async function createApp(production = process.env.NODE_ENV === 'production') {
  const app = express();
  await fs.mkdir(downloadsDir, { recursive: true });
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    try { if (origin && new URL(origin).host !== req.get('host')) { res.status(403).json({ error: 'Origine non consentita.' }); return; } }
    catch { res.status(403).json({ error: 'Origine non valida.' }); return; }
    next();
  });
  // Uploads must precede JSON middleware: even JSON-looking files are handled as bytes.
  app.post('/api/upload-media', express.raw({ type: () => true, limit: '500mb' }), async (req, res, next) => {
    let file: string | undefined;
    try {
      const name = decodeURIComponent(req.get('x-filename') || 'media.mp4');
      const ext = path.extname(name).toLowerCase();
      if (!['.mp4','.mov','.avi','.mkv','.webm','.mp3','.wav','.m4a','.ogg','.png','.jpg','.jpeg','.webp'].includes(ext) || !Buffer.isBuffer(req.body) || !req.body.length) throw new InputError('File vuoto o formato non supportato.');
      file = path.join(downloadsDir, `upload_${randomUUID()}${ext}`);
      await fs.writeFile(file, req.body, { flag: 'wx' });
      const asset = await describeMedia(file, path.basename(name));
      res.json({ success: true, asset, url: asset.fileUrl });
    } catch (error) { if (file) await fs.rm(file, { force: true }); next(error); }
  });
  app.use(express.json({ limit: '5mb' }));
  app.get('/api/health', async (_req, res) => {
    try { await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version'])]); res.json({ status: 'ok', ffmpeg: true, ffprobe: true }); }
    catch { res.status(503).json({ status: 'error', error: 'Installa FFmpeg e ffprobe.' }); }
  });
  installMcp(app);
  installCaptions(app);
  installBackgroundRemover(app);
  installWaveform(app);
  let exportsRunning = 0;
  app.post(['/api/export','/api/screenshot'], async (req, res, next) => {
    if (exportsRunning >= 2) { res.status(429).json({ success: false, error: 'Attendi le esportazioni in corso.' }); return; }
    exportsRunning++;
    try { const screenshot=req.path==='/api/screenshot';const result=await exportMedia(screenshot?{...req.body,format:'png'}:req.body || {},{screenshot});res.json({...result,...(screenshot?{savedToDownloads:await saveScreenshotToDownloads(result)}:{})}); } catch (error) { next(error); } finally { exportsRunning--; }
  });
  app.post('/api/youtube/download', (req, res, next) => {
    try { const job = startYoutubeDownload(req.body?.url); res.status(202).json({ jobId: job.id }); } catch (error) { next(error); }
  });
  app.get('/api/youtube/download/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) { res.status(404).json({ error: 'Download non trovato.' }); return; }
    res.json(job);
  });
  app.get('/api/download/:filename', (req, res) => {
    const file = path.basename(req.params.filename);
    res.download(path.join(downloadsDir, file), file, error => { if (error && !res.headersSent) res.status(404).json({ error: 'File non trovato.' }); });
  });
  app.use('/media_downloads', express.static(downloadsDir, { dotfiles: 'deny', index: false }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint non trovato.' }));
  if (production) {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[TALEDIT]', error.message);
    if (res.headersSent) return;
    const invalid = error instanceof InputError || error.type === 'entity.parse.failed';
    res.status(invalid ? 400 : error.status || 500).json({ success: false, error: invalid ? error.message : 'Operazione fallita. Controlla i log del server e la disponibilità di FFmpeg.' });
  });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().then(app => app.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('[TALEDIT] Server avviato sulla porta', process.env.PORT || 3000))).catch(error => { console.error(error); process.exitCode = 1; });
}
