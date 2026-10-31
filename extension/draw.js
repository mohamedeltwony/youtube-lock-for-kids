// The hourglass and truck drawings, shared by the lock page and the corner overlay on YouTube Kids.
globalThis.Draw = (() => {
  const INK = '#10214B';
  const COBALT = '#1746D1';
  const SAND = '#FF8A00';
  const GLASS_PATH = 'M56 32C56 112 106 140 112 180C106 220 56 248 56 328H184C184 248 134 220 128 180C134 140 184 112 184 32Z';

  function hourglass({ p = 0, frame = INK, sand = SAND, glass = '#FFFFFF', id = 'hourglass', still = false } = {}) {
    const topY = 56 + p * 122;
    const h = 18 + p * 118;
    const flowing = !still && p > 0 && p < 1;
    return `
    <svg class="hourglass" viewBox="0 0 240 360" role="img" aria-label="ساعة رملية">
      <defs><clipPath id="${id}"><path d="${GLASS_PATH}"/></clipPath></defs>
      <path d="${GLASS_PATH}" fill="${glass}" fill-opacity=".72"/>
      <g clip-path="url(#${id})">
        <rect x="40" y="${topY}" width="160" height="${p >= 1 ? 0 : Math.max(0, 182 - topY)}" fill="${sand}"/>
        ${flowing ? `<line class="stream" x1="120" y1="178" x2="120" y2="${322 - h + 6}" stroke="${sand}" stroke-width="7" stroke-linecap="round" stroke-dasharray="16 7"/>` : ''}
        <path d="M40 330V${330 - h * .42}Q120 ${330 - h * 1.5} 200 ${330 - h * .42}V330Z" fill="${sand}"/>
      </g>
      <path d="${GLASS_PATH}" fill="none" stroke="${frame}" stroke-width="7"/>
      <path d="M78 52C80 88 94 112 106 132" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".9"/>
      <rect x="22" y="8" width="196" height="30" rx="15" fill="${frame}"/>
      <rect x="22" y="322" width="196" height="30" rx="15" fill="${frame}"/>
      <rect x="30" y="30" width="12" height="300" rx="6" fill="${frame}"/>
      <rect x="198" y="30" width="12" height="300" rx="6" fill="${frame}"/>
    </svg>`;
  }

  // Faces left: in Arabic the journey runs from right to left. The wheel arch centre is (106, 176).
  function truckCab({ body = COBALT, dark = INK, window: win = '#BDF0FF', lamp = '#FFE36E', asleep = false } = {}) {
    const eye = asleep
      ? `<path d="M96 86Q118 104 140 86" fill="none" stroke="${dark}" stroke-width="8" stroke-linecap="round"/>`
      : `<circle cx="118" cy="82" r="23" fill="#fff"/><circle cx="109" cy="83" r="12" fill="${dark}"/><circle cx="105" cy="78" r="4" fill="#fff"/>`;
    return `
      <path d="M192 196V68C192 44 176 30 152 30H98C82 30 70 38 62 54L42 100H30C14 100 6 112 6 128V196Z" fill="${body}"/>
      <path d="M100 48H156C168 48 174 56 174 66V112H62L82 60C86 52 92 48 100 48Z" fill="${win}"/>
      ${eye}
      <circle cx="24" cy="130" r="11" fill="${lamp}"/>
      <path d="M12 160Q28 176 48 160" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>
      <rect x="150" y="124" width="26" height="8" rx="4" fill="${dark}" opacity=".55"/>
      <circle cx="106" cy="176" r="50" fill="${dark}"/>
      <rect x="0" y="186" width="200" height="16" rx="8" fill="${dark}"/>`;
  }

  function wheel(cx, cy, r) {
    return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/><circle cx="${cx}" cy="${cy}" r="${r * .46}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r * .16}" fill="${INK}"/></g>`;
  }

  function smallTruck({ body = '#FFC800', bed = SAND, sand = '#FFE36E', asleep = false } = {}) {
    return `
    <svg class="mini-truck" viewBox="0 0 440 240" role="img" aria-label="عربية نقل">
      <path d="M214 66Q320 -14 428 66Z" fill="${sand}"/>
      <path d="M206 64H432L412 190H206Z" fill="${bed}"/>
      ${truckCab({ body, lamp: '#FFFFFF', asleep })}
      <rect x="190" y="186" width="244" height="18" rx="8" fill="${INK}"/>
      ${wheel(106, 196, 42)}${wheel(340, 196, 42)}
    </svg>`;
  }

  const icons = {
    lunch: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="#FFD27A" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="#FF7A59"/><path d="M6 12v12a4 4 0 0 0 8 0V12M10 12v40" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M58 52V30" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><ellipse cx="57" cy="20" rx="4.500" ry="9" fill="${INK}"/></svg>`,
    nap: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 18v36M56 34v20M8 46h48" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><rect x="10" y="30" width="46" height="14" rx="5" fill="#7CC8FF"/><rect x="12" y="23" width="20" height="11" rx="5.500" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M42 8h11L42 20h11" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sleep: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 42A21 21 0 1 1 28 10a17 17 0 0 0 16 32Z" fill="#FFD84D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="16" r="3.500" fill="${INK}"/><circle cx="56" cy="30" r="2.500" fill="${INK}"/></svg>`,
    flag: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8v50" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M19 10H54V38H19Z" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M19 10H31V19H19ZM43 10H54V19H43ZM31 19H43V29H31ZM19 29H31V38H19ZM43 29H54V38H43Z" fill="${INK}"/></svg>`,
    play: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 12 52 32 20 52Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.500" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  };

  return { hourglass, truckCab, wheel, smallTruck, icons };
})();
