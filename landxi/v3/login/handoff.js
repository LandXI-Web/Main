/* 정문 → 관제(:8702) 세션 인계 — 출처가 달라 localStorage 가 나뉘므로(4173 ≠ 8702) 정문이 받은 실제 토큰을
   URL 조각(#lx_handoff=…)으로 한 번 넘긴다. 조각은 서버로 전송되지 않는다(요청 줄·로그에 남지 않음).
   받는 쪽은 즉시 조각을 지우고 GET /me 로 토큰을 검증한 뒤 자기 출처의 'lx_api_session' 에 세운다.
   의존성 0 — :8702 에서도 그대로 import 하거나 복사해 쓸 수 있다.

   보내는 쪽(정문 auth.js):  location.assign(opsUrl + '#' + handoffFragment(session))
   받는 쪽(관제 첫 줄):        await receiveHandoff({ base: 'http://localhost:8700' })  → 세션 | null */

const KEY = 'lx_api_session';
const b64u = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

/** 세션(토큰 · realm · role · tenant_id · expires_at · user) → 조각 문자열 */
export function handoffFragment(s) {
  const pick = { token: s.token, realm: s.realm, role: s.role, tenant_id: s.tenant_id ?? null, expires_at: s.expires_at, user: s.user || null };
  return 'lx_handoff=' + b64u.enc(JSON.stringify(pick));
}

/** 조각이 있으면 읽고 지운 뒤 /me 로 검증해 세운다. 검증 실패 · 조각 없음 = null */
export async function receiveHandoff({ base = 'http://localhost:8700', key = KEY } = {}) {
  const m = /(?:^#|&)lx_handoff=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);   // 주소창 · 기록에서 즉시 지운다
  let s = null;
  try { s = JSON.parse(b64u.dec(m[1])); } catch { return null; }
  if (!s || !s.token || !(new Date(s.expires_at) > new Date())) return null;
  try {
    const r = await fetch(base + '/api/v1/me', { headers: { authorization: 'Bearer ' + s.token, accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return null;
    const me = await r.json();
    if (me.realm !== s.realm || me.role !== s.role) return null;
    const v = { ...s, user: me.user || s.user };
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 차단 */ }
    return v;
  } catch { return null; }
}
