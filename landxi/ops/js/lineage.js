/* 계보 띠(S2) — 데이터셋 → run → 모델 → 카드 버전 → 배포본 → 기관 → job. 롤백 = 한 칸 되감김(현재 띠가 밀려나고 이전 버전 띠가 들어온다 500). */
import { h } from './boot.js';

const KIND = { dataset: '데이터셋', run: '학습 run', model: '모델', card_version: '카드 버전', deploy: '배포본', tenant: '기관', job: 'job' };

const short = (n) => {
  if (n.label && (n.kind === 'job' || n.kind === 'dataset')) return n.label;
  const id = String(n.id ?? n.label ?? '—');
  if (n.kind === 'model') return id.replace(/\/train\d*$/, '').replace(/^namwon\//, '');
  if (n.kind === 'card_version') return id.replace(/^card-/, '');
  return id;
};
export function lineageBand(host) {
  const band = h('div', { class: 'lin', role: 'list', 'aria-label': '버전 이력' }); host.append(band);
  let sig = '';
  const fill = (chain, stagger) => {
    band.replaceChildren(...chain.map((n, i) => {
      const el = h('div', { class: 'lin-n' + (stagger ? ' is-in' : ''), role: 'listitem', 'data-kind': n.kind, title: `${KIND[n.kind] || n.kind} · ${n.id ?? '—'}${n.label ? ' · ' + n.label : ''}` },
        h('span', {}, KIND[n.kind] || n.kind), h('b', {}, short(n)));
      if (stagger) el.style.animationDelay = (i * 60) + 'ms';
      return el;
    }));
  };
  return {
    el: band,
    set(chain, { rewind = false } = {}) {
      const s = JSON.stringify(chain); if (s === sig) return Promise.resolve(); sig = s;
      if (!rewind || !band.children.length) { fill(chain, false); return Promise.resolve(); }
      band.classList.add('is-rewind');
      return new Promise((res) => setTimeout(() => { band.classList.remove('is-rewind'); fill(chain, true); setTimeout(res, 500 + chain.length * 60); }, 500));
    },
  };
}
