/* help-my 쪽 부팅. 두 가지로 뜬다.
   · ?embed=1 — K1 기본 `?` 가 K5 서랍 안 iframe 으로 부른다: 셸 없이 탭 + 내용만. Esc 는 바깥 서랍을 닫는다.
   · 단독 /landxi/v3/help-my/ — 정문 로그인한 사람만(K2) · K1 셸 + 흰 카드 한 장. */
import { gate, whoami, FRONT } from '../kit/auth-gate.js';
import { shell } from '../kit/shell.js';
import { h } from '../kit/util.js';
import { mountHelp } from './help.js';

const q = new URLSearchParams(location.search);
const embed = q.get('embed') === '1' && window.parent !== window;
const tab = q.get('tab') || undefined;

async function boot() {
  if (embed) {
    document.documentElement.classList.add('hm-embed');
    const who = await whoami();
    if (!who) { window.top.location.replace(FRONT + '?next=' + encodeURIComponent(window.top.location.pathname + window.top.location.search)); return; }
    // 바깥 서랍 — 제목을 명세 문구 `지원` 으로(키트 기본 제목이 다를 때) · Esc 를 바깥으로 넘긴다
    try {
      const dr = window.frameElement?.closest('.k-drawer');
      const tt = dr?.querySelector('.k-dr-t'); if (tt) tt.textContent = '지원';
      dr?.setAttribute('aria-label', '지원');
      if (window.frameElement) window.frameElement.title = '지원';
    } catch { /* 다른 출처 */ }
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      try { window.parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch { /* */ }
    });
    const root = h('div.hm-root');
    document.body.append(root);
    mountHelp(root, { who, tab });
    return;
  }
  const who = await gate('help-my');
  let H;
  const S = shell({ who, home: 'help-my', onHelp: () => document.querySelector('.hm-tab[aria-selected="true"]')?.focus() });
  const card = h('section.t-card.hm-card', {}, h('h1.hm-h', { text: '지원' }));
  S.main.append(h('div.hm-stage', {}, card));
  H = mountHelp(card, { who, tab });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.k-drawer')) location.href = who.landing; });
  return H;
}
boot();
