const { hourglass, truckCab, wheel, smallTruck, icons } = globalThis.Draw;

const KIDS_HOME = 'https://www.youtubekids.com/';
const POLL_MS = 5000;
const MOTION_MS = 60000;

const COPY = {
  wait: { title: 'العربية جاية في الطريق', line: 'لما الرمل ينزل كله، نتفرج سوا.' },
  overnight: { title: 'العربية جاية في الطريق', line: 'بعد ما ننام ونصحى، نتفرج سوا.' },
  session: { title: 'وصلنا! يلا نتفرج', line: 'الرمل نزل كله. دوس على الزرار.' },
  finished: { title: 'خلصنا! يلا نلعب', line: 'الساعة اتقلبت، والرمل هينزل من الأول.' },
  night: { title: 'العربية نايمة', line: 'بكرة لما نصحى، نكمل الطريق.' },
  none: { title: 'العربية راكنة', line: 'مفيش مواعيد دلوقتي.' },
};

const app = document.getElementById('app');
const send = message => chrome.runtime.sendMessage(message);
let lastKey = '';
let view = null;

function rig(cls, viewBox, g, { state, progress }) {
  const asleep = state === 'night';
  const frame = asleep ? '#FFFFFF' : '#10214B';
  const label = 'عربية كبيرة شايلة ساعة رملية';
  const load = state === 'session' ? `
    <foreignObject x="${g.bx}" y="${226 - g.bw}" width="${g.bw}" height="${g.bw}">
      <button class="go" ${cls === 'desk' ? 'id="go"' : ''} type="button">${icons.play}شغّل</button>
    </foreignObject>` : `
    <foreignObject x="${g.x}" y="${g.y}" width="${g.w}" height="${g.w * 1.5}">${hourglass({ p: progress, frame, id: `sand-${cls}`, still: asleep })}</foreignObject>
    <path d="M${g.x + g.w * .06} ${g.y + g.w * 1.42}L${g.x - 22} 258M${g.x + g.w * .94} ${g.y + g.w * 1.42}L${g.x + g.w + 22} 258" stroke="#FF8A00" stroke-width="10" stroke-linecap="round"/>`;
  const truck = `
    <rect x="350" y="240" width="630" height="40" rx="12" fill="#1746D1"/>
    <rect x="350" y="276" width="630" height="18" rx="9" fill="#10214B"/>
    <g transform="translate(16 0) scale(1.8)">${truckCab({ asleep })}</g>
    ${wheel(207, 318, 62)}${wheel(690, 324, 56)}${wheel(830, 324, 56)}`;
  const naming = state === 'session' ? '' : `role="img" aria-label="${label}"`;
  return `<svg class="${cls}" viewBox="${viewBox}" preserveAspectRatio="xMidYMax meet" ${naming}>
    ${asleep ? `<g class="halo">${truck}</g>` : ''}
    ${truck}
    ${load}
  </svg>`;
}

function strip({ state, progress, stops }) {
  const marks = stops.map(s => `<b style="--at:${s.at * 100}%">${icons[s.icon]}</b>`).join('');
  const truck = state === 'session' ? '' : smallTruck({ asleep: state === 'night' });
  return `<div class="strip"><div class="track" style="--p:${progress * 100}%"><i></i>${marks}<b class="goal">${icons.flag}</b>${truck}</div></div>`;
}

const nightSky = `<i class="moon"></i>${[[46, 7], [52, 17, 'wide'], [60, 9], [82, 19, 'wide'], [88, 7, 'wide'], [94, 15, 'wide']]
  .map(([x, y, cls = '']) => `<i class="star ${cls}" style="right:${x}%;top:${y}%"></i>`).join('')}`;

