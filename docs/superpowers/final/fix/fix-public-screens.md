# fix-public-screens — 게스트 메인 · 영업 · 서비스 상세 · 로그인 · 도움말: 용어 · 숫자 · 버그

**배경(평가 P0/P1/P2):** 게스트 메인·영업 카탈로그가 광주전남 해양쓰레기를 '운영 1,857건'으로 표기(다른 화면과 모순). 영업 카드 남원 2,098(설명 없음). 서비스 상세 `?card=card-change` 결과 지도 캡션에 'null'. 영업 카탈로그 한가운데 '첫 결과 전 — 첫 결과가 생기면 여기에 카드가 생깁니다' 빈 카드 노출. 게스트 메인 네트워크 정지까지 28.5s(메인 필름 지연 로드 미완 — 9/26 결정: CSS 마스크·지연 로드 착수).

## 소유 파일
- `landxi/v3/main/**` · `landxi/v3/sales/**` · `landxi/v3/service-detail/**` · `landxi/v3/login/**` · `landxi/v3/help-my/**`

## 할 일
1. **용어:** 다섯 앱 보이는 글자에서 정문→`로그인`, 집→`첫 화면`, 관제→`LX 관리자 대시보드`, 생산 콘솔→`LX 직원 대시보드`, 반입·조립·검수·이식·판독·착지·봉투 등 → 용어표. 로그인 화면 역할 설명·오류 문구 포함.
2. **숫자 한 출처:** 메인·영업 카드·서비스 상세의 결과 수·상태를 `GET /api/v1/summary`(게스트는 공개분, 계약 `fix-server-summary.md`)로. 카드 상태 칩(`운영`·`시범`·`첫 결과 전`)은 summary `stage` 그대로. 1,857·2,098 같은 고정·출처 불명 값 제거.
3. **service-detail 'null' 캡션:** `app.js` 서랍/결과 지도 캡션 조립부(≈ 302행 `cap`)에서 빈 필드가 문자열 'null' 로 들어가는 경로 수정 — 모든 카드(`?card=` 전 종류)에서 'null'·'undefined'·'NaN' 0.
4. **영업 빈 카드:** 카탈로그는 명세 S-6 `?public=1`(실결과 있는 배포본) 기준으로 진열 — 결과 없는 카드는 카탈로그 한가운데 빈 카드로 두지 않는다(배치·새 구성은 하지 말 것; 필터만).
5. **메인 로딩:** 첫 화면 밖 필름·큰 영상은 지연 로드(IntersectionObserver·`preload=none`), 첫 뷰에 필요한 것만 먼저. 목표 네트워크 정지 ≤ 8s(1440, 로컬 서버) — 실측 전/후를 보고서에.
6. 로딩 중 '아직 결과가 없습니다' 오표시가 있으면 `불러오는 중`.

## 완료 조건
- `forbidden.mjs`(게스트, `lx-sales`) main·sales·service-detail(카드 전 종류)·login·help-my '지어낸 용어' 0 · 콘솔 오류 0.
- 광주전남 해양쓰레기 상태·수가 메인·영업·서비스 상세에서 summary 와 동일.
- 'null' 문자열 검색(전 카드 innerText) 0.
- 영업 첫 화면 왼쪽 빈 공간은 구성 판단이므로 `Fable 에게 넘길 것`. 해외 기관 로그인이 한국어뿐인 문제는 명세 K15(global 만 en) 밖이라 고치지 말고 보고서 `사용자 결정 필요`에 적는다.

## 공통 규칙 (모든 정비 작업)
- **시작 전:** `E:/Land-XI 플랫폼/CLAUDE.md` 전체 + §5 기록(메모리 `landxi-quality-bar.md`·`landxi-open-items.md`·`landxi-gpu-power.md`, 최종 명세 `docs/superpowers/final/LANDXI-FINAL-SPEC.md` §3·§4·§5)을 읽는다. 보고 첫 줄 = `브리핑 확인: (이 작업에 걸리는 규칙 3개)`.
- **이번 차수는 Opus 정비만.** 디자인 판단(빈 첫 화면의 새 구성, 시각 완성도, 불합격 화면 디자인 재작업)은 하지 않는다. 발견하면 보고서 `Fable 에게 넘길 것` 칸에 적는다.
- **소유 파일만 수정.** 아래 '소유' 밖은 읽기·import·API 호출만. 필요한 남의 파일 변경은 보고서 `요청` 칸에.
- **건드리지 말 것:** `landxi/proto/review/**`, `tools/review/**`(다른 에이전트 작업 중), `landxi/v3/kit/lint/**`(검사기 자체의 금지어 정규식은 정상).
- **git:** commit·reset·checkout·restore·stash 금지(커밋은 Ship 단계만). 임시 스크립트는 스크래치 폴더에만.
- **용어표(화면에 보이는 글자만, 변수·함수·파일명·CSS 클래스·주석은 그대로):** 관제·관제실·OPS → `LX 관리자 대시보드`(묶음은 `LX 관리자 화면`) · 생산 콘솔 → `LX 직원 대시보드` · 정문 → `로그인` · 집 → `첫 화면` · 반입 → `데이터 올리기`/`영상 등록` · 조립·카드 만들기 → `서비스 만들기` · 검수 → `결과 확인` · 이식·심기 → `다른 지역에 적용`/`배포` · 판독 → `AI 분석` · 발행 → `서비스 공개` · 운영(단계 이름) → `서비스 관리` · 착지·도착 → 빼거나 `분석 완료` · 봉투·결손·계보·극장·shard·칩/s → 화면에서 제거(`?dev=1` 개발자 서랍만). `시연·데모·준비 중` 금지. **새 말을 만들지 말 것.** 보이는 글자에는 본문·`title`·`aria-label`·`placeholder`·`alt`·토스트·빈 상태·오류 문구·JSON 문구 파일이 모두 포함된다.
- **숫자 한 출처:** 대표 수치는 `GET /api/v1/summary`(계약: `fix-server-summary.md` §계약) 에서만 읽는다. 화면에 숫자를 적어 넣지 않는다. 같은 이름 = 같은 값, 다른 값이면 다른 이름.
- **지역 하드코딩 금지**(namwon·yeosu 등 문자열을 js/html 에 새로 넣지 말 것). 남원은 예시 지역.
- **GPU:** 추론은 게이트웨이 작업 대기열로만, 동시 고부하 GPU ≤ 1. Ollama·vLLM 종료 금지.
- **기동·확인:** `powershell -File "E:/Land-XI 플랫폼/01. 디자인/server/start-landxi.ps1"`. 확인은 로그인 폼으로만(세션 주입 금지). 용어 검사: `node "E:/Land-XI 플랫폼/01. 디자인/landxi/v3/kit/lint/forbidden.mjs" --login <계정> <url…>` (계정: `lx-staff` · `lx-admin` · `lx-sales` · `namwon-manager@namwon` · 광주전남 담당자 `gj-manager@<기관 id>` · 해외 기관 계정은 `GET /api/v1/auth/tenants` 로 확인, 게스트는 `--login` 없이). 비밀번호는 env `LX_PW`(기본 서버 .env).
- **보고서:** `docs/superpowers/final/fix/<id>-report.md` — 바꾼 파일, 전/후 스크린샷(1440·390) 경로, forbidden 결과, 남은 것, `Fable 에게 넘길 것`, `요청`.
