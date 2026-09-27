# F2-R 보고: 레일 정본화 · 기존 셸 편입 (판정용 요약 · 판정 2차 반영판)

상세 결과(레일 표 · 딥링크 규약 표 · 세션 인계 · 실패 소유자 표 · F2-A/C/D 요청 · 세 사용자 점검 · **§9 판정 1차 반영표**)는 `f2/F2-R-result.md`에 있습니다.

## 실제 기동 검증
- `server/start-landxi.ps1 -Status` 결과: 4173 · Redis · PostGIS · 게이트웨이 :8700(health ok · workers gpu 1 · cpu 1) · 목 :8701 · 관제 :8702 · scheduler · cpu-0 · gpu 워커 모두 OK였습니다.
- GPU 규칙: F2-R은 추론 · 벤치 · 컨테이너 조작을 하지 않았습니다(브라우저 녹화와 e2e만). 녹화 전 nvidia-smi 사용률은 GPU0 0 % · GPU1 0–54 %(순간)였습니다.

## 판정 2차 지적 → 조치 (2026-09-27)

| 지적 | 결과 |
|---|---|
| **[F2-R] 4배속 구간에 배속 표기 없음** | **해결.** `record-f2r.mjs`의 ffmpeg `filter_complex`에서 배속 조각마다 `trim` 뒤 · `setpts` 앞에 `drawtext` 오버레이를 넣었습니다. 1행 `4× 배속 · 이 구간 실시간 7.3 s`, 2행 `실시간 경과 6.3 s / 7.3 s · 원본 28.4–35.7 s`입니다(원본 시각 기준 카운터가 흐릅니다). 글자는 textfile로 넘겨 이스케이프 문제가 없습니다. `marks.json`에는 `edit.map`(조각별 원본 구간 · 배속 · 판정본 시작)과 마크마다 `t_out`(판정본 시각)을 새로 적습니다. 다시 녹화했고 `f2r.mp4` · `f2r-full.mp4` · `strips` · `stills` · `F2-R/` 사본을 모두 갱신했습니다. |
| [통합자/F2-D] `portal.js` TENANTS에 scope global 기관 줄 없음 | **소유 밖이라 대기합니다.** 2026-09-27 04:2x 기준 `portal.js`에 `kgz-agri` 줄이 없고 `portal-login-kgz-agri.html`도 없습니다. F2-R 쪽 준비는 끝났습니다. ① e2e `f2r-portal-survey` 6번 **'제품 경로(주입 0)'**를 신설했습니다. portal.js에서 scope global 기관을 찾으면 그 기관 로그인 문으로 들어가 레일 `Global ↗` · href를 단언하고 `shots/f2/R/portal-kgz-global-real.png`를 남깁니다. 지금은 **skip 1**(사유 표기)입니다. ② 녹화 스크립트도 같은 분기를 씁니다. 줄이 들어오면 문으로 실제 로그인하고 `12-global-kgz-real.png`를 남기며, 없으면 지금처럼 '테스트 주입' 띠를 붙입니다(`marks: global.injected`). ③ `shell-gate.js TENANT_HOME`(F2-R 소유)에 kgz 미러를 **먼저 넣지 않았습니다.** portal.js 줄 없이 넣으면 `tenantById` 폴백이 LX(`menus:'all'`)를 돌려줘, 위조한 기관 세션이 LX 메뉴를 얻는 구멍이 생기기 때문입니다. 통합자가 portal.js 줄을 넣을 때 `TENANT_HOME['kgz-agri']` 한 줄을 같이 넣어야 합니다(값 = 그 줄의 `home`). |
| [통합자] `proto-dataset:118` · `proto-dashboard:120` | 소유 밖입니다. 기대값은 1차와 같습니다(관리자 레일 `['home','ops','infra','tenants','deploys','media','publish','produce','admin','my']` · map href `/landxi/xi/index.html`). |
| [F2-A 기록] denied 안내 0 · 흰 판 · 복원/큐 대기 · 콘솔 · EMBED_CSS | 소유 밖입니다. 이번 재녹화 실측으로 **실태조사 복원 8.4 s**(27.7 → 36.1), **큐 첫 줄 8.7 s**(42.8 → 51.5)였습니다. 기준 5 s를 넘어 여전히 미달입니다. f2r-rail denied 단언은 skip 1 그대로입니다. |
| [F2-C 기록] 관제 폼 · GPU 원천 · Infinity s | 소유 밖입니다. 녹화는 `data-lx=ready` 뒤 제출했고 `pwInUrl:false`였습니다. |

## 판정 1차 지적 → 조치

