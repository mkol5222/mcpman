#!/usr/bin/env node

import { serve, getDirname } from './http-server.ts';
import { makeHandler } from './routes.ts';
import { join } from 'path';
import { platform } from 'os';
import { execSync } from 'child_process';

const DEFAULT_PORT = 3000;

function parseArgs(): { port: number } {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      const isBun = typeof process.versions.bun !== 'undefined';
      const cmd = isBun ? 'bunx' : 'npx';
      console.log('Usage: mcpman [options]');
      console.log('');
      console.log('Options:');
      console.log('  --port <number>  Port to run the server on (default: 3000)');
      console.log('  --help, -h       Show this help message');
      console.log('');
      console.log('Examples:');
      console.log(`  ${cmd} mkol5222/mcpman`);
      console.log(`  ${cmd} mkol5222/mcpman --port 8080`);
      process.exit(0);
    }
  }

  return { port };
}

function openBrowser(url: string): void {
  const os = platform();
  try {
    if (os === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else if (os === 'win32') execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch {}
}

async function main() {
  const { port } = parseArgs();
  const PUBLIC_DIR = join(getDirname(import.meta.url), '..', 'public');

  serve({ port, fetch: makeHandler(PUBLIC_DIR) });

  const url = `http://localhost:${port}`;
  console.log('');
  console.log('  Claude Code MCP Server Manager');
  console.log('');
  console.log(`  Local:   ${url}`);
  console.log('');

  openBrowser(url);
}

main();
