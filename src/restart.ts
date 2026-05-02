import { execSync } from 'node:child_process';
import { platform } from 'node:os';

export interface RestartResult {
  success: boolean;
  message: string;
  os: string;
}

const MAC_APP_PATH = '/Applications/Claude.app';
const MAC_APP_NAME = 'Claude';

const WIN_PROCESS_NAMES = ['Claude.exe', 'Claude'];
const WIN_PATHS = [
  '%LOCALAPPDATA%\\Claude\\Claude.exe',
  '%PROGRAMFILES%\\Claude\\Claude.exe',
];

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
  for (const proc of WIN_PROCESS_NAMES) {
    try {
      execSync(`taskkill /IM "${proc}" /F 2>nul`, {
        encoding: 'utf-8',
        shell: 'cmd.exe',
        timeout: 10000,
      });
    } catch {
    }
  }

  setTimeout(() => {
    for (const appPath of WIN_PATHS) {
      try {
        execSync(`start "" "${appPath}"`, {
          encoding: 'utf-8',
          shell: 'cmd.exe',
          timeout: 10000,
        });
        break;
      } catch {
      }
    }
  }, 2000);

  return {
    success: true,
    message: 'Claude Desktop is restarting on Windows...',
    os: 'win32',
  };
}