| 지적 | 결과 |
|---|---|
| 관리자 홈(admin-home · 결재 대기 2·1·6) 레일 고립 | **해결.** 레일 첫 줄 '운영 현황' → `admin-home.html`이고 admin-home에서 `aria-current=page`입니다. 관제 쪽은 '관제 현황'(title `LX/OPS 운영 현황`)입니다. 관리자 레일은 **10**입니다. 키 정리 방식은 `roles.js RAIL_ACTIVE`이고, admin-home.js(소유 밖)는 수정 0입니다. |
| 포털 지도 탭 XI맵 HUD 겹침 | **해결(F2-R 쪽 방법).** iframe이 본문 전폭 1254 × 높이 ≥ 718로 서고 필지 표는 아래로 갑니다. iframe 안 HUD 최상위 7개의 교차는 **0**으로 실측했습니다(e2e). 결과 지도 보기는 예전 한 화면 그대로입니다. |
| '의심 큐 ↗' 죽은 버튼 | **해결.** `&queue=1`(XI맵 survey-mode 규약)로 바꿨습니다. 도착하면 실태조사 모드와 `#fdrawer` '의심 큐 20,872'가 열리고 첫 줄이 보이는 것을 e2e로 단언했습니다. |
| 관제 로그인 GET 비밀번호 노출(F2-C) | 소유 밖입니다. F2-C에 정식 요청했습니다(method=post + onsubmit 폴백 또는 준비 전 disabled). F2-R 녹화는 준비(`data-lx=ready`) 뒤 제출하고 `pwInUrl:false`를 기록합니다. |
| XI맵 denied 안내 0(F2-A) | F2-A에 요청했습니다. `f2r-rail`에 단언을 넣었고, XI맵에 denied 처리가 들어오면 자동으로 켜집니다. **지금은 skip 1**입니다. |
| 관제 GPU0 값(F2-C) | 실측을 기록했습니다. nvidia-smi `memory.used`는 두 장 모두 44,206 MiB(같은 값 · WDDM), 프로세스별 값은 `[N/A]`였습니다. 화면은 GPU0 14,843 · GPU1 44,225였고 '마지막 수신'은 흐르고 있었습니다. 원천을 화면에 표기해 달라고 F2-C에 요청했습니다. |
| 문서 정직화 | 콘솔 오류 0은 **4xx 제외 값**입니다. XI맵 로드마다 `GET :8700/api/v1/agent/models 401` 1줄이 남습니다(F2-E/F2-A). `Global ↗`은 **제품 노출 0(테스트 주입만)**이고, F2-D에 kgz 기관 줄 추가를 요청했습니다. |

## 판정 영상 `shots/f2/R/f2r.mp4` (= `shots/f2/F2-R/f2r.mp4`) · **45.4 s** · 1440×900 · 2026-09-27 재녹화
- 로딩 대기 두 구간만 4배속이고 자른 곳은 0입니다. **배속 구간은 화면 왼쪽 아래 띠에 `4× 배속 · 이 구간 실시간 N s`와 실시간 경과 카운터 · 원본 구간을 표기합니다.** 실시간 원본은 `f2r-full.mp4`(56.8 s)입니다. 표의 시각은 원본 기준이고, 판정본 시각은 `marks.json`의 `t_out`입니다.

| 원본 초 | 판정본 초 | 장면 | 실측 |
|---|---|---|---|
| 0.2–1.5 | 같음 | 직원 로그인 → 레일 7 | `rail: 7` |
| 2.1–5.6 | 같음 | '지도 서비스' → 새 XI맵 | `xi.ready` 3.5 s · role `staff` · 마스트 `LX 직원` |
| 7.6–10.4 | 같음 | 통계 서랍 `stats-standard?embed=1` | 크롬 0 · 기간 칩 2025 → 2023 → 2025 |
| 11.6 | 같음 | `ai-card.html?card=card-farm&version=v2.1` | v2.1 행 강조 · 계보 |
| 13.6–17.0 | 같음 | `관제 배포 제어 ↗` → `:8702 login.html?next=deploys.html?deploy=dp-nw-farm-25` → 관제 로그인 | 도착 `deploys.html?deploy=dp-nw-farm-25` · `pwInUrl:false` |
| 18.2–19.8 | 같음 | 관리자 → 레일 10 · 현재 = 운영 현황 → '인프라 관제' | `:8702 …?next=infra.html` |
| 23.9 | 같음 | 영업 첫 화면 새 XI맵 | role `sales` · `영업 · 시연` |
| 26.6–36.1 | 26.6–30.6 | 남원 포털 → 지도 탭 → 실태조사 복원(**28.4–35.7 4× · 띠 표기 '실시간 7.3 s'**) | iframe role `agency` · `xmode=survey` · 복원 8.4 s |
| 40.7 | 35.2 | 결과 탭 `의심 큐 ↗` | href `…&queue=1` |
| 41.9–51.5 | 36.4–40.1 | 큐 도착(**43.2–51.2 4× · 띠 표기 '실시간 7.9 s'**) | `#fdrawer` 열림 · 합계 20,872 · 첫 줄 8.7 s |
| 53.2–54.6 | 41.8–43.1 | kgz `Global ↗`(**테스트 주입 · 화면 띠 표기** · portal.js 줄 대기) → Global | — |

