# F2-∑ — 2차 통합: 관리-생산-서비스 일원화 장면 · 순서 · 통합 영상(≈ 150s) · 커밋

- 판정 Fable 5.1 · 통합 실행자 Opus 5.5 · 선행: 7 에픽 전부 Craft 게이트 합격(불합격 에픽은 통합에 넣지 않고 재게이트).
- 규칙: 커밋은 **통합 단계만**(에픽별 5 + 통합 1 · F1과 같은 방식) · `git checkout/reset/stash` 0(되돌림은 수동 편집) · 다른 작업(p0926 `shots/w0` `shots/p0926` · `landxi/proto/ximap.html`) 변경은 커밋하지 않음 · V-World 키 유출 스캔 0건 · GPU 전력 규칙(GPU0 워커 · GPU1 vLLM 유휴 · 동시 고부하 0).

## 1. 에픽 · 소유 · 의존(데이터로만)

| id | 모델 | 소유(요약) | 준다 → | 받는다 ← |
|---|---|---|---|---|
| F2-A XI맵 v2 + 실태조사 모드 | Opus 5.5 | `landxi/xi/**` · f1a/f2a/f2s spec | 브리지 `window.XI`(D0) · `#agent-slot` · 서랍 `report` 탭 슬롯 · `?job=/?pnu=/?mode=survey` 규약 | F2-S API·녹음 · F2-B v1.1 필드·tenant 스트림 · F2-R 레일·embed |
| F2-B 백엔드 v2 + 복구 | Opus 5.5 | `server/**`(제외: ops·global·survey·agent) · f1b/f2b spec | ext 라우터 훅(D0) · `plan()` 훅 · `tenant_event` 헬퍼 · v1.1-5~21 · mock 픽스처 | F2-C 폴러 필드 · F2-S `survey_parcels` 표 · F2-E 계량 |
| F2-S 실태조사 백엔드 | Opus 5 | `server/survey/**` · `adapters/survey/**` · `landxi_api/survey.py` · `0002_survey.sql` · `02. 데이터/survey/{replay,findings-emd.json}` | API v1.1-22 · `findings-emd.json` · `survey-namwon.ndjson` · `report.py build_draft` · `finding.state` SSE | F2-B 훅·헬퍼 |
| F2-E 에이전트 AG-0 | Opus 5.5 | `landxi/agent/**` · `server/agent/**` · `landxi_api/agent.py` · `0003_agent.sql` | `agent:models` · `usage_events llm_tokens` · 리플레이 녹음 | F2-A 브리지 · F2-S 도구 · F2-B 결합 API |
| F2-C 관제 v2 | Opus 5 | `landxi/ops/**` · `server/ops/**` · ops-grid.css | `ops:gpu` 필드(util_ma5 power_w caution llm) · `?job=` 행 펼침 완성 통보 | F2-B `/ops/gpus` 통과 · F2-E 계량 · F2-S finding.state |
| F2-D Global v2 | Opus 5 | `landxi/global/**` · `adapters/global/**` · `pipelines/global/**` · globe-stage.css | 기관 `?job=` 수신 | F2-B index.month/progress/eta/index API · F2-C `?job=` · F2-A fx |
| F2-R 레일 정본화 | Opus 5 | `landxi/proto/{shell,shell-gate,login,stats/report-standard,map-stats,map-report,ai-card*,produce*,portal-*}` · `roles.js` · `landxi/login.html` · proto-* spec | 레일 URL · `?embed=1` · `?card= ?deploy=` 딥링크 | F2-A/C/D URL 규약 |

소유 겹침 0 검사: `grep -h "^## owned_files" -A 3 f2/F2-*.md`로 경로 교집합 0 확인(통합 첫 작업). 두 에픽이 같은 파일을 요청하면 **결과 문서 '요청' 절**로만 — 통합자가 옮긴다(`api-v1.js` v1.1 함수 · `tokens-v2.css --e-fly` · `main.py` 훅은 F2-B).

## 2. 통합 순서(하루)
1. 기동 `server/start-landxi.ps1`(Redis·PostGIS·8700·8701·워커·8702·4173) → `-Status` 전부 녹색 · `/health.recovered_at_boot`.
2. 마이그레이션 0001–0003 적용 · F2-S `s5_load_pg.py` 검증 통과 → `findings-emd.json` 존재.
3. 통합자 조치: `api-v1.js`에 v1.1 함수 이관(`tenantEvents survey* agent*`) · `tokens-v2.css --e-fly` · `.gitignore` · F2-A 서랍 스타일 주입 제거(F2-R embed 완성 시) · F2-D 결손 칩 교체 확인.
4. e2e 전량 순차 1회(`--workers=1` · f2c/f2d는 순차 필수) → 실패는 소유 에픽 표기.
5. 통합 영상 녹화(아래) → 스틸 8장 → `SendUserFile`.
6. 커밋 7(에픽별) + 통합 1 · 메시지 F1 관례.

