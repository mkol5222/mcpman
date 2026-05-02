import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, basename } from 'node:path';

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClaudeDesktopConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface ServerInfo {
  name: string;
  config: McpServerConfig;
  status: 'active' | 'disabled' | 'error';
  error?: string;
}

export interface ConfigResult {
  found: boolean;
  path?: string;
  config?: ClaudeDesktopConfig;
  servers: ServerInfo[];
  error?: string;
}

export interface SaveResult {
  success: boolean;
  message: string;
  path?: string;
}

const CONFIG_PATHS = {
  darwin: () => join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  win32: () => join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
  linux: () => join(homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
};

const STORE_DIR_NAMES = {
  darwin: join(homedir(), 'Library', 'Application Support', 'mcp-inspector'),
  win32: join(process.env.APPDATA || '', 'mcp-inspector'),
  linux: join(homedir(), '.config', 'mcp-inspector'),
};

function getStoreDir(): string {
  const os = platform() as keyof typeof STORE_DIR_NAMES;
  return STORE_DIR_NAMES[os] || STORE_DIR_NAMES.linux;
}

function getDisabledStorePath(): string {
  return join(getStoreDir(), 'disabled-servers.json');
}

export function getConfigPath(): string {
  const os = platform() as keyof typeof CONFIG_PATHS;
  const getPath = CONFIG_PATHS[os] || CONFIG_PATHS.linux;
  return getPath();
}

export function findConfigPath(): string | null {
  const configPath = getConfigPath();
  return existsSync(configPath) ? configPath : null;
}

function loadDisabledServers(): Record<string, McpServerConfig> {
  const storePath = getDisabledStorePath();

  if (!existsSync(storePath)) {
    return {};
  }

  try {
    const raw = readFileSync(storePath, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function saveDisabledServers(servers: Record<string, McpServerConfig>): void {
  const storePath = getDisabledStorePath();
  const dir = dirname(storePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const json = JSON.stringify(servers, null, 2);
  writeFileSync(storePath, json + '\n', 'utf-8');
}

export function loadConfig(configPath?: string): ConfigResult {
  const path = configPath || findConfigPath();

  if (!path) {
    return {
      found: false,
      servers: [],
      error: `Configuration file not found at: ${getConfigPath()}`,
    };
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const config: ClaudeDesktopConfig = JSON.parse(raw);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      return {
        found: true,
        path,
        config,
        servers: [],
        error: 'No "mcpServers" section found in configuration',
      };
    }

    const disabledServers = loadDisabledServers();

    const activeServers: ServerInfo[] = Object.entries(config.mcpServers).map(([name, serverConfig]) => {
      const isValid = serverConfig && typeof serverConfig === 'object' && 'command' in serverConfig;

      if (!isValid) {
        return {
          name,
          config: serverConfig as McpServerConfig,
          status: 'error' as const,
          error: 'Invalid server configuration: missing "command" field',
        };
      }

      return {
        name,
        config: serverConfig,
        status: 'active',
      };
    });

    const disabledServerInfos: ServerInfo[] = Object.entries(disabledServers).map(([name, serverConfig]) => ({
      name,
      config: serverConfig,
      status: 'disabled',
    }));

    const allServers = [...activeServers, ...disabledServerInfos].sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      if (a.status === 'active') return -1;
      if (b.status === 'active') return 1;
      return 0;
    });

    return {
      found: true,
      path,
      config,
      servers: allServers,
    };
  } catch (err) {
    return {
      found: false,
      servers: [],
      error: `Failed to parse configuration: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function saveConfig(config: ClaudeDesktopConfig, configPath?: string): SaveResult {
  const path = configPath || findConfigPath();

  if (!path) {
    return {
      success: false,
      message: `Cannot save: configuration file not found at ${getConfigPath()}`,
    };
  }

  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const json = JSON.stringify(config, null, 2);
    writeFileSync(path, json + '\n', 'utf-8');

    return {
      success: true,
      message: 'Configuration saved successfully',
      path,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function disableServer(serverName: string, configPath?: string): SaveResult {
  const path = configPath || findConfigPath();

  if (!path) {
    return {
      success: false,
      message: 'Configuration file not found',
    };
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const config: ClaudeDesktopConfig = JSON.parse(raw);

    if (!config.mcpServers[serverName]) {
      return {
        success: false,
        message: `Server "${serverName}" not found in active servers`,
      };
    }

    const serverConfig = config.mcpServers[serverName];

    delete config.mcpServers[serverName];

    saveConfig(config, path);

    const disabled = loadDisabledServers();
    disabled[serverName] = serverConfig;
    saveDisabledServers(disabled);

    return {
      success: true,
      message: `Server "${serverName}" disabled (removed from config, settings saved)`,
      path,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to disable server: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function enableServer(serverName: string, configPath?: string): SaveResult {
  const path = configPath || findConfigPath();

  if (!path) {
    return {
      success: false,
      message: 'Configuration file not found',
    };
  }

  try {
    const disabled = loadDisabledServers();

    if (!disabled[serverName]) {
      return {
        success: false,
        message: `Server "${serverName}" not found in disabled servers`,
      };
    }

    const serverConfig = disabled[serverName];

    delete disabled[serverName];
    saveDisabledServers(disabled);

    const raw = readFileSync(path, 'utf-8');
    const config: ClaudeDesktopConfig = JSON.parse(raw);

    config.mcpServers[serverName] = serverConfig;

    saveConfig(config, path);

    return {
      success: true,
      message: `Server "${serverName}" enabled (restored to config)`,
      path,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to enable server: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function loadRawConfigFile(filePath: string): { success: boolean; content?: string; path?: string; error?: string } {
  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${filePath}`,
    };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return {
      success: true,
      content,
      path: filePath,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