function render(data) {
  view = data;
  const { state, sleepAhead } = data.status;
  // A finished wait restarts the sand, and a full hourglass waits for the session itself.
  const progress = state === 'finished' ? 0 : data.status.progress;
  const copy = COPY[state === 'wait' && sleepAhead ? 'overnight' : state];
  document.documentElement.dataset.state = state;
  document.title = copy.title;
  const scene = { state, progress, stops: data.status.stops };
  app.innerHTML = `
    <button class="adult" id="open-adult" type="button">${icons.lock}<span>للكبار</span></button>
    ${state === 'night' ? nightSky : ''}
    <div class="copy"><h1>${copy.title}</h1><p>${copy.line}</p></div>
    <div class="rig">
      ${rig('desk', '0 -150 1000 530', { x: 490, y: -146, w: 270, bx: 480, bw: 290 }, scene)}
      ${rig('phone', '0 -370 810 750', { x: 392, y: -354, w: 412, bx: 410, bw: 370 }, scene)}
    </div>
    ${strip(scene)}`;
  document.getElementById('open-adult').addEventListener('click', openAdult);
  app.querySelectorAll('.go').forEach(go => go.addEventListener('click', () => { location.href = KIDS_HOME; }));
}

async function refresh() {
  let data;
  try {
    data = await send({ type: 'status' });
  } catch {
    return;
  }
  // Sand moves in small steps; no need to redraw the page for every poll.
  const key = `${data.status.state}|${Math.round(data.status.progress * 200)}|${data.status.sleepAhead}`;
  if (key !== lastKey) {
    lastKey = key;
    render(data);
  } else {
    view = data;
  }
}

// ---- Motion rests after a minute, so the page does not become another screen to stare at.
document.body.classList.add('rest-pending');
setTimeout(() => document.body.classList.add('resting'), MOTION_MS);

// ---- Adult box

const dialog = document.getElementById('adult');
const form = document.getElementById('adult-form');
const fields = {
  title: document.getElementById('adult-title'),
  note: document.getElementById('adult-note'),
  password: document.getElementById('password'),
  confirm: document.getElementById('confirm'),
  confirmRow: document.getElementById('confirm-row'),
  minutes: document.getElementById('minutes'),
  minutesRow: document.getElementById('minutes-row'),
  error: document.getElementById('adult-error'),
  submit: document.getElementById('adult-submit'),
};

function configureAdult(setup) {
  fields.title.textContent = setup ? 'اختار كلمة سر' : 'للكبار';
  fields.note.textContent = setup ? 'هتحتاجها عشان تفتح يوتيوب في أي وقت. لو نسيتها، لازم تشيل الإضافة وتركبها تاني.' : '';
  fields.confirmRow.hidden = !setup;
  fields.confirm.required = setup;
  fields.minutesRow.hidden = setup;
  fields.submit.textContent = setup ? 'احفظ كلمة السر' : 'افتح يوتيوب';
  fields.error.textContent = '';
  form.reset();
}

function openAdult() {
  configureAdult(!view?.hasPassword);
  dialog.showModal();
  fields.password.focus();
}

function waitMessage(ms) {
  return `استنى ${Math.ceil(ms / 1000)} ثانية وحاول تاني.`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  fields.error.textContent = '';
  const setup = !view?.hasPassword;
  const password = fields.password.value;
  if (setup) {
    if (password !== fields.confirm.value) {
      fields.error.textContent = 'كلمتين السر مش زي بعض.';
      return;
    }
    const result = await send({ type: 'setPassword', password });
    if (!result.ok) {
      fields.error.textContent = 'كلمة السر لازم تكون 4 حروف أو أرقام على الأقل.';
      return;
    }
    dialog.close();
    await refresh();
    return;
  }
  const minutes = fields.minutes.value ? Number(fields.minutes.value) : null;
  const result = await send({ type: 'unlock', password, minutes });
  if (result.ok) {
    location.href = result.url;
    return;
  }
  fields.password.value = '';
  fields.error.textContent = result.retryIn ? waitMessage(result.retryIn) : 'كلمة السر مش صح.';
});

document.getElementById('adult-cancel').addEventListener('click', () => dialog.close());

await refresh();
setInterval(refresh, POLL_MS);
if (!view?.hasPassword || location.hash === '#setup') {
  if (!view?.hasPassword) openAdult();
  history.replaceState(null, '', location.pathname);
}
