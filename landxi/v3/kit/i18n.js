/* K15 i18n.js — 다국어. global 집만 en, 나머지는 ko 고정. 숫자·날짜 로캘.
   import { t, locale, nf, df } from './i18n.js'
   t('cmdk.placeholder') · t('shell.fresh', { time: '09:30' }) · nf(12345) · df('2026-09-24') */

const pick = () => {
  const forced = document.documentElement.dataset.locale;
  if (forced === 'en' || forced === 'ko') return forced;
  return /\/landxi\/v3\/global\//.test(location.pathname) ? 'en' : 'ko';
};
const LOC = pick();
const load = async (l) => { try { const r = await fetch(new URL(`./i18n/${l}.json`, import.meta.url)); return r.ok ? await r.json() : {}; } catch { return {}; } };
const DICT = await load(LOC);
const KO = LOC === 'ko' ? DICT : await load('ko');

export const locale = () => LOC;
/** 키 → 문구. {var} 치환. 없는 키는 ko → 빈 글자(키 이름이 화면에 새지 않게). */
export function t(key, vars = {}) {
  const s = DICT[key] ?? KO[key] ?? '';
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
/** 숫자 */
export const nf = (v, digits) => {
  if (v === null || v === undefined || Number.isNaN(+v)) return '—';
  const d = digits ?? (Number.isInteger(+v) ? 0 : 1);
  return Number(v).toLocaleString(LOC === 'en' ? 'en-US' : 'ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
/** 날짜: ko 2026.09.24 · en Sep 24, 2026 */
export const df = (s) => {
  const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(+d)) return '';
  if (LOC === 'en') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
