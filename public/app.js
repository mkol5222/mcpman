const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorTextEl = document.getElementById('errorText');
const toastEl = document.getElementById('toast');
const toastIcon = document.getElementById('toastIcon');
const toastTextEl = document.getElementById('toastText');
const configInfoEl = document.getElementById('configInfo');
const configPathEl = document.getElementById('configPath');
const serverCountEl = document.getElementById('serverCount');
const configEditor = document.getElementById('configEditor');
const configViewer = document.getElementById('configViewer');
const configContent = document.getElementById('configContent');
const configTextarea = document.getElementById('configTextarea');
const viewConfigBtn = document.getElementById('viewConfigBtn');
const viewGlobalEnvBtn = document.getElementById('viewGlobalEnvBtn');
const editConfigBtn = document.getElementById('editConfigBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const cancelConfigBtn = document.getElementById('cancelConfigBtn');
const closeConfigBtn = document.getElementById('closeConfigBtn');
const closeGlobalEnvBtn = document.getElementById('closeGlobalEnvBtn');
const serversListEl = document.getElementById('serversList');
const noServersEl = document.getElementById('noServers');
const refreshBtn = document.getElementById('refreshBtn');
const restartBtn = document.getElementById('restartBtn');
const serverModal = document.getElementById('serverModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');
const modalClose = document.getElementById('modalClose');
const globalEnvSection = document.getElementById('globalEnvSection');

let validationWarningEl = null;

let currentOS = 'unknown';
let currentConfig = null;
let currentServers = [];
let currentGlobalEnv = {};
let configEditorOpen = false;
let configEditMode = false;
let globalEnvOpen = false;

const ENCRYPTION_KEY = 'mcpman-env-secret';
const LOCAL_STORAGE_KEY = 'mcpman_global_env';

const MCP_CATALOG = [
  {
    name: 'management',
    package: '@chkp/quantum-management-mcp',
    command: 'npx',
    args: ['-y', '@chkp/quantum-management-mcp'],
    description: 'Query and visualize installed policies, rulebases, and network topology. Retrieve and analyze access, NAT and VPN rules.',
    features: ['Query installed policies and rulebases', 'Network topology visualization', 'Access, NAT and VPN rules analysis', 'Objects inspection (hosts, networks, services)'],
    useCases: ['Regulatory compliance checks', 'Risky rule discovery', 'Path analysis for access', 'Rulebase optimization with AI'],
    env: ['MANAGEMENT_HOST', 'MANAGEMENT_PORT', 'API_KEY', 'USERNAME', 'PASSWORD']
  },
  {
    name: 'management-logs',
    package: '@chkp/management-logs-mcp',
    command: 'npx',
    args: ['-y', '@chkp/management-logs-mcp'],
    description: 'Query and visualize connection logs. View audit and monitoring logs for security analysis and compliance.',
    features: ['Connection logs querying', 'Audit log analysis', 'Monitoring logs', 'Best used with other Check Point MCPs'],
    useCases: ['Dropped connection analysis', 'Network probing investigation', 'Policy audit research'],
    env: ['MANAGEMENT_HOST', 'MANAGEMENT_PORT', 'API_KEY', 'USERNAME', 'PASSWORD']
  },
  {
    name: 'https-inspection',
    package: '@chkp/https-inspection-mcp',
    command: 'npx',
    args: ['-y', '@chkp/https-inspection-mcp'],
    description: 'Query and analyze HTTPS inspection rules, layers, and gateway configurations.',
    features: ['HTTPS inspection rule management', 'Layer and section analysis', 'Gateway integration', 'SSL/TLS policy compliance'],
    useCases: ['HTTPS inspection rule analysis', 'SSL/TLS policy compliance', 'Traffic decryption coverage', 'Performance impact analysis'],
    env: ['MANAGEMENT_HOST', 'MANAGEMENT_PORT', 'API_KEY', 'USERNAME', 'PASSWORD']
  }
];

function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function encrypt(data) {
  const jsonStr = JSON.stringify(data);
  const encoded = base64Encode(jsonStr);
  return encoded.split('').reverse().join('');
}

function decrypt(encrypted) {
  try {
    const reversed = encrypted.split('').reverse().join('');
    const decoded = base64Decode(reversed);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function loadFromLocalStorage() {
  const encrypted = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!encrypted) return null;
  return decrypt(encrypted);
}

function saveToLocalStorage(data) {
  const encrypted = encrypt(data);
  localStorage.setItem(LOCAL_STORAGE_KEY, encrypted);
}

function clearLocalStorage() {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

function showValidationWarning(validation) {
  if (!validation || validation.valid) {
    hideValidationWarning();
    return;
  }

  if (!validationWarningEl) {
    validationWarningEl = document.createElement('div');
    validationWarningEl.className = 'validation-warning';
    configInfoEl.parentNode.insertBefore(validationWarningEl, configInfoEl.nextSibling);
  }

  const errorCount = validation.errors.length;
  const errorList = validation.errors.map(err =>
    `<li><strong>${escapeHtml(err.path || '(root)')}:</strong> ${escapeHtml(err.message)}</li>`
  ).join('');

  validationWarningEl.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <div>
      <strong>Configuration Warning</strong>
      <p>${errorCount} validation error${errorCount > 1 ? 's' : ''} found:</p>
      <ul>${errorList}</ul>
    </div>
  `;
  validationWarningEl.classList.remove('hidden');
}

function hideValidationWarning() {
  if (validationWarningEl) {
    validationWarningEl.classList.add('hidden');
  }
}

async function loadConfig() {
  showLoading();
  hideError();
  hideToast();
  hideConfigInfo();
  hideServers();
  hideNoServers();
  hideConfigEditor();

  try {
    const response = await fetch('/api/config');
    const result = await response.json();

    hideLoading();

    if (!result.found) {
      showError(result.error || 'Failed to load configuration');
      return;
    }

    currentOS = result.os || 'unknown';
    currentConfig = result.config;
    currentServers = result.servers;

    showConfigInfo(result.path, result.servers.length);
    showValidationWarning(result.validation);

    if (result.servers.length === 0) {
      showNoServers();
      return;
    }

    renderServers(result.servers);
  } catch (err) {
    hideLoading();
    showError(`Network error: ${err.message}`);
  }
}

async function loadGlobalEnv() {
  try {
    const response = await fetch('/api/global-env');
    const result = await response.json();

    if (result.success) {
      currentGlobalEnv = result.env || {};
      renderGlobalEnv();
    }
  } catch (err) {
    console.error('Failed to load global env:', err);
  }
}

function renderGlobalEnv() {
  const listEl = document.getElementById('globalEnvList');
  const entries = Object.entries(currentGlobalEnv);
  const savedValues = loadFromLocalStorage() || {};

  if (entries.length === 0) {
    listEl.innerHTML = '<div class="no-env-vars">No environment variables configured</div>';
    return;
  }

  listEl.innerHTML = entries.map(([key, value]) => {
    const displayValue = savedValues[key] || value;
    const isPassword = key.toLowerCase().includes('password') || key.toLowerCase() === 'pass';
    const maskedDisplay = isPassword ? maskValue(displayValue) : escapeHtml(displayValue);
    const inputType = isPassword ? 'password' : 'text';

    return `
      <div class="env-var-row" data-key="${escapeHtml(key)}">
        <span class="env-var-key">${escapeHtml(key)}</span>
        <div class="env-var-value-wrapper">
          <input type="${inputType}" class="env-input env-value-input" value="${escapeHtml(displayValue)}" data-key="${escapeHtml(key)}" data-original="${escapeHtml(value)}">
        </div>
        <button class="btn btn-sm" data-save-env="${escapeHtml(key)}" title="Save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-danger" data-remove-env="${escapeHtml(key)}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-save-env]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.saveEnv;
      const input = listEl.querySelector(`input[data-key="${CSS.escape(key)}"]`);
      const newValue = input.value;
      await updateGlobalEnvVar(key, newValue);
    });
  });

  listEl.querySelectorAll('[data-remove-env]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.removeEnv;
      await removeGlobalEnvVar(key);
    });
  });

  listEl.querySelectorAll('.env-value-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const key = input.dataset.key;
        updateGlobalEnvVar(key, input.value);
      }
    });
  });
}

