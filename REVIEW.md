# Security Review Report - MCP Server Manager (mcpman)

**Date:** 2026-05-02  
**Version Reviewed:** 1.1.0  
**Scope:** Full codebase security assessment

---

## Executive Summary

The MCP Server Manager is a local web application for managing Claude Desktop MCP server configurations. While designed as a development tool with localhost-only access, several security vulnerabilities were identified ranging from **High** to **Low** severity. The most critical issues involve path traversal vulnerabilities and lack of input validation on file operations.

**Overall Risk Rating: MEDIUM-HIGH**

---

## Critical Findings

### 1. Path Traversal Vulnerability - HIGH

**Location:** `src/server.ts:25,39`, `src/cli.ts:71,85`, `src/config-parser.ts:367-401`

**Description:**
The `configPath` parameter is accepted from URL search parameters without validation:

```typescript
// src/server.ts
const configPath = url.searchParams.get('path') || undefined;
```

This value is then used directly in file operations:
- `loadRawConfigFile(filePath)` - reads arbitrary files
- `fs.writeFileSync(filePath, content, 'utf-8')` - writes arbitrary files
- `readFileSync(path, 'utf-8')` - reads in `loadConfig()`, `saveConfig()`, etc.

**Impact:**
An attacker with access to the web interface could use path traversal sequences (`../`) to:
- Read sensitive files from the filesystem (SSH keys, `.env` files, etc.)
- Write malicious content to arbitrary locations
- Potentially achieve remote code execution by overwriting system files

**Proof of Concept:**
```
GET /api/config/raw?path=../../../etc/passwd
PUT /api/config/raw?path=../../../tmp/malicious.json
```

**Remediation:**
```typescript
import { resolve, normalize } from 'node:path';

function validateConfigPath(inputPath: string): string | null {
  const allowedDir = dirname(getConfigPath());
  const resolved = resolve(inputPath);
  
  // Ensure the resolved path is within the allowed directory
  if (!resolved.startsWith(allowedDir)) {
    return null;
  }
  
  return resolved;
}
```

---

### 2. Missing Authentication on API Endpoints - MEDIUM

**Location:** All API endpoints in `src/server.ts` and `src/cli.ts`

**Description:**
The HTTP server has no authentication mechanism. All API endpoints are accessible to anyone who can reach `localhost:3000`.

**Impact:**
- Any local user or process can modify MCP server configurations
- Sensitive environment variables (API tokens, credentials) can be viewed
- Claude Desktop can be restarted arbitrarily
- Server configurations can be enabled/disabled

**Remediation Options:**
1. Add token-based authentication for API calls
2. Bind to `127.0.0.1` only (currently done) and add localhost checks
3. Implement a one-time token generated at startup shown in console
4. Use macOS/iOS keychain or Windows credential manager for local auth

```typescript
// Example: Simple token auth
const AUTH_TOKEN = process.env.MCPMAN_TOKEN || crypto.randomUUID();
if (req.headers.get('Authorization') !== `Bearer ${AUTH_TOKEN}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

---

### 3. Command Injection Risk - MEDIUM

**Location:** `src/restart.ts:47-62,71-103`, `src/cli.ts:44-49`

**Description:**
While `execSync` calls use hardcoded constants for application names/paths, there are potential issues:

1. **macOS restart:** `osascript -e 'tell application "${MAC_APP_NAME}" to quit'`
   - `MAC_APP_NAME` is hardcoded as `'Claude'` - safe currently
   
2. **Windows restart:** VBScript execution with `cscript //nologo "${scriptPath}"`
   - Script path is in `tmpdir()` - safer but still executes a generated script
   
3. **Browser opening:** `execSync(\`open "${url}"\`, ...)`
   - URL is constructed locally but could be manipulated if code changes

**Impact:**
Currently low risk due to hardcoded values, but the pattern is dangerous if extended.

**Remediation:**
- Use `execFileSync` instead of `execSync` with template literals
- Validate all inputs to command execution
- Avoid shell interpolation when possible

```typescript
// Safer approach
import { execFileSync } from 'node:child_process';
execFileSync('osascript', ['-e', `tell application "${MAC_APP_NAME}" to quit`]);
```

---

### 4. Cross-Site Scripting (XSS) - MEDIUM

**Location:** `public/app.js:54-65, 340-361, 383-423`

**Description:**
The application uses an `escapeHtml()` function, but there are potential issues:

1. **Validation warning innerHTML:** `validationWarningEl.innerHTML` is set with user-controlled validation error paths
   - Error paths come from config file structure
   - `escapeHtml()` is used, but ensure it's applied consistently

2. **Server name display:** Server names from config are displayed
   - `escapeHtml(server.name)` is used - good

3. **Command/Args display:** User-controlled config values displayed
   - Uses `escapeHtml()` - good

**Impact:**
If an attacker can control config file content (via another vulnerability or shared system), they could inject malicious scripts.

**Remediation:**
```javascript
// Ensure escapeHtml works correctly
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
// This implementation is actually safe as it uses textContent
```

Consider adding Content Security Policy headers.

---

### 5. Missing Security Headers - LOW

**Location:** `src/http-server.ts`

**Description:**
The custom HTTP server does not set security headers:

- No `Content-Security-Policy`
- No `X-Content-Type-Options: nosniff`
- No `X-Frame-Options`
- No `Strict-Transport-Security` (if HTTPS is added later)

**Impact:**
- Clickjacking attacks possible (no X-Frame-Options)
- MIME type confusion attacks possible
- No CSP protection against XSS

