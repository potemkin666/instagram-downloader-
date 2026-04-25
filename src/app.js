import { createApiClient } from './api-client.js';
import { COMMANDS } from './commands.js';
import { copyCode, initNextLevelAesthetics } from './effects.js';

const apiClient = createApiClient({
  backend: {
    fetchLiveLines,
    loadProfileSummary,
    checkApiHealth,
  },
});

/* ═══════════════════════════════════════════════════════════
   RENDER CARDS
═══════════════════════════════════════════════════════════ */
function renderCards() {
  const grid = document.getElementById('commands-grid');
  grid.innerHTML = '';
  const visible = getVisibleCommands();
  visible.forEach(c => {
    const isFavorite = favoriteCommandIds.has(c.id);
    const runCount = commandRunCounts[c.id] || 0;
    const div = document.createElement('div');
    div.className = `command-card cat-${c.cat}${isFavorite ? ' favorite-card' : ''}`;
    div.dataset.id = c.id;
    div.setAttribute('role','button');
    div.setAttribute('tabindex','0');
    div.setAttribute('aria-label',`Run ${c.name} command`);
    div.innerHTML = `
      <button class="fav-btn ${isFavorite ? 'active' : ''}" aria-label="Toggle favorite for ${c.name}" title="Toggle favorite">${isFavorite ? '★' : '☆'}</button>
      <span class="card-icon">${c.icon}</span>
      <div class="card-category">${c.cat.toUpperCase()}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-desc">${c.desc}</div>
      <div class="card-usage">Runs: ${runCount}</div>`;
    div.addEventListener('click', () => runCommand(c));
    div.addEventListener('keydown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('fav-btn')) return;
      if (e.key==='Enter'||e.key===' ') runCommand(c);
    });
    const fav = div.querySelector('.fav-btn');
    if (fav) {
      fav.addEventListener('click', (e) => toggleFavorite(c.id, e));
      fav.addEventListener('keydown', (e) => e.stopPropagation());
    }
    grid.appendChild(div);
  });
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 't-info';
    empty.textContent = 'No matching commands found.';
    grid.appendChild(empty);
  }
  updateVisibleCount(visible.length);
}

function filterCards(btn) {
  const category = btn && btn.dataset ? btn.dataset.cat : 'all';
  setActiveCategory(category);
  persistCommandUiState();
  renderCards();
}

/* ═══════════════════════════════════════════════════════════
   TERMINAL
═══════════════════════════════════════════════════════════ */
let _typing = false;
const API_URL_STORAGE_KEY = 'oceangramApiBaseUrl';
const FAVORITES_STORAGE_KEY = 'oceangramFavoriteCommands';
const RUN_COUNT_STORAGE_KEY = 'oceangramCommandRunCounts';
const RECENT_TARGETS_STORAGE_KEY = 'oceangramRecentTargets';
const RECENT_COMMANDS_STORAGE_KEY = 'oceangramRecentCommands';
const COMMAND_UI_STATE_STORAGE_KEY = 'oceangramCommandUiState';
const LIVE_CACHE_STORAGE_KEY = 'oceangramLiveOutputCache';
const FUNCTIONAL_SETTINGS_STORAGE_KEY = 'oceangramFunctionalSettings';
const LAST_MEDIA_URL_STORAGE_KEY = 'oceangramLastMediaUrl';
const LIVE_LINE_TYPES = new Set(['prompt', 'dim', 'label', 'info', 'result', 'warn', 'success']);
// Keep a fallback path for older browsers that lack AbortController-based request cancellation.
const SUPPORTS_ABORT_CONTROLLER = 'AbortController' in window;
const API_TIMEOUT_MS = 15000;
const API_HEALTH_CHECK_TIMEOUT_MS = 8000;
const API_HEALTH_DEBOUNCE_MS = 700;
const LIVE_FETCH_TOTAL_ATTEMPTS = 2;
const RUN_ALL_LABEL_DEFAULT = 'RUN VISIBLE';
const RUN_ALL_LABEL_STOP = 'STOP';
const COMMAND_CATEGORIES = new Set(['all', 'Profile', 'Social', 'Content', 'Engagement', 'Contact', 'favorites']);
const DEFAULT_COMMAND_UI_STATE = { category: 'all', search: '', sort: 'default' };
const IDENTITY_ENDPOINTS = ['/api/profile-summary', '/api/profile', '/api/identity'];
const MIN_INSTAGRAM_ID_DIGITS = 4;
const MAX_INSTAGRAM_USERNAME_LENGTH = 30;
const IDENTITY_REFRESH_DEBOUNCE_MS = 500;
const MIN_BATCH_DELAY_MS = 0;
const MAX_BATCH_DELAY_MS = 5000;
const DEFAULT_FUNCTIONAL_SETTINGS = { useCache: true, autoRetry: true, allowContact: false, batchDelayMs: 400 };
// Cap cache at 50 entries to keep localStorage bounded while still retaining a useful working set of recent commands.
const MAX_LIVE_CACHE_ITEMS = 50;
// 1-30 chars; letters/numbers/dot/underscore; no leading/trailing/consecutive dots.
const INSTAGRAM_USERNAME_REGEX = new RegExp(String.raw`^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,${MAX_INSTAGRAM_USERNAME_LENGTH}}$`);
const NUMERIC_ID_SEQUENCE_REGEX = new RegExp(String.raw`\b\d{${MIN_INSTAGRAM_ID_DIGITS},}\b`);
const EXPLICIT_USERNAME_REGEX = new RegExp(String.raw`\b(?:username|user name|target|account|profile)\b\s*[:=#-]\s*@?([A-Za-z0-9._]{1,${MAX_INSTAGRAM_USERNAME_LENGTH}})\b`, 'i');
const EXPLICIT_INSTAGRAM_ID_REGEX = new RegExp(String.raw`\b(?:instagram\s*id|profile\s*id|user\s*id|account\s*id|pk|id)\b\s*[:=#-]\s*(\d{${MIN_INSTAGRAM_ID_DIGITS},})\b`, 'i');
const MEDIA_HOST_SUFFIXES = ['instagram.com', 'cdninstagram.com', 'fbcdn.net'];
const MAX_RECENT_COMMANDS = 8;
const MAX_RECENT_TARGETS = 8;
const INITIAL_TERMINAL_LINES = [
  ['prompt', '🌊 OceanGram v1.0.0 — bioluminescent shell ready'],
  ['dim', '════════════════════════════════════════════════'],
  ['info', 'Enter a target username, then click any command card.'],
];
let currentCategory = 'all';
let commandSearchText = '';
let sortMode = 'default';
let recentCommands = [];
let recentTargets = [];
let favoriteCommandIds = new Set();
let commandRunCounts = {};
let lastRunContext = null;
let commandInFlight = false;
let runAllInProgress = false;
let cancelRunAll = false;
let apiHealthDebounceId = null;
let liveResponseCache = {};
let useCacheEnabled = DEFAULT_FUNCTIONAL_SETTINGS.useCache;
let autoRetryEnabled = DEFAULT_FUNCTIONAL_SETTINGS.autoRetry;
let allowContactCommands = DEFAULT_FUNCTIONAL_SETTINGS.allowContact;
let batchDelayMs = DEFAULT_FUNCTIONAL_SETTINGS.batchDelayMs;
let lastMediaUrl = '';
let profileSummaryState = createEmptyProfileSummaryState();
let activeIdentityRequestId = 0;
let identityRefreshDebounceId = null;

