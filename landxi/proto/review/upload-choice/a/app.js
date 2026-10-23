/* 시안 ① 바깥 틀 유지 — 머리줄 · 왼쪽 메뉴 · 업로드는 이 페이지가 쥐고 있고, 메뉴를 누르면 안쪽 틀(iframe)의 화면만 바뀐다.
   안쪽 화면은 실제 운영 화면 그대로(대시보드 · 프로젝트 · 분석 서비스 · 지도 서비스). 안쪽 화면의 머리줄 · 메뉴는 겹치지 않게 숨긴다.
   주소창은 ?screen= 으로 맞춘다(뒤로 가기 = 앞 메뉴). 메뉴를 누른 뒤 안쪽 화면이 다 그려질 때까지 걸린 시간을 머리줄 '시안' 표시에 적는다. */
import { boot, SCREENS, REAL } from '../common.js';
import { h } from '../../../../v3/kit/util.js';

const q = () => { const s = new URLSearchParams(location.search).get('screen'); return SCREENS.includes(s) ? s : 'home'; };
let cur = q();
window.__uc = [];   // 잰 값(자동 측정 도구가 읽음)

const { S, timeTag } = await boot({ which: 'a', current: cur, onPick: (id) => { if (id === cur) return; history.pushState({ screen: id }, '', '?screen=' + id); show(id); } });
const frame = h('iframe.uc-frame', { title: '화면', src: REAL[cur] });
S.main.append(frame);

const HIDE = `.k-app>.k-mast,.k-app>.k-rail{display:none!important}
.k-app{grid-template-rows:minmax(0,1fr)!important;grid-template-columns:minmax(0,1fr)!important}
.k-app .k-main{grid-row:1!important;grid-column:1!important}
.k-app.has-sub{grid-template-rows:auto minmax(0,1fr)!important}
.k-app.has-sub .k-sub{grid-row:1!important;grid-column:1!important}
.k-app.has-sub .k-main{grid-row:2!important}
body.t[data-pre]::before{display:none!important}`;

let run = 0;
function watch(id, t0) {
  const me = ++run;
  let okSince = 0;
  const tick = () => {
    if (me !== run) return;
    let doc = null; try { doc = frame.contentDocument; } catch { /* */ }
    if (doc && doc.location.pathname === REAL[id] && doc.head && !doc.getElementById('uc-hide')) {
      const s = doc.createElement('style'); s.id = 'uc-hide'; s.textContent = HIDE; doc.head.append(s);
    }
    const main = doc?.location.pathname === REAL[id] ? doc.querySelector('.k-app .k-main') : null;
    const ld = doc?.querySelector('.k-ld');
    const ok = !!main && main.children.length > 0 && (!ld || ld.hidden) && doc.readyState === 'complete';
    const now = performance.now();
    if (ok) { okSince ||= now; if (now - okSince >= 500) { const ms = Math.round(okSince - t0); window.__uc.push({ screen: id, ms }); timeTag(`방금 메뉴 ${(ms / 1000).toFixed(1)}초`); return; } }
    else okSince = 0;
    if (now - t0 > 30000) { timeTag('30초 넘음'); return; }
    setTimeout(tick, 50);
  };
  tick();
}
function show(id) {
  cur = id;
  S.go(SCREENS.indexOf(id));
  timeTag('화면 여는 중');
  const t0 = performance.now();
  try { frame.contentWindow.location.replace(REAL[id]); } catch { frame.src = REAL[id]; }   // replace = 안쪽 이동이 뒤로 가기 기록을 늘리지 않게
  watch(id, t0);
}
history.replaceState({ screen: cur }, '', '?screen=' + cur);
addEventListener('popstate', () => show(q()));
watch(cur, performance.now());
