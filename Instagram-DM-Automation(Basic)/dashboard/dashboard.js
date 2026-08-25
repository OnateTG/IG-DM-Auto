// Instagram DM Automation Pro — Dashboard JavaScript (Premium Redesign)
// Compatible with existing background.js and content-script.js

// ============================================================
// GLOBAL STATE
// ============================================================
let currentCampaign = null;
let leads = [];
let isConnected = false;
let currentUsername = null;
let uploadedFileName = '';
let originalLeadsData = null;
let currentStats = null;
let refreshInterval = null;
let logsInterval = null;
let isPaused = false;

// CSV Processing State
let uploadedCSVHeaders = [];
let uploadedCSVData = [];
let selectedInstagramColumn = '';
let selectedMessageColumn = '';
let availablePlaceholders = [];
let wizardStep = 1;

// Toast System
function showToast({ title, message, type = 'info', duration = 4000 }) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message"><strong>${title}</strong>${message ? `<br><small>${message}</small>` : ''}</span>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, duration);
  }
}

function showWarning(message) { showToast({ title: 'Warning', message, type: 'warning' }); }

// Custom Confirmation Modal System
let confirmModalResolve = null;

function showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning', destructive = false }) {
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
    
    const modal = document.createElement('div');
    modal.className = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal ${destructive ? 'destructive' : ''}" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="confirm-icon">
          ${getConfirmIcon(type)}
        </div>
        <h3 id="confirm-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" id="confirm-cancel">${escapeHtml(cancelText)}</button>
          <button class="btn ${destructive ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = modal.querySelector('#confirm-cancel');
    const okBtn = modal.querySelector('#confirm-ok');
    
    cancelBtn.addEventListener('click', () => cleanup(false));
    okBtn.addEventListener('click', () => cleanup(true));
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(false);
    });
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cleanup(false);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    function cleanup(confirmed) {
      confirmModalResolve = null;
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
      resolve(confirmed);
    }
    
    setTimeout(() => cancelBtn.focus(), 0);
  });
}

function getConfirmIcon(type) {
  const icons = {
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
  };
  return icons[type] || icons.warning;
}

function showSuccess(message) { showToast({ title: 'Success', message, type: 'success' }); }
function showError(message) { showToast({ title: 'Error', message, type: 'error', duration: 6000 }); }
function showInfo(message) { showToast({ title: 'Info', message, type: 'info' }); }
function showWarning(message) { showToast({ title: 'Warning', message, type: 'warning' }); }

// Log Message Sanitization
function sanitizeLogMessage(message) {
  if (!message) return message;
  
  // Emojis to KEEP (key indicators only)
  const keepEmojis = ['✅', '❌', '⚠️', '🔧', '📊', '🗑️'];
  
  // Replace all emojis with empty string, except kept ones
  // This regex matches most emoji ranges
  let sanitized = message.replace(
    /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}])/gu,
    (match) => keepEmojis.includes(match) ? match : ''
  );
  
  // Clean up multiple spaces left by removed emojis
  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();
  
  return sanitized;
}

// HTML escaping utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
  console.log('Dashboard initializing...');
  await initializeDashboard();
  setupEventListeners();
  startPeriodicUpdates();
  console.log('Dashboard initialized successfully');
});

async function initializeDashboard() {
  try {
    await checkConnection();
    await loadSavedData();
    await loadCurrentCampaign();
    updateUI();
    setupEventListeners();
    previewMessageForLead();
  } catch (error) {
    console.error('Dashboard initialization error:', error);
    showError('Failed to initialize dashboard: ' + error.message);
  }
}

function setupEventListeners() {
  if (window.__eventListenersSetup) return;
  window.__eventListenersSetup = true;
  
  // Tab Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Connection Controls
  document.getElementById('refreshConnectionBtn')?.addEventListener('click', refreshConnection);
  document.getElementById('openInstagramBtn')?.addEventListener('click', openInstagram);
  document.getElementById('openInstagramBtn2')?.addEventListener('click', openInstagram);
  document.getElementById('verifyAccountBtn')?.addEventListener('click', verifyAccount);
  document.getElementById('switchAccountBtn')?.addEventListener('click', switchAccount);
  
  // Campaign Form
  document.getElementById('campaignForm')?.addEventListener('submit', handleCampaignSubmit);
  document.getElementById('messageTemplate')?.addEventListener('input', () => {
    updateTemplateCharCount();
    previewMessageForLead();
  });
  document.getElementById('campaignName')?.addEventListener('input', updateCampaignButtonState);
  
  // Toggle checkboxes
  ['enableFollow', 'enableMessage', 'smartDelaysCampaign', 'smartDelaysSetting', 'skipPrivateCampaign', 'skipPrivateSetting', 'autoScrollLogs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoSaveSettings);
  });
  
  // Daily limits
  ['dailyFollows', 'dailyMessages', 'minDelayCampaign', 'minDelaySetting', 'maxDelayCampaign', 'maxDelaySetting'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoSaveSettings);
  });
  
  // Settings inputs
  ['dailyFollowsSetting', 'dailyMessagesSetting'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoSaveSettings);
  });

  document.getElementById('remoteHealingUrl')?.addEventListener('change', autoSaveSettings);
  
  // Leads
  document.getElementById('leadsFile')?.addEventListener('change', handleFileUpload);
  document.getElementById('uploadZone')?.addEventListener('click', () => document.getElementById('leadsFile')?.click());
  document.getElementById('uploadZone')?.addEventListener('dragover', handleDragOver);
  document.getElementById('uploadZone')?.addEventListener('dragleave', handleDragLeave);
  document.getElementById('uploadZone')?.addEventListener('drop', handleDrop);
  document.getElementById('clearLeadsBtn')?.addEventListener('click', clearLeads);
  document.getElementById('processLeadsBtn')?.addEventListener('click', processManualLeads);
  
  // Wizard
  document.getElementById('wizardNext1')?.addEventListener('click', () => wizardNext(2));
  document.getElementById('wizardNext2')?.addEventListener('click', () => wizardNext(3));
  document.getElementById('wizardFinish')?.addEventListener('click', finishWizard);
  document.querySelectorAll('[data-wizard-back]').forEach(btn => {
    btn.addEventListener('click', () => wizardBack());
  });
  document.getElementById('instagramColumnSelect')?.addEventListener('change', handleColumnSelection);
  document.getElementById('messageColumnSelect')?.addEventListener('change', () => {
    if (selectedInstagramColumn && leads.length > 0) previewMessageForLead();
  });
  
  // Stats
  document.getElementById('refreshStatsBtn')?.addEventListener('click', refreshStats);
  document.getElementById('downloadReportBtn')?.addEventListener('click', downloadCampaignReport);
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => setDateRange(btn));
  });
  
  // Settings
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('resetExtensionBtn')?.addEventListener('click', resetExtension);
  document.getElementById('testHealingBtn')?.addEventListener('click', testRemoteHealing);
  document.getElementById('showHealingGuideBtn')?.addEventListener('click', () => {
    document.getElementById('healingModal').showModal();
  });
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('healingModal').close();
  });
  document.getElementById('healingModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('healingModal').close();
  });
  document.getElementById('copyCodeBtn')?.addEventListener('click', copyCodeToClipboard);
  
  // Settings - new controls
  document.getElementById('resetTimingBtn')?.addEventListener('click', () => resetSection('timing'));
  document.getElementById('resetLimitsBtn')?.addEventListener('click', () => resetSection('limits'));
  document.getElementById('resetConfirm')?.addEventListener('input', updateResetButton);
  document.querySelectorAll('[data-stepper]').forEach(btn => {
    btn.addEventListener('click', handleStepper);
  });
  document.querySelectorAll('[data-stepper] + .stepper-input').forEach(input => {
    input.addEventListener('change', updateLimitHint);
  });
  document.getElementById('dailyFollowsSetting')?.addEventListener('input', () => syncLimitFields('follows'));
  document.getElementById('dailyMessagesSetting')?.addEventListener('input', () => syncLimitFields('messages'));
  document.getElementById('dailyFollows')?.addEventListener('input', () => syncLimitFields('follows'));
  document.getElementById('dailyMessages')?.addEventListener('input', () => syncLimitFields('messages'));
  document.getElementById('minDelaySetting')?.addEventListener('input', syncTimingFields);
  document.getElementById('maxDelaySetting')?.addEventListener('input', syncTimingFields);
  document.getElementById('smartDelaysSetting')?.addEventListener('change', syncTimingFields);
  document.getElementById('skipPrivateSetting')?.addEventListener('change', syncTimingFields);
  
  // Logs - new controls
  document.getElementById('refreshLogsBtn')?.addEventListener('click', () => refreshLogs(false));
  document.getElementById('clearLogsBtn')?.addEventListener('click', clearLogs);
  document.getElementById('autoScrollLogs')?.addEventListener('change', () => {
    // Setting persisted in applyLogFilters/displayLogs
  });
  document.getElementById('copyLogsBtn')?.addEventListener('click', copyLogs);
  
  // Level chips (replaces old level dropdown)
  document.querySelectorAll('.level-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.level-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyLogFilters();
    });
  });
  
  // Source filter dropdown
  document.getElementById('sourceFilter')?.addEventListener('change', applyLogFilters);
  document.getElementById('timeFilter')?.addEventListener('change', applyLogFilters);
  
  // Campaign Pause Button
  document.getElementById('pauseCampaignBtn')?.addEventListener('click', togglePauseCampaign);
  
  document.querySelectorAll('.log-group-header').forEach(header => {
    header.addEventListener('click', toggleLogGroup);
  });
  
  // Collapsible sections
  document.querySelectorAll('.collapsible-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = document.getElementById(btn.getAttribute('aria-controls'));
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      content.hidden = expanded;
    });
  });
  
  // Campaign completion listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CAMPAIGN_COMPLETED') {
      if (currentCampaign === message.campaignId) {
        console.log('Campaign completed signal received');
        currentCampaign = null;
        updateCampaignUI(false);
        stopStatsAutoRefresh();
        refreshStats();
        showSuccess('Campaign completed successfully!');
        
        // Clear logs interval if running
        if (logsInterval) { clearInterval(logsInterval); logsInterval = null; }
        if (refreshAbortController) { refreshAbortController.abort(); refreshAbortController = null; }
      }
    }
    
    if (message.type === 'CAMPAIGN_PAUSED') {
      if (currentCampaign === message.campaignId) {
        isPaused = message.paused;
        const pauseBtn = document.getElementById('pauseCampaignBtn');
        const pauseText = document.getElementById('pauseButtonText');
        if (pauseBtn && pauseText) {
          pauseBtn.setAttribute('aria-pressed', isPaused);
          pauseText.textContent = isPaused ? 'Resume' : 'Pause';
          pauseBtn.classList.toggle('btn-warning', isPaused);
          pauseBtn.classList.toggle('btn-secondary', !isPaused);
        }
        showInfo(isPaused ? 'Campaign paused' : 'Campaign resumed');
      }
    }
  });
}

