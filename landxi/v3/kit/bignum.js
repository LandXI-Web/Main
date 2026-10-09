/* K6 bignum.js — 큰 숫자(업무 결과만 · 화면당 1).
   라벨 14 위 · 숫자 80 Paperlogy 800(hud:true = 지도 사진 위 흰 124) · 단위 · 신뢰 기호 · 호버 근거.
   상태 3가지(화면 코드는 그대로 — 하위 호환):
     · 도착 전   bignum(el, null|undefined) 로 만든 직후 · set(undefined) · b.loading() → — + '불러오는 중'
     · 빈 값     set(null) · 봉투 value null · b.empty()                         → — + '아직 결과가 없습니다'
     · 값        set(봉투)
   만든 뒤 PENDING_MS 안에 set 이 한 번도 오지 않으면 빈 값으로 넘긴다(불러오는 중에 멈춰 있지 않게).
   봉투가 아니면: ?dev=1 에서 throw · 평소엔 빈 값.
   const b = bignum(el, null, { label: 'AI 분석 결과', unit: '필지' }); … b.set(env2);
   K16 number-lint 가 읽도록 data-metric(라벨) · data-v(값)를 남긴다. */
import { h, esc, isEnvelope, isDev, RM, E_CAM } from './util.js';
import { sig } from './sig.js';
import { t, nf } from './i18n.js';

/** 법전 §4-7 허용 라벨 — 밖이면 개발 모드에서 경고(사용자 결정 항목). 'AI 분석 결과' = 원칙 135(10-09) · 맨 뒤 하나는 기관 화면(사용자 답 전까지) */
export const ALLOWED = ['AI 분석 결과', '의심 필지', '대장과 다른 필지', '판정 대기', '재학습 필요', '승인 대기', '만들 수 있는 업무', '하천구역 안 건물 점유', '동시 고부하 GPU', 'Changed area', '현장 확인 필요'];
/** 도착 전 표시를 빈 값으로 넘기는 한도(ms) */
export const PENDING_MS = 20000;
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

  let cur = 0, raf = 0, wait = 0;
  const blank = (st) => {
    clearTimeout(wait); wait = 0;
    num.textContent = '—'; uni.textContent = ''; mark.innerHTML = '';
    none.textContent = t(st === 'loading' ? 'empty.loading' : 'big.none'); none.hidden = false;
    el.dataset.state = st; el.classList.toggle('k-big--wait', st === 'loading'); el.setAttribute('aria-busy', st === 'loading' ? 'true' : 'false');
    el.dataset.v = ''; el.dataset.metric = label;
  };
  const loading = () => { cancelAnimationFrame(raf); blank('loading'); wait = setTimeout(() => { if (el.dataset.state === 'loading') blank('empty'); }, PENDING_MS); };
  const set = (e, opt = {}) => {
    cancelAnimationFrame(raf);
    if (e === undefined) return loading();
    if (e === null || (isEnvelope(e) && (e.value === null || e.value === undefined))) return blank('empty');
    if (!isEnvelope(e)) {
      if (isDev()) throw new Error(`[kit/bignum] 봉투 없는 숫자: ${label} = ${JSON.stringify(e).slice(0, 80)}`);
      return set(null);
    }
    clearTimeout(wait); wait = 0;
    none.hidden = true; el.dataset.state = 'ok'; el.classList.remove('k-big--wait'); el.setAttribute('aria-busy', 'false');
    const u = opt.unit ?? unit ?? unitKo(e.unit);
    uni.textContent = u; mark.innerHTML = sig(e);
    el.dataset.metric = label; el.dataset.v = String(e.value);
    const to = +e.value, d = opt.digits ?? digits;
    if (!animate || RM() || !Number.isFinite(to)) { num.textContent = nf(to, d); cur = to; return; }
    const from = cur, t0 = performance.now(), ms = 750;
    const step = (now) => { const p = Math.min(1, (now - t0) / ms); const v = from + (to - from) * E_CAM(p); num.textContent = nf(p < 1 && Number.isInteger(to) ? Math.round(v) : v, d); if (p < 1) raf = requestAnimationFrame(step); else cur = to; };
    raf = requestAnimationFrame(step);
  };
  // 처음 만들 때 null/undefined = 아직 도착 전(화면들이 fetch 전에 자리를 먼저 만든다)
  if (env === null || env === undefined) loading(); else set(env);
  return { el, set, loading, empty: () => { cancelAnimationFrame(raf); blank('empty'); }, label: (s) => { lab.textContent = s; el.dataset.metric = s; } };
}

/** 문자열로(표·카드 안 32 숫자 등) — `12,345필지✓` */
export function numHtml(env, { unit, digits, cls = '' } = {}) {
  if (!isEnvelope(env) || env.value === null) return `<span class="k-num ${cls}">—</span>`;
  return `<span class="k-num ${cls}" data-v="${esc(env.value)}">${nf(env.value, digits)}<small>${esc(unit ?? unitKo(env.unit))}</small></span>${sig(env)}`;
}
