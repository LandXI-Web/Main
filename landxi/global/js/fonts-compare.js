/* fonts-compare — 같은 문구를 Paperlogy 라틴 vs Inter 600/700 으로 나란히(Q-D(b) ③).
   재는 것(실측 · 이 브라우저): 글줄 폭 · 글리프 누락(키릴 폴백) · 폰트 로드 여부. 판정은 Fable/사용자. */
const S = {
  h1: 'LX works in 36 countries.',
  h2: 'Built-up spread 2017 → 2025',
  hud: '0.44',
  lab: 'Index calc · not model inference · T43TEH 6 scenes · cpu-0',
  cyr: 'Ysyk-Ata · Ысык-Ата · Сокулук · Бишкек',
  p: 'The same GeoAI engine that reads Namwon field by field now reads the Chuy valley month by month — from a live globe to a single district.',
};

function sample() {
  return `<h2 class="fc-h1">${S.h1}</h2><p class="fc-h2">${S.h2}</p><p class="fc-hud">${S.hud}<small>NDVI</small></p>
    <p class="fc-lab">${S.lab}</p><p class="fc-cyr" lang="ru">${S.cyr}</p><p class="fc-p">${S.p}</p>`;
}

function width(font, text) {
  const c = document.createElement('canvas').getContext('2d');
  c.font = font; return c.measureText(text).width;
}

async function main() {
  document.querySelectorAll('.fc-sample').forEach((el) => { el.innerHTML = sample(); });
  await document.fonts.ready;
  const L = ['800 66px Paperlogy', '700 34px Paperlogy', '700 22px Paperlogy'];
  const R = ['700 66px Inter', '600 34px Inter', '600 22px Inter'];
  const rows = [['H1 66', S.h1, 0], ['H2 34', S.h2, 1], ['Label 22', S.lab, 2]].map(([k, s, i]) => {
    const a = width(L[i], s), b = width(R[i], s);
    return `<tr><td>${k}</td><td>${a.toFixed(0)} px</td><td>${b.toFixed(0)} px</td><td>${((b / a - 1) * 100).toFixed(1)} %</td></tr>`;
  });
  const cyrL = document.fonts.check('700 26px Paperlogy', 'Ысык'), cyrR = document.fonts.check('600 26px Inter', 'Ысык');
  // 키릴 글리프가 실제로 그 서체에 있는지 — 폴백 서체와 폭이 같으면 그 서체에 글리프가 없다
  const fb = (f) => Math.abs(width(`700 26px ${f}, monospace`, 'Ысык-Ата') - width('700 26px monospace', 'Ысык-Ата')) < 0.5;
  const tbl = `<table class="fc-m"><tr><th>measured in this browser</th><th>Paperlogy</th><th>Inter</th><th>Inter vs Paperlogy</th></tr>${rows.join('')}
    <tr><td>Cyrillic glyphs (Ысык-Ата)</td><td class="${fb('Paperlogy') ? 'warn' : ''}">${fb('Paperlogy') ? 'missing → fallback face' : 'present'}</td><td class="${fb('Inter') ? 'warn' : ''}">${fb('Inter') ? 'missing → fallback face' : 'present'}</td><td>font check ${cyrL}/${cyrR}</td></tr></table>`;
  document.querySelectorAll('.fc-col').forEach((c, i) => { if (i === 1) c.insertAdjacentHTML('beforeend', tbl); });
  document.getElementById('fc-foot').textContent = 'measured · canvas measureText + document.fonts (this Chrome) · Inter 600/700 = @fontsource/inter 5.2.8 (OFL) latin+cyrillic merged · Paperlogy/Pretendard = repo assets · no network fonts';
  document.documentElement.dataset.lx = 'ready';
}
main();
