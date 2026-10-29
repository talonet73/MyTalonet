import type { Express, RequestHandler, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { timingSafeEqual } from 'node:crypto';
import { applyTimelineTool, timelineTools, type TimelineState } from '../src/services/timelineTools';

export function installMcp(app: Express) {
  let state: TimelineState = { clips: [], tracks: [], subtitles: [], mediaAssets: [], currentTime: 0, selectedClipId: null, aspectRatio: '16:9' };
  let revision = 0;
  let enabled = false;
  const listeners = new Set<Response>();
  const legacy = new Map<string, SSEServerTransport>();
  const snapshot = () => ({ state, revision, enabled });
  const broadcast = () => { for (const res of listeners) res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`); };
  // Browser control endpoints accept only same-origin requests. External clients use MCP.
  const sameOrigin: RequestHandler = (req, res, next) => {
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) { res.status(403).json({ error: 'Origine non consentita.' }); return; }
    next();
  };
  app.use('/api/editor', sameOrigin);
  app.get('/api/editor/state', (_req, res) => res.json(snapshot()));
  app.put('/api/editor/state', (req, res) => {
    const next = req.body?.state;
    if (req.body?.revision !== revision) { res.status(409).json(snapshot()); return; }
    if (!next || !Array.isArray(next.clips) || !Array.isArray(next.tracks) || !Array.isArray(next.subtitles) || !Array.isArray(next.mediaAssets) || next.mediaAssets.length > 1000 || next.subtitles.length > 1000 || typeof next.currentTime !== 'number' || !Number.isFinite(next.currentTime) || !['16:9','9:16','1:1','4:3'].includes(next.aspectRatio)) { res.status(400).json({ error: 'Stato timeline non valido.' }); return; }
    state = next; revision++; broadcast(); res.json(snapshot());
  });
  app.post('/api/editor/connection', (req, res) => { enabled = req.body.enabled === true; broadcast(); res.json(snapshot()); });
  app.get('/api/editor/events', (_req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders(); listeners.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    res.on('close', () => { clearInterval(heartbeat); listeners.delete(res); });
  });
  app.get('/api/mcp/status', (_req, res) => res.json({ status: 'active', enabled, activeClients: legacy.size, protocol: 'MCP Streamable HTTP + SSE', authenticationRequired: Boolean(process.env.MCP_AUTH_TOKEN) }));
  const auth: RequestHandler = (req, res, next) => {
    const expected = process.env.MCP_AUTH_TOKEN;
    const value = req.get('authorization')?.replace(/^Bearer /, '') || '';
    if (expected && (Buffer.byteLength(value) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(value), Buffer.from(expected)))) { res.status(401).json({ error: 'Bearer token richiesto.' }); return; }
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) { res.status(403).json({ error: 'Origine non consentita.' }); return; }
    next();
  };
  const makeServer = () => {
    const server = new Server({ name: 'TALEDIT', version: '2.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: timelineTools }));
    server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        if (!enabled) throw new Error('Collegamento MCP spento. Attivalo in TALEDIT.');
        const next = applyTimelineTool(state, request.params.name, request.params.arguments || {});
        if (next !== state) { state = next; revision++; broadcast(); }
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...snapshot() }) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: (error as Error).message }] }; }
    });
    return server;
  };
  // Stateless Streamable HTTP: supported by ChatGPT remote MCP connectors and Claude.
  app.all('/api/mcp', auth, async (req, res, next) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = makeServer();
    try {
      await server.connect(transport);
      res.on('close', () => { void transport.close(); void server.close(); });
      await transport.handleRequest(req, res, req.body);
    } catch (error) { next(error); }
  });
  // Preserve Claude Desktop's legacy SSE endpoint with actual JSON-RPC responses over SSE.
  app.get('/api/mcp/sse', auth, async (_req, res, next) => {
    const transport = new SSEServerTransport('/api/mcp/messages', res);
    legacy.set(transport.sessionId, transport);
    res.on('close', () => legacy.delete(transport.sessionId));
    try { await makeServer().connect(transport); } catch (error) { next(error); }
  });
  app.post('/api/mcp/messages', auth, async (req, res, next) => {
    const transport = legacy.get(String(req.query.sessionId));
    if (!transport) { res.status(404).json({ error: 'Sessione MCP inesistente.' }); return; }
    try { await transport.handlePostMessage(req, res, req.body); } catch (error) { next(error); }
  });
}
