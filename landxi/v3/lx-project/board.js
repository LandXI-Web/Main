/* board.js — 프로젝트 진행 현황 흐름도 한 부품(직원-6 4차 · 직원-7 · 10-09 "한 번에 정리").
   데이터 올리기 → 학습데이터 구축 → 학습 → 추론 → 결과 확인 → 배포 신청 — 여섯 단계(서버 단계 6 그대로 · 프로젝트 안 단계 막대와 같은 이름 · 10-10 질문 10 확인).
   대시보드 맨 위 칸(칩 둘 + '외 n개')과 메뉴 '프로젝트' 목록(?stage= 단계 고르기)이 같은 부품을 쓴다(원칙 99 — 메뉴와 한 줄기).
   값은 모두 서버(GET /projects — stage · steps · blocked · last_at · next). 단계에 들어온 날짜는 서버에 없어 '마지막 활동'으로 보인다(지어내지 않는다). */
import { h } from '../kit/util.js';
import { HOME, ensureCss } from './context.js';

export const GROUPS = [
  { key: 'ingest', label: '데이터 올리기', keys: ['ingest'] },
  { key: 'label', label: '학습데이터 구축', keys: ['label'] },
  { key: 'train', label: '학습', keys: ['train'] },
  { key: 'infer', label: '추론', keys: ['infer'] },
  { key: 'review', label: '결과 확인', keys: ['review'] },
  { key: 'deploy', label: '배포 신청', keys: ['publish'] },
];
const KEYS = ['ingest', 'label', 'train', 'infer', 'review', 'publish'];
export const N = GROUPS.length;

let cssOn = false;
function sheet() {
  ensureCss();
  if (cssOn || document.querySelector('link[data-lxp-board]')) return;
  cssOn = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./board.css', import.meta.url).href, dataset: { lxpBoard: '1' } }));
}
sheet();

