# fix-admin-usage — LX 관리자 화면: 기관 사용량 실집계 + 대표 수치·용어·로딩 버그

**배경(평가 P1):** 인프라 화면(ops-infra) 기관 한도가 전 기관 저장 공간·GPU 시간·분석 면적 0% — 남원엔 실데이터·추론 이력이 있다. LX 관리자 대시보드(ops-core) 영상 첫 프레임에 로딩 중 '결재 대기 — 아직 결과가 없습니다'가 잘못 비친다. 관리자 화면에 개발 정보(GPU명·API·ms)가 보이는 곳이 남아 있다(명세 §4-5: 성능 수치는 ops-infra 표 안에서만).

## 소유 파일
- `server/landxi_api/quota.py` · `server/workers/metering.py` · `server/config/quotas.yaml` · **신설** `server/tests/test_quota_usage.py`
- `landxi/v3/ops-core/**` · `landxi/v3/ops-infra/**`

## 할 일
1. **0% 원인 규명:** `quota.py` 가 읽는 `usage_events`(tenant_id·dim·at)에 실제로 행이 있는지, metering 이 기관 id 를 무엇으로 쓰는지(LX 가 대신 돌린 작업이 `lx` 로만 기록되는지), 저장 공간 du 경로(`results/{t}`)가 실제 결과 폴더(`results/lx/...`, `results/gwangju-jeonnam/...`)와 맞는지, hard 한도가 null 이라 % 가 0 으로 떨어지는지 확인.
2. **실집계:** 저장 공간 = 기관에 속한 결과·영상·대장 폴더 실제 크기, GPU 시간 = 그 기관 배포본/지역을 위해 돈 작업의 `gpu_s` 합(jobs → deploy/tenant 연결), 분석 면적 = 완료 작업 AOI 면적 합. 과거 작업은 jobs 테이블에서 **1회 백필** 스크립트(스크래치 폴더, 멱등)로 usage_events 를 채우고, 앞으로는 metering 이 기관 id 로 기록.
3. 한도 초기값이 없으면 % 대신 실사용량만 보여 주고 `한도 미설정`(기존 문구 있으면 그것) — 0% 를 지어내지 말 것.
4. **ops-core:** 로딩 중에는 `불러오는 중`(K9 기본 문구), 응답이 실제로 비었을 때만 빈 상태. 대표 수치(결재 대기 외 서비스 수치를 쓰는 곳)는 `GET /api/v1/summary`(계약: `fix-server-summary.md`)로.
5. **용어:** ops-core·ops-infra 의 보이는 글자에서 관제·OPS·반입·검수·이식·봉투 등 → 용어표. 화면 제목은 `LX 관리자 대시보드`, 묶음은 `LX 관리자 화면`.
6. GPU명·ms·API 이름은 ops-infra 표 안이 아니면 `?dev=1` 서랍으로.

## 완료 조건
- `lx-admin` 로그인 폼 → ops-infra 기관 표에서 남원·광주전남 저장 공간·GPU 시간·분석 면적이 실값(보고서에 DB 쿼리 결과와 대조).
- ops-core 첫 로드 녹화(≤ 10s)에 '아직 결과가 없습니다' 깜빡임 0.
- `forbidden.mjs --login lx-admin` ops-core·ops-infra '지어낸 용어' 0, 콘솔 오류 0, `server/tests` 통과.
- 첫 화면이 비어 보이는 문제(흐린 지도 + 점 3개)는 **고치지 말고** `Fable 에게 넘길 것`에.

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
