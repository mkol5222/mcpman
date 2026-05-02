#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tsFile = join(__dirname, '..', 'src', 'cli.ts');
const args = process.argv.slice(2);

// Check if running in Bun
const isBun = typeof process.versions.bun !== 'undefined';

if (isBun) {
  // Bun can run TypeScript directly
  const { execFileSync } = await import('child_process');
  try {
    execFileSync('bun', ['run', tsFile, ...args], {
      stdio: 'inherit',
    });
  } catch (err) {
    process.exit(err.status || 1);
  }
} else {
  // Use tsx for Node.js (npx will have installed it)
  const child = spawn('npx', ['tsx', tsFile, ...args], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code, signal) => {
    process.exit(code || (signal ? 1 : 0));
  });
  child.on('error', (err) => {
    console.error('Failed to start mcpman:', err.message);
    console.error('Make sure tsx is installed: npm install -g tsx');
    process.exit(1);
  });
}
