/* 로그인 남은 시간(10-11 QA-고침-6 · 원칙 188) — 머리줄 작은 글 '자동 로그아웃 15:30 · 남은 1시간 20분'.
   끝나기 5분 전 알림(연장 단추) · 머리줄 글을 눌러도 연장. 끝나는 시각은 서버 세션 값(GET /auth/session · 관리자 설정을 따른다) 한 출처.
   끝나면 'lx:session-expired' — kit/auth-gate 의 '로그인이 끝났습니다' 창(끝난 시각 함께)이 이어 받는다. 아이콘 없음(원칙 126). */
import { api, session } from './util.js';
import { toast } from './toast.js';

const WARN_MS = 5 * 60 * 1000;
const day = (d) => { const t = new Date(); if (d.toDateString() === t.toDateString()) return ''; t.setDate(t.getDate() + 1); return d.toDateString() === t.toDateString() ? '내일 ' : `${d.getMonth() + 1}.${d.getDate()} `; };
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function left(ms) {
  if (ms <= 0) return '0분';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}분`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh}시간 ${mm}분` : `${hh}시간`;
}

let on = false;
export function mountClock(el) {
  if (!el || on || !session.get()) return;
  on = true;
  let exp = new Date(session.get().expires_at).getTime();
  let warned = false, warnT = null, busy = false;
  const save = (iso) => {
    exp = new Date(iso).getTime();
    const s = session.get(); if (s) { s.expires_at = iso; session.set(s); }
    warned = exp - Date.now() <= WARN_MS;
    paint();
  };
  const paint = () => {
    const ms = exp - Date.now();
    el.hidden = false;
    el.textContent = `자동 로그아웃 ${day(new Date(exp))}${hm(new Date(exp))} · 남은 ${left(ms)}`;
    el.classList.toggle('is-soon', ms <= WARN_MS);
  };
  async function extend() {
    if (busy) return; busy = true;
    try { const j = await api('/auth/extend', { method: 'POST' }); warnT?.close(); save(j.expires_at); toast(`로그인을 연장했습니다 — ${hm(new Date(j.expires_at))}까지`); }
    catch { /* 끝난 세션이면 api 가 401 → 로그인이 끝났습니다 창 */ }
    busy = false;
  }
  el.addEventListener('click', extend);
  el.title = '누르면 로그인 시간을 연장합니다';
  api('/auth/session').then((j) => { if (j?.expires_at) save(j.expires_at); }).catch(() => {});
  addEventListener('storage', (e) => { if (e.key === session.key) { const s = session.get(); if (s) { exp = new Date(s.expires_at).getTime(); warned = exp - Date.now() <= WARN_MS; paint(); } } });   // 다른 탭에서 연장
  const tick = () => {
    const ms = exp - Date.now();
    if (ms <= 0) { clearInterval(iv); el.textContent = `${hm(new Date(exp))} 로그인 끝남`; dispatchEvent(new CustomEvent('lx:session-expired', { detail: { at: exp } })); return; }
    paint();
    if (ms <= WARN_MS && !warned) {
      warned = true;
      warnT = toast(`${hm(new Date(exp))}에 자동 로그아웃됩니다`, { action: { label: '연장', onClick: extend }, ms: Math.max(ms, 1000) });
    }
  };
  const iv = setInterval(tick, 15000);
  tick();
}