function printLine(body, type, text, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const d = document.createElement('div');
      d.className = `t-${type}`;
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      resolve();
    }, delay);
  });
}

async function animateOutput(lines) {
  if (_typing) return;
  _typing = true;
  const body = document.getElementById('terminal-body');
  body.innerHTML = '';
  let delay = 0;
  for (const [type, text] of lines) {
    await printLine(body, type, text, delay);
    delay += type === 'prompt' ? 0 : 55;
  }
  const cur = document.createElement('span');
  cur.className = 't-cursor';
  const last = document.createElement('div');
  last.className = 't-dim';
  last.appendChild(cur);
  body.appendChild(last);
  _typing = false;
}

/* ═══════════════════════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════════════════════ */
function getTarget() {
  return document.getElementById('target-input').value.trim().replace(/^@/,'');
}

function getApiBaseUrl() {
  const input = document.getElementById('api-url-input');
  const raw = input ? input.value.trim() : '';
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function setLiveModePill() {
  const pill = document.getElementById('live-mode-pill');
  if (!pill) return;
  const base = getApiBaseUrl();
  const baseErr = validateApiBaseUrl(base);
  if (baseErr) {
    pill.innerHTML = base
      ? '<span class="dot dot-yellow"></span>Backend URL invalid'
      : '<span class="dot dot-yellow"></span>Backend URL required';
    return;
  }
  pill.innerHTML = '<span class="dot dot-green"></span>Live mode active';
}

function readStoredApiBaseUrl() {
  try { return localStorage.getItem(API_URL_STORAGE_KEY) || ''; }
  catch (_) { return ''; }
}

function persistApiBaseUrl(value) {
  try {
    if (value) localStorage.setItem(API_URL_STORAGE_KEY, value);
    else localStorage.removeItem(API_URL_STORAGE_KEY);
  } catch (_) {}
}

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function persistJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function initStoredState() {
  const favoriteIds = readStoredJson(FAVORITES_STORAGE_KEY, []);
  favoriteCommandIds = new Set(Array.isArray(favoriteIds) ? favoriteIds : []);
  const counts = readStoredJson(RUN_COUNT_STORAGE_KEY, {});
  commandRunCounts = counts && typeof counts === 'object' ? counts : {};
  const targets = readStoredJson(RECENT_TARGETS_STORAGE_KEY, []);
  recentTargets = Array.isArray(targets) ? targets.slice(0, MAX_RECENT_TARGETS) : [];
  const commands = readStoredJson(RECENT_COMMANDS_STORAGE_KEY, []);
  recentCommands = Array.isArray(commands)
    ? commands
      .filter(item => item && typeof item.commandId === 'string' && typeof item.target === 'string')
      .slice(0, MAX_RECENT_COMMANDS)
    : [];
}

function persistFavorites() {
  persistJson(FAVORITES_STORAGE_KEY, Array.from(favoriteCommandIds));
}

function persistRunCounts() {
  persistJson(RUN_COUNT_STORAGE_KEY, commandRunCounts);
}

function persistRecentTargets() {
  persistJson(RECENT_TARGETS_STORAGE_KEY, recentTargets);
}

function persistRecentCommands() {
  persistJson(RECENT_COMMANDS_STORAGE_KEY, recentCommands);
}

function persistCommandUiState() {
  persistJson(COMMAND_UI_STATE_STORAGE_KEY, {
    category: currentCategory,
    search: commandSearchText,
    sort: sortMode,
  });
}

function readStoredCommandUiState() {
  const state = readStoredJson(COMMAND_UI_STATE_STORAGE_KEY, {});
  if (!state || typeof state !== 'object') return { ...DEFAULT_COMMAND_UI_STATE };
  return {
    category: COMMAND_CATEGORIES.has(state.category) ? state.category : DEFAULT_COMMAND_UI_STATE.category,
    search: typeof state.search === 'string' ? state.search : DEFAULT_COMMAND_UI_STATE.search,
    sort: ['default', 'name', 'category', 'used'].includes(state.sort) ? state.sort : DEFAULT_COMMAND_UI_STATE.sort,
  };
}

function setActiveCategory(category) {
  const nextCategory = COMMAND_CATEGORIES.has(category) ? category : 'all';
  currentCategory = nextCategory;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === nextCategory);
  });
}

function isContactCommand(command) {
  return !!(command && command.cat === 'Contact');
}

function readStoredFunctionalSettings() {
  const saved = readStoredJson(FUNCTIONAL_SETTINGS_STORAGE_KEY, {});
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_FUNCTIONAL_SETTINGS };
  return {
    useCache: saved.useCache !== false,
    autoRetry: saved.autoRetry !== false,
    allowContact: saved.allowContact === true,
    batchDelayMs: Number.isFinite(Number(saved.batchDelayMs))
      ? Math.max(MIN_BATCH_DELAY_MS, Math.min(MAX_BATCH_DELAY_MS, Number(saved.batchDelayMs)))
      : DEFAULT_FUNCTIONAL_SETTINGS.batchDelayMs,
  };
}

function persistFunctionalSettings() {
  persistJson(FUNCTIONAL_SETTINGS_STORAGE_KEY, {
    useCache: useCacheEnabled,
    autoRetry: autoRetryEnabled,
    allowContact: allowContactCommands,
    batchDelayMs,
  });
}

function getLiveCacheKey(target, command) {
  return `${String(target || '').toLowerCase()}::${String(command || '').toLowerCase()}`;
}

function readStoredLiveCache() {
  const parsed = readStoredJson(LIVE_CACHE_STORAGE_KEY, {});
  return trimLiveCacheEntries(parsed && typeof parsed === 'object' ? parsed : {});
}

function updateCacheCountPill() {
  const pill = document.getElementById('cache-count-pill');
  if (!pill) return;
  const count = Object.keys(liveResponseCache || {}).length;
  pill.innerHTML = `<span class="dot dot-green"></span>${count} cached`;
}

function persistLiveCache() {
  liveResponseCache = trimLiveCacheEntries(liveResponseCache);
  persistJson(LIVE_CACHE_STORAGE_KEY, liveResponseCache);
  updateCacheCountPill();
}

function getCachedLiveLines(target, command) {
  const key = getLiveCacheKey(target, command);
  const hit = liveResponseCache[key];
  if (!hit || !Array.isArray(hit.lines)) return null;
  hit.ts = Date.now();
  persistLiveCache();
  return hit.lines.map(([type, text]) => [String(type), String(text)]);
}

function setCachedLiveLines(target, command, lines) {
  const key = getLiveCacheKey(target, command);
  liveResponseCache[key] = {
    ts: Date.now(),
    lines: Array.isArray(lines) ? lines.slice(-250).map(([type, text]) => [String(type), String(text)]) : [],
  };
  persistLiveCache();
}