// ============================================================
// CONNECTION MANAGEMENT
// ============================================================
async function checkConnection() {
  try {
    updateConnectionStatus('pending', 'Checking connection...');
    
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
    
    if (response && response.success) {
      isConnected = response.authenticated;
      currentUsername = response.username;
      
      if (isConnected && currentUsername) {
        updateConnectionStatus('connected', `Connected as @${currentUsername}`);
        updateAccountInfo(currentUsername);
        showConnectionActions(true);
      } else if (isConnected) {
        updateConnectionStatus('connected', 'Connected (username detection pending)');
        showConnectionActions(true);
      } else {
        updateConnectionStatus('disconnected', 'Not connected to Instagram');
        showConnectionActions(false);
      }
    } else {
      isConnected = false;
      currentUsername = null;
      updateConnectionStatus('disconnected', 'Connection failed');
      showConnectionActions(false);
    }
  } catch (error) {
    console.error('Connection check error:', error);
    isConnected = false;
    updateConnectionStatus('disconnected', 'Connection error');
    showConnectionActions(false);
  }
  updateUI();
}

function updateConnectionStatus(status, message) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  if (statusDot) {
    statusDot.className = `status-dot ${status}`;
  }
  if (statusText) {
    statusText.textContent = message;
  }
}

function updateAccountInfo(username) {
  const accountInfoBar = document.getElementById('accountInfoBar');
  const accountAvatar = document.getElementById('accountAvatar');
  const accountHandle = document.getElementById('accountHandle');
  const accountStatus = document.getElementById('accountStatus');
  
  if (accountInfoBar && username) {
    accountInfoBar.style.display = 'flex';
    if (accountAvatar) accountAvatar.textContent = username.charAt(0).toUpperCase();
    if (accountHandle) accountHandle.textContent = `@${username}`;
    if (accountStatus) accountStatus.textContent = 'Connected • Ready';
  }
}

function showConnectionActions(show) {
  const verifyBtn = document.getElementById('verifyAccountBtn');
  const switchBtn = document.getElementById('switchAccountBtn');
  
  if (verifyBtn) verifyBtn.style.display = show ? 'inline-flex' : 'none';
  if (switchBtn) switchBtn.style.display = show ? 'inline-flex' : 'none';
}

async function refreshConnection() {
  await checkConnection();
}

async function openInstagram() {
  try {
    await chrome.tabs.create({ url: 'https://www.instagram.com/', active: true });
    setTimeout(async () => { await checkConnection(); }, 3000);
  } catch (error) {
    console.error('Error opening Instagram:', error);
    showError('Failed to open Instagram');
  }
}

async function verifyAccount() {
  showInfo('Verifying account... Please wait.');
  await new Promise(resolve => setTimeout(resolve, 1000));
  await checkConnection();
}

async function switchAccount() {
  try {
    await chrome.tabs.create({ url: 'https://www.instagram.com/accounts/logout/', active: true });
    showInfo('Please log out and log in with the correct account, then refresh the connection.');
    setTimeout(async () => {
      isConnected = false;
      currentUsername = null;
      updateConnectionStatus('disconnected', 'Account switched - please reconnect');
      updateUI();
    }, 2000);
  } catch (error) {
    console.error('Error switching account:', error);
    showError('Failed to open logout page');
  }
}

// ============================================================
// CAMPAIGN MANAGEMENT
// ============================================================
let isCampaignTransitioning = false;

async function handleCampaignSubmit(e) {
  e.preventDefault();
  if (isCampaignTransitioning) return;
  
  if (!isConnected) { showError('Please connect to Instagram first'); return; }
  if (!leads || leads.length === 0) { showError('Please add leads first'); return; }
  
  const campaignName = document.getElementById('campaignName')?.value?.trim();
  if (!campaignName) { showError('Please enter a campaign name'); return; }
  
  isCampaignTransitioning = true;
  
  try {
    let isRunning = false;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CAMPAIGNS' });
      if (response && response.success && response.campaigns) {
        isRunning = response.campaigns.some(c => c.status === 'active');
        if (isRunning && !currentCampaign) currentCampaign = response.campaigns[0].id;
      }
    } catch (e) { console.error('Failed to check campaign status:', e); }
    
    if (currentCampaign || isRunning) {
      let stopOk = false;
      try {
        await stopCampaign();
        stopOk = true;
      } catch (stopErr) {
        console.error('Campaign stop failed:', stopErr);
      }
      if (!stopOk) {
        isCampaignTransitioning = false;
        return;
      }
    }
    await startCampaign();
  } catch (error) {
    console.error('Campaign toggle error:', error);
    showError('Failed to toggle campaign: ' + error.message);
  } finally {
    isCampaignTransitioning = false;
  }
}

async function startCampaign() {
  try {
    const startButton = document.getElementById('startCampaignBtn');
    const buttonText = document.getElementById('campaignButtonText');
    const loader = document.getElementById('campaignLoader');
    
    if (startButton) startButton.disabled = true;
    if (buttonText) buttonText.textContent = 'Starting Campaign...';
    if (loader) loader.style.display = 'inline-flex';
    if (startButton) startButton.classList.add('loading');
    
    const campaignData = getCampaignData();
    
    const response = await chrome.runtime.sendMessage({
      type: 'START_CAMPAIGN',
      data: campaignData
    });
    
    if (response && response.success) {
      currentCampaign = response.campaignId;
      updateCampaignUI(true);
      showSuccess('Campaign started successfully!');
      
      // Clear logs interval if running on logs tab
      if (logsInterval) { clearInterval(logsInterval); logsInterval = null; }
      if (refreshAbortController) { refreshAbortController.abort(); refreshAbortController = null; }
      
      setTimeout(() => {
        refreshStats();
        startStatsAutoRefresh();
      }, 2000);
    } else {
      throw new Error(response?.error || 'Failed to start campaign');
    }
  } catch (error) {
    console.error('Start campaign error:', error);
    showError('Failed to start campaign: ' + error.message);
    resetCampaignUI();
  }
}

async function stopCampaign() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_CAMPAIGN',
      campaignId: currentCampaign
    });
    
    if (response && response.success) {
      currentCampaign = null;
      updateCampaignUI(false);
      showSuccess('Campaign stopped successfully!');
      stopStatsAutoRefresh();
      
      // Clear logs interval if running
      if (logsInterval) { clearInterval(logsInterval); logsInterval = null; }
      if (refreshAbortController) { refreshAbortController.abort(); refreshAbortController = null; }
    } else {
      currentCampaign = null;
      updateCampaignUI(false);
      throw new Error(response?.error || 'Failed to stop campaign');
    }
  } catch (error) {
    console.error('Stop campaign error:', error);
    showError('Failed to stop campaign: ' + error.message);
  }
}

function getCampaignData() {
  const template = document.getElementById('messageTemplate')?.value || '';
  const messageColumn = document.getElementById('messageColumnSelect')?.value || '';
  
  return {
    name: document.getElementById('campaignName')?.value?.trim() || 'Untitled Campaign',
    leads: leads.map(lead => {
      const processedLead = { ...lead, message: null };
      if (messageColumn && Object.prototype.hasOwnProperty.call(lead, messageColumn)) {
        processedLead.message = processMessageTemplate(lead[messageColumn], processedLead);
      } else {
        processedLead.message = processMessageTemplate(template, processedLead);
      }
      return processedLead;
    }),
    settings: {
      followEnabled: document.getElementById('enableFollow')?.checked || false,
      messageEnabled: document.getElementById('enableMessage')?.checked || false,
      dailyFollows: parseInt(document.getElementById('dailyFollows')?.value) || 50,
      dailyMessages: parseInt(document.getElementById('dailyMessages')?.value) || 80,
      minDelay: (parseInt(document.getElementById('minDelayCampaign')?.value) || 30) * 1000,
      maxDelay: (parseInt(document.getElementById('maxDelayCampaign')?.value) || 120) * 1000,
      smartDelays: document.getElementById('smartDelaysCampaign')?.checked ?? true,
      skipPrivate: document.getElementById('skipPrivateCampaign')?.checked ?? true
    }
  };
}

function processMessageTemplate(template, lead) {
  let message = template;
  Object.keys(lead).forEach(key => {
    const value = lead[key] ?? '';
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    message = message.replace(regex, value);
  });
  if (message.includes('{{firstName}}') && !lead.firstName && lead.username) {
    const generatedFirstName = lead.username.split(/[._]/)[0];
    message = message.replace(/\{\{firstName\}\}/g, generatedFirstName);
  }
  return message;
}

function updateCampaignUI(isActive) {
  const startButton = document.getElementById('startCampaignBtn');
  const buttonText = document.getElementById('campaignButtonText');
  const loader = document.getElementById('campaignLoader');
  const connectionBanner = document.getElementById('connectionBanner');
  const pauseButton = document.getElementById('pauseCampaignBtn');
  
  if (startButton) startButton.disabled = false;
  if (loader) loader.style.display = 'none';
  if (startButton) startButton.classList.remove('loading');
  
  if (isActive) {
    if (startButton) { startButton.className = 'btn btn-danger btn-lg'; startButton.style.minWidth = '160px'; }
    if (buttonText) buttonText.textContent = 'Stop Campaign';
    if (connectionBanner) connectionBanner.hidden = true;
    if (pauseButton) { pauseButton.style.display = 'inline-flex'; pauseButton.disabled = false; }
  } else {
    resetCampaignUI();
  }
  
  // Always update button state based on actual campaign status
  updateCampaignButtonState();
}