async function updateGlobalEnvVar(key, value) {
  const savedValues = loadFromLocalStorage() || {};
  savedValues[key] = value;
  saveToLocalStorage(savedValues);

  try {
    const response = await fetch('/api/global-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    const result = await response.json();

    if (result.success) {
      showToast(`Updated ${key}`, 'success');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast(`Failed to update environment variable: ${err.message}`, 'error');
  }
}

async function addGlobalEnvVar(key, value) {
  try {
    const response = await fetch('/api/global-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
      await loadGlobalEnv();
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast(`Failed to add environment variable: ${err.message}`, 'error');
  }
}

async function removeGlobalEnvVar(key) {
  try {
    const response = await fetch(`/api/global-env/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
      const savedValues = loadFromLocalStorage() || {};
      delete savedValues[key];
      saveToLocalStorage(savedValues);
      await loadGlobalEnv();
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast(`Failed to remove environment variable: ${err.message}`, 'error');
  }
}

function showGlobalEnv() {
  globalEnvOpen = true;
  globalEnvSection.classList.remove('hidden');
  loadGlobalEnv();
}

function hideGlobalEnv() {
  globalEnvOpen = false;
  globalEnvSection.classList.add('hidden');
}

async function loadRawConfig() {
  try {
    const response = await fetch('/api/config/raw');
    const result = await response.json();

    if (result.success) {
      const formatted = JSON.stringify(JSON.parse(result.content), null, 2);
      configContent.textContent = formatted;
      configTextarea.value = formatted;

      if (result.validation && !result.validation.valid) {
        showToast(`${result.validation.errors.length} validation error(s) found`, 'error');
      }
    } else {
      configContent.textContent = result.error || 'Failed to load config file';
      configTextarea.value = '';
    }
  } catch (err) {
    configContent.textContent = `Failed to load: ${err.message}`;
    configTextarea.value = '';
  }
}

async function saveRawConfig() {
  try {
    const content = configTextarea.value;
    JSON.parse(content);

    const response = await fetch('/api/config/raw', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    const result = await response.json();

    if (result.success) {
      showToast('Configuration saved successfully', 'success');
      exitEditMode();
      await loadConfig();
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      showToast('Invalid JSON: ' + err.message, 'error');
    } else {
      showToast(`Failed to save: ${err.message}`, 'error');
    }
  }
}

function showConfigEditor() {
  configEditorOpen = true;
  configEditor.classList.remove('hidden');
  loadRawConfig();
}

function hideConfigEditor() {
  configEditorOpen = false;
  configEditor.classList.add('hidden');
  exitEditMode();
}

function enterEditMode() {
  configEditMode = true;
  configViewer.classList.add('hidden');
  configTextarea.classList.remove('hidden');
  editConfigBtn.classList.add('hidden');
  saveConfigBtn.classList.remove('hidden');
  cancelConfigBtn.classList.remove('hidden');
  configTextarea.value = configContent.textContent;
  configTextarea.focus();
}

function exitEditMode() {
  configEditMode = false;
  configViewer.classList.remove('hidden');
  configTextarea.classList.add('hidden');
  editConfigBtn.classList.remove('hidden');
  saveConfigBtn.classList.add('hidden');
  cancelConfigBtn.classList.add('hidden');
}

async function toggleServer(serverName, enable) {
  try {
    const response = await fetch(`/api/config/servers/${encodeURIComponent(serverName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: enable ? 'enable' : 'disable' }),
    });

    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
      await loadConfig();
      return true;
    }

    showToast(result.message, 'error');
    return false;
  } catch (err) {
    showToast(`Failed to toggle server: ${err.message}`, 'error');
    return false;
  }
}

async function removeServer(serverName) {
  try {
    const response = await fetch(`/api/config/servers/${encodeURIComponent(serverName)}`, {
      method: 'DELETE',
    });

    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
      await loadConfig();
      return true;
    }

    showToast(result.message, 'error');
    return false;
  } catch (err) {
    showToast(`Failed to remove server: ${err.message}`, 'error');
    return false;
  }
}

