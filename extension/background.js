import { DEFAULT_SETTINGS, OFFICIAL_DAILY_MAX, dailyMinutes, getStatus, validateSettings } from './schedule.js';

const LOCK_URL = chrome.runtime.getURL('lock.html');
const YOUTUBE_HOME = 'https://www.youtube.com/';
const YOUTUBE_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'youtubekids.com', 'youtu.be'];
const KIDS_DOMAIN = 'youtubekids.com';
// Google's sign-in passes through this host for every Google site, so locking it would break Gmail and Drive.
const SIGN_IN_HOST = 'accounts.youtube.com';
const YOUTUBE_TAB_URLS = [
  '*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.youtubekids.com/*', '*://youtu.be/*',
];

const RULE_CHILD = 101;
const RULE_CHILD_EMBED = 102;
const RULE_PARENT = 103;
const PBKDF2_ITERATIONS = 200000;
const MIN_PASSWORD = 4;
const FREE_ATTEMPTS = 5;

// ---- Reading state

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getParentAccess() {
  const { parent } = await chrome.storage.session.get('parent');
  if (!parent) return null;
  return parent.until === null || parent.until > Date.now() ? parent : null;
}

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isYouTube(url) {
  try {
    const { hostname } = new URL(url);
    return hostname !== SIGN_IN_HOST && YOUTUBE_DOMAINS.some(d => hostMatches(hostname, d));
  } catch {
    return false;
  }
}

function isKids(url) {
  try {
    return hostMatches(new URL(url).hostname, KIDS_DOMAIN);
  } catch {
    return false;
  }
}

function isAllowed(url, { parent, session }) {
  if (!isYouTube(url) || parent) return true;
  return session && isKids(url);
}

async function getAccess() {
  const [settings, parent] = await Promise.all([getSettings(), getParentAccess()]);
  const status = getStatus(settings);
  return { settings, status, parentAccess: parent, parent: Boolean(parent), session: status.state === 'session' };
}

// ---- Applying state. Session rules vanish on restart, so a crash always falls back to locked.

function desiredRules({ parent, session }) {
  if (parent) {
    return [{
      id: RULE_PARENT, priority: 2, action: { type: 'allow' },
      condition: { requestDomains: YOUTUBE_DOMAINS, resourceTypes: ['main_frame', 'sub_frame'] },
    }];
  }
  if (session) {
    return [
      {
        id: RULE_CHILD, priority: 2, action: { type: 'allow' },
        condition: { requestDomains: [KIDS_DOMAIN], resourceTypes: ['main_frame', 'sub_frame'] },
      },
      {
        id: RULE_CHILD_EMBED, priority: 2, action: { type: 'allow' },
        condition: {
          requestDomains: ['youtube.com', 'youtube-nocookie.com'],
          initiatorDomains: [KIDS_DOMAIN],
          resourceTypes: ['sub_frame'],
        },
      },
    ];
  }
  return [];
}

async function applyRules(access) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_CHILD, RULE_CHILD_EMBED, RULE_PARENT],
    addRules: desiredRules(access),
  });
}

async function closeBlockedTabs(access) {
  const tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS });
  await Promise.all(tabs
    .filter(tab => !isAllowed(tab.url, access))
    .map(tab => chrome.tabs.update(tab.id, { url: LOCK_URL }).catch(() => {})));
}

async function scheduleNextChange(access) {
  const parentUntil = access.parentAccess?.until;
  const times = [access.status.nextChange, parentUntil].filter(Boolean);
  await chrome.alarms.clear('boundary');
  if (times.length) await chrome.alarms.create('boundary', { when: Math.max(Date.now() + 1000, Math.min(...times)) });
}

let queue = Promise.resolve();
function sync() {
  queue = queue.catch(() => {}).then(async () => {
    const access = await getAccess();
    await applyRules(access);
    await closeBlockedTabs(access);
    await scheduleNextChange(access);
  });
  return queue;
}

async function countWatchedMinute() {
  const tabs = await chrome.tabs.query({ url: '*://*.youtubekids.com/*', active: true });
  if (!tabs.length) return;
  const today = new Date().toDateString();
  const { watched } = await chrome.storage.local.get('watched');
  const minutes = watched?.day === today ? watched.minutes + 1 : 1;
  await chrome.storage.local.set({ watched: { day: today, minutes } });
}