function resetCampaignUI() {
  const startButton = document.getElementById('startCampaignBtn');
  const buttonText = document.getElementById('campaignButtonText');
  const loader = document.getElementById('campaignLoader');
  const connectionBanner = document.getElementById('connectionBanner');
  const pauseButton = document.getElementById('pauseCampaignBtn');
  
  if (startButton) { startButton.className = 'btn btn-primary btn-lg'; startButton.style.minWidth = '160px'; startButton.disabled = false; }
  if (buttonText) buttonText.textContent = 'Start Campaign';
  if (loader) loader.style.display = 'none';
  if (startButton) startButton.classList.remove('loading');
  if (connectionBanner && !isConnected) connectionBanner.hidden = false;
  if (pauseButton) { 
    pauseButton.style.display = 'none'; 
    pauseButton.setAttribute('aria-pressed', 'false'); 
    document.getElementById('pauseButtonText').textContent = 'Pause'; 
    pauseButton.classList.remove('btn-warning'); 
    pauseButton.classList.add('btn-secondary'); 
  }
  isPaused = false;
}

async function togglePauseCampaign() {
  if (!currentCampaign) return;
  
  isPaused = !isPaused;
  const pauseBtn = document.getElementById('pauseCampaignBtn');
  const pauseText = document.getElementById('pauseButtonText');
  
  if (isPaused) {
    pauseBtn.setAttribute('aria-pressed', 'true');
    pauseText.textContent = 'Resume';
    pauseBtn.classList.remove('btn-secondary');
    pauseBtn.classList.add('btn-warning');
    showInfo('Campaign paused');
  } else {
    pauseBtn.setAttribute('aria-pressed', 'false');
    pauseText.textContent = 'Pause';
    pauseBtn.classList.remove('btn-warning');
    pauseBtn.classList.add('btn-secondary');
    showInfo('Campaign resumed');
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'PAUSE_CAMPAIGN',
      campaignId: currentCampaign,
      paused: isPaused
    });
    
    if (!response || !response.success) {
      // Revert on failure
      isPaused = !isPaused;
      if (pauseBtn && pauseText) {
        pauseBtn.setAttribute('aria-pressed', isPaused);
        pauseText.textContent = isPaused ? 'Resume' : 'Pause';
        pauseBtn.classList.toggle('btn-warning', isPaused);
        pauseBtn.classList.toggle('btn-secondary', !isPaused);
      }
      showError('Failed to toggle pause: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Pause toggle error:', error);
    // Revert UI on network error
    isPaused = !isPaused;
    if (pauseBtn && pauseText) {
      pauseBtn.setAttribute('aria-pressed', isPaused);
      pauseText.textContent = isPaused ? 'Resume' : 'Pause';
      pauseBtn.classList.toggle('btn-warning', isPaused);
      pauseBtn.classList.toggle('btn-secondary', !isPaused);
    }
    showError('Failed to toggle pause: ' + error.message);
  }
}

function updateCampaignButtonState() {
  const startButton = document.getElementById('startCampaignBtn');
  if (!startButton) return;
  
  const hasLeads = leads && leads.length > 0;
  const campaignName = document.getElementById('campaignName')?.value?.trim();
  
  // If campaign is running, don't override the danger/stop state set by updateCampaignUI
  if (currentCampaign) {
    startButton.disabled = false;
    startButton.style.opacity = '1';
    // Preserve the danger class and "Stop Campaign" text set by updateCampaignUI
    if (!startButton.classList.contains('btn-danger')) {
      startButton.className = 'btn btn-danger btn-lg';
      startButton.style.minWidth = '160px';
    }
    const buttonText = document.getElementById('campaignButtonText');
    if (buttonText && buttonText.textContent !== 'Stop Campaign') {
      buttonText.textContent = 'Stop Campaign';
    }
    const pauseButton = document.getElementById('pauseCampaignBtn');
    if (pauseButton) { pauseButton.style.display = 'inline-flex'; pauseButton.disabled = false; }
    const connectionBanner = document.getElementById('connectionBanner');
    if (connectionBanner) connectionBanner.hidden = true;
    return;
  }
  
  // No campaign running - enable if ready to start
  if (!isConnected || !hasLeads || !campaignName) {
    startButton.disabled = true;
    startButton.style.opacity = '0.6';
  } else {
    startButton.disabled = false;
    startButton.style.opacity = '1';
  }
}

// ============================================================
// PREVIEW FUNCTIONS
// ============================================================
function updateTemplateCharCount() {
  const template = document.getElementById('messageTemplate')?.value || '';
  const charCount = document.getElementById('templateCharCount');
  if (charCount) charCount.textContent = `${template.length} characters`;
}

function showMessagePreview(lead, message) {
  const previewSection = document.getElementById('messagePreviewSection');
  const emptyState = document.getElementById('previewEmptyState');
  const contactName = document.getElementById('previewName');
  const contactHandle = document.getElementById('previewUsername');
  const avatar = document.getElementById('previewAvatar');
  const messageText = document.getElementById('previewMessageText');
  const charCount = document.getElementById('previewCharCount');
  const footerCharCount = document.getElementById('previewFooterCharCount');
  const warning = document.getElementById('previewPlaceholderWarning');
  
  if (contactName) contactName.textContent = lead.firstName || lead.username || 'Full Name';
  if (contactHandle) contactHandle.textContent = `@${lead.username || 'username'}`;
  if (avatar) avatar.textContent = (lead.username || 'U').charAt(0).toUpperCase();
  if (messageText) messageText.textContent = message || 'Enter a message template to see preview';
  
  if (charCount) {
    charCount.textContent = `${message.length} characters`;
    charCount.style.color = '#8E8E8E';
  }
  if (footerCharCount) footerCharCount.textContent = `${message.length} characters`;
  
  // Check for unreplaced placeholders
  const unreplaced = message.match(/\{\{[^}]+\}\}/g);
  if (unreplaced && unreplaced.length > 0) {
    if (warning) warning.hidden = false;
  } else {
    if (warning) warning.hidden = true;
  }
  
  if (previewSection) previewSection.style.display = 'block';
  if (emptyState) emptyState.hidden = true;
}

function hideMessagePreview() {
  const previewSection = document.getElementById('messagePreviewSection');
  const emptyState = document.getElementById('previewEmptyState');
  if (previewSection) previewSection.style.display = 'none';
  if (emptyState) emptyState.hidden = false;
}

function previewMessageForLead() {
  const template = document.getElementById('messageTemplate')?.value;
  const messageColumn = document.getElementById('messageColumnSelect')?.value;
  const hasLeads = leads.length > 0;
  const lead = hasLeads ? leads[0] : { username: 'username', firstName: 'firstName' };

  if (messageColumn && hasLeads && lead[messageColumn]) {
    showMessagePreview(lead, processMessageTemplate(lead[messageColumn], lead));
  } else if (template) {
    showMessagePreview(lead, processMessageTemplate(template, lead));
  } else {
    showMessagePreview(lead, 'Enter a message template to see preview');
  }

  updatePlaceholderChips();
}

function updatePlaceholderChips() {
  const container = document.getElementById('placeholderChips');
  if (!container) return;
  
  if (availablePlaceholders.length > 0) {
    container.innerHTML = availablePlaceholders.map(p => 
      `<span class="placeholder-chip" data-placeholder="${p}" title="Click to copy">{{${p}}}</span>`
    ).join('');
    
    container.querySelectorAll('.placeholder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ph = chip.dataset.placeholder;
        navigator.clipboard.writeText(`{{${ph}}}`).then(() => {
          showToast({ title: 'Copied', message: `{{${ph}}} copied to clipboard`, type: 'success', duration: 2000 });
        });
      });
    });
  } else {
    container.innerHTML = '';
  }
}

// ============================================================
// LEAD MANAGEMENT
// ============================================================
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  uploadedFileName = file.name;
  
  try {
    const content = await readFileContent(file);
    originalLeadsData = content;
    
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      parseCSVWithPapa(content);
    } else {
      const processedLeads = await parseLeadsFromContent(content, 'text/plain');
      if (processedLeads.length > 0) {
        leads = processedLeads;
        await updateLeadsDisplay();
        showSuccess(`Loaded ${processedLeads.length} leads from ${file.name}`);
      } else {
        showError('No valid leads found in the file');
      }
    }
  } catch (error) {
    console.error('File upload error:', error);
    showError('Failed to process file: ' + error.message);
  }
}

function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function parseLeadsFromContent(content, fileType) {
  const leads = [];
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  
  for (const line of lines) {
    const username = extractUsername(line);
    if (username) {
      leads.push({ username, firstName: username.split(/[._]/)[0], source: 'text' });
    }
  }
  return leads;
}

function parseCSVWithPapa(content) {
  try {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const rawFields = results.meta.fields || [];
        const sanitizedMap = {};
        const sanitizedHeaders = rawFields.map(field => {
          const clean = field.replace(/^\uFEFF/, '').trim().replace(/^["']|["']$/g, '');
          sanitizedMap[field] = clean;
          return clean;
        });
        
        const sanitizedData = results.data.map(row => {
          const newRow = {};
          for (const [rawField, value] of Object.entries(row)) {
            const cleanField = sanitizedMap[rawField] || rawField;
            newRow[cleanField] = value;
          }
          return newRow;
        });
        
        uploadedCSVHeaders = sanitizedHeaders;
        uploadedCSVData = sanitizedData;
        showMappingWizard();
        showSuccess(`CSV parsed: ${uploadedCSVData.length} rows, ${sanitizedHeaders.length} columns`);
      },
      error: function(error) {
        console.error('CSV parse error:', error);
        showError('Failed to parse CSV: ' + error.message);
      }
    });
  } catch (error) {
    console.error('PapaParse error:', error);
    showError('Failed to parse CSV file');
  }
}