/** 프로젝트의 단계(여섯 단계 가운데 몇 번째) — 서버 stage.key 로 */
export const groupOf = (p) => Math.max(0, GROUPS.findIndex((g) => g.keys.includes(p?.stage?.key)));
/** 여섯 칸 진행(done · now · wait · skip) — 서버 steps(6칸) 그대로(한 출처 · GPT2-3). 셈 = 서버 progress(끝남 + 건너뜀) */
const SEG_WORD = { done: '완료', now: '지금 단계', wait: '대기', skip: '건너뜀' };
export function seg4(p) {
  return KEYS.map((k, i) => (SEG_WORD[p?.steps?.[i]] ? p.steps[i] : 'wait'));
}
export const doneN = (p) => (p?.progress?.n ?? seg4(p).filter((x) => x === 'done' || x === 'skip').length);
/** 여섯 칸 막대(요소) — 프로젝트 목록과 같은 .lxp-seg 모양 */
export function seg4El(p) {
  const s = seg4(p);
  return h('span.lxp-seg.sb-seg4', { role: 'img', 'aria-label': `여섯 단계 가운데 ${doneN(p)}단계 끝남` },
    ...s.map((x, i) => h('i', { dataset: { st: x }, title: `${GROUPS[i].label} · ${SEG_WORD[x]}` })));
}
/** 남은 일 — 서버 blocked 첫 줄. kind: warn(내가 손댈 것) · wait(승인 대기) · null */
export function kick(p) {
  const b = p?.blocked?.[0];
  if (!b) return null;
  const text = b.kind === 'before' && !/남음$/.test(b.text) ? `${b.text} 남음` : b.text;
  return { kind: b.kind === 'wait' ? 'wait' : 'warn', text };
}
/** 마지막 활동 — 오늘 · 어제 · n일 전(두 달 넘으면 월.일) */
export function ago(s) {
  const d = new Date(s || '');
  if (Number.isNaN(+d)) return '—';
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 864e5);
  if (n <= 0) return '오늘';
  if (n === 1) return '어제';
  if (n <= 60) return `${n}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
const RANK = { warn: 0, wait: 1 };
/** 정렬 — kick(남은 일 먼저 → 오래된 활동 순) · recent(마지막 활동 최근 순) · name(이름) */
export function sortBy(items, how = 'kick') {
  const t = (p) => String(p.last_at || p.updated_at || '');
  const r = (p) => RANK[kick(p)?.kind] ?? 2;
  const a = items.slice();
  if (how === 'name') a.sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  else if (how === 'recent') a.sort((x, y) => t(y).localeCompare(t(x)));
  else a.sort((x, y) => r(x) - r(y) || t(x).localeCompare(t(y)));
  return a;
}
/** 단계 화면 주소 — 메뉴 '프로젝트' 목록에 단계 거르기 */
export const stageListHref = (gkey, { scope = 'mine', from = 'board' } = {}) => {
  const u = new URLSearchParams();
  if (scope) u.set('scope', scope);
  if (gkey) u.set('stage', gkey);
  if (from) u.set('from', from);
  return HOME + '?' + u.toString();
};

/** 흐름도 — items(서버 목록) · picked(고른 단계 key) · link(gkey) → 주소 · onPick(gkey) → 누름 · chips(대시보드: 칩 둘 + 외 n개) */
export function flow(items, { picked = null, link = null, onPick = null, chips = false } = {}) {
  const by = GROUPS.map(() => []);
  for (const p of items) by[groupOf(p)].push(p);
  return h('ol.sb-fl', { 'aria-label': '프로젝트 단계' }, ...GROUPS.map((g, i) => {
    const ps = sortBy(by[i]);
    const warn = ps.filter((p) => kick(p)?.kind === 'warn').length;
    const wait = ps.filter((p) => kick(p)?.kind === 'wait').length;
    const last = ps.map((p) => String(p.last_at || p.updated_at || '')).sort().pop();
    const sub = ps.length
      ? [warn ? h('em', { text: `남은 일 ${warn}` }) : null, wait ? `승인 대기 ${wait}` : null, last ? `마지막 활동 ${ago(last)}` : null].filter(Boolean)
      : ['없음'];
    const subEl = h('small.sb-st-s');
    sub.forEach((x, k) => { if (k) subEl.append(' · '); subEl.append(x); });
    const graph = h('span.sb-st-g', { 'aria-hidden': 'true' }, ...ps.slice(0, 12).map((p) =>
      h('i', { style: `--w:${Math.round((doneN(p) / N) * 100)}%`, dataset: { kind: kick(p)?.kind || '' } })));
    const on = picked === g.key;
    const label = `${i + 1} ${g.label} · ${ps.length}개${warn ? ` · 남은 일 ${warn}` : ''}`;
    const inner = [h('span.sb-st-k.num', { text: String(i + 1) }),
      h('span.sb-st-row', {}, h('b.num', { text: String(ps.length) }), graph),
      h('span.sb-st-l', { text: g.label }), subEl];
    const btn = link
      ? h('a.sb-st-b', { href: link(g.key), 'aria-label': label, 'aria-current': on ? 'true' : null }, ...inner)
      : h('button.sb-st-b', { type: 'button', 'aria-label': label, 'aria-pressed': String(on), onclick: () => onPick?.(on ? null : g.key) }, ...inner);
    const li = h('li.sb-st', { dataset: { n: String(ps.length), key: g.key } }, btn);
    if (on) li.dataset.open = '1';
    if (chips) {
      const box = h('div.sb-chips');
      for (const p of ps.slice(0, 2)) {
        const k = kick(p);
        box.append(h('a.sb-chip', { href: link ? link(g.key) : '#', dataset: { kind: k?.kind || '' }, title: [p.name, p.next?.text, k?.text].filter(Boolean).join(' · ') },
          h('span', { text: p.name }), seg4El(p)));
      }
      if (ps.length > 2) box.append(h('a.sb-chip.sb-chip--more', { href: link ? link(g.key) : '#', text: `외 ${ps.length - 2}개` }));
      li.append(box);
    }
    return li;
  }));
}
