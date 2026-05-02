# MCP Server Inspector (mcpman)

A Bun-based web app that inspects and manages your Claude Desktop MCP server configuration. It automatically finds and parses `claude_desktop_config.json`, displaying all configured MCP servers with their details.

## Quick Start

```bash
bunx mkol5222/mcpman
```

That's it — the server starts and your browser opens automatically.

### Custom Port

```bash
bunx mkol5222/mcpman --port 8080
```

## Features

- Auto-detects Claude Desktop config file (macOS, Windows, Linux)
- Lists all MCP servers with status (active/disabled/error)
- Shows command, arguments, and environment variables
- **Enable/disable servers** by removing/restoring them from the config
- **Restart Claude Desktop** on macOS and Windows
- Modal detail view for each server with toggle control
- Extensible architecture for future add/remove functionality

## Development

```bash
git clone https://github.com/mkol5222/mcpman.git
cd mcpman
bun install
bun run dev    # with hot reload
# or
bun run start  # production mode
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Config File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## How Disable Works

Since Claude Desktop does not respect a `disabled` field in its config, disabling a server **removes it entirely** from `claude_desktop_config.json`. The server's configuration is saved to a separate store so it can be re-enabled later:

- **macOS**: `~/Library/Application Support/mcp-inspector/disabled-servers.json`
- **Windows**: `%APPDATA%/mcp-inspector/disabled-servers.json`
- **Linux**: `~/.config/mcp-inspector/disabled-servers.json`

This means the Claude config always stays clean and valid — disabled servers simply don't appear in it.

## Project Structure

```
src/
  cli.ts           # CLI entry point (bunx) — starts server + opens browser
  config-parser.ts # Config detection, parsing, saving, enable/disable
  restart.ts       # Claude Desktop restart utility (macOS/Windows)
  server.ts        # Standalone HTTP server
public/
  index.html       # Main page
  app.css          # Styles
  app.js           # Frontend logic
```

## API

### Configuration

- `GET /api/config` - Returns parsed MCP server configuration + detected OS
- `GET /api/config?path=/custom/path` - Load config from custom path
- `POST /api/config/save` - Save full config object

### Server Management

- `POST /api/config/servers/:name` - Toggle server state
  ```json
  { "action": "enable" }  // or "disable"
  ```

### Restart

- `POST /api/restart` - Restart Claude Desktop (macOS/Windows only)
- `GET /api/os` - Returns detected OS platform

## Managing Servers

### Enable/Disable

Click the **Enable** or **Disable** button on any server card, or open the detail modal and use the toggle switch. Disabling removes the server from the Claude config and stores its settings for later. Enabling restores it.

### Restarting Claude

Click **Restart Claude** in the header. You'll be prompted to confirm, with a summary of active vs disabled servers. On macOS, this uses `osascript` to quit and reopen Claude. On Windows, it uses `taskkill` and restarts the executable.
