// Pure time logic: no Chrome calls, so it can be unit tested with a fixed clock.

export const DEFAULT_SETTINGS = {
  sessions: [
    { start: '10:00', minutes: 20 },
    { start: '17:00', minutes: 20 },
  ],
  lunch: '13:00',
  nap: '15:00',
  bedtime: '20:00',
  wake: '07:00',
};

export const OFFICIAL_DAILY_MAX = 60;
const FINISHED_MS = 10 * 60 * 1000;
const DAY_RANGE = [-1, 0, 1, 2];

function at(day, hhmm, offsetDays = 0) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + offsetDays, h, m, 0, 0);
}

function sessionsAround(settings, now) {
  const active = settings.sessions.filter(s => s.minutes > 0);
  const list = [];
  for (const offset of DAY_RANGE) {
    for (const s of active) {
      const start = at(now, s.start, offset);
      list.push({ start, end: new Date(start.getTime() + s.minutes * 60000) });
    }
  }
  return list.sort((a, b) => a.start - b.start);
}

function isNight(settings, now) {
  const bed = at(now, settings.bedtime);
  const wake = at(now, settings.wake);
  return now >= bed || now < wake;
}

function stopsBetween(settings, from, to) {
  const span = to - from;
  const stops = [];
  for (const offset of DAY_RANGE) {
    for (const [icon, time] of [['lunch', settings.lunch], ['nap', settings.nap], ['sleep', settings.bedtime]]) {
      const t = at(from, time, offset);
      if (t > from && t < to) stops.push({ icon, at: (t - from) / span });
    }
  }
  return stops.sort((a, b) => a.at - b.at);
}

export function getStatus(settings, now = new Date()) {
  const list = sessionsAround(settings, now);
  if (!list.length) return { state: 'none', progress: 0, stops: [], nextChange: null, nextStart: null };

  const current = list.find(s => s.start <= now && now < s.end);
  if (current) {
    const before = list.filter(s => s.end <= current.start).at(-1);
    return {
      state: 'session',
      progress: 1,
      stops: stopsBetween(settings, before.end, current.start),
      sessionStart: current.start.getTime(),
      sessionEnd: current.end.getTime(),
      sessionProgress: (now - current.start) / (current.end - current.start),
      minutesLeft: (current.end - now) / 60000,
      nextChange: current.end.getTime(),
      nextStart: current.start.getTime(),
    };
  }

  const prev = list.filter(s => s.end <= now).at(-1);
  const next = list.find(s => s.start > now);
  const overnight = next.start.toDateString() !== prev.end.toDateString();
  const sinceEnd = now - prev.end;
  const finishedUntil = prev.end.getTime() + FINISHED_MS;
  const finished = sinceEnd < FINISHED_MS;
  const night = !finished && overnight && isNight(settings, now);
  const sameDayAsEnd = now.toDateString() === prev.end.toDateString();
  const nextChange = Math.min(
    next.start.getTime(),
    finished ? finishedUntil : Infinity,
    ...[at(now, settings.bedtime), at(now, settings.wake), at(now, settings.bedtime, 1), at(now, settings.wake, 1)]
      .map(d => d.getTime()).filter(t => t > now.getTime()),
  );

  return {
    state: finished ? 'finished' : night ? 'night' : 'wait',
    progress: Math.min(1, Math.max(0, (now - prev.end) / (next.start - prev.end))),
    stops: stopsBetween(settings, prev.end, next.start),
    overnight,
    sleepAhead: overnight && !night && sameDayAsEnd,
    nextStart: next.start.getTime(),
    nextChange,
  };
}

export function dailyMinutes(settings) {
  return settings.sessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_IN = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function validateSettings(s) {
  const errors = [];
  if (!Array.isArray(s?.sessions) || !s.sessions.length) return ['لازم يكون فيه جلسة واحدة على الأقل.'];
  for (const session of s.sessions) {
    if (!TIME.test(session.start)) errors.push('وقت الجلسة مش مظبوط.');
    if (!Number.isInteger(session.minutes) || session.minutes < 0 || session.minutes > 120) {
      errors.push('مدة الجلسة لازم تكون من 0 لـ 120 دقيقة.');
    }
  }
  for (const key of ['lunch', 'nap', 'bedtime', 'wake']) {
    if (!TIME.test(s[key] ?? '')) errors.push('أحد المواعيد مش مظبوط.');
  }
  if (errors.length) return errors;
  const on = s.sessions.filter(x => x.minutes > 0).sort((a, b) => MINUTES_IN(a.start) - MINUTES_IN(b.start));
  if (!on.length) return ['لازم يكون فيه جلسة واحدة على الأقل.'];
  on.forEach((x, i) => {
    const next = on[i + 1];
    if (next && MINUTES_IN(x.start) + x.minutes > MINUTES_IN(next.start)) errors.push('الجلسات متداخلة.');
    if (MINUTES_IN(x.start) + x.minutes > 24 * 60) errors.push('الجلسة لازم تخلص قبل نص الليل.');
  });
  return errors;
}