async function restartClaude() {
  const activeCount = currentServers.filter(s => s.status === 'active').length;
  const disabledCount = currentServers.filter(s => s.status === 'disabled').length;

  let message = 'Restart Claude Desktop?';
  if (disabledCount > 0) {
    message = `Restart Claude Desktop?\n\n${activeCount} active and ${disabledCount} disabled server(s) will be affected.`;
  }

  if (!confirm(message)) {
    return;
  }

  restartBtn.disabled = true;

  try {
    const response = await fetch('/api/restart', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast(`Failed to restart: ${err.message}`, 'error');
  }

  restartBtn.disabled = false;
}

function showLoading() {
  loadingEl.classList.remove('hidden');
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function showError(message) {
  errorTextEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function showToast(message, type = 'success') {
  toastTextEl.textContent = message;
  toastEl.className = `toast toast-${type}`;

  if (type === 'success') {
    toastIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
  } else {
    toastIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  }

  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toastEl.classList.add('toast-hiding');
    setTimeout(hideToast, 300);
  }, 3000);
}

function hideToast() {
  toastEl.classList.add('hidden');
  toastEl.classList.remove('toast-hiding');
}

function showConfigInfo(path, count) {
  configPathEl.textContent = path;
  serverCountEl.textContent = count;
  configInfoEl.classList.remove('hidden');
}

function hideConfigInfo() {
  configInfoEl.classList.add('hidden');
}

function renderServers(servers, searchQuery = '') {
  const searchHtml = `
    <div class="servers-search">
      <input type="text" id="serversSearchInput" placeholder="Search servers..." class="servers-search-input" value="${escapeHtml(searchQuery)}">
    </div>
  `;

  let filteredServers = servers;
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredServers = servers.filter(server => {
      const nameMatch = server.name.toLowerCase().includes(query);
      const commandMatch = server.config.command.toLowerCase().includes(query);
      const argsMatch = server.config.args.some(arg => arg.toLowerCase().includes(query));
      return nameMatch || commandMatch || argsMatch;
    });
  }

  const cardsHtml = filteredServers.map((server, idx) => {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.innerHTML = createServerCardHTML(server);
    return card.outerHTML;
  }).join('');

  serversListEl.innerHTML = searchHtml + cardsHtml;

  const searchInput = document.getElementById('serversSearchInput');
  searchInput.addEventListener('input', (e) => {
    renderServers(servers, e.target.value);
  });

  filteredServers.forEach((server, idx) => {
    const card = serversListEl.children[idx + 1];
    if (!card) return;

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.card-actions')) {
        const originalIndex = servers.indexOf(server);
        showServerModal(originalIndex);
      }
    });

    const toggleBtn = card.querySelector('[data-toggle]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const serverName = toggleBtn.dataset.server;
        const enable = toggleBtn.dataset.enable === 'true';
        await toggleServer(serverName, enable);
      });
    }

    const removeBtn = card.querySelector('[data-remove-server]');
    if (removeBtn) {
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const serverName = removeBtn.dataset.removeServer;
        if (confirm(`Are you sure you want to remove server "${serverName}"?`)) {
          await removeServer(serverName);
        }
      });
    }

    const logsBtn = card.querySelector('[data-logs-server]');
    if (logsBtn) {
      logsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const serverName = logsBtn.dataset.logsServer;
        showLogModal(serverName);
      });
    }
  });

  if (filteredServers.length === 0 && searchQuery) {
    const noResults = document.createElement('div');
    noResults.className = 'no-servers';
    noResults.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <h2>No Matching Servers</h2>
      <p>No servers match your search "${escapeHtml(searchQuery)}"</p>
    `;
    serversListEl.appendChild(noResults);
  }

  serversListEl.classList.remove('hidden');
}

function createServerCardHTML(server) {
  const statusClass = `status-${server.status}`;
  const statusLabel = server.status.charAt(0).toUpperCase() + server.status.slice(1);
  const envCount = server.config.env ? Object.keys(server.config.env).length : 0;
  const fullCommand = `${server.config.command} ${server.config.args.join(' ')}`;
  const isDisabled = server.status === 'disabled';
  const toggleAction = isDisabled ? 'enable' : 'disable';
  const toggleLabel = isDisabled ? 'Enable' : 'Disable';

  return `
    <div class="server-header">
      <span class="server-name">${escapeHtml(server.name)}</span>
      <div class="server-actions-row">
        <span class="server-status ${statusClass}">
          <span class="status-dot"></span>
          ${statusLabel}
        </span>
        <div class="card-actions">
          <button class="btn btn-sm btn-danger btn-remove" data-remove-server="${escapeHtml(server.name)}" title="Remove server">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button class="btn btn-sm btn-toggle" data-toggle data-server="${escapeHtml(server.name)}" data-enable="${isDisabled}">
            ${toggleLabel}
          </button>
          <button class="btn btn-sm btn-icon btn-logs" data-logs-server="${escapeHtml(server.name)}" title="View Logs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div class="server-command">${escapeHtml(fullCommand)}</div>
    <div class="server-meta">
      ${envCount > 0 ? `<span>${envCount} env var${envCount > 1 ? 's' : ''}</span>` : ''}
      ${server.error ? `<span class="status-error">${escapeHtml(server.error)}</span>` : ''}
    </div>
  `;
}

function hideServers() {
  serversListEl.innerHTML = '';
  serversListEl.classList.add('hidden');
}

function showNoServers() {
  noServersEl.classList.remove('hidden');
}

function hideNoServers() {
  noServersEl.classList.add('hidden');
}

function showServerModal(serverIndex) {
  const server = currentServers[serverIndex];
  modalTitle.textContent = server.name;

  const fullCommand = `${server.config.command} ${server.config.args.join(' ')}`;
  const envVars = server.config.env ? Object.entries(server.config.env) : [];
  const isDisabled = server.status === 'disabled';

  let html = `
    <div class="detail-section">
      <div class="detail-label">Status</div>
      <div class="detail-value status-${server.status}">
        ${server.status.charAt(0).toUpperCase() + server.status.slice(1)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Command</div>
      <div class="detail-value">${escapeHtml(server.config.command)}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Arguments</div>
      <div class="detail-value">${escapeHtml(server.config.args.join(' ')) || '<em>None</em>'}</div>
    </div>
  `;

  if (server.error) {
    html += `
      <div class="detail-section">
        <div class="detail-label">Error</div>
        <div class="detail-value error-detail">${escapeHtml(server.error)}</div>
      </div>
    `;
  }

  if (envVars.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-label">
          Environment Variables
          <button id="fetchAllEnvBtn" class="btn btn-xs btn-icon" title="Fetch all from Global Env">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6"/>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>
          <button id="addEnvVarBtn" class="btn btn-xs btn-icon" title="Add Environment Variable">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div class="env-vars" id="envVarsContainer">
          ${envVars.map(([key, value]) => `
            <div class="env-var" data-key="${escapeHtml(key)}">
              <input type="text" class="env-key-input" value="${escapeHtml(key)}" data-old-key="${escapeHtml(key)}">
              <input type="text" class="env-value-input" value="${escapeHtml(value)}" data-key="${escapeHtml(key)}">
              <button class="btn btn-xs btn-icon btn-remove-env" data-key="${escapeHtml(key)}" title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="detail-section">
        <div class="detail-label">
          Environment Variables
          <button id="fetchAllEnvBtn" class="btn btn-xs btn-icon" title="Fetch all from Global Env">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6"/>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>
          <button id="addEnvVarBtn" class="btn btn-xs btn-icon" title="Add Environment Variable">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div class="env-vars" id="envVarsContainer">
          <div class="env-empty">No environment variables</div>
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = html;

  modalFooter.innerHTML = `
    <button id="viewJsonBtn" class="btn btn-sm btn-secondary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      View JSON
    </button>
    <button id="cancelServerBtn" class="btn btn-sm">Cancel</button>
    <button id="saveServerBtn" class="btn btn-sm btn-success">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save
    </button>
  `;

  let hasUnsavedChanges = false;

  document.querySelectorAll('.env-value-input').forEach(input => {
    input.addEventListener('input', () => {
      hasUnsavedChanges = true;
    });
  });

  document.querySelectorAll('.env-key-input').forEach(input => {
    input.addEventListener('input', () => {
      hasUnsavedChanges = true;
    });
  });

  document.getElementById('addEnvVarBtn')?.addEventListener('click', () => {
    const container = document.getElementById('envVarsContainer');
    const emptyMsg = container.querySelector('.env-empty');
    if (emptyMsg) emptyMsg.remove();

    const newRow = document.createElement('div');
    newRow.className = 'env-var';
    newRow.innerHTML = `
      <input type="text" class="env-key-input" placeholder="Key" data-new="true">
      <input type="text" class="env-value-input" placeholder="Value" data-new="true">
      <button class="btn btn-xs btn-icon btn-remove-env" data-key="" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    container.appendChild(newRow);
    hasUnsavedChanges = true;

    newRow.querySelector('.btn-remove-env').addEventListener('click', () => {
      newRow.remove();
      const remaining = container.querySelectorAll('.env-var');
      if (remaining.length === 0) {
        container.innerHTML = '<div class="env-empty">No environment variables</div>';
      }
      hasUnsavedChanges = true;
    });

    newRow.querySelector('.env-key-input').addEventListener('input', () => {
      hasUnsavedChanges = true;
    });

    newRow.querySelector('.env-value-input').addEventListener('input', () => {
      hasUnsavedChanges = true;
    });
  });

  document.querySelectorAll('.btn-remove-env').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.env-var');
      row.remove();
      const container = document.getElementById('envVarsContainer');
      const remaining = container.querySelectorAll('.env-var');
      if (remaining.length === 0) {
        container.innerHTML = '<div class="env-empty">No environment variables</div>';
      }
      hasUnsavedChanges = true;
    });
  });

  document.getElementById('viewJsonBtn').addEventListener('click', () => {
    showJsonModal(server);
  });

  document.getElementById('saveServerBtn').addEventListener('click', async () => {
    const env = {};
    const rows = modalBody.querySelectorAll('.env-var');
    rows.forEach(row => {
      const keyInput = row.querySelector('.env-key-input');
      const valueInput = row.querySelector('.env-value-input');
      const key = keyInput.value.trim();
      if (key) {
        env[key] = valueInput.value;
      }
    });
    const success = await saveServerEnv(server.name, env);
    if (success) {
      hasUnsavedChanges = false;
      hideModal();
      showToast('Server configuration saved', 'success');
      await loadConfig();
    }
  });

  document.getElementById('cancelServerBtn').addEventListener('click', () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Discard them?')) {
        hasUnsavedChanges = false;
        hideModal();
      }
    } else {
      hideModal();
    }
  });

  document.getElementById('fetchAllEnvBtn')?.addEventListener('click', () => {
    fetchAllEnvVars(server);
    hasUnsavedChanges = true;
  });

  document.querySelectorAll('.fetch-single-env').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      fetchSingleEnvVar(server, key);
      hasUnsavedChanges = true;
    });
  });

  serverModal.classList.remove('hidden');
}

async function saveServerEnv(serverName, env) {
  try {
    const response = await fetch(`/api/config/servers/${encodeURIComponent(serverName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env }),
    });

    const result = await response.json();
    if (!result.success) {
      showToast(result.message || 'Failed to save', 'error');
      return false;
    }
    return true;
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, 'error');
    return false;
  }
}