**Remediation:**
```typescript
// In http-server.ts serve() function
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

// Apply to all responses
Object.entries(securityHeaders).forEach(([key, value]) => {
  response.headers.set(key, value);
});
```

---

### 6. Information Disclosure - LOW

**Location:** `public/app.js`, API responses

**Description:**
The application discloses potentially sensitive information:

1. **Full config file path displayed** in the UI (`configPathEl.textContent = path`)
2. **Environment variables** are shown (masked in UI, but full value in raw editor)
3. **Server commands and arguments** displayed in UI
4. **Error messages** may leak file paths and system information

**Impact:**
- Local users can see sensitive configuration details
- Error messages could help attackers understand system layout

**Remediation:**
- Consider hiding full paths in production mode
- Add option to disable raw config editor
- Sanitize error messages before sending to client

---

### 7. No Rate Limiting - LOW

**Location:** All API endpoints

**Description:**
API endpoints have no rate limiting. An attacker (or malicious script) could:

- Flood the `/api/restart` endpoint to repeatedly restart Claude Desktop
- Make excessive requests to read config files
- Cause denial of service through resource exhaustion

**Impact:**
- Local DoS possible
- Could disrupt user's work by repeatedly restarting Claude

**Remediation:**
```typescript
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function rateLimit(ip: string, maxRequests: number = 60, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip) || { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  
  record.count++;
  requestCounts.set(ip, record);
  
  return record.count <= maxRequests;
}
```

---

### 8. Insecure File Permissions - LOW

**Location:** `src/config-parser.ts:162,260`

**Description:**
When creating directories and writing files:

```typescript
mkdirSync(dir, { recursive: true });
writeFileSync(path, json + '\n', 'utf-8');
```

No explicit file permissions are set. On Unix systems, files may be created with default umask (often 022), making config files readable by other users.

**Impact:**
- Config files with API tokens may be readable by other local users
- Disabled servers file may expose sensitive information

**Remediation:**
```typescript
import { chmodSync } from 'node:fs';

// After writing sensitive files
writeFileSync(path, json + '\n', 'utf-8');
chmodSync(path, 0o600); // Owner read/write only
```

---

### 9. Dependency Security - LOW

**Location:** `package.json`

**Description:**
Dependencies are minimal (good), but:

- `tsx: ^4.19.3` - Ensure this is kept up to date
- No `package-lock.json` or `bun.lockb` committed (good for security, but need to verify lockfile)

**Recommendation:**
- Run `npm audit` or `bun audit` regularly
- Pin dependency versions in production
- Consider adding Dependabot or similar for automated updates

---

### 10. No Input Size Limits - LOW

**Location:** `src/server.ts:41-55` (PUT /api/config/raw)

**Description:**
The raw config endpoint accepts arbitrary content without size limits:

```typescript
const body = await req.json();
const content = body.content;
```

**Impact:**
- Could cause memory exhaustion with very large payloads
- No limits on config file size

**Remediation:**
```typescript
// Check Content-Length header
const contentLength = req.headers.get('Content-Length');
if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
  return error('Request too large', 413);
}
```

---

## Summary of Findings

| # | Vulnerability | Severity | Ease of Exploit |
|---|--------------|----------|----------------|
| 1 | Path Traversal | **HIGH** | Easy |
| 2 | Missing Authentication | **MEDIUM** | Easy |
| 3 | Command Injection Risk | **MEDIUM** | Hard (currently safe) |
| 4 | XSS via innerHTML | **MEDIUM** | Medium |
| 5 | Missing Security Headers | **LOW** | N/A |
| 6 | Information Disclosure | **LOW** | Easy |
| 7 | No Rate Limiting | **LOW** | Easy |
| 8 | Insecure File Permissions | **LOW** | Medium |
| 9 | Dependency Security | **LOW** | N/A |
| 10 | No Input Size Limits | **LOW** | Easy |

---

## Recommended Action Plan

### Immediate (Fix within 1 week)
1. **Fix path traversal** - Validate and sanitize all file paths
2. **Add authentication** - At minimum, a startup token or localhost binding verification
3. **Set security headers** - Add CSP, X-Frame-Options, etc.

### Short-term (Fix within 1 month)
4. **Replace `execSync` with `execFileSync`** where possible
5. **Add rate limiting** to API endpoints
6. **Set strict file permissions** on written config files
7. **Add input size limits**

### Long-term (Ongoing)
8. **Regular dependency audits**
9. **Consider adding HTTPS support** with self-signed cert for localhost
10. **Add logging and audit trails** for config changes

---

## Code Quality Notes

### Positive Security Practices Found
- Uses `escapeHtml()` consistently in frontend
- Masks sensitive env values in UI (first 8 + last 4 chars)
- Validates JSON before writing config files
- Has `.gitignore` that excludes `.env` files
- Minimal dependencies reduce attack surface
- TypeScript used with strict mode enabled

### Areas for Improvement
- No unit tests for security-critical functions
- No automated security testing
- Error handling could leak information
- No request validation middleware pattern

---

## Conclusion

While the MCP Server Manager is designed as a local development tool, it handles sensitive configuration data including API tokens and credentials. The **path traversal vulnerability** is the most critical issue that should be addressed immediately. Adding proper authentication, even simple token-based auth, would significantly improve the security posture.

The application's risk is somewhat mitigated by:
- Localhost-only binding
- Minimal network exposure
- Intended for development use

However, on shared systems or in environments where local access control is weak, these vulnerabilities could be exploited.

**Recommended next steps:**
1. Patch path traversal immediately
2. Add authentication token system
3. Implement security headers
4. Consider a security audit before any production use

---

*Report generated by opencode security review*
