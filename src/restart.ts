import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RestartResult {
  success: boolean;
  message: string;
  os: string;
}

const MAC_APP_PATH = '/Applications/Claude.app';
const MAC_APP_NAME = 'Claude';

export function getOS(): string {
  return platform();
}

export function restartClaude(): RestartResult {
  const os = platform();

  try {
    if (os === 'darwin') {
      return restartMac();
    }

    if (os === 'win32') {
      return restartWindows();
    }

    return {
      success: false,
      message: `Restart not supported for ${os}. Please restart Claude Desktop manually.`,
      os,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to restart Claude Desktop: ${err instanceof Error ? err.message : String(err)}`,
      os,
    };
  }
}

function restartMac(): RestartResult {
  try {
    execSync(`osascript -e 'tell application "${MAC_APP_NAME}" to quit'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch {
  }

  setTimeout(() => {
    try {
      execSync(`open -a "${MAC_APP_PATH}"`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch {
    }
  }, 1500);

  return {
    success: true,
    message: 'Claude Desktop is restarting on macOS...',
    os: 'darwin',
  };
}

function restartWindows(): RestartResult {
  const scriptPath = join(tmpdir(), 'mcpman_restart_claude.vbs');

  const vbsScript = [
    'Set WshShell = CreateObject("WScript.Shell")',
    'On Error Resume Next',
    'WshShell.Run "taskkill /IM Claude.exe /F", 0, True',
    'WScript.Sleep 2000',
    'WshShell.Run """%LOCALAPPDATA%\\Claude\\Claude.exe""", 1, False',
    'WshShell.Run """%PROGRAMFILES%\\Claude\\Claude.exe""", 1, False',
  ].join('\n');

  try {
    writeFileSync(scriptPath, vbsScript, 'utf-8');
    execSync(`cscript //nologo "${scriptPath}"`, {
      timeout: 15000,
      stdio: 'ignore',
    });
  } catch {
  }

  setTimeout(() => {
    try {
      unlinkSync(scriptPath);
    } catch {
    }
  }, 5000);

  return {
    success: true,
    message: 'Claude Desktop is restarting on Windows...',
    os: 'win32',
  };
}