function fetchAllEnvVars(server) {
  const globalEnv = loadFromLocalStorage() || currentGlobalEnv;
  const rows = modalBody.querySelectorAll('.env-var');
  rows.forEach(row => {
    const keyInput = row.querySelector('.env-key-input');
    const valueInput = row.querySelector('.env-value-input');
    const key = keyInput.value.trim();
    if (key && globalEnv[key] !== undefined) {
      valueInput.value = globalEnv[key];
    }
  });
}

function fetchSingleEnvVar(server, key) {
  const globalEnv = loadFromLocalStorage() || currentGlobalEnv;
  const rows = modalBody.querySelectorAll('.env-var');
  rows.forEach(row => {
    const keyInput = row.querySelector('.env-key-input');
    const valueInput = row.querySelector('.env-value-input');
    if (keyInput.value.trim() === key && globalEnv[key] !== undefined) {
      valueInput.value = globalEnv[key];
    }
  });
}

function showJsonModal(server) {
  const jsonContent = JSON.stringify({ [server.name]: server.config }, null, 2);
  const jsonModal = document.getElementById('jsonModal');
  const jsonModalBody = document.getElementById('jsonModalBody');

  jsonModalBody.innerHTML = `<pre class="json-content"><code>${escapeHtml(jsonContent)}</code></pre>`;
  jsonModal.classList.remove('hidden');
}