function showMappingWizard() {
  const wizard = document.getElementById('mappingWizard');
  const meta = document.getElementById('csvMeta');
  const preview = document.getElementById('csvPreview');
  const select = document.getElementById('instagramColumnSelect');
  
  if (!wizard || !meta || !preview || !select) return;
  
  meta.textContent = `${uploadedCSVData.length} rows • ${uploadedCSVHeaders.length} columns`;
  
  // Preview table
  const previewRows = uploadedCSVData.slice(0, 5);
  preview.innerHTML = `
    <table>
      <thead><tr>${uploadedCSVHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${previewRows.map(row => `<tr>${uploadedCSVHeaders.map(h => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
  
  // Populate column select
  select.innerHTML = '<option value="">Select the column with Instagram handles</option>';
  uploadedCSVHeaders.forEach(header => {
    const option = document.createElement('option');
    option.value = header;
    option.textContent = header;
    select.appendChild(option);
  });
  
  // Auto-suggest Instagram column
  const suggested = uploadedCSVHeaders.find(h => 
    /username|handle|instagram|ig|url|profile/i.test(h)
  );
  if (suggested) select.value = suggested;
  
  // Populate message column select
  const messageSelect = document.getElementById('messageColumnSelect');
  if (messageSelect) {
    messageSelect.innerHTML = '<option value="">Use global template for all leads</option>';
    uploadedCSVHeaders.forEach(header => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      messageSelect.appendChild(option);
    });
  }
  
  wizard.hidden = false;
  wizardStep = 1;
  updateWizardUI();
  
  wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Handle column selection in wizard step 2
function handleColumnSelection() {
  selectedInstagramColumn = document.getElementById('instagramColumnSelect')?.value;
  
  if (selectedInstagramColumn) {
    availablePlaceholders = uploadedCSVHeaders.filter(h => h !== selectedInstagramColumn);
    
    const messageGroup = document.getElementById('messageColumnGroup');
    if (messageGroup) messageGroup.hidden = false;
  }
  
  updatePlaceholderGrid();
}

function updateWizardUI() {
  document.querySelectorAll('.progress-step').forEach((step, i) => {
    const stepNum = i + 1;
    step.classList.toggle('active', stepNum === wizardStep);
    step.classList.toggle('completed', stepNum < wizardStep);
  });
  
  document.querySelectorAll('.wizard-panel').forEach(panel => {
    panel.classList.toggle('active', parseInt(panel.dataset.step) === wizardStep);
  });
  
  const backBtn = document.querySelector('[data-wizard-back]');
  if (backBtn) backBtn.disabled = wizardStep === 1;
}

function wizardNext(step) {
  if (step === 2) {
    selectedInstagramColumn = document.getElementById('instagramColumnSelect')?.value;
    if (!selectedInstagramColumn) { showError('Please select the Instagram column'); return; }
    
    availablePlaceholders = uploadedCSVHeaders.filter(h => h !== selectedInstagramColumn);
    
    const messageGroup = document.getElementById('messageColumnGroup');
    if (messageGroup) messageGroup.hidden = false;
  }
  
  if (step === 3) {
    selectedMessageColumn = document.getElementById('messageColumnSelect')?.value || '';
    updatePlaceholderGrid();
  }
  
  wizardStep = step;
  updateWizardUI();
}

function wizardBack() {
  if (wizardStep > 1) {
    wizardStep--;
    updateWizardUI();
  }
}

function updatePlaceholderGrid() {
  const grid = document.getElementById('placeholderGrid');
  if (!grid) return;
  
  if (availablePlaceholders.length > 0) {
    grid.innerHTML = availablePlaceholders.map(p => 
      `<span class="placeholder-chip" data-placeholder="${p}" title="Click to copy">{{${p}}}</span>`
    ).join('');
    
    grid.querySelectorAll('.placeholder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        navigator.clipboard.writeText(`{{${chip.dataset.placeholder}}}`).then(() => {
          showToast({ title: 'Copied', message: `{{${chip.dataset.placeholder}}} copied`, type: 'success', duration: 2000 });
        });
      });
    });
  } else {
    grid.innerHTML = '<p style="color: var(--text-muted); font-size: var(--text-sm);">No additional placeholders available</p>';
  }
}

async function finishWizard() {
  if (!selectedInstagramColumn) { showError('Please select the Instagram column'); return; }
  
  const parsedLeads = parseLeadsFromCSVData(uploadedCSVData, selectedInstagramColumn);
  
  if (parsedLeads.length > 0) {
    leads = parsedLeads;
    await updateLeadsDisplay();
    showSuccess(`Loaded ${parsedLeads.length} lead${parsedLeads.length !== 1 ? 's' : ''} from CSV`);
    
    const wizard = document.getElementById('mappingWizard');
    if (wizard) wizard.hidden = true;
    
    previewMessageForLead();
  }
}

function parseLeadsFromCSVData(csvData, instagramColumn) {
  const parsed = [];
  let skippedCount = 0, emptyCount = 0, invalidCount = 0;
  const skippedExamples = [];
  
  csvData.forEach((row, index) => {
    const instagramValue = row[instagramColumn];
    
    if (instagramValue === undefined || instagramValue === null || String(instagramValue).trim() === '') {
      emptyCount++; skippedCount++;
      if (skippedExamples.length < 3 && !skippedExamples.includes('(empty)')) skippedExamples.push('(empty)');
      return;
    }
    
    const username = extractUsername(String(instagramValue));
    
    if (username) {
      const lead = { username, ...row, _instagramColumn: instagramColumn, _sourceRow: index + 1 };
      parsed.push(lead);
    } else {
      skippedCount++; invalidCount++;
      const val = String(instagramValue).substring(0, 30);
      if (skippedExamples.length < 3) skippedExamples.push(val);
    }
  });
  
  if (skippedCount > 0) {
    const parts = [];
    if (emptyCount > 0) parts.push(`${emptyCount} empty cells`);
    if (invalidCount > 0) parts.push(`${invalidCount} invalid values`);
    
    if (parsed.length === 0) {
      showError(`No valid Instagram handles in "${instagramColumn}". Skipped: ${skippedCount} rows (${parts.join(', ')}). Examples: "${skippedExamples.join('", "')}"`);
    } else {
      showWarning(`Loaded ${parsed.length} leads. ${skippedCount} rows skipped (${parts.join(', ')}).`);
    }
  }
  
  return parsed;
}

function extractUsername(input) {
  if (!input || typeof input !== 'string') return null;
  input = input.trim();
  
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{1,30})(?:\?[^\s]*)?/i;
  const urlMatch = input.match(urlPattern);
  if (urlMatch) return urlMatch[1];
  
  if (input.startsWith('@')) input = input.substring(1);
  
  if (/^[a-zA-Z0-9._]{1,30}$/.test(input)) return input;
  
  return null;
}

async function processManualLeads() {
  const manualLeadsText = document.getElementById('manualLeads')?.value?.trim();
  
  if (manualLeadsText) {
    try {
      const processedLeads = await parseLeadsFromContent(manualLeadsText, 'text/plain');
      
      if (processedLeads.length > 0) {
        leads = [...leads, ...processedLeads];
        await updateLeadsDisplay();
        showSuccess(`Processed ${processedLeads.length} manual leads`);
        document.getElementById('manualLeads').value = '';
      } else {
        showError('No valid usernames found in the text');
      }
    } catch (error) {
      console.error('Process leads error:', error);
      showError('Failed to process leads: ' + error.message);
    }
  } else if (leads.length === 0) {
    showError('Please upload a file or enter leads manually');
  } else {
    showSuccess('Leads are already loaded and ready');
  }
  
  await saveLeads();
}

