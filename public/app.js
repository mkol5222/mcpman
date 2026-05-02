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
const editConfigBtn = document.getElementById('editConfigBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const cancelConfigBtn = document.getElementById('cancelConfigBtn');
const closeConfigBtn = document.getElementById('closeConfigBtn');
const serversListEl = document.getElementById('serversList');
const noServersEl = document.getElementById('noServers');
const refreshBtn = document.getElementById('refreshBtn');
const restartBtn = document.getElementById('restartBtn');
const serverModal = document.getElementById('serverModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');
const modalClose = document.getElementById('modalClose');

let currentOS = 'unknown';
let currentConfig = null;
let currentServers = [];
let configEditorOpen = false;
let configEditMode = false;

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

async function loadRawConfig() {
  try {
    const response = await fetch('/api/config/raw');
    const result = await response.json();

    if (result.success) {
      const formatted = JSON.stringify(JSON.parse(result.content), null, 2);
      configContent.textContent = formatted;
      configTextarea.value = formatted;
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

function renderServers(servers) {
  serversListEl.innerHTML = '';

  servers.forEach(server => {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.innerHTML = createServerCardHTML(server);
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.card-actions')) {
        showServerModal(server);
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

    serversListEl.appendChild(card);
  });

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
          <button class="btn btn-sm btn-toggle" data-toggle data-server="${escapeHtml(server.name)}" data-enable="${isDisabled}">
            ${toggleLabel}
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

function showServerModal(server) {
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
        <div class="detail-label">Environment Variables</div>
        <div class="env-vars">
          ${envVars.map(([key, value]) => `
            <div class="env-var">
              <span class="env-key">${escapeHtml(key)}</span>
              <span class="env-value">${maskValue(escapeHtml(value))}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = html;

  const toggleLabel = isDisabled ? 'Enable Server' : 'Disable Server';
  modalFooter.innerHTML = `
    <div class="toggle-container">
      <span class="toggle-label">${toggleLabel}</span>
      <label class="toggle">
        <input type="checkbox" id="modalToggle" ${isDisabled ? '' : 'checked'}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;

  const modalToggle = document.getElementById('modalToggle');
  modalToggle.addEventListener('change', async () => {
    const enable = modalToggle.checked;
    modalToggle.disabled = true;
    const success = await toggleServer(server.name, enable);
    modalToggle.disabled = false;

    if (success) {
      hideModal();
    } else {
      modalToggle.checked = !enable;
    }
  });

  serverModal.classList.remove('hidden');
}

function hideModal() {
  serverModal.classList.add('hidden');
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

refreshBtn.addEventListener('click', loadConfig);
restartBtn.addEventListener('click', restartClaude);
viewConfigBtn.addEventListener('click', () => {
  if (configEditorOpen) {
    hideConfigEditor();
  } else {
    showConfigEditor();
  }
});
editConfigBtn.addEventListener('click', enterEditMode);
saveConfigBtn.addEventListener('click', saveRawConfig);
cancelConfigBtn.addEventListener('click', exitEditMode);
closeConfigBtn.addEventListener('click', hideConfigEditor);
modalClose.addEventListener('click', hideModal);
serverModal.querySelector('.modal-backdrop').addEventListener('click', hideModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (configEditMode) {
      exitEditMode();
    } else if (configEditorOpen) {
      hideConfigEditor();
    } else {
      hideModal();
    }
  }
});

loadConfig();
