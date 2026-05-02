import { serve } from 'bun';
import { loadConfig, saveConfig, enableServer, disableServer } from './config-parser.ts';
import { restartClaude, getOS } from './restart.ts';
import { join } from 'path';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC_DIR = join(import.meta.dir, '..', 'public');

function serveStaticFile(filePath: string): Response | null {
  const fullPath = join(PUBLIC_DIR, filePath);

  if (!existsSync(fullPath)) {
    return null;
  }

  const ext = fullPath.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    ico: 'image/x-icon',
  };

  const contentType = mimeTypes[ext || ''] || 'application/octet-stream';

  return new Response(Bun.file(fullPath), {
    headers: { 'Content-Type': contentType },
  });
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function error(message: string, status = 400): Response {
  return Response.json({ success: false, message }, { status });
}

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const configPath = url.searchParams.get('path') || undefined;

    if (path === '/api/config') {
      const result = loadConfig(configPath);
      return json({ ...result, os: getOS() });
    }

    if (path === '/api/config/save' && req.method === 'POST') {
      try {
        const body = await req.json();
        const config = body.config;
        if (!config || typeof config !== 'object') {
          return error('Invalid config object');
        }
        const result = saveConfig(config, configPath);
        return json(result);
      } catch (err) {
        return error(`Failed to parse request: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (path.startsWith('/api/config/servers/') && req.method === 'POST') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const body = await req.json();
      const action = body.action;

      if (action === 'enable') {
        const result = enableServer(serverName, configPath);
        return json(result);
      }

      if (action === 'disable') {
        const result = disableServer(serverName, configPath);
        return json(result);
      }

      return error(`Unknown action: ${action}`);
    }

    if (path === '/api/restart' && req.method === 'POST') {
      const result = restartClaude();
      return json(result);
    }

    if (path === '/api/os') {
      return json({ os: getOS() });
    }

    if (path === '/' || path === '/index.html') {
      return serveStaticFile('index.html') || new Response('Not found', { status: 404 });
    }

    const staticFile = serveStaticFile(path.replace(/^\//, ''));
    if (staticFile) {
      return staticFile;
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`MCP Server Inspector running at http://localhost:${PORT}`);
