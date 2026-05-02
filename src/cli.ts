#!/usr/bin/env bun

import { serve } from 'bun';
import { loadConfig, saveConfig, enableServer, disableServer } from './config-parser.ts';
import { restartClaude, getOS } from './restart.ts';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { platform, homedir } from 'os';
import { execSync } from 'child_process';

const DEFAULT_PORT = 3000;

function parseArgs(): { port: number } {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: mcpman [options]');
      console.log('');
      console.log('Options:');
      console.log('  --port <number>  Port to run the server on (default: 3000)');
      console.log('  --help, -h       Show this help message');
      console.log('');
      console.log('Examples:');
      console.log('  bunx mkol5222/mcpman');
      console.log('  bunx mkol5222/mcpman --port 8080');
      process.exit(0);
    }
  }

  return { port };
}

function openBrowser(url: string): void {
  const os = platform();

  try {
    if (os === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (os === 'win32') {
      execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
  }
}

async function main() {
  const { port } = parseArgs();
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
    port,
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

  const url = `http://localhost:${port}`;

  console.log('');
  console.log('  MCP Server Inspector');
  console.log('');
  console.log(`  Local:   ${url}`);
  console.log('');

  openBrowser(url);
}

main();
