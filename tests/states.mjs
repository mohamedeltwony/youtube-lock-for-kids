#!/usr/bin/env node
// Screenshots every lock-page state at every width, with a fixed status, and checks the motion rules.
// Run: node tests/states.mjs <profile-dir> <shots-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Browser } from './cdp.mjs';

const EXTENSION = resolve(import.meta.dirname, '../extension');
const [profile, shots] = process.argv.slice(2).map(p => resolve(p));
mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const day = [{ icon: 'lunch', at: .4 }, { icon: 'nap', at: .7 }];
const STATES = {
  wait: { state: 'wait', progress: .5, stops: day, overnight: false },
  evening: { state: 'wait', progress: .08, stops: [{ icon: 'sleep', at: .16 }], overnight: true, sleepAhead: true },
  morning: { state: 'wait', progress: .9, stops: [{ icon: 'sleep', at: .16 }], overnight: true, sleepAhead: false },
  night: { state: 'night', progress: .6, stops: [{ icon: 'sleep', at: .16 }], overnight: true },
  session: { state: 'session', progress: 1, stops: day },
  finished: { state: 'finished', progress: 0, stops: day, overnight: false },
  none: { state: 'none', progress: 0, stops: [] },
};

const browser = new Browser();
browser.start(profile);
await sleep(1500);
const { id } = await browser.send('Extensions.loadUnpacked', { path: EXTENSION });
await sleep(1500);

async function page(status, width, height) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  await browser.send('Page.enable', {}, sessionId);
  await browser.send('Runtime.enable', {}, sessionId);
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    chrome.runtime.sendMessage = async () => (${JSON.stringify({ status, hasPassword: true, settings: {}, parent: null })});
  ` }, sessionId);
  await browser.send('Page.navigate', { url: `chrome-extension://${id}/lock.html` }, sessionId);
  await sleep(900);
  return { targetId, sessionId };
}
const evaluate = async (tab, expression) => (await browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, tab.sessionId)).result.value;

for (const [name, status] of Object.entries(STATES)) {
  for (const [width, height] of [[1440, 900], [1366, 650], [1280, 720], [1024, 768], [768, 1024], [761, 900], [759, 900], [720, 700], [683, 650], [600, 600], [375, 812], [360, 780], [320, 640]]) {
    const tab = await page(status, width, height);
    const info = await evaluate(tab, `({ overflow: document.documentElement.scrollWidth > innerWidth, outside: [...document.querySelectorAll('.track .mini-truck, .track b, h1, .copy p, .adult, .go')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > innerWidth || r.bottom > innerHeight + 2); }).length, font: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0], loaded: document.fonts.check('800 40px "Baloo Bhaijaan 2"', 'وصلنا'), dir: document.documentElement.dir })`);
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, tab.sessionId);
    writeFileSync(`${shots}/${name}-${width}.png`, Buffer.from(data, 'base64'));
    console.log(name, width, JSON.stringify(info));
    await browser.send('Target.closeTarget', { targetId: tab.targetId });
  }
}

for (const file of ['popup.html']) {
  const { targetId } = await browser.send('Target.createTarget', { url: `chrome-extension://${id}/${file}` });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(700);
  await browser.send('Runtime.evaluate', { expression: `document.querySelectorAll('details').forEach(d => { d.open = true; })` }, sessionId);
  await sleep(200);
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(`${shots}/popup.png`, Buffer.from(data, 'base64'));
}

const adult = await page(STATES.wait, 1440, 900);
await browser.send('Runtime.evaluate', { expression: `document.getElementById('open-adult').click()` }, adult.sessionId);
await sleep(300);
writeFileSync(`${shots}/adult-box.png`, Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' }, adult.sessionId)).data, 'base64'));

const tab = await page(STATES.wait, 1440, 900);
const list = `document.getAnimations().map(a => ({ name: a.animationName, ms: a.effect.getTiming().duration, state: a.playState }))`;
console.log('motion now', JSON.stringify(await evaluate(tab, list)));
await sleep(62000);
console.log('motion after a minute', JSON.stringify(await evaluate(tab, list)));
await browser.stop();
process.exit(0);
