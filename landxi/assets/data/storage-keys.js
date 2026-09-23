// 저장소 키 정본 (MASTER-PLAN §7.1 · C-24) — 새 키는 여기 1줄 PR.
//   owner  그 키를 소유한 에픽
//   life   'lx-session' | 'tenant-session' | 'data' | 'pref'
//   store  'local' | 'session' — 지금 코드가 실제로 쓰는 저장소(grep 로 확인한 값 · 2026-09-24)
//   reset  MY '시연 초기화'(E3-4)가 지우는가
//
// 세션 규칙(§7.1)
//   R-S1 두 세션은 동시에 존재하지 않는다 — LX signIn 은 lx_tenant_session 을 지우고,
//        기관 signIn 은 lx_logged_in · lx_role 을 지운다. 둘 다 있으면 손상 → 전부 지우고 login.html.
//   R-S2 signOut() 은 세 키를 전부 지운다(shell.js).
// 기관(지자체) 계정은 roles.js 와 무관하다 — portal.js TENANTS + lx_tenant_session(Q1 완전 별도).
export const KEYS = [
  { key: 'lx_logged_in', owner: 'E0-1', life: 'lx-session', store: 'local', reset: true, note: "'1'" },
  { key: 'lx_role', owner: 'E0-1', life: 'lx-session', store: 'local', reset: true, note: 'admin | staff | sales' },
  { key: 'lx_tenant_session', owner: 'E0-1', life: 'tenant-session', store: 'local', reset: true, note: 'JSON {tenant, at}' },
  { key: 'lx_saved_email', owner: 'E0-2', life: 'pref', store: 'local', reset: false },
  { key: 'lx_publish_v1', owner: 'E0-8', life: 'data', store: 'local', reset: true },
  { key: 'lx_project_v1', owner: 'E1-5', life: 'data', store: 'session', reset: true },
  { key: 'lx-analysis-v1:*', owner: 'E0-4', life: 'data', store: 'session', reset: true, note: 'runs · deploys · edits · shares' },
  { key: 'lx-map-props', owner: 'E1-6', life: 'data', store: 'local', reset: true },
  { key: 'lx-map-acts', owner: 'E0-5', life: 'data', store: 'session', reset: true },
  { key: 'lx-map-reports', owner: 'E0-5', life: 'data', store: 'session', reset: true },
  { key: 'lx-admin-v1:*', owner: 'E1-8', life: 'data', store: 'session', reset: true },
  { key: 'lx.support.inquiries', owner: 'E1-8', life: 'data', store: 'session', reset: true },
  { key: 'lx_my_state', owner: 'E1-6', life: 'data', store: 'session', reset: true },
  { key: 'lx_custom_symbol', owner: 'E1-6', life: 'pref', store: 'local', reset: false },
  { key: 'lx_dash_tab', owner: 'E0-6', life: 'pref', store: 'local', reset: false },
  { key: 'lx_ds_pp', owner: 'E0-7', life: 'pref', store: 'local', reset: false },
  { key: 'lx_ds_memo_*', owner: 'E0-7', life: 'data', store: 'local', reset: true },
];

/** 세션 키 — signOut 은 lx + tenant 전부를 지운다. */
export const SESSION_KEYS = { lx: ['lx_logged_in', 'lx_role'], tenant: ['lx_tenant_session'] };
export const ALL_SESSION_KEYS = [...SESSION_KEYS.lx, ...SESSION_KEYS.tenant];