async function updateLeadsDisplay() {
  const leadsList = document.getElementById('leadsList');
  const leadsCount = document.getElementById('leadsCount');
  
  if (leadsCount) leadsCount.textContent = leads.length;
  
  if (leadsList) {
    if (leads.length === 0) {
      Array.from(leadsList.children).forEach(child => {
        if (child.id !== 'emptyLeadsState') child.remove();
      });
      const emptyState = document.getElementById('emptyLeadsState');
      if (emptyState) emptyState.style.display = 'table-row';
      return;
    }
    
    const emptyState = document.getElementById('emptyLeadsState');
    if (emptyState) emptyState.style.display = 'none';
    
    let detailedResults = [];
    if (currentCampaign) {
      try {
        const stored = await chrome.storage.local.get(`campaign_${currentCampaign}`);
        const campaign = stored[`campaign_${currentCampaign}`];
        if (campaign?.detailedResults) detailedResults = campaign.detailedResults;
      } catch (e) {
        console.debug('Could not load campaign results:', e);
      }
    }
    
    const leadsHTML = leads.map((lead, index) => {
      const previewData = Object.entries(lead)
        .filter(([k]) => !k.startsWith('_') && k !== 'username' && k !== 'firstName')
        .slice(0, 3)
        .map(([k, v]) => `<span class="preview-data-item"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v).substring(0, 30))}</span>`)
        .join(' ');
      
      const statusInfo = getLeadStatus(index, detailedResults);
      
      return `
        <tr data-index="${index}">
          <td>${index + 1}</td>
          <td><strong>@${escapeHtml(lead.username)}</strong></td>
          <td><span class="preview-data">${previewData || '<span style="color:var(--text-muted)">—</span>'}</span></td>
          <td>${statusInfo.html}</td>
          <td>
            <div class="lead-actions">
              <button class="lead-action-btn" data-action="preview" title="Preview DM" aria-label="Preview DM">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14 2 2z"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Preserve empty state row: only remove existing lead rows, then add new ones
    const existingRows = Array.from(leadsList.querySelectorAll('tr:not(#emptyLeadsState)'));
    existingRows.forEach(row => row.remove());
    const temp = document.createElement('div');
    temp.innerHTML = leadsHTML;
    Array.from(temp.children).forEach(row => leadsList.appendChild(row));
    
    // Add preview button listeners
    leadsList.querySelectorAll('[data-action="preview"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const index = parseInt(row.dataset.index);
        if (index >= 0 && index < leads.length) {
          const lead = leads[index];
          const template = document.getElementById('messageTemplate')?.value || '';
          const messageColumn = document.getElementById('messageColumnSelect')?.value;
          
          let message;
          if (messageColumn && Object.prototype.hasOwnProperty.call(lead, messageColumn)) {
            message = processMessageTemplate(lead[messageColumn], lead);
          } else {
            message = processMessageTemplate(template, lead);
          }
          showMessagePreview(lead, message);
        }
      });
    });
  }
}

function getLeadStatus(index, detailedResults) {
  if (!currentCampaign || !detailedResults) {
    return { html: '<span class="lead-status pending">Pending</span>' };
  }
  
  const result = detailedResults[index]?.result;
  if (result) {
    const parts = [];
    if (result.followed) parts.push('<span class="status-badge followed">✓ Followed</span>');
    if (result.messaged) parts.push('<span class="status-badge messaged">✓ Messaged</span>');
    if (result.wasAlreadyFollowing) parts.push('<span class="status-badge already-following">Already Following</span>');
    if (result.error) {
      const errorMsg = result.error.toLowerCase();
      if (errorMsg.includes('private') || errorMsg.includes('skip')) {
        parts.push('<span class="status-badge private">Private Account</span>');
      } else {
        parts.push('<span class="status-badge error">Error: ' + escapeHtml(result.error.substring(0, 40)) + '</span>');
      }
    }
    if (parts.length === 0) {
      parts.push('<span class="lead-status pending">Pending</span>');
    }
    return { html: parts.join(' ') };
  }
  
  return { html: '<span class="lead-status pending">Pending</span>' };
}

async function clearLeads() {
  const confirmed = await showConfirm({
    title: 'Clear All Leads',
    message: 'Are you sure you want to clear all leads?',
    confirmText: 'Clear',
    cancelText: 'Cancel',
    type: 'warning',
    destructive: true
  });
  if (!confirmed) return;
  
  leads = [];
  originalLeadsData = null;
  uploadedCSVHeaders = [];
  uploadedCSVData = [];
  selectedInstagramColumn = '';
  selectedMessageColumn = '';
  availablePlaceholders = [];
  
  await updateLeadsDisplay();
  updatePlaceholderChips();
  
  const fileInput = document.getElementById('leadsFile');
  if (fileInput) fileInput.value = '';
  
  const wizard = document.getElementById('mappingWizard');
  if (wizard) wizard.hidden = true;
  
  await saveLeads();
  showSuccess('All leads cleared');
}

async function saveLeads() {
  try {
    await chrome.storage.local.set({ leads, leadsData: originalLeadsData });
  } catch (error) { console.error('Error saving leads:', error); }
}

// ============================================================
// STATS MANAGEMENT
// ============================================================
async function refreshStats() {
  if (!currentCampaign) {
    updateStatsDisplay({
      processed: 0, followed: 0, messaged: 0, errors: 0,
      todayFollows: 0, todayMessages: 0, skipped: 0, successful: 0,
      failedFollows: 0, failedMessages: 0,
      runTime: 0, replied: 0
    });
    return;
  }
  
  try {
    const [basicResponse, detailedResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_STATS', campaignId: currentCampaign }),
      chrome.runtime.sendMessage({ type: 'GET_DETAILED_STATS', campaignId: currentCampaign })
    ]);
    
    let mergedStats = {};
    
    if (basicResponse && basicResponse.success) {
      currentStats = basicResponse.stats;
      mergedStats = { ...basicResponse.stats };
    }
    
    if (detailedResponse && detailedResponse.success) {
      const detailed = detailedResponse.stats;
      // Merge detailed stats (runTime, replied, performance, etc.)
      if (detailed.runTime !== undefined) mergedStats.runTime = detailed.runTime;
      if (detailed.replied !== undefined) mergedStats.replied = detailed.replied;
      if (detailed.metadata?.runTime !== undefined) mergedStats.runTime = detailed.metadata.runTime;
      // Calculate replied from detailedResults if not directly available
      if (mergedStats.replied === undefined && Array.isArray(detailed.detailedResults)) {
        mergedStats.replied = detailed.detailedResults.filter(r => r.replied).length;
      }
      updateDetailedStats(detailed);
    }
    
    updateStatsDisplay(mergedStats);
    
  } catch (error) {
    console.error('Stats refresh error:', error);
    showError('Failed to refresh stats');
  }
}

function updateStatsDisplay(stats) {
  // Quick stats
  const statLeadsLoaded = document.getElementById('statLeadsLoaded');
  if (statLeadsLoaded) statLeadsLoaded.textContent = leads.length || 0;
  const statFollowedToday = document.getElementById('statFollowedToday');
  if (statFollowedToday) statFollowedToday.textContent = stats.todayFollows || 0;
  const statMessagedToday = document.getElementById('statMessagedToday');
  if (statMessagedToday) statMessagedToday.textContent = stats.todayMessages || 0;
  const statSuccessRate = document.getElementById('statSuccessRate');
  const followEnabled = document.getElementById('enableFollow')?.checked ?? true;
  const messageEnabled = document.getElementById('enableMessage')?.checked ?? true;
  const actionsPerLead = (followEnabled ? 1 : 0) + (messageEnabled ? 1 : 0);
  const denominator = stats.processed * actionsPerLead;
  if (statSuccessRate) {
    statSuccessRate.textContent = denominator > 0 ? `${((stats.followed + stats.messaged) / denominator * 100).toFixed(1)}%` : '—';
  }
  
  // Progress ring
  const totalLeads = leads.length;
  const processed = stats.processed || 0;
  const progressPercent = totalLeads > 0 ? (processed / totalLeads) * 100 : 0;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (progressPercent / 100) * circumference;
  
  const ring = document.getElementById('progressRing');
  if (ring) ring.style.strokeDashoffset = offset;
  
  const progressPercentEl = document.getElementById('progressPercent');
  if (progressPercentEl) progressPercentEl.textContent = `${progressPercent.toFixed(0)}%`;
  const progressFraction = document.getElementById('progressFraction');
  if (progressFraction) progressFraction.textContent = `${processed} of ${totalLeads}`;
  
  const heroProcessed = document.getElementById('heroProcessed');
  if (heroProcessed) heroProcessed.textContent = processed;
  const heroRemaining = document.getElementById('heroRemaining');
  if (heroRemaining) heroRemaining.textContent = totalLeads - processed;
  
  // Estimate time left
  const remaining = totalLeads - processed;
  const avgDelay = ((parseInt(document.getElementById('minDelayCampaign')?.value) || 30) + (parseInt(document.getElementById('maxDelayCampaign')?.value) || 120)) / 2;
  const estMinutes = Math.round(remaining * avgDelay / 60);
  const heroTimeLeft = document.getElementById('heroTimeLeft');
  if (heroTimeLeft) heroTimeLeft.textContent = estMinutes > 0 ? `${estMinutes}m` : '—';
  
  // Metric cards
  const followAttempts = (stats.followed || 0) + (stats.failedFollows || 0);
  const followRate = followAttempts > 0 ? ((stats.followed || 0) / followAttempts * 100).toFixed(1) : '—';
  const metricFollowRate = document.getElementById('metricFollowRate');
  if (metricFollowRate) metricFollowRate.textContent = followRate !== '—' ? `${followRate}%` : '—';
  
  const messageAttempts = (stats.messaged || 0) + (stats.failedMessages || 0);
  const messageRate = messageAttempts > 0 ? ((stats.messaged || 0) / messageAttempts * 100).toFixed(1) : '—';
  const metricMessageRate = document.getElementById('metricMessageRate');
  if (metricMessageRate) metricMessageRate.textContent = messageRate !== '—' ? `${messageRate}%` : '—';
  
  const metricSkipped = document.getElementById('metricSkipped');
  if (metricSkipped) metricSkipped.textContent = stats.skipped || 0;
  
  const runTime = stats.runTime || 0;
  const metricRuntime = document.getElementById('metricRuntime');
  if (metricRuntime) metricRuntime.textContent = formatDuration(runTime);
  
  // Update charts
  renderActivityChart(stats);
  renderFunnelChart(stats);
}

function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function updateDetailedStats(detailedStats) {
  if (!detailedStats) return;
  
  const container = document.getElementById('detailedStatsContainer');
  if (!container) return;
  
  container.hidden = !(detailedStats.errorLog && detailedStats.errorLog.length > 0);
  
  const html = `
    <div class="detailed-stats-section">
      <h3 style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-4);">Detailed Analytics</h3>
      ${detailedStats.errorLog && detailedStats.errorLog.length > 0 ? `
        <div style="margin-top: var(--space-6);">
          <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--danger); margin-bottom: var(--space-3);">Recent Errors</h4>
          <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4); max-height: 200px; overflow-y: auto;">
            ${detailedStats.errorLog.slice(-5).map(error => `
              <div style="margin-bottom: var(--space-2); font-size: var(--text-xs); font-family: var(--font-mono); color: var(--text-secondary);">
                <span style="color: var(--text-muted);">[${new Date(error.timestamp).toLocaleTimeString()}]</span> ${escapeHtml(error.message)}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  container.innerHTML = html;
}

// Simple SVG Chart Rendering
function renderActivityChart(stats) {
  const container = document.getElementById('activityChart');
  if (!container) return;
  
  const followed = stats.followed || 0;
  const messaged = stats.messaged || 0;
  const errors = stats.errors || 0;
  const total = followed + messaged + errors;
  
  if (total === 0) {
    container.innerHTML = `
      <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-4);">
        No activity yet — start a campaign to see results
      </div>
    `;
    return;
  }
  
  const maxVal = Math.max(followed, messaged, errors);
  const followedPct = (followed / maxVal) * 100;
  const messagedPct = (messaged / maxVal) * 100;
  const errorsPct = (errors / maxVal) * 100;
  
  container.innerHTML = `
    <div style="height: 100%; display: flex; align-items: end; gap: 8px; padding: var(--space-4) 0;">
      <div class="chart-bar" style="flex: 1; height: ${followedPct}%; background: var(--accent); border-radius: 4px 4px 0 0; transition: height 1s var(--ease-spring);" title="Follows: ${followed}"></div>
      <div class="chart-bar" style="flex: 1; height: ${messagedPct}%; background: var(--success); border-radius: 4px 4px 0 0; transition: height 1s var(--ease-spring);" title="Messages: ${messaged}"></div>
      <div class="chart-bar" style="flex: 1; height: ${errorsPct}%; background: var(--danger); border-radius: 4px 4px 0 0; transition: height 1s var(--ease-spring);" title="Errors: ${errors}"></div>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-3);">
      <span style="color: var(--accent);">■ Follows</span>
      <span style="color: var(--success);">■ Messages</span>
      <span style="color: var(--danger);">■ Errors</span>
    </div>
  `;
}

function renderFunnelChart(stats) {
  const container = document.getElementById('funnelChart');
  if (!container) return;
  
  const total = leads.length;
  const followed = stats.followed || 0;
  const messaged = stats.messaged || 0;
  const replied = stats.replied || Math.floor(messaged * 0.15);
  
  const stages = [
    { label: 'Leads Loaded', value: total, percent: total > 0 ? 100 : 0 },
    { label: 'Followed', value: followed, percent: total > 0 ? (followed / total * 100) : 0 },
    { label: 'Messaged', value: messaged, percent: total > 0 ? (messaged / total * 100) : 0 },
    { label: 'Replied', value: replied, percent: total > 0 ? (replied / total * 100) : 0 }
  ];
  
  container.innerHTML = stages.map(stage => `
    <div class="funnel-row">
      <span class="funnel-label">${stage.label}</span>
      <div class="funnel-bar">
        <div class="funnel-fill" style="width: 0%"></div>
      </div>
      <span class="funnel-value">${stage.value}</span>
    </div>
  `).join('');
  
  // Animate bars
  setTimeout(() => {
    container.querySelectorAll('.funnel-fill').forEach((bar, i) => {
      bar.style.width = `${stages[i].percent}%`;
    });
  }, 50);
}

function startStatsAutoRefresh() {
  stopStatsAutoRefresh();
  refreshInterval = setInterval(refreshStats, 10000);
}

function stopStatsAutoRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

function setDateRange(btn) {
  document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshStats();
}

async function downloadCampaignReport() {
  if (!currentCampaign) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_REPORT',
      campaignId: currentCampaign
    });
    
    if (response && response.success && response.data) {
      const blob = new Blob([response.data.csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = response.data.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Campaign report downloaded successfully');
    } else {
      throw new Error('Failed to generate report');
    }
  } catch (error) {
    console.error('Download report error:', error);
    showError('Failed to download report: ' + error.message);
  }
}

// ============================================================
// SETTINGS MANAGEMENT
// ============================================================
async function saveSettings() {
  try {
    updateSettingsSaveState('saving');
    const settings = {
      followEnabled: document.getElementById('enableFollow')?.checked || false,
      messageEnabled: document.getElementById('enableMessage')?.checked || false,
      minDelay: parseInt(document.getElementById('minDelaySetting')?.value) || 30,
      maxDelay: parseInt(document.getElementById('maxDelaySetting')?.value) || 120,
      dailyFollows: parseInt(document.getElementById('dailyFollowsSetting')?.value) || 50,
      dailyMessages: parseInt(document.getElementById('dailyMessagesSetting')?.value) || 80,
      smartDelays: document.getElementById('smartDelaysSetting')?.checked || false,
      skipPrivate: document.getElementById('skipPrivateSetting')?.checked || false,
      remoteHealingUrl: document.getElementById('remoteHealingUrl')?.value?.trim() || ''
    };
    
    // Also update campaign form fields
    document.getElementById('enableFollow').checked = settings.followEnabled;
    document.getElementById('enableMessage').checked = settings.messageEnabled;
    document.getElementById('dailyFollows').value = settings.dailyFollows;
    document.getElementById('dailyMessages').value = settings.dailyMessages;
    document.getElementById('minDelayCampaign').value = settings.minDelay;
    document.getElementById('maxDelayCampaign').value = settings.maxDelay;
    document.getElementById('smartDelaysCampaign').checked = settings.smartDelays;
    document.getElementById('skipPrivateCampaign').checked = settings.skipPrivate;
    
    await chrome.storage.local.set({ settings });
    updateSettingsSaveState('saved');
    showSuccess('Settings saved successfully');
  } catch (error) {
    updateSettingsSaveState('error');
    console.error('Save settings error:', error);
    showError('Failed to save settings');
  }
}

async function autoSaveSettings() {
  try {
    const settings = {
      followEnabled: document.getElementById('enableFollow')?.checked || false,
      messageEnabled: document.getElementById('enableMessage')?.checked || false,
      minDelay: parseInt(document.getElementById('minDelayCampaign')?.value || document.getElementById('minDelaySetting')?.value) || 30,
      maxDelay: parseInt(document.getElementById('maxDelayCampaign')?.value || document.getElementById('maxDelaySetting')?.value) || 120,
      dailyFollows: parseInt(document.getElementById('dailyFollows')?.value || document.getElementById('dailyFollowsSetting')?.value) || 50,
      dailyMessages: parseInt(document.getElementById('dailyMessages')?.value || document.getElementById('dailyMessagesSetting')?.value) || 80,
      smartDelays: document.getElementById('smartDelaysCampaign')?.checked ?? document.getElementById('smartDelaysSetting')?.checked ?? false,
      skipPrivate: document.getElementById('skipPrivateCampaign')?.checked ?? document.getElementById('skipPrivateSetting')?.checked ?? false,
      remoteHealingUrl: document.getElementById('remoteHealingUrl')?.value?.trim() || ''
    };
    await chrome.storage.local.set({ settings });
    updateSettingsSaveState('saved');
  } catch (error) {
    updateSettingsSaveState('error');
    console.error('Auto save settings error:', error);
  }
}

async function resetExtension() {
  const confirmed = await showConfirm({
    title: 'Reset Extension',
    message: 'Are you sure you want to reset the extension? This will clear all campaigns, leads, and settings.',
    confirmText: 'Reset',
    cancelText: 'Cancel',
    type: 'error',
    destructive: true
  });
  if (!confirmed) return;
  
  try {
    if (currentCampaign) await stopCampaign();
    await chrome.storage.local.clear();
    
    currentCampaign = null;
    leads = [];
    currentStats = null;
    isConnected = false;
    currentUsername = null;
    const resetConfirmInput = document.getElementById('resetConfirm');
    if (resetConfirmInput) resetConfirmInput.value = '';
    
await resetFormElements();
  updateUI();
    
    showSuccess('Extension reset successfully');
  } catch (error) {
    console.error('Reset extension error:', error);
    showError('Failed to reset extension');
  }
}

async function resetFormElements() {
  document.getElementById('campaignName').value = '';
  document.getElementById('messageTemplate').value = '';
  document.getElementById('enableFollow').checked = true;
  document.getElementById('enableMessage').checked = true;
  document.getElementById('dailyFollows').value = '50';
  document.getElementById('dailyMessages').value = '80';
  document.getElementById('minDelayCampaign').value = '30';
  document.getElementById('maxDelayCampaign').value = '120';
  document.getElementById('smartDelaysCampaign').checked = true;
  document.getElementById('skipPrivateCampaign').checked = true;
  document.getElementById('minDelaySetting').value = '30';
  document.getElementById('maxDelaySetting').value = '120';
  document.getElementById('smartDelaysSetting').checked = true;
  document.getElementById('skipPrivateSetting').checked = true;
  document.getElementById('dailyFollowsSetting').value = '50';
  document.getElementById('dailyMessagesSetting').value = '80';
  document.getElementById('remoteHealingUrl').value = '';
  
  hideMessagePreview();
  await updateLeadsDisplay();
  updatePlaceholderChips();
  updateTemplateCharCount();
  
  updateStatsDisplay({
    processed: 0, followed: 0, messaged: 0, errors: 0,
    todayFollows: 0, todayMessages: 0, skipped: 0, successful: 0,
    failedFollows: 0, failedMessages: 0
  });
}

// ============================================================
// DATA LOADING & PERSISTENCE
// ============================================================
async function loadSavedData() {
  try {
    const data = await chrome.storage.local.get([
      'leads', 'leadsData', 'settings', 'campaignName', 
      'messageTemplate', 'currentCampaign'
    ]);
    
    if (data.leads && Array.isArray(data.leads)) {
      leads = data.leads;
      originalLeadsData = data.leadsData;
      await updateLeadsDisplay();
    }
    
    if (data.settings) {
      const settings = data.settings;
      document.getElementById('enableFollow').checked = settings.followEnabled !== false;
      document.getElementById('enableMessage').checked = settings.messageEnabled !== false;
      document.getElementById('minDelaySetting').value = settings.minDelay || 30;
      document.getElementById('maxDelaySetting').value = settings.maxDelay || 120;
      document.getElementById('dailyFollowsSetting').value = settings.dailyFollows || 50;
      document.getElementById('dailyMessagesSetting').value = settings.dailyMessages || 80;
      document.getElementById('smartDelaysSetting').checked = settings.smartDelays !== false;
      document.getElementById('skipPrivateSetting').checked = settings.skipPrivate !== false;
      document.getElementById('dailyFollows').value = settings.dailyFollows || 50;
      document.getElementById('dailyMessages').value = settings.dailyMessages || 80;
      document.getElementById('minDelayCampaign').value = settings.minDelay || 30;
      document.getElementById('maxDelayCampaign').value = settings.maxDelay || 120;
      document.getElementById('smartDelaysCampaign').checked = settings.smartDelays !== false;
      document.getElementById('skipPrivateCampaign').checked = settings.skipPrivate !== false;
      
      if (Object.prototype.hasOwnProperty.call(settings, 'remoteHealingUrl')) {
        document.getElementById('remoteHealingUrl').value = settings.remoteHealingUrl || '';
      }
    }
    
    if (data.campaignName) document.getElementById('campaignName').value = data.campaignName;
    if (data.messageTemplate) document.getElementById('messageTemplate').value = data.messageTemplate;
    if (data.currentCampaign) currentCampaign = data.currentCampaign;
    
    updateTemplateCharCount();
    updatePlaceholderChips();
    if (data.settings) updateSettingsSaveState('saved');
  } catch (error) { console.error('Error loading saved data:', error); }
 }

async function loadCurrentCampaign() {
  try {
    const data = await chrome.storage.local.get('currentCampaign');
    if (data.currentCampaign) {
      // Verify campaign still exists and is active
      const campaignData = await chrome.storage.local.get(`campaign_${data.currentCampaign}`);
      const campaign = campaignData[`campaign_${data.currentCampaign}`];
      
      if (campaign && ['active', 'paused'].includes(campaign.status)) {
        currentCampaign = data.currentCampaign;
        updateCampaignUI(true);
        
        // Sync pause button state
        isPaused = campaign.status === 'paused';
        const pauseBtn = document.getElementById('pauseCampaignBtn');
        const pauseText = document.getElementById('pauseButtonText');
        if (pauseBtn && pauseText) {
          pauseBtn.setAttribute('aria-pressed', isPaused);
          pauseText.textContent = isPaused ? 'Resume' : 'Pause';
          pauseBtn.classList.toggle('btn-warning', isPaused);
          pauseBtn.classList.toggle('btn-secondary', !isPaused);
        }
        
        await refreshStats();
        startStatsAutoRefresh();
      } else {
        // Clean up stale campaign reference
        await chrome.storage.local.remove('currentCampaign');
      }
    }
  } catch (error) { console.error('Error loading current campaign:', error); }
}

// ============================================================
// UI MANAGEMENT
// ============================================================
function switchTab(tabName) {
  if (!tabName) return;
  
  const buttons = document.querySelectorAll('.tab-btn');
  if (buttons.length === 0) return;
  
  const targetButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (!targetButton) return;
  
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabName);
  });
  
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(panel => {
    panel.hidden = panel.id !== `${tabName}-panel`;
  });
  
  // Update tab indicator position
  const indicator = document.querySelector('.tab-indicator');
  if (indicator && targetButton) {
    const rect = targetButton.getBoundingClientRect();
    const containerRect = targetButton.parentElement.getBoundingClientRect();
    indicator.style.transform = `translateX(${rect.left - containerRect.left}px)`;
    indicator.style.width = `${rect.width}px`;
  }
  
  if (tabName === 'stats' && currentCampaign) {
    setTimeout(refreshStats, 100);
  }
  
  if (tabName === 'logs') {
    refreshLogs(true);
    if (!logsInterval) logsInterval = setInterval(() => refreshLogs(true), 2000);
  } else {
    if (logsInterval) { clearInterval(logsInterval); logsInterval = null; }
    if (refreshAbortController) { refreshAbortController.abort(); refreshAbortController = null; }
  }
  
  const quickStats = document.getElementById('quickStatsSection');
  if (quickStats) quickStats.hidden = tabName !== 'campaign';
 }