function hideJsonModal() {
  document.getElementById('jsonModal').classList.add('hidden');
}

function showCatalogModal() {
  document.getElementById('catalogModal').classList.remove('hidden');
  renderCatalog(MCP_CATALOG);
}

function hideCatalogModal() {
  document.getElementById('catalogModal').classList.add('hidden');
  document.getElementById('catalogSearchInput').value = '';
}

let logTailEnabled = true;
let logTailInterval = null;
let currentLogServer = null;
let currentLogRaw = '';
let currentLogEvents = [];
let logViewMode = 'raw';

function showLogModal(serverName) {
  currentLogServer = serverName;
  logTailEnabled = true;
  logViewMode = 'raw';
  document.getElementById('logModalTitle').textContent = `Logs: ${serverName}`;
  document.getElementById('logModal').classList.remove('hidden');
  updateLogTailButton();
  updateLogViewButtons();
  loadLog(serverName);
  startLogTailing();
}

function hideLogModal() {
  document.getElementById('logModal').classList.add('hidden');
  document.getElementById('logContent').innerHTML = '';
  document.getElementById('logFilterInput').value = '';
  document.getElementById('logEventsList').innerHTML = '';
  document.getElementById('logRawPanel').classList.remove('hidden');
  document.getElementById('logStructuredPanel').classList.add('hidden');
  stopLogTailing();
  currentLogServer = null;
  currentLogRaw = '';
  currentLogEvents = [];
}

function toggleLogTail() {
  logTailEnabled = !logTailEnabled;
  updateLogTailButton();
  if (logTailEnabled) {
    startLogTailing();
  } else {
    stopLogTailing();
  }
}

function updateLogTailButton() {
  const icon = document.getElementById('logTailIcon');
  const label = document.getElementById('logTailLabel');
  if (logTailEnabled) {
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    label.textContent = 'Pause';
  } else {
    icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    label.textContent = 'Resume';
  }
}

function updateLogViewButtons() {
  document.getElementById('logViewRawBtn').classList.toggle('active', logViewMode === 'raw');
  document.getElementById('logViewStructuredBtn').classList.toggle('active', logViewMode === 'structured');
}