function clearLiveCache() {
  liveResponseCache = {};
  persistJson(LIVE_CACHE_STORAGE_KEY, liveResponseCache);
  updateCacheCountPill();
  setTargetValidation('Cleared cached live command output.');
}

function trimLiveCacheEntries(cache) {
  const source = cache && typeof cache === 'object' ? cache : {};
  const entries = Object.entries(source);
  if (entries.length <= MAX_LIVE_CACHE_ITEMS) return source;
  const next = { ...source };
  entries.sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
  const trim = entries.length - MAX_LIVE_CACHE_ITEMS;
  for (let i = 0; i < trim; i++) {
    delete next[entries[i][0]];
  }
  return next;
}

function readStoredLastMediaUrl() {
  try { return localStorage.getItem(LAST_MEDIA_URL_STORAGE_KEY) || ''; }
  catch (_) { return ''; }
}

function persistLastMediaUrl(url) {
  try {
    if (url) localStorage.setItem(LAST_MEDIA_URL_STORAGE_KEY, url);
    else localStorage.removeItem(LAST_MEDIA_URL_STORAGE_KEY);
  } catch (_) {}
}

function updateMediaButtons() {
  const disabled = !lastMediaUrl;
  ['open-media-btn', 'save-media-btn', 'copy-media-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

function setLastMediaUrl(url) {
  lastMediaUrl = String(url || '').trim();
  persistLastMediaUrl(lastMediaUrl);
  updateMediaButtons();
}

function extractUrlsFromText(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi);
  return matches ? matches.map(u => u.replace(/[),.;]+$/, '')) : [];
}

function looksLikeMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const u = raw.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/.test(u)) return true;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (MEDIA_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return true;
  } catch (_) {}
  return false;
}

function hasMeaningfulOutput(payload) {
  return Array.isArray(payload)
    && payload.length > 0
    && payload.some(([, text]) => String(text || '').trim().length > 0);
}

function extractMediaUrlFromLines(lines, commandName = '') {
  if (!Array.isArray(lines)) return '';
  const candidates = [];
  lines.forEach(([, text]) => {
    extractUrlsFromText(String(text || '')).forEach(url => candidates.push(url));
  });
  if (!candidates.length) return '';
  // Osintgram `propic` outputs the primary profile picture URL first.
  if (commandName === 'propic') return candidates[0];
  return candidates.find(looksLikeMediaUrl) || candidates[0];
}

function openLastMedia() {
  if (!lastMediaUrl) return;
  window.open(lastMediaUrl, '_blank', 'noopener');
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function getMediaDownloadFilename(url) {
  const stamp = formatTimestampForFilename();
  try {
    const parsed = new URL(String(url || '').trim());
    const match = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i);
    const ext = match ? `.${match[1].toLowerCase()}` : '.jpg';
    return `oceangram-media-${stamp}${ext}`;
  } catch (_) {
    return `oceangram-media-${stamp}.jpg`;
  }
}

async function saveLastMedia() {
  if (!lastMediaUrl) return;
  const filename = getMediaDownloadFilename(lastMediaUrl);
  try {
    const res = await fetchWithTimeout(lastMediaUrl, { method: 'GET' }, API_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      triggerDownload(objectUrl, filename);
      setTargetValidation('Saved latest media locally.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 200);
    }
  } catch (_) {
    triggerDownload(lastMediaUrl, filename);
    setTargetValidation('Direct download fallback used for latest media.');
  }
}

async function copyLastMediaUrl() {
  if (!lastMediaUrl) return;
  try {
    await navigator.clipboard.writeText(lastMediaUrl);
    setTargetValidation('Copied latest media URL to clipboard.');
  } catch (_) {
    setTargetValidation('Unable to copy media URL.');
  }
}

function createEmptyProfileSummaryState(overrides = {}) {
  return {
    status: 'idle',
    statusText: 'Enter a username and backend URL to fetch a verified Instagram ID and profile image.',
    username: '',
    instagramId: '',
    profileImageUrl: '',
    source: '',
    verifiedAt: '',
    checks: [],
    ...overrides,
  };
}

function setProfileSummaryState(overrides = {}) {
  profileSummaryState = createEmptyProfileSummaryState({ ...profileSummaryState, ...overrides });
  renderProfileSummary();
}

function formatVerificationTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return '';
  }
}

function renderProfileSummary() {
  const shell = document.getElementById('profile-avatar-shell');
  const img = document.getElementById('profile-avatar-img');
  const status = document.getElementById('profile-summary-status');
  const username = document.getElementById('profile-username-value');
  const instagramId = document.getElementById('profile-id-value');
  const source = document.getElementById('profile-source-value');
  const verified = document.getElementById('profile-last-verified-value');
  const checksHost = document.getElementById('profile-checks');
  const refreshBtn = document.getElementById('refresh-identity-btn');
  if (!shell || !img || !status || !username || !instagramId || !source || !verified || !checksHost) return;

  const hasImage = !!profileSummaryState.profileImageUrl;
  shell.classList.toggle('has-image', hasImage);
  img.src = hasImage ? profileSummaryState.profileImageUrl : '';
  img.alt = profileSummaryState.username
    ? `Verified profile image for @${profileSummaryState.username}`
    : 'Instagram profile preview';
  status.textContent = profileSummaryState.statusText || 'No profile summary yet.';
  username.textContent = profileSummaryState.username ? `@${profileSummaryState.username}` : 'Awaiting lookup';
  username.classList.toggle('muted', !profileSummaryState.username);
  instagramId.textContent = profileSummaryState.instagramId || 'Not verified yet';
  instagramId.classList.toggle('muted', !profileSummaryState.instagramId);
  source.textContent = profileSummaryState.source || 'No backend response yet';
  source.classList.toggle('muted', !profileSummaryState.source);
  verified.textContent = profileSummaryState.verifiedAt ? formatVerificationTime(profileSummaryState.verifiedAt) : 'Not checked yet';
  verified.classList.toggle('muted', !profileSummaryState.verifiedAt);
  if (refreshBtn) refreshBtn.disabled = profileSummaryState.status === 'loading' || commandInFlight;

  checksHost.innerHTML = '';
  const checks = Array.isArray(profileSummaryState.checks) ? profileSummaryState.checks : [];
  if (!checks.length) {
    const empty = document.createElement('div');
    empty.className = 'profile-check';
    empty.innerHTML = '<div class="profile-check-head"><span class="dot dot-yellow"></span><span>Waiting for verification</span></div><div class="profile-check-detail">A live backend response is required before showing the Instagram ID and avatar.</div>';
    checksHost.appendChild(empty);
    return;
  }

  checks.forEach(check => {
    const item = document.createElement('div');
    item.className = `profile-check ${check.ok ? 'ok' : 'fail'}`;
    item.innerHTML = `
      <div class="profile-check-head">
        <span class="dot ${check.ok ? 'dot-green' : 'dot-red'}"></span>
        <span>${check.label}</span>
      </div>
      <div class="profile-check-detail">${check.detail}</div>`;
    checksHost.appendChild(item);
  });
}

