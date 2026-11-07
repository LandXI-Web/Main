/* 내 분석 진행(11-07 7-A · 7-B) — 분석 시작 뒤 오른쪽 진행 카드(lx-analyze)와 직원 화면 위 머리줄 칩이 같은 상태 한 출처를 본다.
   서버: GET /me/jobs/active(내가 돌리는 것 + 방금 끝난 것) · GET /jobs/{id}/status(작업 하나 · 말 · 단계 · % · 영상 칸 · 지난/남은 시간 · 대기 순번).
   숫자는 {value,unit,basis,as_of,source} 봉투 — 남은 시간은 어림(근거 없으면 null → 표시 안 함). 작업 id 는 화면 글자에 없다(주소 열쇠로만). */
import { h, api } from './util.js';
import { toast } from './toast.js';

const CSS = new URL('./job-run.css', import.meta.url).href;
export function ensureCss() { if (!document.querySelector('link[data-k-jobrun]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-jobrun': '' })); }

export const val = (e) => (e && typeof e === 'object' ? e.value : e);
export function durWord(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}분 ${r}초` : `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
export function etaWord(s) {
  s = Number(s) || 0;
  if (s < 90) return '약 1분';
  const m = Math.round(s / 60);
  return m < 60 ? `약 ${m}분` : `약 ${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
}
const HERE = (p) => new URL(p, import.meta.url).href;
export const mapHref = (id) => HERE('../lx-map/') + '?job=' + encodeURIComponent(id);
/** 이 작업 화면 — 서비스 카드로 돌린 분석 = 그 카드 분석 칸(진행 카드) · 그 밖(국토 변화 · 프로젝트 추론) = 지도 서비스 */
export const jobHref = (j) => (j.kind !== 'index' && j.card_id ? HERE('../lx-analyze/') + '?card=' + encodeURIComponent(j.card_id) + '#analyze' : mapHref(j.job_id));

export const fetchActive = (card) => api('/me/jobs/active' + (card ? '?card=' + encodeURIComponent(card) : ''));
export const fetchStatus = (id) => api(`/jobs/${encodeURIComponent(id)}/status`);

/* 끝나면 알림 — 화면(어느 쪽이든)에서 끝남을 보면 한 번 알린다. 이 브라우저에 기억 */
const LSK = { notify: 'lx-job-notify', told: 'lx-job-told', seen: 'lx-job-seen' };
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a.slice(-40))); } catch { /* 저장 못 해도 화면은 그대로 */ } };
export const wantsNotify = (id) => read(LSK.notify).includes(id);
export function setNotify(id, on) { const a = read(LSK.notify).filter((x) => x !== id); if (on) a.push(id); write(LSK.notify, a); }
const markSeen = (id) => { const a = read(LSK.seen); if (!a.includes(id)) { a.push(id); write(LSK.seen, a); } };
export function tellIfDone(j) {
  if (!j || j.state !== 'done' || !wantsNotify(j.job_id)) return;
  const t = read(LSK.told); if (t.includes(j.job_id)) return;
  t.push(j.job_id); write(LSK.told, t);
  toast('분석이 끝났습니다', { action: { label: '결과 보기', href: mapHref(j.job_id) }, ms: 6000 });
}
/** 같은 화면의 다른 부분에 알린다(카드 ↔ 위 칩) */
export const poke = () => dispatchEvent(new Event('lx:job-change'));

/* ── 위 머리줄 칩 — 진행 중일 때만 · 30초마다 읽기(+ 카드가 알리면 바로) · 끝나면 잠깐 '분석 끝 · 결과 보기' ── */
export function mountChip(host) {
  ensureCss();
  const dot = h('i.jc-dot', { 'aria-hidden': 'true' });
  const txt = h('span.jc-t');
  const bar = h('span.jc-bar', { 'aria-hidden': 'true' }, h('i'));
  const pct = h('b.jc-p.num');
  const chip = h('a.k-job-chip', { hidden: true, role: 'status', 'aria-live': 'polite' }, dot, txt, bar, pct);
  host.append(chip);
  chip.addEventListener('click', () => { const id = chip.dataset.job; if (id && chip.dataset.mode === 'done') markSeen(id); });
  let timer = 0, busy = false;
  async function tick() {
    if (busy || document.hidden) return; busy = true;
    try {
      const d = await fetchActive();
      const act = d.items || [];
      for (const j of d.recent || []) tellIfDone(j);
      const fresh = (d.recent || []).filter((j) => j.state === 'done' && !read(LSK.seen).includes(j.job_id) && Date.now() - Date.parse(j.finished_at || 0) < 5 * 60 * 1000);
      if (act.length) {
        const run = act.filter((j) => val(j.progress) != null);
        const p = run.length ? Math.round(run.reduce((s, j) => s + val(j.progress), 0) / run.length) : null;
        chip.hidden = false; chip.dataset.mode = 'run'; chip.dataset.job = act[0].job_id;
        chip.href = jobHref(act[0]);
        txt.textContent = run.length ? `분석 ${act.length}건 진행 중` : `분석 ${act.length}건 대기 중`;
        bar.hidden = p == null; pct.hidden = p == null;
        if (p != null) { bar.firstChild.style.width = p + '%'; pct.textContent = p + '%'; }
      } else if (fresh.length) {
        chip.hidden = false; chip.dataset.mode = 'done'; chip.dataset.job = fresh[0].job_id;
        chip.href = mapHref(fresh[0].job_id);
        txt.textContent = '분석 끝 · 결과 보기'; bar.hidden = true; pct.hidden = true;
      } else { chip.hidden = true; delete chip.dataset.mode; }
    } catch { /* 읽지 못하면 그대로 — 다음 번에 */ }
    busy = false;
  }
  const loop = () => { clearTimeout(timer); timer = setTimeout(async () => { await tick(); loop(); }, 30000); };
  addEventListener('lx:job-change', () => setTimeout(tick, 400));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick(); loop();
}