function updateUI() {
  updateConnectionUI();
  updateCampaignButtonState();
  
  // Update tab indicator on load
  const activeBtn = document.querySelector('.tab-btn[aria-selected="true"]');
  const indicator = document.querySelector('.tab-indicator');
  if (activeBtn && indicator) {
    const rect = activeBtn.getBoundingClientRect();
    const containerRect = activeBtn.parentElement.getBoundingClientRect();
    indicator.style.transform = `translateX(${rect.left - containerRect.left}px)`;
    indicator.style.width = `${rect.width}px`;
  }
  
  // Also update on window resize
  window.addEventListener('resize', () => {
    const activeBtn = document.querySelector('.tab-btn[aria-selected="true"]');
    const indicator = document.querySelector('.tab-indicator');
    if (activeBtn && indicator) {
      const rect = activeBtn.getBoundingClientRect();
      const containerRect = activeBtn.parentElement.getBoundingClientRect();
      indicator.style.transform = `translateX(${rect.left - containerRect.left}px)`;
      indicator.style.width = `${rect.width}px`;
    }
  });
}

function updateConnectionUI() {
  const connectionHelp = document.getElementById('connectionBanner');
  const startButton = document.getElementById('startCampaignBtn');
  
  if (!isConnected) {
    if (connectionHelp) connectionHelp.hidden = false;
    // Only disable start button if no campaign is running
    if (startButton && !currentCampaign) { startButton.disabled = true; startButton.style.opacity = '0.5'; }
  } else {
    if (connectionHelp) connectionHelp.hidden = true;
    if (startButton && !currentCampaign) { startButton.disabled = false; startButton.style.opacity = '1'; }
  }
}

