#!/usr/bin/env node
// End-to-end checks in real Chrome. Run: node tests/e2e.mjs <profile-dir> [shots-dir]
// Uses a throwaway profile, a throwaway test password and a local page for the cross-site cases.
import { Browser } from './cdp.mjs';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXTENSION = resolve(import.meta.dirname, '../extension');
const PROFILE = resolve(process.argv[2]);
const SHOTS = resolve(process.argv[3] ?? `${PROFILE}-shots`);
const TEST_PASSWORD = 'test-1234';
// Headless Chrome announces itself as HeadlessChrome, and YouTube Kids refuses that as an old browser.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = new Browser();
let extensionId;

async function load() {
  browser.start(PROFILE, [`--user-agent=${USER_AGENT}`]);
  await sleep(1500);
  const { id } = await browser.send('Extensions.loadUnpacked', { path: EXTENSION });
  extensionId = id;
  await sleep(1500);
}

async function openTab(url = 'about:blank') {
  const { targetId } = await browser.send('Target.createTarget', { url });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  await browser.send('Page.enable', {}, sessionId);
  await browser.send('Runtime.enable', {}, sessionId);
  return { targetId, sessionId };
}
const closeTab = tab => browser.send('Target.closeTarget', { targetId: tab.targetId });
async function evaluate(tab, expression) {
  const { result, exceptionDetails } = await browser.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true }, tab.sessionId);
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 400));
  return result.value;
}
const go = (tab, url) => browser.send('Page.navigate', { url }, tab.sessionId);
async function urlOf(tab) {
  const { entries, currentIndex } = await browser.send('Page.getNavigationHistory', {}, tab.sessionId);
  return entries[currentIndex].url;
}
async function shot(tab, name) {
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, tab.sessionId);
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
}
const isLock = url => url.startsWith(`chrome-extension://${extensionId}/lock.html`);
async function settledUrl(tab, ms = 2500) {
  await sleep(ms);
  return urlOf(tab);
}

async function openLock() {
  const tab = await openTab(`chrome-extension://${extensionId}/lock.html`);
  await sleep(900);
  return tab;
}
const message = (tab, body) => evaluate(tab, `chrome.runtime.sendMessage(${JSON.stringify(body)})`);

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function settingsFrom(sessionStart, minutes) {
  return {
    sessions: [{ start: hhmm(sessionStart), minutes }],
    lunch: '13:00', nap: '15:00', bedtime: '23:59', wake: '00:01',
  };
}

// A local page standing in for "another website".
const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><title>other site</title>
    <a id="link" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">watch</a>
    <iframe id="embed" src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="400" height="240"></iframe>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const OTHER = `http://127.0.0.1:${server.address().port}/`;

