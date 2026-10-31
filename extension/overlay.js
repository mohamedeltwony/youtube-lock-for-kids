// A small hourglass in a corner of YouTube Kids. It grows slowly near the end, so the stop is not a surprise.
(() => {
  const POLL_MS = 5000;
  const SIZES = { calm: 92, soon: 136, last: 190 };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;pointer-events:none;display:none';
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText = `width:${SIZES.calm}px;padding:10px 6px 8px;border-radius:22px;background:#FFC800;box-shadow:0 6px 0 #10214B`;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) box.style.transition = 'width 6s ease';
  root.append(box);
  document.documentElement.append(host);

  let timer;
  async function update() {
    let data;
    try {
      data = await chrome.runtime.sendMessage({ type: 'status' });
    } catch {
      clearInterval(timer); // The extension was reloaded; this copy of the script is no longer connected.
      return;
    }
    const { status } = data;
    if (status.state !== 'session') {
      host.style.display = 'none';
      return;
    }
    host.style.display = 'block';
    box.style.width = `${status.minutesLeft <= 1 ? SIZES.last : status.minutesLeft <= 5 ? SIZES.soon : SIZES.calm}px`;
    box.innerHTML = Draw.hourglass({ p: status.sessionProgress, id: 'corner-sand' });
  }

  update();
  timer = setInterval(update, POLL_MS);
})();
