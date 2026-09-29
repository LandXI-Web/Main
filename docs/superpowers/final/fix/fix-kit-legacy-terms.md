# fix-kit-legacy-terms — 공용 부품 키트 + 기존 앱(ops·global·xi) 화면 용어 · 로딩 상태 버그

**배경:** 금지어 검사에 '지어낸 용어' 규칙이 추가됐다(2026-09-29). 키트 문구(예: K9 `영상 반입 필요`, K6 결손 문구)와 기존 앱 `landxi/ops/**`(관제 정적 :8702 · 125곳)·`landxi/global/**`(85곳)·`landxi/xi/**`(186곳, survey 데이터·ui·fx 포함)에 관제·반입·검수·판독·착지·봉투·계보·극장·OPS 가 남아 있다(주석 포함 수치). 로딩 중 '아직 결과가 없습니다'가 비치는 문제의 뿌리가 `kit/bignum.js`(봉투 없으면 결손 표시)일 수 있다.

## 소유 파일
- `landxi/v3/kit/**` **중** `cmdk.js`·`cmdk.css`(→ fix-agent-scope)와 `lint/**`(수정 금지)를 **뺀 전부**, `landxi/v3/shared/**`
- `landxi/ops/**` · `landxi/global/**` · `landxi/xi/**`

## 할 일
1. **용어(보이는 글자만):** 위 경로의 html 본문·js 안 화면 문구·i18n json(`kit/i18n/*.json`)·데이터 json 의 표시용 필드·title/aria-label/placeholder/alt 를 용어표로 교체. 변수·함수·파일명·CSS 클래스·주석·데이터 키는 그대로(주석은 검사 대상 아님 — 바꾸지 않아도 된다). 키트 K9 기본 제목 `영상 반입 필요` → `영상 등록 필요`, 결손 → `—`+`아직 결과가 없습니다`(이미 명세 문구). `landxi/xi/**` 는 xi-clean 이 import 하는 엔진이므로 **문구만** 바꾸고 동작 변경 금지.
2. **로딩 상태:** `bignum`·`empty` 등 부품이 fetch 전(봉투 미도착)과 실제 빈 값(봉투 value null)을 구분 — 도착 전 `불러오는 중`(K9 로딩 문구), 빈 봉투일 때만 `아직 결과가 없습니다`. 부품 API 는 하위 호환 유지(화면 코드 수정 없이 동작).
3. **키트 갤러리** `landxi/v3/kit/index.html` 이 그대로 렌더되는지 확인.
4. 기존 앱 중 레일에서 빠진 화면(`landxi/ops` :8702 등)도 주소로 열리므로 같은 기준 적용.

## 완료 조건
- `forbidden.mjs` 로 키트 갤러리, `landxi/ops/index.html`·`infra.html`·`tenants.html`·`deploys.html`(`lx-admin`), `landxi/global/index.html`(해외 계정), `landxi/xi/index.html`(`lx-staff`) 검사 → '지어낸 용어' 0 · 콘솔 오류 0.
- 다른 작업의 v3 화면(xi-clean·gov-fusion 등)이 키트 변경 후 오류 없이 열림(스모크 스크린샷).
- 보고서에 바꾼 문구 전/후 목록(파일별 건수).

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
