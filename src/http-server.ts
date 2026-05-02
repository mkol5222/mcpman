import { createServer, Server } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { URL, fileURLToPath } from 'url';

const mimeTypes: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
};

export function getDirname(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

export interface ServerOptions {
  port: number;
  fetch: (req: Request) => Promise<Response> | Response;
}

export function serve(options: ServerOptions): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${options.port}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    });

    try {
      const response = await options.fetch(request);

      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
    }
  });

  server.listen(options.port);
  return server;
}

export function serveStaticFile(filePath: string, publicDir: string): Response | null {
  const fullPath = join(publicDir, filePath);

  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    return null;
  }

  const ext = extname(fullPath).slice(1).toLowerCase();
  const contentType = mimeTypes[ext || ''] || 'application/octet-stream';

  try {
    const content = readFileSync(fullPath);
    return new Response(content, {
      headers: { 'Content-Type': contentType },
    });
  } catch {
    return null;
  }
}
