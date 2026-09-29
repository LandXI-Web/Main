# fix-service-user-screens — 지자체·해외 기관 화면: 해양쓰레기 한 상태 · 용어 · 동작 버그

**배경(평가 P0/P2):** 광주전남 담당자 첫 화면(gov-fusion)이 해양쓰레기를 '영상 등록 필요'라 하는데 배경엔 항공영상이 깔려 있고 다른 화면은 '운영'. gov-fusion 은 들어올 때마다 '필지에 이어 붙이는 중'을 다시 재생하고 390px 에서는 그동안 결과가 안 보인다. 해외(global) 히어로 'Crop condition drop · Ysyk-Ata 117.8 km²'가 Sprawl 탭으로 바꿔도 그대로이고, Sprawl 탭 버튼이 'Run this season'으로 탭과 맞지 않는다.

## 소유 파일
- `landxi/v3/gov-fusion/**` · `landxi/v3/gov-report/**` · `landxi/v3/global/**`

## 할 일
1. **한 상태:** gov-fusion 기관 첫 화면의 서비스 상태·대표 수치를 `GET /api/v1/summary`(계약 `fix-server-summary.md`, 기관 세션 = 자기 관할만)로. `영상 등록 필요` 는 summary `imagery.has=false` 일 때만. 광주전남 = 실보유 결과 기준 한 가지 상태.
2. **재생 반복:** '필지에 이어 붙이는 중' 은 같은 대장·같은 결과로 이미 결합된 적이 있으면(서버 `registry?latest=1` 결합 결과·캐시) 건너뛰고 바로 결과를 보인다. 새 대장 업로드 때만 진행 표시. 390px 에서 결과가 가려지지 않게(진행 표시가 결과를 덮지 않도록 순서만 조정 — 새 배치 디자인 금지).
3. **global 히어로:** 탭(Crop·Sprawl 등)마다 해당 지표·값·단위·라벨이 바뀌게(명세 §4-7 허용 라벨 안에서; Sprawl 라벨이 명세에 없으면 기존 문구 체계 안에서 쓰고 보고서에 `사용자 결정 필요`). 탭별 실행 버튼 문구를 탭 동작과 일치.
4. **용어:** 세 앱 보이는 글자(한국어 문구) 용어표 교체. global 영문 문구에 내부 말(landing·envelope·lineage·theatre 등) 있으면 평이한 말로.
5. **gov-report:** 용어·숫자만 정비(보고서·할 일 표 대표 수치 summary 기준). 읍면동 고르기 전 큰 3D 종이비행기 일러스트는 디자인 판단 → `Fable 에게 넘길 것`.
6. 로딩 중 '아직 결과가 없습니다' 오표시 있으면 `불러오는 중`.

## 완료 조건
- 로그인 폼 `gj-manager@<광주전남 기관 id>`: 해양쓰레기 상태·수 = summary · '영상 등록 필요' 오표시 0(스크린샷 1440·390).
- `namwon-manager@namwon` 재진입 시 결합 재생 없이 ≤ 3s 결과 표시.
- 해외 기관 계정: 탭 전환 시 히어로 값 변경·버튼 문구 일치(스크린샷).
- `forbidden.mjs` 세 앱(남원·광주전남·해외 계정) '지어낸 용어' 0 · 콘솔 오류 0.

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
