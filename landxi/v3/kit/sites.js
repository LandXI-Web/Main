/* 입구 셋 — 주소 이름은 이 파일 한 곳(확인 대장 6 · 원칙 27 — "나중에 도메인 따라 달라질 부분도 있지만").
   한 플랫폼의 분기: 같은 서버 · 같은 데이터 · 같은 작업 흐름. 입구가 로그인 화면의 모습과 로그인 문(realm)을 정한다.
     app   = LX 직원 · 영업(아이디로 구분)       → 아이디 · 비밀번호
     admin = LX 관리자                           → 아이디 · 비밀번호(관리자 계정만 — 서버가 확인)
     gov   = 기관(국내 · 해외)                    → 기관 고르기 + 아이디 · 비밀번호
   읽는 곳: 로그인 화면(landxi/v3/login) · 키트 관문(kit/auth-gate.js — 입구별 첫 화면) · 공개 관문(tools/public-gate.mjs — 주소 → 입구 → 서버에 알림).
   이름을 바꾸면 이 PC 밖 설정 두 곳도 같은 이름으로: Cloudflare 터널(사용자 폴더 .cloudflared/landxi.yml) · server/.env LX_PUBLIC_HOSTS.
   이 PC(localhost)에서는 로그인 주소에 ?site=app · ?site=admin · ?site=gov 를 붙여 같은 입구를 연다.
   일반 스크립트와 모듈 둘 다로 읽힌다(로그인 머리 · 키트 · node) — import · export 를 쓰지 말 것. */
globalThis.LX_SITES = Object.freeze({
  app: Object.freeze({ host: 'app.land-xi.dev', realm: 'lx', label: '' }),
  admin: Object.freeze({ host: 'admin.land-xi.dev', realm: 'lx', label: 'LX 관리자' }),
  gov: Object.freeze({ host: 'gov.land-xi.dev', realm: 'tenant', label: '기관' }),
});