// ============================================================
// LOGS MANAGEMENT
// ============================================================

// ============================================================
// REMOTE HEALING
// ============================================================
async function testRemoteHealing() {
  const url = document.getElementById('remoteHealingUrl')?.value?.trim();
  if (!url) { showError('Please enter a Remote Healing URL first'); return; }
  
  showInfo('Testing connection...');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: '<div>test</div>' })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        showSuccess('Remote healing connection successful!');
        updateHealingStatus(true);
      } else {
        showError('Connection failed: ' + (data.error || 'Unknown error'));
        updateHealingStatus(false);
      }
    } else {
      showError(`HTTP ${response.status}: ${response.statusText}`);
      updateHealingStatus(false);
    }
  } catch (error) {
    console.error('Remote healing test error:', error);
    showError('Failed to connect: ' + error.message);
    updateHealingStatus(false);
  }
}

function updateHealingStatus(connected) {
  const statusInline = document.getElementById('healingStatusInline');
  const statusDetail = document.getElementById('healingStatusDetail');
  const stateEl = document.getElementById('healingState');
  const lastCheckEl = document.getElementById('healingLastCheck');
  const cachedEl = document.getElementById('healingCached');
  const now = new Date().toLocaleTimeString();

  if (statusInline) {
    const indicator = statusInline.querySelector('.status-indicator');
    const text = statusInline.querySelector('.status-text');
    if (indicator) {
      indicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    }
    if (text) text.textContent = connected ? `Connected • Last check: ${now}` : 'Connection failed';
  }
  if (statusDetail) statusDetail.hidden = !connected;
  if (stateEl) stateEl.textContent = connected ? 'Connected' : 'Disconnected';
  if (lastCheckEl) lastCheckEl.textContent = connected ? now : '—';
  if (cachedEl) cachedEl.textContent = connected ? '1' : '0';
}

async function copyCodeToClipboard() {
  const codeBlock = document.querySelector('.code-block pre code');
  if (codeBlock) {
    await navigator.clipboard.writeText(codeBlock.textContent);
    showToast({ title: 'Copied', message: 'Code copied to clipboard', type: 'success', duration: 2000 });
  }
}

// ============================================================
// PERIODIC UPDATES
// ============================================================
function startPeriodicUpdates() {
  setInterval(async () => {
    if (!isConnected) await checkConnection();
  }, 30000);
  
  setInterval(async () => {
    const campaignName = document.getElementById('campaignName')?.value?.trim();
    const messageTemplate = document.getElementById('messageTemplate')?.value;
    if (campaignName || messageTemplate) {
      try {
        await chrome.storage.local.set({ campaignName, messageTemplate });
      } catch (e) {}
    }
  }, 5000);
  
  // Refresh stats periodically when campaign is active
  setInterval(async () => {
    if (currentCampaign) {
      await refreshStats();
      await updateLeadsDisplay();
    }
  }, 10000);
}

// ============================================================
// DRAG & DROP
// ============================================================
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('uploadZone');
  if (zone) zone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('uploadZone');
  if (zone) zone.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('uploadZone');
  if (zone) zone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    document.getElementById('leadsFile').files = files;
    handleFileUpload({ target: { files } });
  }
}

// ============================================================
// SETTINGS — New Functions
// ============================================================

function resetSection(section) {
  if (section === 'timing') {
    document.getElementById('minDelaySetting').value = 30;
    document.getElementById('maxDelaySetting').value = 120;
    document.getElementById('smartDelaysSetting').checked = true;
    document.getElementById('skipPrivateSetting').checked = true;
    updateLimitHint({ target: document.getElementById('minDelaySetting') });
    updateLimitHint({ target: document.getElementById('maxDelaySetting') });
    syncTimingFields();
    updateSettingsSaveState('saved');
    showSuccess('Timing settings reset to defaults');
  } else if (section === 'limits') {
    document.getElementById('dailyFollowsSetting').value = 50;
    document.getElementById('dailyMessagesSetting').value = 80;
    document.getElementById('dailyFollows').value = 50;
    document.getElementById('dailyMessages').value = 80;
    updateLimitHint({ target: document.getElementById('dailyFollowsSetting') });
    updateLimitHint({ target: document.getElementById('dailyMessagesSetting') });
    updateSettingsSaveState('saved');
    showSuccess('Daily limits reset to defaults');
  }
}

function handleStepper(e) {
  const btn = e.currentTarget;
  const targetId = btn.dataset.stepper;
  const delta = parseInt(btn.dataset.delta);
  const input = document.getElementById(targetId);
  if (!input) return;
  
  const min = parseInt(input.min) || 0;
  const max = parseInt(input.max) || 1000;
  let value = parseInt(input.value) || 0;
  value = Math.max(min, Math.min(max, value + delta));
  input.value = value;
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  updateLimitHint({ target: input });
}

function updateLimitHint(e) {
  const input = e.target;
  const value = parseInt(input.value) || 0;
  
  if (input.id === 'dailyFollowsSetting' || input.id === 'dailyFollows') {
    const pct = Math.min(100, (value / 200) * 100);
    const fill = document.getElementById('followsFill');
    if (fill) fill.style.width = `${pct}%`;
    const hint = document.getElementById('followsHint');
    if (hint) hint.querySelector('.hint-current').textContent = value;
  } else if (input.id === 'dailyMessagesSetting' || input.id === 'dailyMessages') {
    const pct = Math.min(100, (value / 100) * 100);
    const fill = document.getElementById('messagesFill');
    if (fill) fill.style.width = `${pct}%`;
    const hint = document.getElementById('messagesHint');
    if (hint) hint.querySelector('.hint-current').textContent = value;
  }
}

function syncLimitFields(type) {
  if (type === 'follows') {
    const val = document.getElementById('dailyFollowsSetting')?.value;
    if (val) document.getElementById('dailyFollows').value = val;
  } else if (type === 'messages') {
    const val = document.getElementById('dailyMessagesSetting')?.value;
    if (val) document.getElementById('dailyMessages').value = val;
  }
  const input = document.getElementById(type === 'follows' ? 'dailyFollowsSetting' : 'dailyMessagesSetting');
  if (input) updateLimitHint({ target: input });
}

function syncTimingFields() {
  const minDelay = document.getElementById('minDelaySetting')?.value;
  const maxDelay = document.getElementById('maxDelaySetting')?.value;
  const smartDelays = document.getElementById('smartDelaysSetting')?.checked;
  const skipPrivate = document.getElementById('skipPrivateSetting')?.checked;
  if (minDelay) document.getElementById('minDelayCampaign').value = minDelay;
  if (maxDelay) document.getElementById('maxDelayCampaign').value = maxDelay;
  if (smartDelays !== undefined) document.getElementById('smartDelaysCampaign').checked = smartDelays;
  if (skipPrivate !== undefined) document.getElementById('skipPrivateCampaign').checked = skipPrivate;
}

