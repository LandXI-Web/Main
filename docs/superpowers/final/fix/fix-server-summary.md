# fix-server-summary — 대표 수치 단일 요약 API(숫자 한 출처의 서버 쪽)

**배경(Opus 독립 평가 P0):** 광주전남 해양쓰레기가 화면마다 다름(게스트 메인·영업 '운영 1,857건' / 학습 '첫 학습 전' / 광주전남 첫 화면 '영상 등록 필요' / XI맵 여수 '아직 결과가 없습니다' / 직원 에이전트 '확인되지 않습니다'). 남원 대표 숫자 1,101(LX 직원 대시보드 확인 대기)·1,079(XI맵·서비스 상세 현장 확인 필요)·745(결과 확인 무허가)·2,098(영업 카드)·9,593→70,474(탐지)로 흩어짐. 기관 신고 24(대시보드) vs 16+6=22(서비스 관리).

## 소유 파일
- **신설** `server/landxi_api/summary.py`
- `server/landxi_api/main.py` (라우터 등록 한 줄만 — 이 작업만 main.py 수정)
- **신설** `server/tests/test_summary.py`
- 필요 시 `server/config/sets.yaml` · `server/config/regions.yaml` (데이터 정합만, 항목 삭제 금지)

## 계약 (다른 작업들이 이 형식에 맞춰 병렬로 구현한다 — 바꾸지 말 것)
`GET /api/v1/summary?region={sgg_cd}&card={card_id}` (둘 다 선택) · 로그인 세션이면 기관 범위(RLS)로, 없으면 공개분만(`public=1` 자동).
```json
{ "as_of": "2026-09-29",
  "items": [ {
    "card": "card-marine", "card_name": "해양쓰레기 실태조사 서비스",
    "sgg_cd": "46130", "region_name": "전라남도 여수시", "tenant": "gwangju-jeonnam",
    "stage": "운영 | 시범 | 첫 결과 전",
    "imagery": {"has": true, "label": "2025년 항공영상"},
    "metrics": {
      "detected":      {"label": "AI 탐지",        "value": 0, "unit": "건",   "basis": "measured", "as_of": "…", "source": "사용자 말 한 줄"},
      "field_check":   {"label": "현장 확인 필요", "value": 0, "unit": "필지", "basis": "…", "as_of": "…", "source": "…"},
      "review_pending":{"label": "결과 확인 대기", "value": 0, "unit": "건",   "basis": "…", "as_of": "…", "source": "…"},
      "reports":       {"label": "기관 신고",      "value": 0, "unit": "건",   "basis": "…", "as_of": "…", "source": "…"}
    } } ] }
```
- 각 metric 은 기존 `landxi_api/envelope.py` 봉투 규칙을 따른다(basis 6종). 값이 없으면 `value:null` + `basis` 로 이유 — 0 을 지어내지 말 것.
- `label` 은 화면이 그대로 쓰는 이름. **같은 label 은 모든 호출에서 같은 계산식.** 1,101/1,079/745 가 서로 다른 지표라면 서로 다른 key·label 로 나눠라(예: `field_check` vs `review_pending`). 새 지표가 필요하면 key 를 추가하되 이 문서 계약 절에 적고 보고한다.
- `stage` 판정은 **실제 보유 자료** 기준: 실결과(results/ · survey findings · pmtiles) 있음 + 배포 stage → 운영/시범, 없으면 `첫 결과 전`. `imagery.has` 는 카탈로그 실제 영상 기준.
- 파이썬 함수 `summary.build(conn, tenant, region=None, card=None)` 를 모듈 수준으로 공개(에이전트 도구 `fix-agent-scope` 가 import 한다).

## 할 일
1. 현재 각 숫자의 출처를 전수 조사: `survey.py`(stats·findings), `deploys.py`, `registry.py`(카드 결과 수), `public.py`, `regions.py`(n_findings), `results.py`, `feedback.py`(신고). 1,101 / 1,079 / 745 / 2,098 / 9,593 / 70,474 / 24 / 22 / 1,857 각각이 어떤 쿼리·파일에서 나오는지 표로 보고서에 남긴다.
2. 광주전남 해양쓰레기: `config/sets.yaml` 의 `results/lx/yeosu-marine-2025-aerial`·`dp-gj-marine-25` 등 **실제 보유 결과**를 확인하고 한 가지 상태로 확정(실결과 수 = pmtiles/피처 실측). 1,857 이 실측이 아니면 쓰지 않는다.
3. 기존 API 중 같은 이름을 다른 값으로 내던 곳(예: regions `n_findings`, registry 카드 결과 수)은 **summary.build 를 호출해 같은 값**을 내도록 고친다 — 단 그 파일들이 이 작업 소유가 아니므로, 고칠 곳 목록을 보고서 `요청`에 쓰고 필요한 공용 함수만 summary.py 에 둔다. (regions.py·registry.py 수정은 Ship 전 통합 단계에서 적용)
4. 성능: 응답 ≤ 300ms(캐시 60s 허용, 봉투 as_of 로 표시).

## 완료 조건
- `GET /api/v1/summary` · `?region=` · `?card=` · 게스트/남원/광주전남/LX 직원 세션별 응답이 계약 형식, RLS 로 타 기관 항목 0.
- 광주전남 해양쓰레기 항목이 실제 자료 기준 한 가지 stage·한 가지 수.
- 출처 대조표(위 1)와 '같은 label 같은 값' 자체 검사 결과를 보고서에.
- `server/tests` 전부 통과 + `test_summary.py` 신규 통과. 게이트웨이 재기동 후 기존 화면 오류 0.

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
