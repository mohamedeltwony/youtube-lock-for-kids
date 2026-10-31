const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
const clock = time => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(time);

let officialMax = 60;

function describe({ status, parent }) {
  if (parent) return parent.until ? `مفتوح للكبار لحد ${clock(parent.until)}` : 'مفتوح للكبار لحد ما كروم يتقفل';
  if (status.state === 'session') return `جلسة الطفل شغالة لحد ${clock(status.sessionEnd)}`;
  if (status.state === 'none') return 'مقفول. مفيش جلسات.';
  return `مقفول. الجلسة الجاية ${clock(status.nextStart)}`;
}

function showTotal() {
  const total = Number($('s1-minutes').value) + Number($('s2-minutes').value);
  const over = total > officialMax;
  $('total').textContent = over
    ? `المجموع ${total} دقيقة، أكتر من الحد الرسمي (${officialMax} دقيقة في اليوم).`
    : `المجموع ${total} دقيقة في اليوم.`;
  $('total').classList.toggle('over', over);
}

async function refresh() {
  const data = await send({ type: 'status' });
  officialMax = data.officialMax;
  $('state').textContent = describe(data);
  $('watched').textContent = `اتفرج النهارده: ${data.watchedToday} دقيقة`;
  $('lock-now').hidden = !data.parent;
  return data;
}

function fill({ sessions, lunch, nap, bedtime, wake }) {
  $('s1-start').value = sessions[0]?.start ?? '10:00';
  $('s1-minutes').value = sessions[0]?.minutes ?? 0;
  $('s2-start').value = sessions[1]?.start ?? '17:00';
  $('s2-minutes').value = sessions[1]?.minutes ?? 0;
  Object.entries({ lunch, nap, bedtime, wake }).forEach(([id, value]) => { $(id).value = value; });
  showTotal();
}

function failure(result) {
  if (result.errors) return result.errors[0];
  if (result.error === 'short') return 'كلمة السر لازم تكون 4 حروف أو أرقام على الأقل.';
  if (result.error === 'no-password') return 'اختار كلمة سر الأول من صفحة القفل.';
  if (result.retryIn) return `استنى ${Math.ceil(result.retryIn / 1000)} ثانية وحاول تاني.`;
  return 'كلمة السر مش صح.';
}

function report(el, result, success) {
  el.textContent = result.ok ? success : failure(result);
  el.classList.toggle('error', !result.ok);
}

$('s1-minutes').addEventListener('input', showTotal);
$('s2-minutes').addEventListener('input', showTotal);

$('lock-now').addEventListener('click', async () => {
  await send({ type: 'lockNow' });
  await refresh();
});

$('schedule-form').addEventListener('submit', async event => {
  event.preventDefault();
  const settings = {
    sessions: [
      { start: $('s1-start').value, minutes: Number($('s1-minutes').value) },
      { start: $('s2-start').value, minutes: Number($('s2-minutes').value) },
    ],
    lunch: $('lunch').value, nap: $('nap').value, bedtime: $('bedtime').value, wake: $('wake').value,
  };
  const result = await send({ type: 'saveSettings', password: $('schedule-password').value, settings });
  $('schedule-password').value = '';
  report($('schedule-message'), result, 'اتحفظت المواعيد.');
  await refresh();
});

$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const result = await send({ type: 'changePassword', current: $('current').value, next: $('next').value });
  $('current').value = '';
  $('next').value = '';
  report($('password-message'), result, 'اتغيرت كلمة السر.');
});

fill((await refresh()).settings);
