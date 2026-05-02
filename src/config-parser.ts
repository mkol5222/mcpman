import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, basename } from 'node:path';

export interface ValidationError {
  path: string;
  message: string;
}

export function validateConfig(config: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    errors.push({ path: '', message: 'Configuration must be an object' });
    return { valid: false, errors };
  }

  const cfg = config as Record<string, unknown>;

  if (!('mcpServers' in cfg)) {
    errors.push({ path: '', message: 'Missing required field: mcpServers' });
    return { valid: false, errors };
  }

  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
    errors.push({ path: 'mcpServers', message: 'mcpServers must be an object' });
    return { valid: false, errors };
  }

  const servers = cfg.mcpServers as Record<string, unknown>;
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    errors.push({ path: 'mcpServers', message: 'No servers defined in mcpServers' });
  }

  for (const [name, serverConfig] of Object.entries(servers)) {
    const serverPath = `mcpServers.${name}`;

    if (!serverConfig || typeof serverConfig !== 'object') {
      errors.push({ path: serverPath, message: 'Server configuration must be an object' });
      continue;
    }

    const server = serverConfig as Record<string, unknown>;

    if (!('command' in server)) {
      errors.push({ path: serverPath, message: 'Missing required field: command' });
    } else if (typeof server.command !== 'string') {
      errors.push({ path: `${serverPath}.command`, message: 'command must be a string' });
    }

    if ('args' in server) {
      if (!Array.isArray(server.args)) {
        errors.push({ path: `${serverPath}.args`, message: 'args must be an array' });
      } else {
        const allStrings = (server.args as unknown[]).every(arg => typeof arg === 'string');
        if (!allStrings) {
          errors.push({ path: `${serverPath}.args`, message: 'All args must be strings' });
        }
      }
    }

    if ('env' in server) {
      if (!server.env || typeof server.env !== 'object') {
        errors.push({ path: `${serverPath}.env`, message: 'env must be an object' });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

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
  validation?: {
    valid: boolean;
    errors: ValidationError[];
  };
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
    const validation = validateConfig(config);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      return {
        found: true,
        path,
        config,
        servers: [],
        error: 'No "mcpServers" section found in configuration',
        validation,
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
      validation,
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

export function loadRawConfigFile(filePath: string): { success: boolean; content?: string; path?: string; error?: string; validation?: { valid: boolean; errors: ValidationError[] } } {
  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${filePath}`,
    };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    let validation;
    try {
      const config = JSON.parse(content);
      validation = validateConfig(config);
    } catch {
      return {
        success: true,
        content,
        path: filePath,
        validation: { valid: false, errors: [{ path: '', message: 'Invalid JSON: unable to parse file' }] },
      };
    }
    return {
      success: true,
      content,
      path: filePath,
      validation,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