function setLogView(mode) {
  logViewMode = mode;
  updateLogViewButtons();

  if (mode === 'raw') {
    document.getElementById('logRawPanel').classList.remove('hidden');
    document.getElementById('logStructuredPanel').classList.add('hidden');
  } else {
    document.getElementById('logRawPanel').classList.add('hidden');
    document.getElementById('logStructuredPanel').classList.remove('hidden');
    renderStructuredLog();
  }
}

function startLogTailing() {
  if (logTailInterval) return;
  logTailInterval = setInterval(() => {
    if (logTailEnabled && currentLogServer) {
      loadLog(currentLogServer);
    }
  }, 2000);
}

function stopLogTailing() {
  if (logTailInterval) {
    clearInterval(logTailInterval);
    logTailInterval = null;
  }
}

async function loadLog(serverName) {
  try {
    const response = await fetch(`/api/logs/${encodeURIComponent(serverName)}?maxLines=500`);
    const result = await response.json();

    if (result.success) {
      currentLogRaw = result.log || '';
      currentLogEvents = parseLogToEvents(currentLogRaw);
      displayLog(currentLogRaw);
      if (logViewMode === 'structured') {
        renderStructuredLog();
      }
    } else {
      displayLog(`Error loading log: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    displayLog(`Error loading log: ${err.message}`);
  }
}

function parseLogToEvents(logText) {
  const events = [];
  const lines = logText.split('\n');

  let currentEvent = null;
  let buffer = [];

  function fixTruncatedJson(jsonStr) {
    const truncatedMatch = jsonStr.match(/\[(\d+)\s+chars\s+truncated\]$/);
    if (!truncatedMatch) return jsonStr;

    const reconstructed = jsonStr.slice(0, jsonStr.lastIndexOf('['));
    try {
      JSON.parse(reconstructed);
      return reconstructed;
    } catch {
      return jsonStr;
    }
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('-->')) {
      if (currentEvent) {
        events.push(currentEvent);
      }
      let jsonStr = trimmedLine.slice(3).trim();
      jsonStr = fixTruncatedJson(jsonStr);
      try {
        const json = JSON.parse(jsonStr);
        currentEvent = {
          direction: 'request',
          method: json.method || 'unknown',
          id: json.id,
          params: json.params,
          json: jsonStr
        };
      } catch {
        currentEvent = {
          direction: 'request',
          method: 'parse_error',
          id: null,
          params: null,
          json: jsonStr
        };
      }
      buffer = [];
    } else if (trimmedLine.startsWith('<--')) {
      if (currentEvent) {
        events.push(currentEvent);
      }
      let jsonStr = trimmedLine.slice(3).trim();
      jsonStr = fixTruncatedJson(jsonStr);
      try {
        const json = JSON.parse(jsonStr);
        currentEvent = {
          direction: json.error ? 'error' : 'response',
          method: currentEvent?.method || 'unknown',
          id: json.id,
          result: json.result,
          error: json.error,
          json: jsonStr
        };
      } catch {
        currentEvent = {
          direction: 'error',
          method: 'parse_error',
          id: null,
          result: null,
          error: jsonStr,
          json: jsonStr
        };
      }
      buffer = [];
    } else if (trimmedLine.startsWith('[CLD]') || trimmedLine.startsWith('[MCP]') || trimmedLine.startsWith('[NPM]')) {
      if (currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      }
      events.push({
        direction: 'system',
        method: 'log',
        id: null,
        message: trimmedLine,
        json: ''
      });
    } else if (trimmedLine.includes('{') && trimmedLine.includes('"jsonrpc"')) {
      let cleanedLine = fixTruncatedJson(trimmedLine);
      try {
        const json = JSON.parse(cleanedLine);
        if (json.method) {
          if (currentEvent) events.push(currentEvent);
          currentEvent = {
            direction: 'request',
            method: json.method || 'unknown',
            id: json.id,
            params: json.params,
            json: cleanedLine
          };
        } else if (json.result !== undefined || json.error) {
          if (currentEvent) events.push(currentEvent);
          currentEvent = {
            direction: json.error ? 'error' : 'response',
            method: currentEvent?.method || 'unknown',
            id: json.id,
            result: json.result,
            error: json.error,
            json: cleanedLine
          };
        } else {
          buffer.push(cleanedLine);
        }
      } catch {
        buffer.push(cleanedLine);
      }
    } else if (trimmedLine.includes('[...') && trimmedLine.includes('truncated]')) {
      buffer.push(trimmedLine);
    } else if (trimmedLine) {
      if (currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      }
      events.push({
        direction: 'system',
        method: 'log',
        id: null,
        message: trimmedLine,
        json: ''
      });
    }
  }

  if (currentEvent) {
    events.push(currentEvent);
  }

  return events;
}

function renderStructuredLog() {
  const listEl = document.getElementById('logEventsList');
  const filter = document.getElementById('logFilterInput').value.toLowerCase();

  let filteredEvents = currentLogEvents;
  if (filter) {
    filteredEvents = currentLogEvents.filter(event => {
      if (event.method?.toLowerCase().includes(filter)) return true;
      if (event.message?.toLowerCase().includes(filter)) return true;
      if (event.json?.toLowerCase().includes(filter)) return true;
      return false;
    });
  }

  if (filteredEvents.length === 0) {
    listEl.innerHTML = '<div class="log-empty">No events to display</div>';
    return;
  }

  listEl.innerHTML = filteredEvents.map((event, idx) => {
    const dirClass = event.direction === 'request' ? 'request' : event.direction === 'response' ? 'response' : 'error';
    const dirLabel = event.direction.toUpperCase();
    const methodColor = getMethodColor(event.method);

    let bodyHtml = '';
    if (event.json && event.direction !== 'system') {
      bodyHtml = `<div class="log-event-body"><pre>${syntaxHighlightJson(event.json)}</pre></div>`;
    } else if (event.message) {
      bodyHtml = `<div class="log-event-body"><pre>${escapeHtml(event.message)}</pre></div>`;
    }

    return `
      <div class="log-event" data-idx="${idx}">
        <div class="log-event-header">
          <span class="log-event-direction ${dirClass}">${dirLabel}</span>
          <span class="log-event-method" style="color: ${methodColor}">${escapeHtml(event.method)}</span>
          ${event.id !== null && event.id !== undefined ? `<span class="log-event-id">#${event.id}</span>` : ''}
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');
}

function getMethodColor(method) {
  const colors = {
    'initialize': '#10b981',
    'initialize/result': '#10b981',
    'tools/list': '#8b5cf6',
    'tools/list/result': '#8b5cf6',
    'tools/call': '#f59e0b',
    'tools/call/result': '#f59e0b',
    'resources/list': '#3b82f6',
    'resources/list/result': '#3b82f6',
    'resources/read': '#3b82f6',
    'resources/read/result': '#3b82f6',
    'prompts/list': '#ec4899',
    'prompts/list/result': '#ec4899',
    'notifications/initialized': '#6366f1',
    'sampling/create_message': '#14b8a6',
    'sampling/create_message/result': '#14b8a6',
    'cancel': '#ef4444',
    'ping': '#84cc16'
  };
  return colors[method] || 'var(--text-primary)';
}

function syntaxHighlightJson(json) {
  if (!json) return '';
  try {
    const parsed = JSON.parse(json);
    return syntaxHighlightObject(parsed);
  } catch {
    return escapeHtml(json).replace(/(".*?")/g, '<span class="string">$1</span>');
  }
}

function syntaxHighlightObject(obj) {
  if (typeof obj === 'string') {
    return `<span class="string">"${escapeHtml(obj)}"</span>`;
  } else if (typeof obj === 'number') {
    return `<span class="number">${obj}</span>`;
  } else if (typeof obj === 'boolean') {
    return `<span class="boolean">${obj}</span>`;
  } else if (obj === null) {
    return `<span class="null">null</span>`;
  } else if (Array.isArray(obj)) {
    const items = obj.map(item => syntaxHighlightObject(item)).join(', ');
    return `[${items}]`;
  } else if (typeof obj === 'object') {
    const entries = Object.entries(obj).map(([key, val]) => {
      return `<span class="key">"${escapeHtml(key)}"</span>: ${syntaxHighlightObject(val)}`;
    }).join(', ');
    return `{${entries}}`;
  }
  return String(obj);
}

function displayLog(logText) {
  const logContent = document.getElementById('logContent');
  const filter = document.getElementById('logFilterInput').value.toLowerCase();

  if (filter) {
    const lines = logText.split('\n');
    const filtered = lines.filter(line => line.toLowerCase().includes(filter));
    logContent.textContent = filtered.join('\n');
  } else {
    logContent.textContent = logText;
  }
}

function filterLog() {
  displayLog(currentLogRaw);
  if (logViewMode === 'structured') {
    renderStructuredLog();
  }
}

function renderCatalog(catalog) {
  const body = document.getElementById('catalogModalBody');
  if (catalog.length === 0) {
    body.innerHTML = '<div class="no-env-vars">No matching servers found</div>';
    return;
  }

  body.innerHTML = '<div class="catalog-list">' + catalog.map(server => `
    <div class="catalog-item">
      <div class="catalog-item-info">
        <div class="catalog-item-header">
          <div class="catalog-item-name">${escapeHtml(server.name)}</div>
          <div class="catalog-item-package">${escapeHtml(server.package)}</div>
        </div>
        <div class="catalog-item-description">${escapeHtml(server.description)}</div>
        <div class="catalog-item-features">
          ${server.features.map(f => '<span class="catalog-feature">' + escapeHtml(f) + '</span>').join('')}
        </div>
        <div class="catalog-item-env">
          <strong>Env:</strong> ${server.env.join(', ')}
        </div>
      </div>
      <div class="catalog-item-action">
        <button class="btn btn-sm btn-success" data-add-catalog="${escapeHtml(server.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add
        </button>
      </div>
    </div>
  `).join('') + '</div>';

  body.querySelectorAll('[data-add-catalog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const serverName = btn.dataset.addCatalog;
      addCatalogServer(serverName);
    });
  });
}

