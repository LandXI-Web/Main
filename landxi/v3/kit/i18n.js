/* K15 i18n.js — 다국어. global 집만 en, 나머지는 ko 고정. 숫자·날짜 로캘.
   import { t, tl, langOf, locale, nf, df } from './i18n.js'
   t('cmdk.placeholder') · t('shell.fresh', { time: '09:30' }) · nf(12345) · df('2026-09-24')
   C2 plan 3.6: 질문 언어로 답한다 — langOf(질문) = 한글 비율 < 30% 면 'en' · tl('en', 'cmdk.error') 로 화면 로캘과 무관하게 그 언어 문구 */

const pick = () => {
  const forced = document.documentElement.dataset.locale;
  if (forced === 'en' || forced === 'ko') return forced;
  return /\/landxi\/v3\/global\//.test(location.pathname) ? 'en' : 'ko';
};
const LOC = pick();
const load = async (l) => { try { const r = await fetch(new URL(`./i18n/${l}.json`, import.meta.url)); return r.ok ? await r.json() : {}; } catch { return {}; } };
const [KO, EN] = await Promise.all([load('ko'), load('en')]);
const DICTS = { ko: KO, en: EN };
const DICT = DICTS[LOC] || KO;

export const locale = () => LOC;
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
/** 키 → 문구. {var} 치환. 없는 키는 ko → 빈 글자(키 이름이 화면에 새지 않게). */
export function t(key, vars = {}) {
  return fmt(DICT[key] ?? KO[key] ?? '', vars);
}
/** 언어를 정해 문구(질문 언어 · 화면 로캘과 무관) — 없는 키는 ko */
export function tl(lang, key, vars = {}) {
  const d = DICTS[lang] || DICT;
  return fmt(d[key] ?? KO[key] ?? '', vars);
}
/** 질문 언어 — 한글 글자 ÷ (한글 + 로마자) < 0.3 이면 'en'(서버 runner.lang_of 와 같은 규칙) · 글자가 없으면 화면 로캘 */
export function langOf(text) {
  const s = String(text || '');
  const ko = (s.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  if (!ko && !en) return LOC;
  return ko / (ko + en) < 0.3 ? 'en' : 'ko';
}
/** 숫자 */
export const nf = (v, digits, lang = LOC) => {
  if (v === null || v === undefined || Number.isNaN(+v)) return '—';
  const d = digits ?? (Number.isInteger(+v) ? 0 : 1);
  return Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
/** 날짜: ko 2026.09.24 · en Sep 24, 2026 */
export const df = (s) => {
  const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(+d)) return '';
  if (LOC === 'en') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
