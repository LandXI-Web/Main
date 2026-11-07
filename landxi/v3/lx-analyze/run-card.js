/* 분석 진행 카드(11-07 7-A) — '분석 시작'을 누르면 오른쪽 칸이 이 카드로 바뀐다. 4단계(대기열 · 영상 받기 · AI 분석 · 결과 쌓기) · 진행 막대 · % · 영상 칸 k/K ·
   지난 시간 · 남은 시간(어림) · 취소 · 끝나면 알림 · 끝나면 '결과 보기'(지도 서비스) + 이 서비스 최근 분석. 페이지를 다시 열어도 내가 돌리는 작업이 있으면 다시 보인다.
   상태 = 서버 GET /jobs/{id}/status 한 출처(위 머리줄 칩과 같은 값 · kit/job-watch.js). 값이 없으면 그 칸을 그리지 않는다(지어낸 값 0). */
import { h, api } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { ensureCss, val, durWord, etaWord, mapHref, fetchActive, fetchStatus, wantsNotify, setNotify, tellIfDone, poke } from '../kit/job-watch.js';

const POLL_MS = 3000;
const ymd = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}` : ''; };

/** box = 진행 카드를 그릴 칸 · card = 분석 서비스 카드 id · onShow/onHide = 폼 ↔ 진행 카드 바꾸기 */
export function runCard(box, { card, onShow, onHide }) {
  ensureCss();
  let id = null, timer = 0, gone = false, busy = false, last = null;
  const recent = h('div.rc-recent');
  const body = h('div');
  box.append(body, recent);
  box.hidden = true;

  const stop = () => { clearTimeout(timer); timer = 0; };
  function leave() { stop(); id = null; last = null; box.hidden = true; onHide?.(); loadRecent(); poke(); }

  function draw(s) {
    last = s;
    const run = s.state === 'running', wait = s.state === 'queued', ok = s.state === 'done';
    const pct = val(s.progress), el = val(s.elapsed), rem = val(s.remaining), t = s.tiles;
    const head = ok ? '분석을 마쳤습니다' : s.state === 'cancelled' ? '분석을 취소했습니다' : s.state === 'failed' || s.state === 'timeout' ? `분석이 멈췄습니다${s.reason ? ' · ' + s.reason : ''}`
      : wait ? `작업 대기${s.queue ? ` · 대기열 ${s.queue.position}번째 / ${s.queue.total}` : ''}` : `${s.word}${s.stage ? ' · ' + s.stage : ''}`;
    const steps = (s.steps || []).map((w, i) => {
      const n = i + 1, cls = ok || n < s.step ? 'done' : n === s.step && (run || wait) ? 'now' : '';
      return h('li.rc-st', { class: cls }, h('i', { text: String(n) }), h('span', { text: w }));
    });
    const kv = [];
    if (run && el != null) kv.push(h('span', {}, h('em', { text: '지난 시간' }), durWord(el)));
    if (wait && val(s.waited) != null) kv.push(h('span', {}, h('em', { text: '기다린 시간' }), durWord(val(s.waited))));
    if (run && rem != null) kv.push(h('span', {}, h('em', { text: '남은 시간(어림)' }), etaWord(rem)));
    const acts = [];
    if (ok) acts.push(h('a.t-btn.rc-a', { href: mapHref(s.job_id), text: '결과 보기' }), h('button.t-btn.t-btn--2.rc-a', { type: 'button', text: '새 분석', onclick: leave }));
    else if (run || wait) {
      acts.push(h('button.t-btn.t-btn--2.rc-a', { type: 'button', text: '취소', onclick: () => cancel(s) }));
      const on = wantsNotify(s.job_id);
      acts.push(h('button.t-btn.t-btn--2.rc-a', { type: 'button', 'aria-pressed': String(on), text: on ? '알림 켜짐' : '끝나면 알림',
        onclick: () => { setNotify(s.job_id, !wantsNotify(s.job_id)); draw(last); if (wantsNotify(s.job_id)) toast('끝나면 알려 드립니다'); } }));
    } else acts.push(h('button.t-btn.t-btn--2.rc-a', { type: 'button', text: '새 분석', onclick: leave }));
    body.replaceChildren(h('div.rc', { dataset: { state: s.state } },
      h('div.rc-h', {}, run || wait ? h('i.rc-dot') : null, h('span', { text: head })),
      h('p.rc-nm', { text: s.imagery_name || s.title || '분석' }),
      s.imagery_name && s.title ? h('p.rc-sub', { text: s.title }) : null,
      h('ol.rc-steps', {}, ...steps),
      run || ok ? h('div.rc-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct ?? 0) }, h('i', { style: { width: (pct ?? 0) + '%' } })) : null,
      run || ok ? h('div.rc-big', {}, h('b.num', { text: `${pct ?? 0}%` }), t && t.total ? h('span', { text: `영상 칸 ${t.n} / ${t.total}` }) : null) : null,
      kv.length ? h('div.rc-kv', {}, ...kv) : null,
      h('div.rc-acts', {}, ...acts)),
    h('p.rc-after', { text: ok ? '지도 서비스에 레이어로 쌓였습니다.' : '끝나면 이 자리에 ‘결과 보기’가 뜨고 지도 서비스에 레이어로 쌓입니다.' }));
  }

  async function cancel(s) {
    if (busy) return; busy = true;
    try { await api(s.cancel_path, { method: 'POST' }); toast('분석을 취소했습니다'); await tick(); }
    catch (e) { toast(e?.message || '취소하지 못했습니다'); }
    busy = false; poke();
  }

  async function tick() {
    if (gone || !id) return;
    stop();
    try {
      const s = await fetchStatus(id);
      draw(s);
      if (s.state === 'done') { tellIfDone(s); loadRecent(); poke(); return; }
      if (s.state === 'failed' || s.state === 'timeout' || s.state === 'cancelled') { loadRecent(); poke(); return; }
    } catch { /* 이번엔 못 읽음 — 카드는 그대로 두고 다시 */ }
    if (!gone && id) timer = setTimeout(tick, POLL_MS);
  }

  /** 이 작업을 진행 카드로 보인다(분석 시작 직후 · 다시 열었을 때) */
  function show(jobId) {
    if (!jobId) return;
    id = jobId; box.hidden = false; onShow?.();
    if (!body.firstChild) body.append(h('p.rc-nm', { text: '진행 상태를 읽는 중' }));
    tick(); poke();
  }
  /** 분석 시작 응답의 지도 서비스 주소(?job=)에서 작업 열쇠를 뽑는다 */
  const jobOf = (map) => { try { return new URL(map, location.href).searchParams.get('job'); } catch { return null; } };

  async function loadRecent() {
    try {
      const d = await api('/me/analyses');
      const rows = (d.groups || []).filter((g) => g.kind === 'card' && String(g.key).includes(card)).flatMap((g) => g.items || []).filter((x) => x.mine !== false)
        .sort((a, b) => String(b.finished_at || '').localeCompare(String(a.finished_at || '')));
      if (!rows.length) { recent.replaceChildren(); return; }
      recent.replaceChildren(h('h4', { text: `이 서비스로 돌린 최근 분석 · ${rows.length}건` }),
        h('ul.rc-rows', {}, ...rows.slice(0, 3).map((x) => h('li', {}, h('a', { href: mapHref(x.job) },
          h('b', { text: String(x.region || '').split(' ')[0] || '분석' }),
          h('span.k', { text: [x.imagery?.word, x.found && val(x.found) != null ? `${Number(val(x.found)).toLocaleString('ko-KR')}건` : ''].filter(Boolean).join(' · ') }),
          h('span.d.num', { text: ymd(x.finished_at) }))))));
    } catch { recent.replaceChildren(); }
  }

  /** 열 때 — 내가 돌리는 이 서비스의 분석이 있으면 카드를 다시 보인다 */
  async function resume() {
    try { const d = await fetchActive(card); if (d.items?.[0]) show(d.items[0].job_id); else loadRecent(); } catch { loadRecent(); }
  }
  addEventListener('pagehide', () => { gone = true; stop(); });
  return { show, showFromStart: (r) => { const j = jobOf(r?.map); if (j) show(j); else resume(); }, resume };
}
