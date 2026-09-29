# fix-xi-live — XI맵 실시간 소범위 추론(압축 재생이 아닌 실제 경로)

**배경(평가 P1):** XI맵 '이 범위 분석'은 '실제 18분 · 12초로 압축' 재생이지 실시간이 아니다. Hyper Performance 는 '전역 추론이 지도에 차오르는 체감'으로 증명해야 한다(메모리 vision-motto). 또 XI맵 여수(광주전남)는 '아직 결과가 없습니다'로 실제 보유 결과와 어긋난다.

## 소유 파일
- `server/landxi_api/jobs.py` · `server/workers/scheduler.py` · `server/workers/gpu_worker.py` · `server/workers/tiling.py` · `server/workers/postprocess.py` · **신설** `server/tests/test_live_infer.py`
- `landxi/v3/xi-clean/**` (용어 교체 포함)
- 읽기만: `landxi/xi/**`(엔진 import), `landxi/v3/kit/**`

## 할 일
1. **소범위 실추론 경로:** XI맵에서 현재 보이는 읍면동 하나(또는 그에 준하는 범위, 서버 상한으로 강제) → `POST /jobs/quote` → `POST /jobs{kind:infer}` → 게이트웨이 작업 대기열 → GPU 워커가 칩 단위로 추론 → 칩 완료마다 이벤트(`/events/...` 기존 SSE 재사용) → 화면이 받은 결과를 즉시 지도에 채운다. 목표: 첫 결과 ≤ 10s, 읍면동 전체 ≤ 3분(실측값을 보고서에; 화면엔 ms·칩 수 노출 금지).
2. **전력 규칙:** 워커는 GPU 한 장만(`CUDA_VISIBLE_DEVICES` 고정), `power_budget` 검사 통과 시에만 실행, 초과면 대기열에서 대기 + 화면 `잠시 뒤 시작합니다` 류 기존 문구. vLLM 이 있는 GPU1 과 겹치지 않게 GPU0 사용을 기본으로 하고 기동 전 `nvidia-smi` 로 확인. 두 장 동시 고부하 금지. Ollama·vLLM 종료 금지.
3. 영상 출처: 해당 지역 카탈로그의 실제 정사영상/항공영상(로컬 실자산). 영상이 없는 지역은 버튼을 끄고 `영상 등록 필요`(K9) — 재생으로 대체하지 말 것.
4. **기존 압축 재생은 삭제하지 말고** `전체 범위 기록 보기` 로 이름을 바꿔 보조 동작으로 남긴다('압축' 문구·배속 숫자는 화면에서 제거하거나 `?dev=1`).
5. 결과 저장: 완료 작업 결과는 기존 results 규칙대로 저장 → `GET /api/v1/summary` 에 반영(계약: `fix-server-summary.md`). XI맵의 지역 대표 수치는 summary 에서만 읽는다(여수 = 실보유 결과 기준 한 가지 상태).
6. xi-clean 보이는 글자 용어 교체(판독→AI 분석, 착지·도착 제거 등).
7. sales 세션의 `demo:true` 강제 등 기존 jobs.py 규칙은 유지.

## 완료 조건
- 로그인 폼(`lx-staff`) → XI맵 → 읍면동 선택 → 실추론 시작 → 결과가 지도에 차오르는 20s 이하 영상(GPU 한 장, `nvidia-smi` 로그 동봉).
- 같은 작업 id 가 LX 관리자 화면 작업 목록에 보임(일원화 확인 — 화면에 id 노출은 금지).
- 광주전남 담당자·직원으로 XI맵 여수 대표 수치 = summary 값.
- `forbidden.mjs` xi-clean(직원·광주전남) '지어낸 용어' 0 · 콘솔 오류 0 · `server/tests` 통과.

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