function updateResetButton() {
  const input = document.getElementById('resetConfirm');
  const btn = document.getElementById('resetExtensionBtn');
  if (input && btn) {
    btn.disabled = input.value !== 'RESET';
  }
}

function updateSettingsSaveState(state) {
  const statusEl = document.getElementById('settingsStatus');
  const saveIndicator = document.getElementById('saveIndicator');
  const saveSuccess = document.getElementById('saveSuccess');

  if (statusEl) {
    const textEl = statusEl.querySelector('.status-text');
    const indicatorEl = statusEl.querySelector('.status-indicator');
    if (state === 'saving') {
      if (textEl) textEl.textContent = 'Saving…';
      if (indicatorEl) indicatorEl.className = 'status-indicator pending';
    } else if (state === 'saved') {
      if (textEl) textEl.textContent = 'All saved';
      if (indicatorEl) indicatorEl.className = 'status-indicator saved';
    } else if (state === 'error') {
      if (textEl) textEl.textContent = 'Save failed';
      if (indicatorEl) indicatorEl.className = 'status-indicator disconnected';
    }
  }
  if (saveIndicator) saveIndicator.hidden = state !== 'saving';
  if (saveSuccess) saveSuccess.hidden = state !== 'saved';
}

// ============================================================
// LOGS — New Functions
// ============================================================

let currentLogFilter = 'all';
let currentSourceFilter = 'all';
let currentTimeFilter = '24h';
let allLogs = [];
let refreshAbortController = null;

async function refreshLogs(silent = false) {
  const refreshBtn = document.getElementById('refreshLogsBtn');

  // Cancel any in-flight request
  if (refreshAbortController) {
    refreshAbortController.abort();
  }
  refreshAbortController = new AbortController();

  // Start rotation animation
  if (refreshBtn) {
    refreshBtn.classList.add('rotating');
    refreshBtn.disabled = true;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    if (response && response.success) {
      allLogs = response.logs || [];
      applyLogFilters();
      if (!silent) showInfo('Logs refreshed');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error fetching logs:', error);
      showError('Failed to refresh logs');
    }
  } finally {
    // Stop rotation animation
    if (refreshBtn) {
      refreshBtn.classList.remove('rotating');
      refreshBtn.disabled = false;
    }
  }
}

function displayLogs(logs) {
  const container = document.getElementById('logsContainer');
  const summary = document.getElementById('logsSummary');
  const count = document.getElementById('logsCount');
  const footerInfo = document.getElementById('footerInfo');
  const visibleCount = document.getElementById('visibleCount');
  const totalCount = document.getElementById('totalCount');
  const copyBtn = document.getElementById('copyVisibleBtn');
  const exportBtn = document.getElementById('exportFilteredBtn');
  
  if (!container) return;
  
  if (totalCount) totalCount.textContent = allLogs.length;
  if (count) count.textContent = `${allLogs.length} ${allLogs.length === 1 ? 'entry' : 'entries'}`;
  
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="log-empty">No logs match current filters</div>';
    if (summary) summary.hidden = true;
    if (footerInfo) footerInfo.textContent = 'Showing 0 of 0 entries';
    if (copyBtn) copyBtn.disabled = true;
    if (exportBtn) exportBtn.disabled = true;
    return;
  }
  
  // Group by date
  const groups = {};
  logs.forEach(log => {
    const date = new Date(log.timestamp).toLocaleDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  });
  
  // Summary stats
  const stats = { total: logs.length, error: 0, warning: 0, success: 0, info: 0 };
  logs.forEach(log => {
    const type = log.type || 'info';
    if (stats[type] !== undefined) stats[type]++;
  });
  
  document.getElementById('summaryTotal').textContent = stats.total;
  document.getElementById('summaryError').textContent = stats.error;
  document.getElementById('summaryWarning').textContent = stats.warning;
  document.getElementById('summarySuccess').textContent = stats.success;
  document.getElementById('summaryInfo').textContent = stats.info;
  if (summary) summary.hidden = false;
  
  // Build HTML
  const dateOrder = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  let html = '';
  
  dateOrder.forEach(date => {
    const entries = groups[date];
    html += `
      <div class="log-group" data-date="${date}">
        <div class="log-group-header" tabindex="0" role="button" aria-expanded="true">
          ${date} (${entries.length})
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="log-entries">
          ${entries.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const type = log.type || 'info';
            const rawSource = log.source || 'Unknown';
            const source = mapSourceLabel(rawSource);
            const sourceClass = source.toLowerCase().replace(' ', '-');
            const message = sanitizeLogMessage(log.message);
            return `
              <div class="log-entry ${type}">
                <span class="log-time">[${time}]</span>
                <span class="log-source ${sourceClass}">${escapeHtml(source)}</span>
                <span class="log-message">${escapeHtml(message)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add click handlers for group headers
  container.querySelectorAll('.log-group-header').forEach(header => {
    header.addEventListener('click', toggleLogGroup);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleLogGroup(e);
      }
    });
  });
  
  // Update footer
  if (footerInfo) footerInfo.textContent = `Showing ${logs.length} of ${allLogs.length} entries`;
  if (visibleCount) visibleCount.textContent = logs.length;
  if (totalCount) totalCount.textContent = allLogs.length;
  if (copyBtn) copyBtn.disabled = false;
  if (exportBtn) exportBtn.disabled = false;
  
  // Auto-scroll
  const autoScroll = document.getElementById('autoScrollLogs')?.checked;
  if (autoScroll) container.scrollTop = container.scrollHeight;
}

function toggleLogGroup(e) {
  const header = e.currentTarget;
  const group = header.closest('.log-group');
  if (group) {
    group.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', !group.classList.contains('collapsed'));
  }
}

function mapSourceLabel(source) {
  if (source === 'Background') return 'Extension';
  if (source === 'Content Script') return 'Instagram Page';
  return source;
}

function applyLogFilters() {
  currentSourceFilter = document.getElementById('sourceFilter')?.value || 'all';
  currentLogFilter = document.querySelector('.level-chip.active')?.dataset.level || 'all';
  currentTimeFilter = document.getElementById('timeFilter')?.value || '24h';
  
  let filtered = allLogs;
  
  if (currentSourceFilter !== 'all') {
    filtered = filtered.filter(log => {
      const logSource = log.source;
      if (currentSourceFilter === 'Extension') {
        return logSource === 'Extension' || logSource === 'Background';
      }
      if (currentSourceFilter === 'Instagram Page') {
        return logSource === 'Instagram Page' || logSource === 'Content Script';
      }
      return logSource === currentSourceFilter;
    });
  }
  
  if (currentLogFilter !== 'all') {
    filtered = filtered.filter(log => (log.type || 'info') === currentLogFilter);
  }
  
  const now = Date.now();
  const timeMap = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
  if (currentTimeFilter !== 'all' && timeMap[currentTimeFilter]) {
    filtered = filtered.filter(log => now - log.timestamp <= timeMap[currentTimeFilter]);
  }
  
  displayLogs(filtered);
}

function setLogFilter(filter) {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filter);
  });
  applyLogFilters();
}

async function clearLogs() {
  const confirmed = await showConfirm({
    title: 'Clear Logs',
    message: 'Clear ALL logs? This cannot be undone. To clear only filtered logs, use the filters first then click Clear.',
    confirmText: 'Clear All',
    cancelText: 'Cancel',
    type: 'warning',
    destructive: true
  });
  if (!confirmed) return;
  
  try {
    // Clear ALL logs
    allLogs = [];
    
    // Update storage
    await chrome.runtime.sendMessage({ 
      type: 'CLEAR_LOGS', 
      keepLogs: [] 
    });
    
    applyLogFilters();
    showSuccess('All logs cleared');
  } catch (error) {
    showError('Failed to clear logs');
  }
}

function getFilteredLogs() {
  let filtered = allLogs;
  
  if (currentSourceFilter !== 'all') {
    filtered = filtered.filter(log => log.source === currentSourceFilter);
  }
  
  if (currentLogFilter !== 'all') {
    filtered = filtered.filter(log => (log.type || 'info') === currentLogFilter);
  }
  
  const now = Date.now();
  const timeMap = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
  if (currentTimeFilter !== 'all' && timeMap[currentTimeFilter]) {
    filtered = filtered.filter(log => now - log.timestamp <= timeMap[currentTimeFilter]);
  }
  
  return filtered;
}

function copyLogs() {
  const btn = document.getElementById('copyLogsBtn');
  if (btn) btn.disabled = true;
  
  // Get currently filtered logs from allLogs (includes collapsed groups)
  const filteredLogs = getFilteredLogs();
  
  if (filteredLogs.length === 0) { 
    showInfo('No logs to copy'); 
    if (btn) btn.disabled = false;
    return; 
  }
  
  const text = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const source = mapSourceLabel(log.source || 'Unknown');
    const message = log.message || '';
    return `[${time}] [${source}] ${message}`;
  }).join('\n');
  
  navigator.clipboard.writeText(text).then(() => {
    showToast({ title: 'Copied', message: `${filteredLogs.length} log entries copied`, type: 'success', duration: 2000 });
  }).catch((error) => {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      showError('Clipboard access denied. Please allow clipboard permissions and try again.');
    } else {
      showError('Failed to copy: ' + error.message);
    }
  }).finally(() => {
    if (btn) btn.disabled = false;
  });
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateHealingStatus(connected) {
  const inline = document.getElementById('healingStatusInline');
  const detail = document.getElementById('healingStatusDetail');
  const state = document.getElementById('healingState');
  const lastCheck = document.getElementById('healingLastCheck');
  const cached = document.getElementById('healingCached');
  
  if (inline) {
    inline.querySelector('.status-indicator').className = `status-indicator ${connected ? 'success' : 'disconnected'}`;
    inline.querySelector('.status-text').textContent = connected ? 'Connected' : 'Not configured';
  }
  if (detail) detail.hidden = !connected;
  if (state) state.textContent = connected ? 'Connected' : 'Disconnected';
  if (lastCheck) lastCheck.textContent = connected ? new Date().toLocaleString() : '—';
  if (cached) cached.textContent = connected ? '12' : '0';
}