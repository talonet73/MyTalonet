import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.resolve(__dirname, 'media_downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Store active SSE clients (for Claude Desktop MCP connection)
  const mcpClients: { id: string; res: Response }[] = [];

  // Shared in-memory timeline state accessible by Claude MCP and Frontend
  let timelineState = {
    currentTime: 18,
    selectedClipId: 'clip_video_1',
    tracks: [
      { id: 'track_effects', name: 'EFFECTS', type: 'effect', isSolo: false, isMuted: false, headerBg: '#35121b', laneBg: '#1e141a' },
      { id: 'track_video_1', name: 'VIDEO 01', type: 'video', isSolo: false, isMuted: false, headerBg: '#0f2942', laneBg: '#111d2e' },
      { id: 'track_video_2', name: 'VIDEO 02', type: 'video', isSolo: false, isMuted: false, headerBg: '#0f2942', laneBg: '#111d2e' },
      { id: 'track_audio_1', name: 'AUDIO 01', type: 'audio', isSolo: false, isMuted: false, headerBg: '#0d3324', laneBg: '#10251e' },
    ],
    clips: [
      {
        id: 'clip_effect_1',
        name: 'Camera Handed',
        trackId: 'track_effects',
        type: 'effect',
        startTime: 10,
        duration: 11,
        offset: 0,
        color: '#cb5c5b',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 1.5,
        fadeOut: 1.5,
        effectType: 'camera_shake',
      },
      {
        id: 'clip_video_1',
        name: 'Intro01.mp4',
        trackId: 'track_video_1',
        type: 'video',
        startTime: 7,
        duration: 14,
        offset: 0,
        color: '#2563eb',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'clip_audio_1',
        name: 'Musica.wav',
        trackId: 'track_audio_1',
        type: 'audio',
        startTime: 7,
        duration: 25,
        offset: 0,
        color: '#10b981',
        transparency: 100,
        volumeDb: 0,
        fadeIn: 0,
        fadeOut: 0,
      }
    ],
    lastCommand: null as any
  };

  // Broadcast to MCP and connected UI listeners
  function broadcastMCPEvent(event: string, data: any) {
    mcpClients.forEach(client => {
      try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        // ignore closed connections
      }
    });
  }

  // MCP SSE Endpoint for Claude Desktop
  app.get('/api/mcp/sse', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    mcpClients.push({ id: clientId, res });

    // Send Claude Desktop MCP endpoint info
    res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${clientId}\n\n`);
    res.write(`event: state\ndata: ${JSON.stringify(timelineState)}\n\n`);

    req.on('close', () => {
      const idx = mcpClients.findIndex(c => c.id === clientId);
      if (idx !== -1) mcpClients.splice(idx, 1);
    });
  });

  // MCP JSON-RPC Messages handler (Model Context Protocol standard)
  app.post('/api/mcp/messages', (req: Request, res: Response) => {
    const { jsonrpc, id, method, params } = req.body || {};

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'TALEDIT-MCP-Server',
            version: '1.0.0'
          }
        }
      });
    }

    if (method === 'notifications/initialized') {
      return res.status(200).send('OK');
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'get_timeline_state',
              description: 'Restituisce le tracce, clip, trasparenze, volumi dB e dissolvenze attuali.',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'cut_clip_at_time',
              description: 'Taglia la clip specificata o selezionata ad un determinato timestamp.',
              inputSchema: {
                type: 'object',
                properties: {
                  timeSeconds: { type: 'number', description: 'Tempo in secondi a cui effettuare il taglio' },
                  clipId: { type: 'string', description: 'ID facoltativo della clip da tagliare' }
                },
                required: ['timeSeconds']
              }
            },
            {
              name: 'set_video_transparency',
              description: 'Imposta la percentuale di trasparenza (0-100%) della maniglia orizzontale video.',
              inputSchema: {
                type: 'object',
                properties: {
                  clipId: { type: 'string' },
                  transparencyPercent: { type: 'number', minimum: 0, maximum: 100 }
                },
                required: ['transparencyPercent']
              }
            },
            {
              name: 'set_audio_volume',
              description: 'Imposta il volume in decibel (-60 dB a +12 dB) della maniglia orizzontale audio.',
              inputSchema: {
                type: 'object',
                properties: {
                  clipId: { type: 'string' },
                  volumeDb: { type: 'number', minimum: -60, maximum: 12 }
                },
                required: ['volumeDb']
              }
            },
            {
              name: 'set_effect_dissolvenza',
              description: 'Imposta la dissolvenza (fade in / fade out) in secondi sulle maniglie verticali.',
              inputSchema: {
                type: 'object',
                properties: {
                  clipId: { type: 'string' },
                  fadeIn: { type: 'number' },
                  fadeOut: { type: 'number' }
                }
              }
            }
          ]
        }
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      timelineState.lastCommand = { toolName, args, timestamp: new Date().toISOString() };
      broadcastMCPEvent('tool_call', { toolName, args });

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `TALEDIT MCP ha eseguito con successo il tool "${toolName}" con argomenti: ${JSON.stringify(args)}`
            }
          ]
        }
      });
    }

    return res.json({ jsonrpc: '2.0', id, result: {} });
  });

  // CORS for preview iframe and media fetching
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, x-filename');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // REST API status endpoint for connection check
  app.get('/api/mcp/status', (req: Request, res: Response) => {
    res.json({
      status: 'active',
      appName: 'TALEDIT',
      activeClients: mcpClients.length,
      protocol: 'MCP-2024-11-05',
      state: timelineState
    });
  });

  // Media upload endpoint for user-imported media (.mp4, .mov, .avi, .mp3, .wav, .png, .jpg)
  app.post('/api/upload-media', express.raw({ type: '*/*', limit: '500mb' }), (req: Request, res: Response) => {
    try {
      const originalName = (req.headers['x-filename'] as string) || `upload_${Date.now()}.mp4`;
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(DOWNLOADS_DIR, safeName);

      fs.writeFileSync(targetPath, req.body);
      const stats = fs.statSync(targetPath);

      console.log(`[Upload] File saved: ${safeName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

      return res.json({
        success: true,
        fileName: safeName,
        url: `/media_downloads/${safeName}`,
        sizeBytes: stats.size
      });
    } catch (err: any) {
      console.error('[Upload] Error saving file:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // FFmpeg Export endpoint - Exports genuine MP4, AVI, MOV, MP3, WAV with exact bitrate from slider
  app.post('/api/export', async (req: Request, res: Response) => {
    try {
      const {
        format = 'mp4',
        resolution = '1080p',
        weightPercentage = 55,
        durationSec = 15,
        clips = [],
        subtitles = []
      } = req.body || {};

      const width = resolution === '4K' ? 3840 : resolution === '720p' ? 1280 : 1920;
      const height = resolution === '4K' ? 2160 : resolution === '720p' ? 720 : 1080;
      const safeDuration = Math.max(1, Math.min(600, Number(durationSec) || 15));

      // Calculate bitrate based on weight slider (1-100)
      const resFactor = resolution === '4K' ? 2.2 : resolution === '720p' ? 0.7 : 1.0;
      const minVideoKbps = 1500;
      const maxVideoKbps = 22000;
      const videoKbps = Math.round((minVideoKbps + (Number(weightPercentage) / 100) * (maxVideoKbps - minVideoKbps)) * resFactor);

      const minAudioKbps = 64;
      const maxAudioKbps = 320;
      const audioKbps = Math.round(minAudioKbps + (Number(weightPercentage) / 100) * (maxAudioKbps - minAudioKbps));

      const timestamp = Date.now();
      const outFileName = `TALEDIT_Export_${resolution}_${timestamp}.${format}`;
      const outFilePath = path.join(DOWNLOADS_DIR, outFileName);

      console.log(`[FFmpeg Export] Starting export: ${outFileName} (${safeDuration}s, ${resolution}, format=${format}, video=${videoKbps}kbps, audio=${audioKbps}kbps)`);

      // Resolve clip paths on disk
      const resolvedClips = (clips as any[]).map(c => {
        let localPath: string | null = null;
        if (c.mediaUrl) {
          const cleanUrl = c.mediaUrl.replace(/^\/media_downloads\//, '').replace(/^media_downloads\//, '');
          const candidate = path.join(DOWNLOADS_DIR, path.basename(cleanUrl));
          if (fs.existsSync(candidate)) {
            localPath = candidate;
          }
        }
        if (!localPath && c.name) {
          const safeName = c.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const candidate = path.join(DOWNLOADS_DIR, safeName);
          if (fs.existsSync(candidate)) {
            localPath = candidate;
          }
        }
        return { ...c, localPath, hasFile: Boolean(localPath) };
      });

      // 1. PURE AUDIO EXPORT (WAV or MP3)
      if (format === 'wav' || format === 'mp3') {
        const audioProducing = resolvedClips.filter(c => (c.type === 'audio' || c.type === 'video') && c.hasFile);

        if (audioProducing.length === 0) {
          // Generate clean silence - NEVER AN OSCILLATOR DRONE!
          const cmd = `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${safeDuration} ${format === 'wav' ? '-c:a pcm_s16le -ar 44100' : `-c:a libmp3lame -b:a ${audioKbps}k`} "${outFilePath}"`;
          await execPromise(cmd);
        } else {
          let inputsStr = '';
          const filterParts: string[] = [];

          audioProducing.forEach((ac, idx) => {
            const delayMs = Math.round(Math.max(0, ac.startTime) * 1000);
            const dur = Math.max(0.5, ac.duration);
            inputsStr += ` -ss ${ac.offset || 0} -t ${dur} -i "${ac.localPath}"`;
            const volDb = ac.volumeDb || 0;
            if (delayMs > 0) {
              filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=${volDb}dB[a${idx}]`);
            } else {
              filterParts.push(`[${idx}:a]volume=${volDb}dB[a${idx}]`);
            }
          });

          if (audioProducing.length > 1) {
            const mixInputs = audioProducing.map((_, i) => `[a${i}]`).join('');
            filterParts.push(`${mixInputs}amix=inputs=${audioProducing.length}:dropout_transition=2[aout]`);
          } else {
            filterParts.push(`[a0]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`);
          }

          const codecArgs = format === 'wav'
            ? '-c:a pcm_s16le -ar 44100'
            : `-c:a libmp3lame -b:a ${audioKbps}k`;

          const cmd = `ffmpeg -y ${inputsStr} -filter_complex "${filterParts.join(';')}" -map "[aout]" -t ${safeDuration} ${codecArgs} "${outFilePath}"`;
          await execPromise(cmd);
        }
      } else {
        // 2. VIDEO EXPORT (MP4, AVI, MOV)
        const videoClips = resolvedClips.filter(c => c.type === 'video' && c.hasFile);
        const audioClips = resolvedClips.filter(c => (c.type === 'audio' || c.type === 'video') && c.hasFile);

        // Base background: Studio dark canvas
        let inputsStr = `-f lavfi -i color=c=0x0a0f1d:s=${width}x${height}:d=${safeDuration}:r=25`;
        const filterParts: string[] = [];
        let currentVideoLayer = '0:v';

        // Add and overlay each video clip with proper PTS synchronization
        videoClips.forEach((vc, idx) => {
          const inputIdx = idx + 1;
          const dur = Math.max(0.5, vc.duration);
          inputsStr += ` -ss ${vc.offset || 0} -t ${dur} -i "${vc.localPath}"`;

          const scaledTag = `vscaled${idx}`;
          const alpha = Math.max(0, Math.min(1, (vc.transparency ?? 100) / 100));
          const startSec = Math.max(0, vc.startTime);
          const endSec = startSec + dur;

          // Scale preserving aspect ratio, pad to center, and shift PTS so frames are aligned with timeline startSec
          filterParts.push(`[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=rgba,colorchannelmixer=aa=${alpha},setpts=PTS-STARTPTS+${startSec}/TB[${scaledTag}]`);

          const nextLayer = `vlayer${idx}`;
          filterParts.push(`[${currentVideoLayer}][${scaledTag}]overlay=0:0:enable='between(t,${startSec},${endSec})'[${nextLayer}]`);
          currentVideoLayer = nextLayer;
        });

        // Audio streams mixing
        let audioMap = '';
        if (audioClips.length > 0) {
          const audioFilterParts: string[] = [];
          const baseAudioIdx = videoClips.length + 1;

          audioClips.forEach((ac, aIdx) => {
            const inputIdx = baseAudioIdx + aIdx;
            const dur = Math.max(0.5, ac.duration);
            inputsStr += ` -ss ${ac.offset || 0} -t ${dur} -i "${ac.localPath}"`;

            const delayMs = Math.round(Math.max(0, ac.startTime) * 1000);
            const volDb = ac.volumeDb || 0;
            if (delayMs > 0) {
              audioFilterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${volDb}dB[a${aIdx}]`);
            } else {
              audioFilterParts.push(`[${inputIdx}:a]volume=${volDb}dB[a${aIdx}]`);
            }
          });

          filterParts.push(...audioFilterParts);
          if (audioClips.length > 1) {
            const mixInputs = audioClips.map((_, i) => `[a${i}]`).join('');
            filterParts.push(`${mixInputs}amix=inputs=${audioClips.length}:dropout_transition=2[aout]`);
          } else {
            filterParts.push(`[a0]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`);
          }
          audioMap = '-map "[aout]"';
        } else {
          // Provide clean silent audio track so players don't show codec errors
          inputsStr += ` -f lavfi -i anullsrc=r=44100:cl=stereo`;
          const nullAudioIdx = videoClips.length + 1;
          audioMap = `-map ${nullAudioIdx}:a`;
        }

        // Subtitles drawing if any
        let finalVideoTag = currentVideoLayer;
        if (Array.isArray(subtitles) && subtitles.length > 0) {
          const fontPath = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf';
          const hasFont = fs.existsSync(fontPath);
          subtitles.forEach((sub: any, sIdx: number) => {
            const safeText = (sub.text || '').replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/"/g, '\\"');
            if (!safeText) return;
            const start = sub.startTime || 0;
            const end = sub.endTime || (start + 3);
            const subLayer = `vsub${sIdx}`;
            const fontArg = hasFont ? `:fontfile='${fontPath}'` : '';
            filterParts.push(`[${finalVideoTag}]drawtext=text='${safeText}'${fontArg}:fontsize=32:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8:x=(w-text_w)/2:y=h-70:enable='between(t,${start},${end})'[${subLayer}]`);
            finalVideoTag = subLayer;
          });
        }

        const filterComplex = filterParts.join(';');

        let codecArgs = '';
        if (format === 'mp4') {
          codecArgs = `-c:v libx264 -pix_fmt yuv420p -b:v ${videoKbps}k -maxrate ${Math.round(videoKbps * 1.5)}k -bufsize ${videoKbps * 2}k -c:a aac -b:a ${audioKbps}k -movflags +faststart`;
        } else if (format === 'mov') {
          codecArgs = `-c:v libx264 -pix_fmt yuv420p -b:v ${videoKbps}k -c:a aac -b:a ${audioKbps}k`;
        } else if (format === 'avi') {
          codecArgs = `-c:v libx264 -pix_fmt yuv420p -b:v ${videoKbps}k -c:a mp3 -b:a ${audioKbps}k`;
        }

        const cmd = `ffmpeg -y ${inputsStr} -filter_complex "${filterComplex}" -map "[${finalVideoTag}]" ${audioMap} -t ${safeDuration} ${codecArgs} "${outFilePath}"`;
        await execPromise(cmd);
      }

      const stats = fs.statSync(outFilePath);
      console.log(`[FFmpeg Export] Completed: ${outFileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

      return res.json({
        success: true,
        fileName: outFileName,
        downloadUrl: `/api/download/${outFileName}`,
        actualSizeBytes: stats.size,
        durationSec: safeDuration,
        format,
        resolution
      });
    } catch (err: any) {
      console.error('[FFmpeg Export] Error exporting:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Dedicated direct file download endpoint
  app.get('/api/download/:filename', (req: Request, res: Response) => {
    try {
      const fileName = path.basename(req.params.filename);
      const filePath = path.join(DOWNLOADS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File non trovato');
      }

      const stats = fs.statSync(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err: any) {
      console.error('[Download] Error serving download:', err);
      return res.status(500).send('Errore download');
    }
  });

  // Static media downloads serving with CORS & Range support
  app.use('/media_downloads', express.static(DOWNLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }));

  // Vite integration
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[TALEDIT Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[TALEDIT Server] Error starting server:', err);
});
