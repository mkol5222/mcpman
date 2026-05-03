import { serve, getDirname } from './http-server.ts';
import { serveStaticFile } from './http-server.ts';
import { loadConfig, saveConfig, enableServer, disableServer, getConfigPath, findConfigPath, loadRawConfigFile, loadGlobalEnv, addGlobalEnvVar, removeGlobalEnvVar, loadDisabledServers, saveDisabledServers } from './config-parser.ts';
import { restartClaude, getOS } from './restart.ts';
import { join } from 'path';

const PORT = parseInt(process.env.PORT || '3000');
const PUBLIC_DIR = join(getDirname(import.meta.url), '..', 'public');

// serveStaticFile is now imported from http-server.ts

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function error(message: string, status = 400): Response {
  return Response.json({ success: false, message }, { status });
}

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const configPath = url.searchParams.get('path') || undefined;

    if (path === '/api/config') {
      const result = loadConfig(configPath);
      return json({ ...result, os: getOS() });
    }

    if (path === '/api/config/raw' && req.method === 'GET') {
      const filePath = configPath || findConfigPath() || getConfigPath();
      const result = loadRawConfigFile(filePath);
      return json(result);
    }

    if (path === '/api/config/raw' && req.method === 'PUT') {
      const filePath = configPath || findConfigPath() || getConfigPath();
      try {
        const body = await req.json();
        const content = body.content;
        if (typeof content !== 'string') {
          return error('Invalid content: expected a string');
        }
        const fs = await import('fs');
        JSON.parse(content);
        fs.writeFileSync(filePath, content, 'utf-8');
        return json({ success: true, message: 'Configuration saved successfully', path: filePath });
      } catch (err) {
        if (err instanceof SyntaxError) {
          return error('Invalid JSON: ' + err.message);
        }
        return error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
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

    if (path === '/api/config/servers' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { name, config } = body;

        if (!name || typeof name !== 'string') {
          return error('Server name is required');
        }

        if (!config || typeof config !== 'object') {
          return error('Server config is required');
        }

        const result = loadConfig(configPath);

        if (!result.found || !result.config) {
          return error('Configuration not found');
        }

        result.config.mcpServers[name] = config;
        const saveResult = saveConfig(result.config, configPath || findConfigPath() || undefined);

        if (!saveResult.success) {
          return json(saveResult);
        }

        return json({ success: true, message: `Server "${name}" added` });
      } catch (err) {
        return error(`Failed to add server: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    if (path.startsWith('/api/config/servers/') && req.method === 'PUT') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');
      const body = await req.json();
      const { env } = body;

      if (typeof env !== 'object' || env === null) {
        return error('Invalid env: expected an object');
      }

      const result = loadConfig(configPath);

      if (!result.found || !result.config) {
        return error('Configuration not found');
      }

      let serverConfig = result.config.mcpServers[serverName];
      let isInDisabled = false;

      if (!serverConfig) {
        const disabledServers = loadDisabledServers();
        if (disabledServers[serverName]) {
          serverConfig = disabledServers[serverName];
          isInDisabled = true;
        }
      }

      if (!serverConfig) {
        return error(`Server "${serverName}" not found`);
      }

      serverConfig.env = env;

      if (isInDisabled) {
        const disabledServers = loadDisabledServers();
        disabledServers[serverName] = serverConfig;
        saveDisabledServers(disabledServers);
        return json({ success: true, message: 'Server configuration saved' });
      } else {
        const saveResult = saveConfig(result.config, configPath || findConfigPath() || undefined);
        if (!saveResult.success) {
          return json(saveResult);
        }
        return json({ success: true, message: 'Server configuration saved' });
      }
    }

    if (path.startsWith('/api/config/servers/') && req.method === 'DELETE') {
      const serverName = decodeURIComponent(path.split('/').pop() || '');

      const result = loadConfig(configPath);

      if (!result.found || !result.config) {
        return error('Configuration not found');
      }

      if (result.config.mcpServers[serverName]) {
        delete result.config.mcpServers[serverName];
        const saveResult = saveConfig(result.config, configPath || findConfigPath() || undefined);
        if (!saveResult.success) {
          return json(saveResult);
        }
        return json({ success: true, message: `Server "${serverName}" removed` });
      }

      const disabledServers = loadDisabledServers();
      if (disabledServers[serverName]) {
        delete disabledServers[serverName];
        saveDisabledServers(disabledServers);
        return json({ success: true, message: `Server "${serverName}" removed` });
      }

      return error(`Server "${serverName}" not found`);
    }

    if (path === '/api/restart' && req.method === 'POST') {
      const result = restartClaude();
      return json(result);
    }

    if (path === '/api/os') {
      return json({ os: getOS() });
    }

    if (path === '/api/global-env' && req.method === 'GET') {
      const env = loadGlobalEnv();
      return json({ success: true, env });
    }

    if (path === '/api/global-env' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { key, value } = body;
        const result = addGlobalEnvVar(key, value);
        return json(result);
      } catch (err) {
        return error(`Failed to add environment variable: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (path.startsWith('/api/global-env/') && req.method === 'DELETE') {
      const key = decodeURIComponent(path.split('/').pop() || '');
      const result = removeGlobalEnvVar(key);
      return json(result);
    }

    if (path === '/' || path === '/index.html') {
      return serveStaticFile('index.html', PUBLIC_DIR) || new Response('Not found', { status: 404 });
    }

    const staticFile = serveStaticFile(path.replace(/^\//, ''), PUBLIC_DIR);
    if (staticFile) {
      return staticFile;
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Claude Code MCP Server Manager running at http://localhost:${PORT}`);