// ---- Password

const toHex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));

async function derive(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

async function storePassword(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  await chrome.storage.local.set({ password: { salt, hash: await derive(password, salt) }, attempts: { count: 0, until: 0 } });
}

async function checkPassword(password) {
  const { password: stored, attempts = { count: 0, until: 0 } } = await chrome.storage.local.get(['password', 'attempts']);
  if (!stored) return { ok: false, error: 'no-password' };
  if (attempts.until > Date.now()) return { ok: false, retryIn: attempts.until - Date.now() };
  if (typeof password === 'string' && await derive(password, stored.salt) === stored.hash) {
    await chrome.storage.local.set({ attempts: { count: 0, until: 0 } });
    return { ok: true };
  }
  const count = attempts.count + 1;
  const delay = count >= FREE_ATTEMPTS ? 30000 * 2 ** (count - FREE_ATTEMPTS) : 0;
  await chrome.storage.local.set({ attempts: { count, until: delay ? Date.now() + delay : 0 } });
  return { ok: false, retryIn: delay };
}

// ---- Messages

const handlers = {
  async status() {
    const { settings, status, parentAccess } = await getAccess();
    const { password, watched } = await chrome.storage.local.get(['password', 'watched']);
    return {
      status,
      settings,
      hasPassword: Boolean(password),
      parent: parentAccess,
      watchedToday: watched?.day === new Date().toDateString() ? watched.minutes : 0,
      plannedMinutes: dailyMinutes(settings),
      officialMax: OFFICIAL_DAILY_MAX,
    };
  },

  async setPassword({ password }) {
    const { password: stored } = await chrome.storage.local.get('password');
    if (stored) return { ok: false, error: 'exists' };
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) return { ok: false, error: 'short' };
    await storePassword(password);
    return { ok: true };
  },

  async changePassword({ current, next }) {
    if (typeof next !== 'string' || next.length < MIN_PASSWORD) return { ok: false, error: 'short' };
    const check = await checkPassword(current);
    if (!check.ok) return check;
    await storePassword(next);
    return { ok: true };
  },

  async unlock({ password, minutes }, sender) {
    const check = await checkPassword(password);
    if (!check.ok) return check;
    await chrome.storage.session.set({ parent: { until: minutes ? Date.now() + minutes * 60000 : null } });
    await sync();
    const key = `pending-${sender.tab?.id}`;
    const stored = await chrome.storage.session.get(key);
    await chrome.storage.session.remove(key);
    return { ok: true, url: stored[key] ?? YOUTUBE_HOME };
  },

  async lockNow() {
    await chrome.storage.session.remove('parent');
    await sync();
    return { ok: true };
  },

  async saveSettings({ password, settings }) {
    const check = await checkPassword(password);
    if (!check.ok) return check;
    const errors = validateSettings(settings);
    if (errors.length) return { ok: false, errors };
    await chrome.storage.local.set({ settings });
    await sync();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !handlers[message?.type]) return false;
  handlers[message.type](message, sender).then(reply, () => reply({ ok: false, error: 'failed' }));
  return true;
});

// ---- Events

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.alarms.create('tick', { periodInMinutes: 1 });
  await sync();
  if (reason === 'install') await chrome.tabs.create({ url: `${LOCK_URL}#setup` });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create('tick', { periodInMinutes: 1 });
  await sync();
});

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name === 'tick') await countWatchedMinute();
  await sync();
});

const navigationFilter = { url: YOUTUBE_DOMAINS.map(hostSuffix => ({ hostSuffix })) };

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0 && isYouTube(url)) chrome.storage.session.set({ [`pending-${tabId}`]: url });
}, navigationFilter);

// Catches pages YouTube's own service worker serves without a network request.
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || !isYouTube(url)) return;
  const access = await getAccess();
  if (!isAllowed(url, access)) await chrome.tabs.update(tabId, { url: LOCK_URL });
}, navigationFilter);

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`pending-${tabId}`));

sync();