try {
  await load();
  check('extension loads in real Chrome', Boolean(extensionId), extensionId);

  const lock = await openLock();
  const first = await message(lock, { type: 'status' });
  check('no password yet on first run', first.hasPassword === false);
  check('first-run box asks for a password', await evaluate(lock, `document.getElementById('adult').open`));
  await shot(lock, 'setup');
  await evaluate(lock, `document.getElementById('adult').close()`);
  check('a short password is refused', !(await message(lock, { type: 'setPassword', password: '12' })).ok);
  check('password is set', (await message(lock, { type: 'setPassword', password: TEST_PASSWORD })).ok);
  check('a second setup cannot replace it', !(await message(lock, { type: 'setPassword', password: 'hijack-1' })).ok);

  // A schedule with no session running now, so everything below starts locked.
  const away = new Date(Date.now() + 3 * 3600000);
  check('schedule can be saved with the password',
    (await message(lock, { type: 'saveSettings', password: TEST_PASSWORD, settings: settingsFrom(away, 20) })).ok);
  check('schedule refuses a wrong password',
    !(await message(lock, { type: 'saveSettings', password: 'wrong', settings: settingsFrom(away, 20) })).ok);

  // ---- Locked
  const tab = await openTab();
  for (const url of [
    'https://www.youtube.com/', 'https://youtube.com/', 'https://m.youtube.com/',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/abc',
    'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtubekids.com/', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) {
    await go(tab, url);
    const final = await settledUrl(tab);
    check(`locked: ${url}`, isLock(final), isLock(final) ? '' : final);
  }

  await go(tab, OTHER);
  await sleep(1200);
  await evaluate(tab, `document.getElementById('link').click()`);
  const fromLink = await settledUrl(tab);
  check('locked: link clicked on another website', isLock(fromLink), isLock(fromLink) ? '' : fromLink);

  await go(tab, OTHER);
  await sleep(2500);
  const { frameTree } = await browser.send('Page.getFrameTree', {}, tab.sessionId);
  const embed = frameTree.childFrames?.[0]?.frame;
  check('locked: embed on another website does not load', Boolean(embed?.url?.startsWith('chrome-error:')), embed?.url);
  await shot(tab, 'embed-blocked');

  // ---- Parent
  const wrong = await message(lock, { type: 'unlock', password: 'wrong', minutes: 15 });
  check('wrong password does not open', wrong.ok === false);
  await go(tab, 'https://www.youtube.com/');
  check('still locked after a wrong password', isLock(await settledUrl(tab)));

  await go(tab, 'https://accounts.youtube.com/');
  const signIn = await settledUrl(tab);
  check('Google sign-in host is left alone', !isLock(signIn), signIn.slice(0, 60));

  const open = await message(lock, { type: 'unlock', password: TEST_PASSWORD, minutes: .25 });
  check('right password opens', open.ok === true);
  await go(tab, 'https://www.youtube.com/');
  const parentUrl = await settledUrl(tab, 4000);
  check('parent reaches full YouTube', parentUrl.includes('youtube.com'), parentUrl.slice(0, 60));
  const expired = await settledUrl(tab, 14000);
  check('parent time expires and the tab goes back to the lock', isLock(expired), expired.slice(0, 60));

  await message(lock, { type: 'unlock', password: TEST_PASSWORD, minutes: 30 });
  await go(tab, 'https://www.youtube.com/');
  await sleep(2500);
  check('a 30 minute parent unlock opens YouTube', !isLock(await urlOf(tab)));
  await message(lock, { type: 'lockNow' });
  check('lock now closes it at once', isLock(await settledUrl(tab, 1500)));

  for (let i = 0; i < 4; i += 1) await message(lock, { type: 'unlock', password: 'nope', minutes: 15 });
  const throttled = await message(lock, { type: 'unlock', password: 'nope', minutes: 15 });
  check('five wrong tries start a delay', throttled.retryIn > 0, `${throttled.retryIn} ms`);
  const blocked = await message(lock, { type: 'unlock', password: TEST_PASSWORD, minutes: 15 });
  check('the right password also waits during the delay', blocked.ok === false);
  await evaluate(lock, `chrome.storage.local.set({ attempts: { count: 0, until: 0 } })`);

  check('change password refuses the wrong current one',
    !(await message(lock, { type: 'changePassword', current: 'wrong', next: 'new-pass-1' })).ok);
  check('change password works',
    (await message(lock, { type: 'changePassword', current: TEST_PASSWORD, next: 'new-pass-1' })).ok);
  check('old password stops working', !(await message(lock, { type: 'unlock', password: TEST_PASSWORD, minutes: 15 })).ok);
  await message(lock, { type: 'changePassword', current: 'new-pass-1', next: TEST_PASSWORD });

  // ---- Child session: starts now, ends within two minutes.
  const now = new Date();
  await message(lock, { type: 'saveSettings', password: TEST_PASSWORD, settings: settingsFrom(now, 2) });
  await sleep(6000);
  const session = await message(lock, { type: 'status' });
  check('session state is on', session.status.state === 'session');
  check('lock page shows the big button without a reload', await evaluate(lock, `!!document.getElementById('go')`));
  await shot(lock, 'session');

  await go(tab, 'https://www.youtube.com/');
  check('session: full YouTube stays locked', isLock(await settledUrl(tab)));
  await go(tab, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  check('session: a full YouTube video stays locked', isLock(await settledUrl(tab)));

  await evaluate(tab, `location.reload()`);
  await sleep(1500);
  await evaluate(tab, `document.getElementById('go').click()`);
  const kidsUrl = await settledUrl(tab, 6000);
  const kidsOpen = kidsUrl.includes('youtubekids.com');
  check('session: the button opens YouTube Kids', kidsOpen, kidsUrl.slice(0, 80));
  await shot(tab, 'kids-session');
  if (kidsOpen) {
    const info = await evaluate(tab, `({ title: document.title, text: document.body.innerText.slice(0, 200), overlay: [...document.documentElement.children].some(e => e.tagName === 'DIV' && e.style.position === 'fixed' && e.style.display === 'block') })`);
    check('session: corner hourglass is on the page', info.overlay, JSON.stringify(info).slice(0, 200));
  }

  const end = session.status.sessionEnd;
  await sleep(Math.max(0, end - Date.now() - 25000));
  await shot(tab, 'kids-last-minute');
  await sleep(Math.max(0, end - Date.now()) + 4000);
  const afterEnd = await urlOf(tab);
  check('session end moves the open tab to the lock page', isLock(afterEnd), afterEnd.slice(0, 80));
  await sleep(800);
  await shot(tab, 'finished');
  const finishedState = await evaluate(tab, `document.documentElement.dataset.state`);
  check('the finished scene is showing', finishedState === 'finished', finishedState);

  // ---- Restart, locked and inside a session
  const afterStart = new Date();
  await message(lock, { type: 'saveSettings', password: TEST_PASSWORD, settings: settingsFrom(afterStart, 3) });
  await sleep(1500);
  await message(lock, { type: 'unlock', password: TEST_PASSWORD, minutes: null });
  await browser.stop();
  await sleep(1500);
  await load();
  const reopened = await openLock();
  const restarted = await message(reopened, { type: 'status' });
  check('after a restart the parent unlock is gone', restarted.parent === null);
  check('after a restart inside a session the state is still session', restarted.status.state === 'session', restarted.status.state);
  const tab2 = await openTab('https://www.youtube.com/');
  check('after a restart full YouTube is locked', isLock(await settledUrl(tab2)));
  await go(tab2, 'https://www.youtubekids.com/');
  const kidsAfter = await settledUrl(tab2, 4000);
  check('after a restart inside a session YouTube Kids still opens', kidsAfter.includes('youtubekids.com'), kidsAfter.slice(0, 80));
} catch (error) {
  check('run finished without a crash', false, error.message.slice(0, 300));
} finally {
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  await browser.stop().catch(() => {});
  server.close();
  process.exit(failed.length ? 1 : 0);
}