async function addCatalogServer(serverName) {
  const catalogItem = MCP_CATALOG.find(s => s.name === serverName);
  if (!catalogItem) return;

  const existingServer = currentServers.find(s => s.name === serverName);
  if (existingServer) {
    if (!confirm(`Server "${serverName}" already exists. Replace it?`)) {
      return;
    }
  }

  const globalEnv = loadFromLocalStorage() || {};
  const env = {};
  catalogItem.env.forEach(key => {
    env[key] = globalEnv[key] || '';
  });

  const newServer = {
    name: catalogItem.name,
    command: catalogItem.command,
    args: [...catalogItem.args],
    env: env
  };

  try {
    const response = await fetch('/api/config/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: serverName, config: newServer }),
    });

    const result = await response.json();

    if (result.success) {
      showToast(`Server "${serverName}" added`, 'success');
      hideCatalogModal();
      await loadConfig();
    } else {
      showToast(result.message || 'Failed to add server', 'error');
    }
  } catch (err) {
    showToast(`Failed to add server: ${err.message}`, 'error');
  }
}

function hideModal() {
  serverModal.classList.add('hidden');
  modalBody.innerHTML = '';
  modalFooter.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function maskValue(value) {
  if (value.length > 20) {
    return value.substring(0, 8) + '...' + value.substring(value.length - 4);
  }
  return value;
}

configTextarea.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = configTextarea.selectionStart;
    const end = configTextarea.selectionEnd;
    configTextarea.value = configTextarea.value.substring(0, start) + '  ' + configTextarea.value.substring(end);
    configTextarea.selectionStart = configTextarea.selectionEnd = start + 2;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveRawConfig();
  }
});

