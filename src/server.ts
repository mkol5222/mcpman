import { serve, getDirname } from './http-server.ts';
import { serveStaticFile } from './http-server.ts';
import { loadConfig, saveConfig, enableServer, disableServer, getConfigPath, findConfigPath, loadRawConfigFile } from './config-parser.ts';
import { restartClaude, getOS } from './restart.ts';
import { join } from 'path';

const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC_DIR = join(getDirname(import.meta.url), '..', 'public');

// serveStaticFile is now imported from http-server.ts

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

    if (path === '/api/config/raw' && req.method === 'GET') {
      const filePath = configPath || findConfigPath() || getConfigPath();
      const result = loadRawConfigFile(filePath);
      return json(result);
    }

    if (path === '/api/config/raw' && req.method === 'PUT') {
      const filePath = configPath || findConfigPath() || getConfigPath();
      try {
        const body = await req.json();
        const content = body.content;
        if (typeof content !== 'string') {
          return error('Invalid content: expected a string');
        }
        const fs = await import('fs');
        JSON.parse(content);
        fs.writeFileSync(filePath, content, 'utf-8');
        return json({ success: true, message: 'Configuration saved successfully', path: filePath });
      } catch (err) {
        if (err instanceof SyntaxError) {
          return error('Invalid JSON: ' + err.message);
        }
        return error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
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
      return serveStaticFile('index.html', PUBLIC_DIR) || new Response('Not found', { status: 404 });
    }

    const staticFile = serveStaticFile(path.replace(/^\//, ''), PUBLIC_DIR);
    if (staticFile) {
      return staticFile;
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`MCP Server Inspector running at http://localhost:${PORT}`);