function normalizeInstagramId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : '';
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(NUMERIC_ID_SEQUENCE_REGEX);
  return match ? match[0] : '';
}

function firstValidValue(values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getNestedValue(source, path) {
  const parts = String(path || '').split('.');
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function pickNestedValue(source, paths) {
  return firstValidValue((paths || []).map(path => getNestedValue(source, path)));
}

function isValidHttpUrl(raw) {
  try {
    const parsed = new URL(String(raw || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function extractIdentityFromStructuredPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const username = firstValidValue([
    pickNestedValue(data, ['username', 'user.username', 'profile.username', 'account.username', 'data.username']),
  ]).replace(/^@/, '');
  const instagramId = normalizeInstagramId(firstValidValue([
    pickNestedValue(data, ['instagram_id', 'instagramId', 'user.instagram_id', 'profile.instagram_id', 'account.instagram_id', 'data.instagram_id']),
    pickNestedValue(data, ['user.id', 'user.pk', 'profile.id', 'profile.pk', 'account.id', 'account.pk', 'data.id', 'data.pk', 'id', 'pk']),
  ]));
  const profileImageUrl = firstValidValue([
    pickNestedValue(data, ['profile_image_url', 'profile_image', 'profile_pic_url_hd', 'profile_pic_url', 'avatar_url', 'image_url', 'user.profile_pic_url_hd', 'user.profile_pic_url', 'profile.profile_pic_url_hd', 'profile.profile_pic_url', 'account.profile_pic_url_hd', 'account.profile_pic_url', 'data.profile_pic_url_hd', 'data.profile_pic_url']),
  ]);
  return {
    username,
    instagramId,
    profileImageUrl,
  };
}

function extractIdentityFromLines(lines) {
  if (!Array.isArray(lines)) return null;
  let username = '';
  let instagramId = '';
  const imageCandidates = [];
  lines.forEach(([, rawText]) => {
    const text = String(rawText || '').trim();
    if (!text) return;
    const usernameMatch = text.match(EXPLICIT_USERNAME_REGEX);
    if (!username && usernameMatch) username = usernameMatch[1];
    const idMatch = text.match(EXPLICIT_INSTAGRAM_ID_REGEX);
    if (!instagramId && idMatch) instagramId = idMatch[1];
    extractUrlsFromText(text).forEach(url => {
      if (looksLikeMediaUrl(url)) imageCandidates.push(url);
    });
  });
  return {
    username: (username || '').replace(/^@/, ''),
    instagramId: normalizeInstagramId(instagramId),
    profileImageUrl: imageCandidates[0] || '',
  };
}

function mergeIdentityCandidates(...candidates) {
  const merged = { username: '', instagramId: '', profileImageUrl: '' };
  candidates.filter(Boolean).forEach(candidate => {
    if (!merged.username && candidate.username) merged.username = String(candidate.username).replace(/^@/, '');
    if (!merged.instagramId && candidate.instagramId) merged.instagramId = normalizeInstagramId(candidate.instagramId);
    if (!merged.profileImageUrl && candidate.profileImageUrl) merged.profileImageUrl = String(candidate.profileImageUrl).trim();
  });
  return merged;
}

function usernamesMatch(expected, actual) {
  if (!expected || !actual) return false;
  return String(expected).replace(/^@/, '').toLowerCase() === String(actual).replace(/^@/, '').toLowerCase();
}

function preloadImage(url) {
  return new Promise(resolve => {
    if (!isValidHttpUrl(url)) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function validateApiBaseUrl(base) {
  if (!base) return 'Set backend URL first';
  try {
    const parsed = new URL(base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Use http:// or https:// backend URL';
  } catch (_) {
    return 'Invalid backend URL format';
  }
  return '';
}

function scheduleApiHealthCheck() {
  if (apiHealthDebounceId) {
    clearTimeout(apiHealthDebounceId);
    apiHealthDebounceId = null;
  }
  const base = getApiBaseUrl();
  const err = validateApiBaseUrl(base);
  if (err) {
    setApiHealthPill('warn', err);
    return;
  }
  setApiHealthPill('warn', 'Checking API...');
  apiHealthDebounceId = setTimeout(() => {
    apiClient.checkApiHealth();
  }, API_HEALTH_DEBOUNCE_MS);
}

function tryAcquireCommandLock() {
  if (commandInFlight) return false;
  commandInFlight = true;
  return true;
}

async function waitForBatchDelay(delayMs) {
  const end = Date.now() + delayMs;
  while (Date.now() < end) {
    if (cancelRunAll) return false;
    const step = Math.min(100, Math.max(20, end - Date.now()));
    await new Promise(resolve => setTimeout(resolve, step));
  }
  return !cancelRunAll;
}

function isEditableElement(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : '';
  return target.isContentEditable === true || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function parseLiveOutputLines(data) {
  if (Array.isArray(data?.lines) && data.lines.every(l =>
    Array.isArray(l)
    && l.length === 2
    && typeof l[0] === 'string'
    && LIVE_LINE_TYPES.has(l[0])
    && typeof l[1] === 'string'
  )) {
    return data.lines;
  }

  let rawOutput = data?.output;
  if (typeof rawOutput === 'undefined' || rawOutput === null || rawOutput === '') {
    rawOutput = data?.result;
  }
  if (typeof rawOutput === 'undefined' || rawOutput === null || rawOutput === '') return [];

  const normalized = Array.isArray(rawOutput) ? rawOutput : String(rawOutput).split('\n');
  return normalized.map(s => {
    const text = String(s);
    return ['result', text.length ? text : ' '];
  });
}

function setTargetValidation(message = '') {
  const el = document.getElementById('target-validation');
  if (!el) return;
  el.textContent = message;
}

function validateTarget(target) {
  if (!target) return 'Enter a target username.';
  if (!INSTAGRAM_USERNAME_REGEX.test(target)) return 'Invalid username format. Use 1-30 letters, numbers, dots, or underscores. No leading, trailing, or consecutive dots.';
  return '';
}

function getValidatedTarget() {
  const target = getTarget();
  const err = validateTarget(target);
  if (err) {
    setTargetValidation(err);
    return null;
  }
  setTargetValidation('');
  return target;
}

async function fetchLiveLines(target, cmd) {
  const result = await requestLiveCommandPayload(target, cmd);
  if (!result.ok) {
    return [
      ['prompt', `oceangram@osint:~$ python3 main.py ${target} --command ${cmd}`],
      ['dim', '════════════════════════════════════════════════'],
      ['warn', `[!] ${result.errorMessage}`],
      ['info', result.type === 'config'
        ? '  Update Backend API URL, then run the command again.'
        : result.type === 'empty'
          ? '  Backend responded, but no usable output was returned.'
          : autoRetryEnabled
            ? '  Retry failed. No fallback output is enabled.'
            : '  No fallback output is enabled.'],
    ];
  }
  return [
    ['prompt', `oceangram@osint:~$ python3 main.py ${target} --command ${cmd}`],
    ['dim', '════════════════════════════════════════════════'],
    ['label', `[ ${cmd} — ${result.source}${result.attempt > 1 ? ` retry #${result.attempt - 1}` : ''} ]`],
    ...result.lines,
    ['success', `[✔] Command completed${result.source === 'cache' ? ' (cached)' : ''}`],
  ];
}

async function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  if (!SUPPORTS_ABORT_CONTROLLER) {
    // Older browsers cannot cancel the underlying request, so we reject locally and ignore any late response.
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('Timed out');
          err.name = 'AbortError';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = API_TIMEOUT_MS) {
  return fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
}

async function parseJsonResponseStrict(response) {
  try {
    return await response.json();
  } catch (_) {
    const contentType = response?.headers?.get('content-type') || 'unknown content-type';
    throw new Error(`Invalid JSON response (${contentType})`);
  }
}

function isInvalidJsonError(err) {
  return /^Invalid JSON response/.test(err?.message || '');
}

async function requestLiveCommandPayload(target, cmd, options = {}) {
  const base = getApiBaseUrl();
  const baseErr = validateApiBaseUrl(base);
  if (baseErr) return { ok: false, type: 'config', errorMessage: baseErr };
  if (useCacheEnabled && !options.skipCache) {
    const cached = getCachedLiveLines(target, cmd);
    if (cached && cached.length) {
      return { ok: true, lines: cached, source: 'cache', attempt: 0, data: { output: cached.map(([, text]) => text) } };
    }
  }
  const url = new URL('/api/command', base);
  url.searchParams.set('target', target);
  url.searchParams.set('command', cmd);
  const maxAttempts = autoRetryEnabled ? LIVE_FETCH_TOTAL_ATTEMPTS : 1;
  let attempt = 0;
  let lastError = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const response = await fetchJsonWithTimeout(url.toString(), API_TIMEOUT_MS);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const data = await parseJsonResponseStrict(response);
      const payload = parseLiveOutputLines(data);
      if (!hasMeaningfulOutput(payload)) {
        return { ok: false, type: 'empty', errorMessage: 'Live backend returned no output', data };
      }
      if (useCacheEnabled) setCachedLiveLines(target, cmd, payload);
      return { ok: true, lines: payload, source: 'live', attempt, data };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) continue;
    }
  }
  const msg = lastError?.name === 'AbortError'
    ? 'request timed out'
    : isInvalidJsonError(lastError)
      ? lastError.message
      : 'connection error';
  return { ok: false, type: 'network', errorMessage: `Live request failed: ${msg}` };
}

async function requestProfileSummaryEndpoint(target) {
  const base = getApiBaseUrl();
  const baseErr = validateApiBaseUrl(base);
  if (baseErr) return { ok: false, reason: baseErr };
  let lastReason = 'No dedicated profile summary endpoint responded.';
  for (const endpoint of IDENTITY_ENDPOINTS) {
    try {
      const url = new URL(endpoint, `${base}/`);
      url.searchParams.set('target', target);
      const response = await fetchJsonWithTimeout(url.toString(), API_TIMEOUT_MS);
      if (!response.ok) {
        lastReason = `Profile summary endpoint responded ${response.status}`;
        continue;
      }
      const data = await parseJsonResponseStrict(response);
      const candidate = extractIdentityFromStructuredPayload(data);
      if (candidate && (candidate.instagramId || candidate.profileImageUrl)) {
        return { ok: true, candidate, source: endpoint.replace('/api/', 'endpoint: ') };
      }
      lastReason = 'Profile summary endpoint returned no usable identity data.';
    } catch (err) {
      lastReason = isInvalidJsonError(err)
        ? 'Profile summary endpoint returned invalid JSON.'
        : 'No dedicated profile summary endpoint responded.';
    }
  }
  return { ok: false, reason: lastReason };
}

function buildIdentityChecks(target, summary, runtime) {
  return [
    {
      label: 'Backend source responded',
      ok: !!runtime.responded,
      detail: runtime.responded ? `Identity data came from ${summary.source}.` : 'No usable live backend response was received.',
    },
    {
      label: 'Requested target matched',
      ok: !!runtime.targetMatched,
      detail: runtime.targetMatched
        ? `The returned profile matched @${target}.`
        : `The backend response did not match the requested username @${target}.`,
    },
    {
      label: 'Instagram ID extracted',
      ok: !!summary.instagramId,
      detail: summary.instagramId ? `Found numeric Instagram ID ${summary.instagramId}.` : 'No numeric Instagram ID could be verified.',
    },
    {
      label: 'Profile image URL verified',
      ok: !!runtime.imageUrlValid,
      detail: runtime.imageUrlValid ? 'A valid http(s) profile image URL was extracted.' : 'No valid http(s) profile image URL was found.',
    },
    {
      label: 'Profile image loaded',
      ok: !!runtime.imageLoaded,
      detail: runtime.imageLoaded ? 'The extracted avatar URL successfully loaded in the browser.' : 'The extracted avatar URL could not be loaded, so it was rejected.',
    },
  ];
}

async function loadProfileSummary(target, options = {}) {
  const expectedTarget = String(target || '').replace(/^@/, '').trim();
  const validationError = validateTarget(expectedTarget);
  const baseErr = validateApiBaseUrl(getApiBaseUrl());
  if (validationError) {
    setProfileSummaryState(createEmptyProfileSummaryState({ statusText: validationError, username: expectedTarget }));
    return null;
  }
  if (baseErr) {
    setProfileSummaryState(createEmptyProfileSummaryState({ statusText: baseErr, username: expectedTarget }));
    return null;
  }

  const requestId = ++activeIdentityRequestId;
  setProfileSummaryState({
    status: 'loading',
    statusText: options.manual
      ? `Refreshing minimum identity summary for @${expectedTarget}...`
      : `Verifying Instagram ID and profile image for @${expectedTarget}...`,
    username: expectedTarget,
    instagramId: '',
    profileImageUrl: '',
    source: '',
    verifiedAt: '',
    checks: [],
  });

  const endpointResult = await requestProfileSummaryEndpoint(expectedTarget);
  const [infoResult, propicResult] = await Promise.all([
    requestLiveCommandPayload(expectedTarget, 'info'),
    requestLiveCommandPayload(expectedTarget, 'propic'),
  ]);
  if (requestId !== activeIdentityRequestId) return null;

  const infoIdentity = infoResult.ok
    ? mergeIdentityCandidates(
      extractIdentityFromStructuredPayload(infoResult.data),
      extractIdentityFromLines(infoResult.lines),
    )
    : null;
  const propicIdentity = propicResult.ok
    ? mergeIdentityCandidates(
      extractIdentityFromStructuredPayload(propicResult.data),
      extractIdentityFromLines(propicResult.lines),
    )
    : null;
  const endpointIdentity = endpointResult.ok ? endpointResult.candidate : null;
  const mergedForIdentity = mergeIdentityCandidates(endpointIdentity, infoIdentity, propicIdentity);
  const mergedForImage = mergeIdentityCandidates(endpointIdentity, propicIdentity, infoIdentity);
  const mergedIdentity = {
    username: mergedForIdentity.username,
    instagramId: mergedForIdentity.instagramId,
    profileImageUrl: mergedForImage.profileImageUrl,
  };
  const targetMatched = usernamesMatch(expectedTarget, mergedIdentity.username);
  const imageUrlValid = isValidHttpUrl(mergedIdentity.profileImageUrl);
  const imageLoaded = imageUrlValid ? await preloadImage(mergedIdentity.profileImageUrl) : false;
  if (requestId !== activeIdentityRequestId) return null;

  const responded = !!(endpointResult.ok || infoResult.ok || propicResult.ok);
  const usableSummary = targetMatched
    ? {
      username: mergedIdentity.username || expectedTarget,
      instagramId: mergedIdentity.instagramId,
      profileImageUrl: imageLoaded ? mergedIdentity.profileImageUrl : '',
      source: endpointResult.ok
        ? endpointResult.source
        : infoResult.ok && propicResult.ok
          ? 'commands: info + propic'
          : infoResult.ok
            ? 'command: info'
            : propicResult.ok
              ? 'command: propic'
              : '',
    }
    : {
      username: expectedTarget,
      instagramId: '',
      profileImageUrl: '',
      source: responded ? 'backend mismatch rejected' : '',
    };
  const checks = buildIdentityChecks(expectedTarget, usableSummary, { responded, targetMatched, imageUrlValid, imageLoaded });
  const fullyVerified = responded && targetMatched && !!usableSummary.instagramId && imageLoaded;
  setProfileSummaryState({
    status: fullyVerified ? 'ready' : 'partial',
    statusText: fullyVerified
      ? `Verified @${usableSummary.username}: live Instagram ID and loadable profile image confirmed.`
      : responded
        ? `Partial verification for @${expectedTarget}. Review the failed checks below before trusting the data.`
        : `Unable to verify @${expectedTarget}. Backend did not return usable identity data.`,
    username: usableSummary.username,
    instagramId: usableSummary.instagramId,
    profileImageUrl: usableSummary.profileImageUrl,
    source: usableSummary.source,
    verifiedAt: responded ? new Date().toISOString() : '',
    checks,
  });
  return profileSummaryState;
}

function scheduleIdentitySummaryRefresh() {
  if (identityRefreshDebounceId) {
    clearTimeout(identityRefreshDebounceId);
    identityRefreshDebounceId = null;
  }
  const target = getTarget();
  if (!target) {
    activeIdentityRequestId += 1;
    setProfileSummaryState(createEmptyProfileSummaryState());
    return;
  }
  const validationError = validateTarget(target);
  const baseErr = validateApiBaseUrl(getApiBaseUrl());
  if (validationError || baseErr) {
    setProfileSummaryState(createEmptyProfileSummaryState({
      username: target,
      statusText: validationError || baseErr,
    }));
    return;
  }
  identityRefreshDebounceId = setTimeout(() => {
    apiClient.loadProfileSummary(target);
  }, IDENTITY_REFRESH_DEBOUNCE_MS);
}

function refreshIdentitySummary() {
  const target = getTarget();
  if (!target) {
    setTargetValidation('Enter a target username first.');
    return;
  }
  apiClient.loadProfileSummary(target, { manual: true });
}

function getVisibleCommands() {
  const q = commandSearchText.trim().toLowerCase();
  const filtered = COMMANDS.filter(c => {
    if (currentCategory === 'favorites' && !favoriteCommandIds.has(c.id)) return false;
    if (currentCategory !== 'all' && currentCategory !== 'favorites' && c.cat !== currentCategory) return false;
    if (!q) return true;
    const haystack = `${c.name} ${c.cat} ${c.desc}`.toLowerCase();
    return haystack.includes(q);
  });
  return sortCommands(filtered);
}

function sortCommands(list) {
  const sorted = [...list];
  if (sortMode === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode === 'category') {
    sorted.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  } else if (sortMode === 'used') {
    sorted.sort((a, b) => (commandRunCounts[b.id] || 0) - (commandRunCounts[a.id] || 0) || a.name.localeCompare(b.name));
  }
  return sorted;
}

function toggleFavorite(commandId, evt) {
  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (favoriteCommandIds.has(commandId)) favoriteCommandIds.delete(commandId);
  else favoriteCommandIds.add(commandId);
  persistFavorites();
  renderCards();
}

function updateVisibleCount(count) {
  const pill = document.getElementById('visible-count-pill');
  if (!pill) return;
  pill.innerHTML = `<span class="dot dot-green"></span>${count} visible`;
}

function updateRunCountPill() {
  const pill = document.getElementById('run-count-pill');
  if (!pill) return;
  const totalRuns = Object.values(commandRunCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  pill.innerHTML = `<span class="dot dot-green"></span>${totalRuns} command runs`;
}

function addRecentCommand(commandId, target) {
  recentCommands = [{ commandId, target }, ...recentCommands
    .filter(x => !(x.commandId === commandId && x.target === target))]
    .slice(0, MAX_RECENT_COMMANDS);
  persistRecentCommands();
  renderRecentCommands();
}

function renderRecentCommands() {
  const host = document.getElementById('recent-commands');
  if (!host) return;
  host.innerHTML = '';
  if (!recentCommands.length) {
    host.innerHTML = '<div class="t-dim">No command history yet.</div>';
    return;
  }
  recentCommands.forEach((item, idx) => {
    const b = document.createElement('button');
    b.className = 'recent-chip';
    b.textContent = `@${item.target} :: ${item.commandId}`;
    b.addEventListener('click', () => rerunRecent(idx));
    host.appendChild(b);
  });
}

async function rerunRecent(index) {
  const item = recentCommands[index];
  if (!item) return;
  const cmd = COMMANDS.find(c => c.id === item.commandId);
  if (!cmd) return;
  const tInput = document.getElementById('target-input');
  if (tInput) tInput.value = item.target;
  await runCommand(cmd, item.target);
}

function addRecentTarget(target) {
  if (!target) return;
  recentTargets = [target, ...recentTargets.filter(t => t !== target)].slice(0, MAX_RECENT_TARGETS);
  persistRecentTargets();
  renderRecentTargets();
}

function clearRecentTargets() {
  recentTargets = [];
  persistRecentTargets();
  renderRecentTargets();
  setTargetValidation('Recent targets cleared.');
}

function clearRecentCommands() {
  recentCommands = [];
  persistRecentCommands();
  renderRecentCommands();
  setTargetValidation('Recent commands cleared.');
}

function renderRecentTargets() {
  const host = document.getElementById('recent-targets-list');
  if (!host) return;
  host.innerHTML = '';
  if (!recentTargets.length) {
    host.innerHTML = '<div class="t-dim">No recent targets yet.</div>';
    return;
  }
  recentTargets.forEach(target => {
    const chip = document.createElement('button');
    chip.className = 'target-chip';
    chip.textContent = `@${target}`;
    chip.addEventListener('click', () => {
      const input = document.getElementById('target-input');
      if (input) input.value = target;
      setTargetValidation('');
    });
    host.appendChild(chip);
  });
}

function registerCommandRun(command, target) {
  commandRunCounts[command.id] = (commandRunCounts[command.id] || 0) + 1;
  persistRunCounts();
  lastRunContext = { commandId: command.id, target };
  updateRunCountPill();
}

function setApiHealthPill(status, text) {
  const pill = document.getElementById('api-health-pill');
  if (!pill) return;
  if (status === 'ok') pill.innerHTML = `<span class="dot dot-green"></span>${text}`;
  else if (status === 'warn') pill.innerHTML = `<span class="dot dot-yellow"></span>${text}`;
  else pill.innerHTML = `<span class="dot dot-red"></span>${text}`;
}

async function checkApiHealth() {
  const base = getApiBaseUrl();
  const baseErr = validateApiBaseUrl(base);
  if (baseErr) {
    setApiHealthPill('warn', baseErr);
    return;
  }
  const btn = document.getElementById('api-health-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetchWithTimeout(`${base}/api/health`, { method: 'GET' }, API_HEALTH_CHECK_TIMEOUT_MS);
    if (res.ok) setApiHealthPill('ok', 'API reachable');
    else setApiHealthPill('warn', `API responded ${res.status}`);
  } catch (_) {
    setApiHealthPill('error', 'API unreachable');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function resetTerminal() {
  const body = document.getElementById('terminal-body');
  if (!body) return;
  body.innerHTML = '';
  INITIAL_TERMINAL_LINES.forEach(([type, text]) => {
    const d = document.createElement('div');
    d.className = `t-${type}`;
    d.textContent = text;
    body.appendChild(d);
  });
  const last = document.createElement('div');
  last.className = 't-dim mt-8';
  last.innerHTML = '<span class="t-cursor"></span>';
  body.appendChild(last);
}

function clearTerminal() {
  resetTerminal();
}

function exportTerminal() {
  const body = document.getElementById('terminal-body');
  if (!body) return;
  const text = Array.from(body.children).map(el => el.textContent || '').join('\n').trim();
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = formatTimestampForFilename();
  a.download = `oceangram-terminal-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatTimestampForFilename() {
  return new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
}

async function retryLastCommand() {
  if (!lastRunContext) {
    setTargetValidation('No previous command to retry yet.');
    return;
  }
  const cmd = COMMANDS.find(c => c.id === lastRunContext.commandId);
  if (!cmd) {
    setTargetValidation('Last command is no longer available.');
    return;
  }
  const tInput = document.getElementById('target-input');
  if (tInput) tInput.value = lastRunContext.target;
  await runCommand(cmd, lastRunContext.target);
}

async function runFirstVisibleCommand() {
  const target = getValidatedTarget();
  if (!target) return;
  const visible = getVisibleCommands();
  if (!visible.length) {
    setTargetValidation('No commands match the current filters. Try adjusting the category or search query.');
    return;
  }
  await runCommand(visible[0], target);
}

function setRunAllButtonState(running) {
  const btn = document.getElementById('run-all-btn');
  if (!btn) return;
  btn.textContent = running ? RUN_ALL_LABEL_STOP : RUN_ALL_LABEL_DEFAULT;
  btn.classList.toggle('stop-mode', running);
  btn.disabled = false;
}

function setCommandBusyState(isBusy) {
  commandInFlight = isBusy;
  document.querySelectorAll('.command-card').forEach(card => {
    card.classList.toggle('command-card-disabled', isBusy);
    card.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
    card.setAttribute('tabindex', isBusy ? '-1' : '0');
  });
  const diveBtn = document.getElementById('dive-btn');
  if (diveBtn) diveBtn.disabled = isBusy;
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) retryBtn.disabled = isBusy;
  const apiHealthBtn = document.getElementById('api-health-btn');
  if (apiHealthBtn) apiHealthBtn.disabled = isBusy;
  const runFirstBtn = document.getElementById('run-first-btn');
  if (runFirstBtn) runFirstBtn.disabled = isBusy;
  const runAllBtn = document.getElementById('run-all-btn');
  if (runAllBtn && !runAllInProgress) runAllBtn.disabled = isBusy;
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) clearCacheBtn.disabled = isBusy;
  const refreshIdentityBtn = document.getElementById('refresh-identity-btn');
  if (refreshIdentityBtn) refreshIdentityBtn.disabled = isBusy || profileSummaryState.status === 'loading';
  ['open-media-btn', 'save-media-btn', 'copy-media-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn && !lastMediaUrl) btn.disabled = true;
  });
}

async function runCommand(c, providedTarget = null) {
  if (!tryAcquireCommandLock()) {
    setTargetValidation('A command is already running. Please wait for it to finish.');
    return;
  }
  if (!allowContactCommands && isContactCommand(c)) {
    commandInFlight = false;
    setTargetValidation('Contact commands are safety-locked. Enable "Allow contact commands" to continue.');
    return;
  }
  const target = providedTarget ?? getValidatedTarget();
  if (!target) {
    commandInFlight = false;
    return;
  }
  setCommandBusyState(true);
  try {
    document.querySelectorAll('.command-card').forEach(el => el.classList.remove('active-card'));
    const el = document.querySelector(`.command-card[data-id="${c.id}"]`);
    if (el) el.classList.add('active-card');
    const lines = await apiClient.fetchLiveLines(target, c.name);
    const mediaUrl = extractMediaUrlFromLines(lines, c.name);
    if (mediaUrl) {
      setLastMediaUrl(mediaUrl);
      setTargetValidation(`Detected media URL from ${c.name}. Use OPEN/SAVE/COPY MEDIA.`);
    }
    registerCommandRun(c, target);
    addRecentTarget(target);
    addRecentCommand(c.id, target);
    await animateOutput(lines);
    renderCards();
    document.querySelector('.terminal-wrap').scrollIntoView({ behavior:'smooth', block:'nearest' });
  } finally {
    setCommandBusyState(false);
  }
}

function startScan() {
  const target = getValidatedTarget();
  if (!target) return;
  apiClient.loadProfileSummary(target);
  addRecentTarget(target);
  const btn = document.getElementById('dive-btn');
  btn.classList.add('loading');
  setTimeout(() => {
    btn.classList.remove('loading');
    animateOutput([
      ['prompt',  `oceangram@osint:~$ oceangram --target ${target}`],
      ['dim',     '════════════════════════════════════════════════'],
      ['info',    `  Initialising bioluminescent scan for: @${target}`],
      ['result',  `  Checking if account is public…`],
      ['success', `  [✔] @${target} is accessible`],
      ['info',    `  Ready — click any command card to begin your dive.`],
      ['dim',     `  ── 20 commands available ──`],
    ]);
    document.querySelector('.commands-grid').scrollIntoView({ behavior:'smooth', block:'start' });
  }, 1200);
}

async function runAllVisibleCommands() {
  if (runAllInProgress) {
    cancelRunAll = true;
    setTargetValidation('Stopping batch run after current command...');
    return;
  }
  const target = getValidatedTarget();
  if (!target) return;
  const visible = getVisibleCommands();
  if (!visible.length) {
    setTargetValidation('No commands match the current filters. Try adjusting the category or search query.');
    return;
  }
  const runnable = allowContactCommands ? visible : visible.filter(c => !isContactCommand(c));
  if (!runnable.length) {
    setTargetValidation('All visible commands are contact commands and safety lock is enabled.');
    return;
  }
  const skipped = visible.length - runnable.length;
  runAllInProgress = true;
  cancelRunAll = false;
  setRunAllButtonState(true);
  try {
    for (let i = 0; i < runnable.length; i++) {
      if (cancelRunAll) break;
      const c = runnable[i];
      setTargetValidation(`Running ${i + 1}/${runnable.length}: ${c.name}`);
      // Sequential to preserve terminal readability.
      await runCommand(c, target);
      if (cancelRunAll) break;
      if (batchDelayMs > 0 && i < runnable.length - 1) {
        const continueBatch = await waitForBatchDelay(batchDelayMs);
        if (!continueBatch) break;
      }
    }
    if (cancelRunAll) setTargetValidation(`Batch run stopped for @${target}.`);
    else if (skipped > 0) setTargetValidation(`Completed ${runnable.length} commands for @${target}. Skipped ${skipped} contact commands (safety lock).`);
    else setTargetValidation(`Completed ${runnable.length} commands for @${target}.`);
  } finally {
    runAllInProgress = false;
    cancelRunAll = false;
    setRunAllButtonState(false);
  }
}

document.getElementById('target-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startScan();
});

/* ═══════════════════════════════════════════════════════════
   COPY CODE
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
Object.assign(globalThis, {
  startScan,
  refreshIdentitySummary,
  checkApiHealth,
  clearRecentTargets,
  runFirstVisibleCommand,
  runAllVisibleCommands,
  clearLiveCache,
  filterCards,
  retryLastCommand,
  openLastMedia,
  saveLastMedia,
  copyLastMediaUrl,
  clearTerminal,
  exportTerminal,
  clearRecentCommands,
  copyCode,
});

initNextLevelAesthetics();
const apiInput = document.getElementById('api-url-input');
if (apiInput) {
  apiInput.value = readStoredApiBaseUrl();
  apiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apiClient.checkApiHealth();
    }
  });
  apiInput.addEventListener('change', () => {
    const normalized = getApiBaseUrl();
    apiInput.value = normalized;
    persistApiBaseUrl(normalized);
    setLiveModePill();
    scheduleApiHealthCheck();
    scheduleIdentitySummaryRefresh();
  });
  apiInput.addEventListener('input', () => {
    persistApiBaseUrl(getApiBaseUrl());
    setLiveModePill();
    scheduleApiHealthCheck();
    scheduleIdentitySummaryRefresh();
  });
}
const cmdSearchInput = document.getElementById('command-search-input');
if (cmdSearchInput) {
  cmdSearchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    runFirstVisibleCommand();
  });
  cmdSearchInput.addEventListener('input', () => {
    commandSearchText = cmdSearchInput.value || '';
    persistCommandUiState();
    renderCards();
  });
}
const cmdSortSelect = document.getElementById('command-sort-select');
if (cmdSortSelect) {
  cmdSortSelect.addEventListener('change', () => {
    sortMode = cmdSortSelect.value || 'default';
    persistCommandUiState();
    renderCards();
  });
}
const useCacheToggle = document.getElementById('use-cache-toggle');
if (useCacheToggle) {
  useCacheToggle.addEventListener('change', () => {
    useCacheEnabled = !!useCacheToggle.checked;
    persistFunctionalSettings();
  });
}
const autoRetryToggle = document.getElementById('auto-retry-toggle');
if (autoRetryToggle) {
  autoRetryToggle.addEventListener('change', () => {
    autoRetryEnabled = !!autoRetryToggle.checked;
    persistFunctionalSettings();
  });
}
const allowContactToggle = document.getElementById('allow-contact-toggle');
if (allowContactToggle) {
  allowContactToggle.addEventListener('change', () => {
    allowContactCommands = !!allowContactToggle.checked;
    persistFunctionalSettings();
    if (!allowContactCommands && currentCategory === 'Contact') {
      setTargetValidation('Contact safety lock is on. Contact commands remain visible but are blocked.');
    }
  });
}
const batchDelayInput = document.getElementById('batch-delay-input');
if (batchDelayInput) {
  batchDelayInput.addEventListener('change', () => {
    const parsed = Number(batchDelayInput.value);
    batchDelayMs = Number.isFinite(parsed)
      ? Math.max(MIN_BATCH_DELAY_MS, Math.min(MAX_BATCH_DELAY_MS, parsed))
      : DEFAULT_FUNCTIONAL_SETTINGS.batchDelayMs;
    batchDelayInput.value = String(batchDelayMs);
    persistFunctionalSettings();
  });
}
const targetInput = document.getElementById('target-input');
if (targetInput) {
  targetInput.addEventListener('input', () => {
    if (!targetInput.value.trim()) setTargetValidation('');
    scheduleIdentitySummaryRefresh();
  });
}
document.addEventListener('keydown', (e) => {
  const key = (e.key || '').toLowerCase();
  const withMeta = e.ctrlKey || e.metaKey;
  const target = e.target;
  const isEditable = isEditableElement(target);
  // Keep normal typing behavior in editable fields, except global discoverability shortcuts.
  if (isEditable && !(withMeta && key === 'k') && key !== 'escape') return;
  if (withMeta && key === 'enter') {
    e.preventDefault();
    runAllVisibleCommands();
    return;
  }
  if (withMeta && key === 'k') {
    const search = document.getElementById('command-search-input');
    if (!search) return;
    e.preventDefault();
    search.focus();
    search.select();
    return;
  }
  if (key === 'escape') {
    setTargetValidation('');
  }
});
initStoredState();
liveResponseCache = readStoredLiveCache();
persistLiveCache();
const functionalSettings = readStoredFunctionalSettings();
useCacheEnabled = functionalSettings.useCache;
autoRetryEnabled = functionalSettings.autoRetry;
allowContactCommands = functionalSettings.allowContact;
batchDelayMs = functionalSettings.batchDelayMs;
lastMediaUrl = readStoredLastMediaUrl();
const commandUiState = readStoredCommandUiState();
setActiveCategory(commandUiState.category);
commandSearchText = commandUiState.search;
sortMode = commandUiState.sort;
if (cmdSearchInput) cmdSearchInput.value = commandSearchText;
if (cmdSortSelect) cmdSortSelect.value = sortMode;
if (useCacheToggle) useCacheToggle.checked = useCacheEnabled;
if (autoRetryToggle) autoRetryToggle.checked = autoRetryEnabled;
if (allowContactToggle) allowContactToggle.checked = allowContactCommands;
if (batchDelayInput) batchDelayInput.value = String(batchDelayMs);
setLiveModePill();
const initialApiErr = validateApiBaseUrl(getApiBaseUrl());
setApiHealthPill('warn', initialApiErr || 'API status unknown');
renderRecentTargets();
renderRecentCommands();
updateRunCountPill();
updateCacheCountPill();
updateMediaButtons();
renderProfileSummary();
resetTerminal();
renderCards();
