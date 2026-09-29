/* K6 sig.js — 신뢰 기호 3종 + 호버 근거 한 줄.
   봉투 basis 6종 → 기호 3종: measured·recorded → ✓ 확인됨 · inferred·estimate → ~ 추정치 · demo·history → 예시
   호버 = `{출처를 사용자 말로} · {기준일} 기준` — API 경로·파일·id·계산식은 humanize() 가 지운다(개발 정보는 ?dev=1 서랍).
   import { sig, sigOf, humanize } from './sig.js' */
import { esc, isEnvelope } from './util.js';
import { t, df } from './i18n.js';

export const SIG = { measured: 'ok', recorded: 'ok', inferred: 'est', estimate: 'est', demo: 'ex', history: 'ex' };
export const sigOf = (basis) => SIG[basis] || 'est';
export const sigWord = (k) => t('sig.' + k);

/* 출처 → 사용자 말(순서 = 우선순위). 사용자 말이 없으면 '플랫폼 기록'. */
const WORDS = [
  [/ap25|25\s?cm|항공\s?영상|aerial/i, '25cm 항공영상'],
  [/drone|드론/i, '드론 영상'],
  [/sentinel|s2|hls|위성/i, '위성 영상'],
  [/vworld|v-world|브이월드/i, 'V-World 공간정보'],
  [/parcel|지적|필지/i, '연속지적도'],
  [/ledger|registry_snap|대장/i, '기관 행정 대장'],
  [/survey_findings|findings|실태조사|survey_emd/i, 'AI 실태조사 결과'],
  [/results?\/|snapshot|결과/i, 'AI 분석 결과'],
  [/feedback|신고/i, '기관 확인 기록'],
  [/deploy|배포/i, '배포 기록'],
  [/jobs?\b|작업/i, '분석 작업 기록'],
  [/ops|gpu|관제/i, 'LX 관리자 대시보드 기록'],
  [/chat\/completions|vllm|llm|agent/i, 'AI 답변'],
];
/** 출처 문자열에서 경로·API·id·확장자·계산식을 지우고 사용자 말 한 마디로 */
export function humanize(source = '') {
  const s = String(source || '');
  const yr = /(20\d{2})(?!\d)/.exec(s.replace(/\d{4}-\d{2}-\d{2}/g, ''));
  for (const [re, w] of WORDS) if (re.test(s)) return (yr && /영상/.test(w) ? `${yr[1]}년 ` : '') + w;
  const clean = s
    .replace(/\b(GET|POST|PUT|DELETE)\b\s*\S*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\S*\/\S*/g, '')
    .replace(/\S+\.(json|gpkg|geojson|csv|xlsx|shp|zip|pmtiles|tif|parquet|py|js)\b/gi, '')
    .replace(/\b[a-z]+[_-][a-z0-9_-]+\b/gi, '')
    .replace(/[(){}\[\]=<>]/g, ' ')
    .replace(/\s{2,}/g, ' ').trim();
  return /[가-힣]/.test(clean) && clean.length <= 24 ? clean : '플랫폼 기록';
}
/** 호버 한 줄 */
export function why(env) {
  if (!isEnvelope(env)) return '';
  const d = df(env.as_of);
  return [humanize(env.source), d ? t('sig.asof', { date: d }) : ''].filter(Boolean).join(' · ');
}

/** 기호 HTML — 숫자 바로 뒤에 붙인다. */
export function sig(env) {
  if (!isEnvelope(env)) return '';
  const k = sigOf(env.basis);
  return `<span class="t-sig k-sig" data-sig="${k}" tabindex="0" role="note" aria-label="${esc(sigWord(k))}" data-why="${esc(why(env))}"></span>`;
}
/** 기호 엘리먼트 */
export function sigEl(env) { const w = document.createElement('span'); w.innerHTML = sig(env); return w.firstElementChild; }

/* ── 호버 풍선(하나만 · title 속성 대신 — 금지어 검사 대상 밖에 두지 않고 사용자 말만 담는다) ── */
let tip = null;
function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div'); tip.className = 'k-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  const show = (el) => {
    const w = el.dataset.why; if (!w) return;
    tip.innerHTML = `<b>${esc(sigWord(el.dataset.sig))}</b>${esc(w)}`; tip.hidden = false;
    const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    const x = Math.min(innerWidth - tr.width - 12, Math.max(12, r.left + r.width / 2 - tr.width / 2));
    const y = r.top - tr.height - 8 < 8 ? r.bottom + 8 : r.top - tr.height - 8;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('.k-sig'); if (el) show(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.k-sig')) hide(); });
  document.addEventListener('focusin', (e) => { if (e.target.classList?.contains('k-sig')) show(e.target); });
  document.addEventListener('focusout', hide);
  addEventListener('scroll', hide, true);
  return tip;
}
if (document.body) ensureTip(); else addEventListener('DOMContentLoaded', ensureTip);
