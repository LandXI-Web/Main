/* K6 bignum.js — 큰 숫자(업무 결과만 · 화면당 1).
   라벨 14 위 · 숫자 80 Paperlogy 800(hud:true = 지도 사진 위 흰 124) · 단위 · 신뢰 기호 · 호버 근거.
   봉투가 아니면: ?dev=1 에서 throw · 평소엔 결손(— + '아직 결과가 없습니다').
   const b = bignum(el, env, { label: '현장 확인 필요', unit: '필지' }); b.set(env2);
   K16 number-lint 가 읽도록 data-metric(라벨) · data-v(값)를 남긴다. */
import { h, esc, isEnvelope, isDev, RM, E_CAM } from './util.js';
import { sig } from './sig.js';
import { t, nf } from './i18n.js';

/** 법전 §4-7 허용 라벨 — 밖이면 개발 모드에서 경고(사용자 결정 항목) */
export const ALLOWED = ['현장 확인 필요', '대장과 다른 필지', '판정 대기', '재학습 필요', '결재 대기', '만들 수 있는 업무', '하천구역 안 건물 점유', '동시 고부하 GPU', 'Changed area'];
const UNIT = { count: '건', parcels: '필지', m2: '㎡', ha: 'ha', km2: '㎢', ratio: '%' };
export const unitKo = (u) => UNIT[u] ?? u ?? '';

export function bignum(el, env, { label = '', unit, digits, hud = false, animate = true } = {}) {
  el.classList.add('k-big'); if (hud) el.classList.add('k-big--hud');
  el.innerHTML = '';
  const lab = h('div.t-label.k-big-l', { text: label });
  const row = h('div.k-big-row');
  const num = h('span', { class: hud ? 't-hud' : 't-big' });
  const uni = h('span.k-big-u');
  const mark = h('span.k-big-s');
  row.append(num, uni, mark);
  const none = h('div.t-label.k-big-none', { text: t('big.none') });
  el.append(lab, row, none);
  if (isDev() && label && !ALLOWED.includes(label)) console.warn(`[kit/bignum] 허용 라벨 밖: '${label}' (법전 §4-7)`);

  let cur = 0, raf = 0;
  const set = (e, opt = {}) => {
    cancelAnimationFrame(raf);
    if (e === null || e === undefined || (isEnvelope(e) && (e.value === null || e.value === undefined))) {
      num.textContent = '—'; uni.textContent = ''; mark.innerHTML = ''; none.hidden = false; el.dataset.v = ''; el.dataset.metric = label; return;
    }
    if (!isEnvelope(e)) {
      if (isDev()) throw new Error(`[kit/bignum] 봉투 없는 숫자: ${label} = ${JSON.stringify(e).slice(0, 80)}`);
      return set(null);
    }
    none.hidden = true;
    const u = opt.unit ?? unit ?? unitKo(e.unit);
    uni.textContent = u; mark.innerHTML = sig(e);
    el.dataset.metric = label; el.dataset.v = String(e.value);
    const to = +e.value, d = opt.digits ?? digits;
    if (!animate || RM() || !Number.isFinite(to)) { num.textContent = nf(to, d); cur = to; return; }
    const from = cur, t0 = performance.now(), ms = 750;
    const step = (now) => { const p = Math.min(1, (now - t0) / ms); const v = from + (to - from) * E_CAM(p); num.textContent = nf(p < 1 && Number.isInteger(to) ? Math.round(v) : v, d); if (p < 1) raf = requestAnimationFrame(step); else cur = to; };
    raf = requestAnimationFrame(step);
  };
  set(env);
  return { el, set, label: (s) => { lab.textContent = s; el.dataset.metric = s; } };
}

/** 문자열로(표·카드 안 32 숫자 등) — `12,345필지✓` */
export function numHtml(env, { unit, digits, cls = '' } = {}) {
  if (!isEnvelope(env) || env.value === null) return `<span class="k-num ${cls}">—</span>`;
  return `<span class="k-num ${cls}" data-v="${esc(env.value)}">${nf(env.value, digits)}<small>${esc(unit ?? unitKo(env.unit))}</small></span>${sig(env)}`;
}