## 3. 통합 영상 시나리오(≈ 150s · 1440×900 · on 모드 · 대기 구간 자막 건너뛰기 · `shots/f2/F2-integrated.mp4`)

| 초 | 층 | 장면(같은 id가 관통한다) |
|---|---|---|
| 0–10 | 서비스 | 게스트 필름 마감 → `?public=1` XI맵(시민 · 실태조사 스위치 없음) → LX 직원 로그인 → **레일 '지도 서비스'** → 새 XI맵 글로브 → 남원 하강(HLS 조각 0 · 먹색 0 · V-World 받침) |
| 10–24 | 서비스 | 실태조사 모드 → 대조 스윕 39칸(`kind:'survey'` job_S) → `의심 필지 20,852` → 서랍 R1·A → 필지 카드 v2 대장 vs 현황 → 이력 → **현장조사 배정**(finding f_R1_…) |
| 24–36 | 에이전트 | `⌘K` "아영면 답 위 건물 의심 상위 5필지" → 계획 3행(ms) → 도착 → 검증 안 된 숫자 취소선 장면 → 보고서 초안 `.docx`(run_E) |
| 36–60 | 생산→관리 | 프레임 황등 378 shard(job_J) 제출 → **반화면 관제** 같은 job_J 행 `is-focus` · GPU0 이용률(이동평균) · W · 스윔레인 · usage.delta → job.done HUD 두 줄 `GPU 초당 · 벽시계` = 관제 행 = `GET /jobs/job_J` |
| 60–74 | 관리→생산→서비스 | 관제 배포 제어 롤백 `dp-nw-farm-25 v2.1→v2.0` → XI맵 계보 칩 ≤ 1s → 칩 `카드 ↗` → `ai-card.html?card=&version=v2.0` 강조 → `produce.html?deploy=` |
| 74–90 | 관리 | **재부팅 복구**: 새 378 shard → 워커 kill → 게이트웨이 재기동 → `job.recovered resumed 152/378` → 관제 `복구 · 재개` 칩 → 완료 counts 동일 |
| 90–96 | 관리 | 관제 기관 카드 실태조사 미니 막대(아까 배정) · LLM 띠 · 링 8(llm_tokens) |
| 96–130 | 글로벌 | XI맵 `Global` → 남원 후퇴(≤ 5s · 띠 0) → 으슥아타 **비행** → NDVI 8칸 라이브 히스토그램(job_G · 자막 건너뛰기) → `Ops lineage →` 실링크 → 관제 행 job_G → `XI map · KR ↗` |
| 130–142 | 서비스 | 기관(남원) 포털 → 지도 탭 = 실태조사 모드 임베드 → 결과 탭 `의심 큐 ↗` · 아까 배정 건 상태 assigned |
| 142–150 | 마감 | 세 화면 정지 3분할(XI맵 job_J HUD · 관제 job_J 행 · 카드 v2.0) + 모토 `Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스` |

같은 id 표(영상 자막에 그대로): `job_J`(XI맵 HUD ↔ 관제 행 ↔ `/jobs/{id}`) · `dp-nw-farm-25 v2.0`(관제 ↔ XI맵 칩 ↔ ai-card) · `f_R1_…`(XI맵 카드 ↔ 관제 미니 막대 ↔ 포털 큐) · `run_E`(에이전트 패널 ↔ audit_log) · `job_G`(Global ↔ 관제).

## 4. 판정(Craft · 5축 · 세 사용자) — 통합 합격선
- 완성형: 영상 안 죽은 버튼 0 · 목업 0 · 자리표 0(결손은 점선 + 이유).
- 유일함: 대조 스윕 · 필지 카드 v2 · 에이전트가 실태조사 API를 부르는 장면 · 국내+글로벌 같은 큐.
- Hyper Solution: 판독 → 필지·대장 대조 → 의심 큐 → 이력 → 배정 → 보고서 초안(docx 파일이 열린다).
- Hyper Performance: HUD 두 줄 · 관제 이동평균·W · nvidia-smi 패널 · `GET /jobs` 4곳 일치 표 · 복구 실증.
- 일원화: 위 같은 id 표 5개가 영상에서 실제로 왕복·실시간.
- 세 사용자: 공무원(스윕→카드→배정→docx) · 시민(공개 모드 정직 · 우와 7초 이상) · LX 직원/관리자(숫자가 틀려 보이지 않음 · 복구).