let validationTimeout = null;
configTextarea.addEventListener('input', () => {
  clearTimeout(validationTimeout);
  validationTimeout = setTimeout(() => {
    try {
      JSON.parse(configTextarea.value);
      configTextarea.style.borderColor = '';
      hideToast();
    } catch (err) {
      if (err instanceof SyntaxError) {
        configTextarea.style.borderColor = 'var(--error)';
      }
    }
  }, 500);
});

refreshBtn.addEventListener('click', loadConfig);
restartBtn.addEventListener('click', restartClaude);
viewConfigBtn.addEventListener('click', () => {
  hideGlobalEnv();
  if (configEditorOpen) {
    hideConfigEditor();
  } else {
    showConfigEditor();
  }
});
viewGlobalEnvBtn.addEventListener('click', () => {
  hideConfigEditor();
  if (globalEnvOpen) {
    hideGlobalEnv();
  } else {
    showGlobalEnv();
  }
});
editConfigBtn.addEventListener('click', enterEditMode);
saveConfigBtn.addEventListener('click', saveRawConfig);
cancelConfigBtn.addEventListener('click', exitEditMode);
closeConfigBtn.addEventListener('click', hideConfigEditor);
closeGlobalEnvBtn.addEventListener('click', hideGlobalEnv);

document.getElementById('addServerBtn').addEventListener('click', () => {
  showCatalogModal();
});

document.getElementById('catalogModalClose').addEventListener('click', hideCatalogModal);
document.getElementById('catalogModal').querySelector('.modal-backdrop').addEventListener('click', hideCatalogModal);

document.getElementById('logModalClose').addEventListener('click', hideLogModal);
document.getElementById('logModal').querySelector('.modal-backdrop').addEventListener('click', hideLogModal);
document.getElementById('toggleLogTailBtn').addEventListener('click', toggleLogTail);
document.getElementById('refreshLogBtn').addEventListener('click', () => {
  if (currentLogServer) {
    loadLog(currentLogServer);
  }
});
document.getElementById('clearLogFilterBtn').addEventListener('click', () => {
  document.getElementById('logFilterInput').value = '';
  filterLog();
});
document.getElementById('logFilterInput').addEventListener('input', filterLog);
document.getElementById('logViewRawBtn').addEventListener('click', () => setLogView('raw'));
document.getElementById('logViewStructuredBtn').addEventListener('click', () => setLogView('structured'));

document.getElementById('catalogSearchInput').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = MCP_CATALOG.filter(server =>
    server.name.toLowerCase().includes(query) ||
    server.command.toLowerCase().includes(query) ||
    (server.description && server.description.toLowerCase().includes(query))
  );
  renderCatalog(filtered);
});

modalClose.addEventListener('click', () => {
  const saveBtn = document.getElementById('saveServerBtn');
  if (saveBtn) {
    saveBtn.click();
  } else {
    hideModal();
  }
});
serverModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  const saveBtn = document.getElementById('saveServerBtn');
  if (saveBtn) {
    saveBtn.click();
  } else {
    hideModal();
  }
});
document.getElementById('jsonModalClose').addEventListener('click', hideJsonModal);
document.getElementById('jsonModal').querySelector('.modal-backdrop').addEventListener('click', hideJsonModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (configEditMode) {
      exitEditMode();
    } else if (configEditorOpen) {
      hideConfigEditor();
    } else if (globalEnvOpen) {
      hideGlobalEnv();
    } else if (!document.getElementById('logModal').classList.contains('hidden')) {
      hideLogModal();
    } else if (!document.getElementById('jsonModal').classList.contains('hidden')) {
      hideJsonModal();
    } else if (!document.getElementById('catalogModal').classList.contains('hidden')) {
      hideCatalogModal();
    } else if (!serverModal.classList.contains('hidden')) {
      const saveBtn = document.getElementById('saveServerBtn');
      if (saveBtn) {
        saveBtn.click();
      } else {
        hideModal();
      }
    } else {
      hideModal();
    }
  }
});

document.getElementById('addEnvBtn').addEventListener('click', () => {
  const keyInput = document.getElementById('newEnvKey');
  const valueInput = document.getElementById('newEnvValue');
  const key = keyInput.value.trim();
  const value = valueInput.value;

  if (!key) {
    showToast('Key cannot be empty', 'error');
    return;
  }

  addGlobalEnvVar(key, value);
  keyInput.value = '';
  valueInput.value = '';
});

loadConfig();
