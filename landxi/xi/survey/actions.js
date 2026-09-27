/* actions.js — 조치 표시(1차 유일한 쓰기 · 계약 v1.1-22 POST /survey/findings/{id}/state).
   '현장조사 배정 ›' / '오탐 신고' → 시트(담당자 · 예정일 · 사유) → 서버 응답 뒤에만 상태 칩 교체(낙관적 갱신 0) → 타임라인 ■ · 큐 · 다른 탭.
   서버 경로가 없으면(off · F2-S 대기) '시연 · 저장 안 됨' — 메모리만(localStorage 0) · 같은 브라우저 탭 사이만 BroadcastChannel.
   실패 코드(finding_state_invalid 409 · 403 · 네트워크)는 시트 안에 결손 한 줄로. */
import { setState, stateOf, STATE_KO, canMove, routeOn, routeNote } from './api-survey.js';
import { toast } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const plus = (d, n) => new Date(Date.parse(d) + n * 86400e3).toISOString().slice(0, 10);
export const DISMISS_REASONS = ['합법 농업용 시설(축사·농막·창고)', '지목변경 미정리(대장 갱신 대상)', '연속지적 경계 어긋남', '영상 촬영 뒤 허가·준공', 'AI 오탐(판독 오류)', '기타'];
const ERR_KO = { finding_state_invalid: '상태 전이 불가(서버 409)', forbidden: '권한 없음', http_403: '권한 없음(403)', http_401: '로그인 필요', no_sw: '서비스 워커 대기', offline: '서버 연결 없음' };

/** 상태 칩 HTML */
export function stateChip(f) {
  const st = stateOf(f), row = f._row || null;
  return `<span class="sv-st" data-st="${st}" ${row?.basis === 'demo' ? 'data-basis="demo"' : ''} title="${esc(st)}${row?.updated_at ? ' · ' + esc(row.updated_at) : ''}">${esc(STATE_KO[st] || st)}</span>`;
}

/**
 * 시트를 host 안에 편다. mode = 'assign' | 'dismiss'. items = [finding]. role = 'agency' | 'staff' | 'sales'
 * onDone({ok:[..], fail:[..], saved}) — 서버 응답 뒤(또는 시연 메모리 반영 뒤) 한 번
 */
export function openStateSheet(host, { mode, items, role, onDone, onCancel }) {
  const to = mode === 'assign' ? 'assigned' : 'dismissed';
  const movable = items.filter((f) => canMove(stateOf(f), to));
  const demo = !routeOn();
  const who = role === 'staff' ? 'LX 직원 · 시연 표기' : role === 'sales' ? '영업 · 시연' : '기관 담당';
  host.hidden = false;
  host.innerHTML = `
    ${mode === 'assign'
      ? `<label>담당자<input name="assignee" type="text" placeholder="예: 농정과 현장조사 1팀" autocomplete="off" value="농정과 현장조사 1팀"></label>
         <label>예정일<input name="planned_for" type="date" value="${plus(today(), 5)}" min="${today()}"></label>
         <label class="full">메모<input name="reason" type="text" placeholder="현장 확인 요청 사유(선택)" value="현장 확인 요청 · 대장 대조 불일치"></label>`
      : `<label class="full">오탐 사유(필수)<select name="reason">${DISMISS_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>`}
    <footer><button type="button" class="xi-btn xi-btn--ink sv-go">${mode === 'assign' ? `${movable.length}건 현장조사 배정` : `${movable.length}건 오탐 처리`}</button>
      <button type="button" class="xi-btn xi-btn--br sv-cancel">취소</button>
      <small>${demo ? `시연 · 저장 안 됨(${esc(routeNote())})` : `POST /survey/findings/{id}/state · ${esc(who)}`}</small></footer>
    <p class="sv-err" hidden></p>`;
  if (movable.length < items.length) { const e = host.querySelector('.sv-err'); e.hidden = false; e.textContent = `${items.length - movable.length}건은 지금 상태(${[...new Set(items.filter((f) => !canMove(stateOf(f), to)).map((f) => STATE_KO[stateOf(f)]))].join('·')})에서 ${STATE_KO[to]}(으)로 바꿀 수 없어 제외`; }
  host.querySelector('.sv-cancel').onclick = () => { host.hidden = true; host.innerHTML = ''; onCancel && onCancel(); };
  host.querySelector('.sv-go').onclick = async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const v = (n) => host.querySelector(`[name=${n}]`)?.value || '';
    const body = { reason: v('reason'), assignee: v('assignee'), planned_for: v('planned_for') };
    const ok = [], fail = [];
    for (const f of movable) {
      try { const r = await setState(f, to, body); ok.push({ f, row: r.row }); }
      catch (e) { fail.push({ f, code: e.code || 'error', status: e.status }); }
    }
    const saved = ok.some((x) => x.row.saved);
    if (fail.length) { const e = host.querySelector('.sv-err'); e.hidden = false; e.textContent = `실패 ${fail.length}건 · ${[...new Set(fail.map((x) => ERR_KO[x.code] || x.code))].join(' · ')}`; btn.disabled = false; }
    if (ok.length) {
      toast(`${ok.length}건 ${STATE_KO[to]}${saved ? ' · 저장됨(감사 로그)' : ' · 저장 안 됨'}`, { basis: saved ? null : 'demo' });
      if (!fail.length) { host.hidden = true; host.innerHTML = ''; }
    }
    onDone && onDone({ ok, fail, saved, to, demo });
  };
  host.querySelector('input,select')?.focus();
}
