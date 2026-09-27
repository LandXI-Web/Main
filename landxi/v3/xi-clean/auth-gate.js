/* auth-gate.js — 세션 관문. 정문(v3/login)에서 받은 세션(lx_api_session)을 그대로 쓴다 — 세션 주입 없음.
   세션이 없으면: 정문이 있으면 정문으로(?next=), 없으면 이 화면 위 로그인 시트(실제 POST /auth/login). 서버가 /me 로 확인한 세션만 통과. */
import { API, session, api } from '../../shared/api-v1.js';

const FRONT = '/landxi/v3/login/';
const $ = (id) => document.getElementById(id);

async function verified() {
  if (!session.get()) return null;
  try { const me = await api('/me'); return { ...session.get(), me }; }
  catch (e) { if (e.status === 401 || e.status === 403) session.clear(); return null; }
}
async function frontDoor() {
  try { const r = await fetch(FRONT, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
}

/** 세션을 돌려준다(없으면 로그인이 끝날 때까지 기다린다) */
export async function gate({ inline = false } = {}) {
  const v = await verified();
  if (v) return v;
  if (!inline && API.mode === 'on' && (await frontDoor())) {
    location.replace(FRONT + '?next=' + encodeURIComponent('/landxi/v3/xi-clean/' + location.search));
    return new Promise(() => {});
  }
  return sheet();
}

function sheet() {
  const g = $('gate'), f = $('gate-f'), err = $('gate-e');
  g.hidden = false;
  const tenant = f.elements.tenant;
  f.addEventListener('change', () => { tenant.hidden = f.elements.realm.value !== 'tenant'; tenant.required = !tenant.hidden; });
  setTimeout(() => f.elements.login.focus(), 50);
  return new Promise((resolve) => {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = f.querySelector('button'); b.disabled = true; err.textContent = '';
      const realm = f.elements.realm.value;
      const body = { realm, login: f.elements.login.value.trim(), password: f.elements.password.value };
      if (realm === 'tenant') body.tenant_id = tenant.value.trim();
      try {
        if (API.mode !== 'on') throw Object.assign(new Error('서버에 연결할 수 없습니다'), { code: 'offline' });
        const s = await api('/auth/login', { method: 'POST', body });
        session.set(s);
        const me = await api('/me');
        g.hidden = true; f.elements.password.value = '';
        resolve({ ...s, me });
      } catch (e) {
        err.textContent = e.code === 'unauthorized' ? '아이디 또는 비밀번호가 맞지 않습니다' : e.message || '로그인하지 못했습니다';
        f.elements.password.select();
      } finally { b.disabled = false; }
    });
  });
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* 세션 만료여도 지운다 */ }
  session.clear();
  location.reload();
}
