import {
  loadConfig, saveConfig, enableServer, disableServer,
  findConfigPath, getConfigPath, loadRawConfigFile,
  loadGlobalEnv, addGlobalEnvVar, removeGlobalEnvVar,
  loadDisabledServers, saveDisabledServers,
  readServerLog, getAvailableLogs,
} from './config-parser.ts';
import { restartClaude, getOS } from './restart.ts';
import { serveStaticFile } from './http-server.ts';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function err(message: string, status = 400): Response {
  return Response.json({ success: false, message }, { status });
}

export function makeHandler(publicDir: string) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const configPath = url.searchParams.get('path') || undefined;

    if (path === '/api/config') {
      return json({ ...loadConfig(configPath), os: getOS() });
    }

    if (path === '/api/config/raw' && req.method === 'GET') {
      return json(loadRawConfigFile(configPath || findConfigPath() || getConfigPath()));
    }

    if (path === '/api/config/raw' && req.method === 'PUT') {
      const filePath = configPath || findConfigPath() || getConfigPath();
      try {
        const { content } = await req.json();
        if (typeof content !== 'string') return err('Invalid content: expected a string');
        JSON.parse(content); // validate before writing
        const { writeFileSync } = await import('node:fs');
        writeFileSync(filePath, content, 'utf-8');
        return json({ success: true, message: 'Configuration saved successfully', path: filePath });
      } catch (e) {
        if (e instanceof SyntaxError) return err('Invalid JSON: ' + e.message);
        return err(`Failed to save: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (path === '/api/config/save' && req.method === 'POST') {
      try {
        const { config } = await req.json();
        if (!config || typeof config !== 'object') return err('Invalid config object');
        return json(saveConfig(config, configPath));
      } catch (e) {
        return err(`Failed to parse request: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (path === '/api/config/servers' && req.method === 'POST') {
      try {
        const { name, config } = await req.json();
        if (!name || typeof name !== 'string') return err('Server name is required');
        if (!config || typeof config !== 'object') return err('Server config is required');
        const result = loadConfig(configPath);
        if (!result.found || !result.config) return err('Configuration not found');
        result.config.mcpServers[name] = config;
        const saved = saveConfig(result.config, configPath || findConfigPath() || undefined);
        if (!saved.success) return json(saved);
        return json({ success: true, message: `Server "${name}" added` });
      } catch (e) {
        return err(`Failed to add server: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (path.startsWith('/api/config/servers/') && req.method === 'PUT') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const { env } = await req.json();
      if (typeof env !== 'object' || env === null) return err('Invalid env: expected an object');
      const result = loadConfig(configPath);
      if (!result.found || !result.config) return err('Configuration not found');
      let serverConfig = result.config.mcpServers[serverName];
      let isDisabled = false;
      if (!serverConfig) {
        const disabled = loadDisabledServers();
        if (disabled[serverName]) { serverConfig = disabled[serverName]; isDisabled = true; }
      }
      if (!serverConfig) return err(`Server "${serverName}" not found`);
      serverConfig.env = env;
      if (isDisabled) {
        const disabled = loadDisabledServers();
        disabled[serverName] = serverConfig;
        saveDisabledServers(disabled);
      } else {
        const saved = saveConfig(result.config, configPath || findConfigPath() || undefined);
        if (!saved.success) return json(saved);
      }
      return json({ success: true, message: 'Server configuration saved' });
    }

    if (path.startsWith('/api/config/servers/') && req.method === 'DELETE') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const result = loadConfig(configPath);
      if (!result.found || !result.config) return err('Configuration not found');
      if (result.config.mcpServers[serverName]) {
        delete result.config.mcpServers[serverName];
        const saved = saveConfig(result.config, configPath || findConfigPath() || undefined);
        if (!saved.success) return json(saved);
        return json({ success: true, message: `Server "${serverName}" removed` });
      }
      const disabled = loadDisabledServers();
      if (disabled[serverName]) {
        delete disabled[serverName];
        saveDisabledServers(disabled);
        return json({ success: true, message: `Server "${serverName}" removed` });
      }
      return err(`Server "${serverName}" not found`);
    }

    if (path.startsWith('/api/config/servers/') && req.method === 'POST') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const { action } = await req.json();
      if (action === 'enable') return json(enableServer(serverName, configPath));
      if (action === 'disable') return json(disableServer(serverName, configPath));
      return err(`Unknown action: ${action}`);
    }

    if (path === '/api/logs' && req.method === 'GET') {
      return json(getAvailableLogs());
    }

    if (path.startsWith('/api/logs/') && req.method === 'GET') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const maxLines = parseInt(url.searchParams.get('maxLines') || '500');
      return json(readServerLog(serverName, maxLines));
    }

    if (path === '/api/restart' && req.method === 'POST') {
      return json(restartClaude());
    }

    if (path === '/api/os') {
      return json({ os: getOS() });
    }

    if (path === '/api/global-env' && req.method === 'GET') {
      return json({ success: true, env: loadGlobalEnv() });
    }

    if (path === '/api/global-env' && req.method === 'POST') {
      try {
        const { key, value } = await req.json();
        return json(addGlobalEnvVar(key, value));
      } catch (e) {
        return err(`Failed to add environment variable: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (path.startsWith('/api/global-env/') && req.method === 'DELETE') {
      const key = decodeURIComponent(path.split('/').pop() || '');
      return json(removeGlobalEnvVar(key));
    }

    if (path === '/' || path === '/index.html') {
      return serveStaticFile('index.html', publicDir) ?? new Response('Not found', { status: 404 });
    }

    return serveStaticFile(path.slice(1), publicDir) ?? new Response('Not found', { status: 404 });
  };
}
