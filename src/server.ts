import { serve, getDirname } from './http-server.ts';
import { makeHandler } from './routes.ts';
import { join } from 'path';

const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC_DIR = join(getDirname(import.meta.url), '..', 'public');

serve({ port: PORT, fetch: makeHandler(PUBLIC_DIR) });

console.log(`Claude Code MCP Server Manager running at http://localhost:${PORT}`);