- 스트립(100 ms × 12컷, 원본에서 추출): `strips/{rail-to-xi, drawer-embed, card-deeplink, ops-next, admin-rail10, sales-xi, portal-survey, queue-arrive}-100ms.png`
- 스틸 12장: `stills/01…12`. 콘솔 오류 0(4xx 제외)입니다.
- 녹화 스크립트: `shots/f2/R/record-f2r.mjs`(관제 비밀번호는 `server/.env`에서 읽고 출력하지 않습니다)

## 테스트
| 묶음 | 결과 |
|---|---|
| 신설 f2r-rail · f2r-embed · f2r-deeplink-card · f2r-portal-survey | 판정 1차 단언 추가(관리자 홈 고립 0 · 임베드 전폭 + HUD 교차 0 · 큐 도착 `#fdrawer`). **전부 통과, skip 1**(denied 토스트 · F2-A 대기). 2차: `f2r-portal-survey` 6건 = **5 통과 · 1 skip**(kgz 제품 경로 · portal.js 줄 대기) |
| 개정 proto-shell · proto-login · proto-session · shell · proto-map · proto-publish · proto-portal | 관리자 레일 10 · '관제 현황' · 포털 한 화면 규칙에 XI 임베드 판 예외 1 + 결과 지도 보기 6해상도 재측정. **자기 spec 전체 311건: 309 통과 · 1 skip · 1 실패**. 실패 1건은 `proto-map:212` keep-all로 map.css p0926 영역이며 손대지 않았습니다. |
| 전체 순차 1회 `npx playwright test --workers=2`(926건 · 27.1분) | **872 통과 · 10 실패 · 44 건너뜀** — 아래 소유자 표 |

| 건수 | 스펙 | 소유 |
|---|---|---|
| 4 | `f1d-descent-tiles` · `f1d-i18n-fonts` · `f1d-motion-law` · `f1d-ysykata-ndvi` | `landxi/global/**` — **F2-D** (F2-R 수정 0) |
| 2 | `f2d-boot-timing` · `f2d-stills` | **F2-D** |
| 1 | `f2c-gpu-ma`(폴러 util_ma5 vs nvidia-smi ±3%p) | **F2-C**(녹화 · 다른 스펙과 같은 시간대 GPU 사용률 변동 · F2-R 수정 0) |
| 1 | `proto-map:212` keep-all | p0926(map.css) |
| 1 | `proto-dataset:118` | **F2-R 변경 때문에 난 실패** · 소유 밖(통합자). 기대값 → `['home','ops','infra','tenants','deploys','media','publish','produce','admin','my']` |
| 1 | `proto-dashboard:120` | **F2-R 변경 때문에 난 실패** · 소유 밖(통합자). `['map','ximap.html']` → `['map','/landxi/xi/index.html']` |

## 5축 자기 판정
- **완성형:** 레일에서 새 화면까지 죽은 링크 0(전수 GET · 형식)입니다. 판정 1차의 죽은 버튼(큐)과 고립 화면(admin-home)은 둘 다 해소했습니다. 남은 미완은 모두 소유자에게 요청했습니다(F2-A 토스트 · 카드 칩, F2-C 폼 · GPU 표기, F2-D kgz 줄).
- **일원화:** 생산(카드 버전 · 생산 공정) ↔ 서비스(XI맵 `?svc=` · 포털 실태조사 · 큐) ↔ 관리(관제 `?deploy=`)가 같은 id `dp-nw-farm-25 · card-farm@2.1`로 왕복합니다.
- **Hyper Solution:** 기관 포털 → XI맵 실태조사(20,852 의심 필지) → 의심 큐(R1–R6 · A/B/C · 배정 · 보고서 초안)까지 클릭 두 번입니다.
- **Hyper Performance:** 수치는 `marks.json` 실시간 원본 그대로입니다. 판정본의 배속 구간에는 실시간 초를 화면에 표기합니다. 큐 도착 8.7 s · 복원 8.4 s는 F2-A 개선 대기입니다.
