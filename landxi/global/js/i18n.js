/* i18n — 글로벌판 로케일(system-v2 §7). ?locale=en 기본(기관 kgz-*) · ko(LX 직원). ru 는 UI 아님 — 지명 병기만.
   <html lang> 를 바꾸면 fonts-v2.css 가 표시체를 Inter 600/700 으로 스왑한다. 단위 ha/km² · 날짜 ISO · 숫자 en-US. */
const DICT = {};
export let locale = 'en';

export async function initI18n(q = new URLSearchParams(location.search), tenant = 'lx') {
  const want = q.get('locale') || (tenant.startsWith('kgz') ? 'en' : 'en');
  locale = want === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = locale;
  const base = new URL('../data/', import.meta.url);
  try {
    const r = await fetch(new URL(`i18n-${locale}.json`, base), { cache: 'no-store' });
    Object.assign(DICT, (await r.json()).strings);
  } catch { /* 사전 없음 → 키 그대로(콘솔 오류 0) */ }
  document.title = t('doc.title');
  return locale;
}

export function t(key, vars = {}) {
  const s = DICT[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function num(v, digits) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const d = digits ?? (Number.isInteger(v) ? 0 : 1);
  return Number(v).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 면적 봉투 → 표기(ha/km² 자동). */
export function area(env, prefer) {
  if (!env || env.value === null) return '—';
  let v = env.value, u = env.unit;
  if (u === 'km2' && prefer === 'ha') { v *= 100; u = 'ha'; }
  if (u === 'ha' && prefer === 'km2') { v /= 100; u = 'km2'; }
  return `${num(v, v >= 100 ? 0 : 1)} ${u === 'km2' ? t('unit.km2') : t('unit.ha')}`;
}

export const basisLabel = (b) => t('basis.' + b);
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
