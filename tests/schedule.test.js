import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS as S, getStatus, validateSettings, dailyMinutes } from '../extension/schedule.js';

const t = (h, m = 0, day = 15) => new Date(2026, 10, day, h, m, 0, 0);
const state = (h, m, day) => getStatus(S, t(h, m, day)).state;

test('default schedule is 40 minutes a day', () => assert.equal(dailyMinutes(S), 40));

test('session boundaries are exact', () => {
  assert.notEqual(getStatus(S, new Date(2026, 10, 15, 9, 59, 59)).state, 'session');
  assert.equal(state(10, 0), 'session');
  assert.equal(getStatus(S, new Date(2026, 10, 15, 10, 19, 59)).state, 'session');
  assert.equal(state(10, 20), 'finished');
  assert.equal(state(17, 0), 'session');
  assert.equal(state(17, 20), 'finished');
});

test('finished scene lasts ten minutes, then waiting', () => {
  assert.equal(state(10, 29), 'finished');
  assert.equal(state(10, 30), 'wait');
  assert.equal(state(17, 30), 'wait');
});

test('night runs from bedtime to wake across midnight', () => {
  assert.equal(state(19, 59), 'wait');
  assert.equal(state(20, 0), 'night');
  assert.equal(state(23, 59), 'night');
  assert.equal(state(0, 0), 'night');
  assert.equal(state(6, 59), 'night');
  assert.equal(state(7, 0), 'wait');
});

test('sand progress runs from 0 to 1 across the daytime wait', () => {
  const start = getStatus(S, t(10, 20)).progress;
  const middle = getStatus(S, t(13, 40)).progress;
  const end = getStatus(S, new Date(2026, 10, 15, 16, 59, 59)).progress;
  assert.equal(start, 0);
  assert.ok(Math.abs(middle - .5) < .001);
  assert.ok(end > .99 && end <= 1);
});

test('sand progress runs continuously across midnight', () => {
  const evening = getStatus(S, t(23, 0)).progress;
  const morning = getStatus(S, t(1, 0, 16)).progress;
  assert.ok(evening > .3 && evening < morning && morning < 1);
});

test('stops fall inside the wait in order', () => {
  const day = getStatus(S, t(11, 0));
  assert.deepEqual(day.stops.map(s => s.icon), ['lunch', 'nap']);
  assert.ok(day.stops[0].at > 0 && day.stops[0].at < day.stops[1].at && day.stops[1].at < 1);
  const evening = getStatus(S, t(18, 0));
  assert.deepEqual(evening.stops.map(s => s.icon), ['sleep']);
  assert.equal(evening.overnight, true);
  assert.equal(day.overnight, false);
});

test('the sleep sentence shows before bedtime, never after he has woken', () => {
  assert.equal(getStatus(S, t(19, 0)).sleepAhead, true);
  assert.equal(getStatus(S, t(7, 30)).sleepAhead, false);
  assert.equal(getStatus(S, t(9, 45)).sleepAhead, false);
  assert.equal(getStatus(S, t(11, 0)).sleepAhead, false);
});

test('a session keeps the stops of the road it just finished', () => {
  assert.deepEqual(getStatus(S, t(17, 5)).stops.map(s => s.icon), ['lunch', 'nap']);
});

test('next change is the true next boundary', () => {
  assert.equal(getStatus(S, t(9, 0)).nextChange, t(10, 0).getTime());
  assert.equal(getStatus(S, t(10, 5)).nextChange, t(10, 20).getTime());
  assert.equal(getStatus(S, t(10, 25)).nextChange, t(10, 30).getTime());
  assert.equal(getStatus(S, t(18, 0)).nextChange, t(20, 0).getTime());
  assert.equal(getStatus(S, t(22, 0)).nextChange, t(7, 0, 16).getTime());
  assert.equal(getStatus(S, t(8, 0)).nextChange, t(10, 0).getTime());
});

test('month and year rollover', () => {
  const s = getStatus(S, new Date(2026, 11, 31, 22, 0));
  assert.equal(s.state, 'night');
  assert.equal(s.nextStart, new Date(2027, 0, 1, 10, 0).getTime());
});

test('a computer waking inside or after a session gets the right state from the clock alone', () => {
  const inside = getStatus(S, t(17, 12));
  assert.equal(inside.state, 'session');
  assert.ok(Math.abs(inside.minutesLeft - 8) < .001);
  assert.ok(Math.abs(inside.sessionProgress - .6) < .001);
  assert.equal(state(17, 50), 'wait');
});

test('a single session still works, and no sessions never opens', () => {
  const one = { ...S, sessions: [{ start: '10:00', minutes: 20 }] };
  assert.equal(getStatus(one, t(10, 10)).state, 'session');
  assert.equal(getStatus(one, t(12, 0)).overnight, true);
  const none = { ...S, sessions: [{ start: '10:00', minutes: 0 }] };
  assert.equal(getStatus(none, t(10, 5)).state, 'none');
});

test('validation refuses overlaps and bad values', () => {
  assert.deepEqual(validateSettings(S), []);
  assert.ok(validateSettings({ ...S, sessions: [{ start: '10:00', minutes: 30 }, { start: '10:20', minutes: 10 }] }).length);
  assert.ok(validateSettings({ ...S, sessions: [{ start: '25:00', minutes: 20 }] }).length);
  assert.ok(validateSettings({ ...S, sessions: [{ start: '10:00', minutes: 0 }] }).length);
  assert.ok(validateSettings({ ...S, sessions: [{ start: '23:50', minutes: 20 }] }).length);
  assert.ok(validateSettings({ ...S, bedtime: 'late' }).length);
});
