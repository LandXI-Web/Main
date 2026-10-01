/* 입구 셋 — 주소 이름은 이 파일 한 곳(확인 대장 6 · 원칙 27 — "나중에 도메인 따라 달라질 부분도 있지만").
   한 플랫폼의 분기: 같은 서버 · 같은 데이터 · 같은 작업 흐름. 입구가 로그인 화면의 모습과 로그인 문(realm)을 정한다.
     app   = LX 직원 · 영업(아이디로 구분)       → 아이디 · 비밀번호
     admin = LX 관리자                           → 아이디 · 비밀번호(관리자 계정만 — 서버가 확인)
     gov   = 기관(국내 · 해외)                    → 기관 목록 → 기관 메인({기관}.land-xi.dev)의 그 기관 모습 로그인(Land-XI 로그인은 LX 전용 · 원칙 78)
   읽는 곳: 로그인 화면(landxi/v3/login) · 키트 관문(kit/auth-gate.js — 입구별 첫 화면) · 공개 관문(tools/public-gate.mjs — 주소 → 입구 → 서버에 알림).
   이름을 바꾸면 이 PC 밖 설정 두 곳도 같은 이름으로: Cloudflare 터널(사용자 폴더 .cloudflared/landxi.yml) · server/.env LX_PUBLIC_HOSTS.
   이 PC(localhost)에서는 로그인 주소에 ?site=app · ?site=admin · ?site=gov 를 붙여 같은 입구를 연다.
   home = 주소만 칠 때(https://{입구}/) 여는 첫 화면 — app = 메인 소개(스크롤 · 10-01 사용자 "메인 화면은 어떻게 들어가지?") · admin = 관리자 로그인.
     메인의 '로그인'은 Land-XI(LX 전용) 로그인으로 · 로그인한 사람에게는 그 자리가 '내 화면으로'(자동 이동 없음 — main/me.js).
   기관 주소(구현 2차 T3 · 사용자 구현 확인 1차 I-1 "이 창구는 LX 직원만" · 7차 결정 기관-주소 ⓒ "기관별 주소 + 요청 기관만 자체 도메인"):
     기관 사용자는 Land-XI 로그인이 아니라 자기 기관 주소에서 그 기관 모습의 로그인으로 들어온다(landxi/v3/gov-home).
     gov.orgHost    = 기관 주소 규칙 — '{org}' = 서버의 기관 id(예: namwon.land-xi.dev · gwangju-jeonnam.land-xi.dev). 입구는 gov(문 = 기관 계정).
     gov.orgDomains = 요청한 기관만 자체 도메인 { 기관 id: '주소 이름' } — 설정 칸만(실제 연결은 나중 · 터널 · 인증서 · server/.env LX_PUBLIC_HOSTS 도 함께).
     gov.reserved   = 기관 이름으로 쓰지 않는 주소 이름(입구 셋 · 다른 서비스).
     gov.org        = 옛 모양 gov.land-xi.dev/{org}/ — 공개 관문이 기관 주소로 넘긴다. gov 입구의 첫 주소(/) = 기관 고르기 목록(각 기관 주소로).
     기관 이름 목록은 서버가 정본(GET /auth/tenants — LX 관리자가 만든 기관). 이 PC · 사본에서는 같은 화면을 /landxi/v3/gov-home/?org={org} 로 연다.
   일반 스크립트와 모듈 둘 다로 읽힌다(로그인 머리 · 키트 · node) — import · export 를 쓰지 말 것. */
globalThis.LX_SITES = Object.freeze({
  app: Object.freeze({ host: 'app.land-xi.dev', realm: 'lx', label: '', home: '/landxi/v3/main/' }),
  admin: Object.freeze({ host: 'admin.land-xi.dev', realm: 'lx', label: 'LX 관리자', home: '/landxi/v3/login/' }),
  gov: Object.freeze({
    host: 'gov.land-xi.dev', realm: 'tenant', label: '기관',
    orgHost: '{org}.land-xi.dev',
    orgDomains: Object.freeze({}),
    reserved: Object.freeze(['app', 'admin', 'gov', 'edu', 'carbon', 'www', 'api', 'static', 'mail']),
    org: '/{org}/',
  }),
});
