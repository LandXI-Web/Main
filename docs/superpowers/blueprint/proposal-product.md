# Land-XI 하이퍼 GeoAI 플랫폼 설계안 — 제품·UX 패널

- 작성 2026-09-24 · 설계 패널(제품·UX 주도) · 다른 두 패널(디자인·인프라)과 독립 작성.
- 근거: 메모리 9편(`landxi-ximap-core` · `landxi-quality-bar` · `landxi-relaunch-0923` · `landxi-redesign-direction` · `landxi-user-prefs` 등) · `recon-0924/ASSET-LEDGER.md`(+ env · vworld · stack · global-map) · `specs/2026-09-20-{two-tier,platform-roles,card-architecture,production}.md` · `audit-0923/MASTER-PLAN.md` · `strategy.md` · `2026-08-26-landxi7-function-inventory.md` · `landxi/assets/data/{cards,roles,portal,services,infra}.js` · `wave0/E0-S-result.md`.
- 표기 규칙: 자산은 ASSET-LEDGER ID(`A01`~`E04`, `B01`~`D11`)로, 외부 데이터는 검증된 URL로 묶는다. 수치는 전부 대장의 실측이며 새로 지어낸 숫자는 없다. 화면에 올릴 때는 `실측` · `시연` · `[추정]` · `준비 중` 네 꼬리표 중 하나를 반드시 단다.
- 전제(변경 없음): 기능은 원본 landxi7 35화면 1:1(추가·삭제 없음) · 구조는 자유 · 기관 계정 완전 별도(Q1) · 관리자 = 잉크 반전 다른 집(Q3) · 영업 = 시연 실행(Q4) · 영상 생성 크레딧 0(Q6).

---

## 0. 한 줄 논지

> **Land-XI는 "지도 위에 프레임을 씌우면 AI가 그 안을 읽고, 결과가 그 자리에 도착하는" 플랫폼이다.** 그래서 화면은 35개지만 문법은 하나다 — **프레임 → 실행 → 도착 → 열람**. XI맵이 이 문법의 본체이고, 다른 모든 화면(대시보드·분석 서비스·포털·관제)은 같은 프레임을 다른 눈으로 보는 창이다.

지금까지 네 차례 '목업' 판정을 받은 원인은 화면이 부족해서가 아니라 **결과가 놓여 있을 뿐 도착하지 않고, 지도가 배경일 뿐 무대가 아니었기** 때문이다(MASTER-PLAN §0 · strategy §4). 이 설계안은 (1) 세 사용자가 각자 "우와" 하는 결정적 장면을 화면마다 하나씩 못 박고, (2) 그 장면이 실자산으로 닫히는지 자산 ID로 검증하고, (3) 운영 가능한 API·파일 경로까지 내려간다.

---

## 1. 판정 기준 — 누가 언제 "우와" 하는가

사용자 요구(9차): "실제 전문가가 이쁘고 세련되게, 공무원·일반인·LX 직원이 우와할 정도로." 판정은 스크린샷이 아니라 **동작 영상**(MASTER-PLAN C-35)으로 한다. 아래 표가 이후 모든 화면의 합격선이다.

| 사용자 | 첫 15초에 일어나야 하는 일 | "우와"의 실체 | 실자산 |
|---|---|---|---|
| **지자체 공무원**(남원 농정과) | 로그인 → 내 카드 덱 → 지도 탭에서 **내 관내 정사영상이 1cm까지 내려가고**, 필지 위에 판독 결과가 스캔 스윕으로 도착한다 | "내 동네가 이렇게 선명하게, 결과가 필지 단위로" — 필지 클릭 시 PNU·지목·공시지가가 뜬다 | A01 4시점 · A02 2,098필지 · A03 시 전역 · C04 필지(PNU·공시지가) 또는 E01 V-World 연속지적 |
| **일반 시민**(게스트) | 필름(궤도→남원)이 끝나는 자리에서 **같은 카메라가 실지도로 이어지고**, 내 동네 검색 → 공개 결과가 열린다 | "영상이 진짜 지도였다" + "우리 하천이 전국 하천 지도에 있다" | A05 전국 하천 벡터타일 · A11 행정경계 · A07 서남해 해양쓰레기 히트맵 · 필름 레그(기존 자산) |
| **LX 직원**(모델 개발자) | XI맵에서 **프레임을 그리고 실행하면 GPU 워커가 타일 단위로 결과를 쏟아내고**, 프로젝트에서 학습 곡선이 실측으로 흐른다 | "내가 만든 모델이 진짜 영상 위에서 돌아간다" | B05 차량 OBB(mAP50 .992) × B03 본사 3.42cm/B04 익산 1.36cm 실추론 · B01 남원 5모델 results.csv · D10 AXIS-Label 라벨링 |
| **LX 관리자**(관제) | 잉크 반전 관제실에서 **GPU 2장의 실측 게이지**, 작업 대기열, 기관별 쿼터 링, 배포 계보가 한 판에 산다 | "인프라가 살아 있다" — nvidia-smi 숫자가 6초마다 갱신 | env.md 실측(A6000 48GB×2 · 64C · 512GB · E: 2TB) · infra.js 계산기 [추정] |
| **해외 기관**(키르기스 농업부·토지자원청) | 글로벌 XI맵에서 **으슥아타 군의 월별 Sentinel-2 NDVI가 실 API로 흐르고**, 미얀마 지진 전후가 한 선으로 갈린다 | "우리 나라 데이터로 이미 돌아간다" | geoBoundaries KGZ ADM2 · Planetary Computer S2 L2A/NDVI · ESA WorldCover 통계 · Copernicus EMS EMSR798 · Maxar Open Data(비상업) |

합격 판정 절차: 화면당 **Playwright `recordVideo` 8–12s 클립 + 100ms 프레임 스트립** → Craft 비평가(구현 미참여 최상위 모델) → 세 사용자 관점 체크(위 표) → `SendUserFile`로 사용자에게 영상 전송. 스펙 통과 ≠ 합격(quality-bar 7차).

---

## 2. 정보구조 — 사이트 다섯, 문법 하나

### 2.1 사이트 지도

```
① 공개 사이트 (게스트)          scrub/index.html 필름 → 착지 = XI맵 공개 모드(ximap.html?public=1)
② LX 워크벤치 (직원 · 영업)     login.html → 대시보드 / 데이터 / 프로젝트 / 분석 서비스 / XI맵 / 서비스 지원 / MY
③ LX/OPS 관제 (관리자)          admin-login.html → 운영 현황 / 인프라 관제 / 기관·할당 / 배포 제어 / 카드 발행 / 데이터 관리 / 서비스 관리 / MY
④ 기관 포털 × n (지자체)        portal-login-<tenant>.html → 카드 덱 → 작업공간 5탭(현황·결과·지도·통계·보고서)
⑤ Land-XI Global (해외 기관)    portal-login-<tenant>.html?locale=en|ru → 같은 골격 · EPSG:4326 · 위성 사다리 · 다국어
```

②~⑤는 모두 **한 벌의 지도 엔진(`map-gl.js`)과 한 벌의 문법(프레임→실행→도착→열람)**을 공유한다. ⑤는 새 사이트가 아니라 포털 생성기(`tools/gen/portal-gen.mjs`)에 `locale` · `crs` · `imagery ladder` 세 축을 더한 산출물이다(카드 구조 §2 분기 = "같은 문법, 다른 맥락").

### 2.2 화면 목록 — 원본 35화면 1:1 대응(추가·삭제 없음)

| 원본(인벤토리 §) | 새 구조에서의 자리 | 무엇이 달라지나(구조) | 파일 |
|---|---|---|---|
| 홈 `home.html`(§12) | ① 필름 + 꼬리 3칸 + **XI맵 공개 모드 착지** | 원본 Hero/Trust/노코드 4노드/Before-After/특징3/라인업 13칩/사례/CTA/문의/푸터 전부 필름 뒤 꼬리에 실자산으로 | `landxi/proto/scrub/index.html` · `scrub-tail.js` · `site/*` |
| 로그인·가입·찾기 4(§11) | ② 입구(직원·영업 2칸 + '관리자 사이트 ›') · ③ `admin-login.html` · ④⑤ `portal-login-*` | 로그인 = 플랫폼 소개(모토·3축) + 실결과 미니맵 얼굴판 | `login.html` · `auth.js` · `portal-login.js` |
| 대시보드(§2) | ② 직원 첫 화면 = **AI 양산 라인 계기판** | 원본 위젯(공지 스트립·KPI·백본·3탭)을 지도 없이 네 띠 + 작은 판으로. '7일 방문' 추세는 콘티 위반이라 제거(Q8) | `proto/dashboard.html` · `db-*.js` |
| 데이터 관리 4탭(§3) | ② ③ 공유 · **판이 주인공**(PLATE-FULL) | 4탭 = 파이프라인 단계, 업로드 → 발행 4/4 → 아카이브가 판 위에서 전이 | `proto/dataset.html` · `ds-plate.js` |
| 프로젝트 8단계(§4) | ② LX 작업실 | 라벨링 = AXIS-Label 실백엔드(D10) · 학습 = results.csv 실곡선(B01) · 분석 = 프레임 실행 | `proto/ai-project*.html` · `project-*.js` |
| 분석 서비스 3탭(§5) | ② 카드 진열대 + 실행 = XI맵 프레임 호출 | 실행 탭은 XI맵 `?card=&pick=frame` 으로 프레임을 받아 온다 | `proto/analysis-ai.html` · `analysis-run.js` |
| **XI맵**(§6) | ②④⑤ **플래그십** · 3비교 모드 → 한 축(시점 스크럽 + 스와이프) · 통계/보고서 = 판 위 서랍 | §4 조작 문법 전부 | `proto/ximap.html` · `map.js` · `map-gl.js` · 신설 `map-frame.js` · `map-ladder.js` · `arrive.js` · `timescrub.js` |
| 서비스 지원 5(§7) | ② 공지·FAQ·문의·사례·매뉴얼 · 기관은 포털 안 `portal-support-<t>` | 문의 = 오탐 신고 + 지도 위치 첨부(`pick`) · 사례 = 2시점 스와이프 | `proto/notice.html` 등 · `support-*.js` |
| 카드 발행 관리 3(§8) | ③ 검토 데스크 · 승인 = 카드가 태어나는 장면 | 승인 → `cards.js DEPLOYS` 오버레이 → 기관 덱 미리보기 | `proto/admin-publish.html` · `publish-*.js` |
| 서비스 관리 5(§9) | ③ 사용자·공지·문의·FAQ·지도 속성 + **인프라 관제 · 기관 할당 · 배포 제어**(원본 '지도 속성 관리'와 '사용자 관리'의 확장이 아니라, **생산 관리 6탭(produce.html)의 인프라 탭을 관제로 격상**한 것 — 새 메뉴가 아니라 기존 탭의 화면화) | `proto/admin-*.html` · 신설 `admin-infra.html` · `admin-tenants.html` · `admin-deploys.html`(= produce 탭 분리) |
| 마이페이지(§10) | ② ③ ④ 각 집의 MY · 디스크 = 기관 쿼터와 같은 부품 | 증량 신청 = 쿼터 요청 큐로 | `proto/mypage.html` · `account-*.js` |
| XI맵 통계·보고서 3(embed) | XI맵 우 서랍 + 단독 페이지 유지 | `?embed=1` 프로토콜 유지 | `stats-standard.html` · `report-standard*.html` |

> 원본에 없는 것을 만들지 않는다. 인프라 관제·기관 할당·배포 제어는 **2026-09-20 생산화 스펙(`produce.html` 6탭 · `infra.js` · `ops.js` · `studio.js`)에 이미 데이터로 존재**하며, 이번 설계는 그 탭을 관리자 사이트의 1급 화면으로 올리는 것이다(사용자 2026-09-24 요구 4번).

---

## 3. 다섯 여정 — 결정적 장면과 자산

### 3.1 지자체 공무원(남원시 농정과 · `dp-nw-farm-25`)

```
portal-login-namwon.html  얼굴판 = 남원 농경지 AOI 정사영상(A01 2506) 위 2,098필지 청록 미니맵이 6s 패닝
 → portal.html 카드 덱 5장(2023→2027) · 밴드 = 실측 결과 수(A02) / 준비 중은 사유 한 줄(Q2)
 → '영농관리 행정서비스' 펴기 → 작업공간 5탭
   현황: 읍면동 39(A11) 단계구분도 + 필지 2,098 · 비닐하우스 1,674 병기(Q5a)
   분석 결과: 필지 표(PNU·emd·conf·area) ↔ 지도 락온 삼각 호버
   지도: XI맵 기관 모드 — 줌 사다리(xdworld → 25cm C01 → 2m A03 → 1cm A01) · 4시점 스크럽 · 스와이프 · 필지 카드(C04)
   통계: stats-standard(읍면동 집계 = A02 × A11 sjoin, P10 사전 계산)
   보고서: report-standard 발급 접수→생성→완료 + CSV BOM
 → 오류 신고: 지도에서 필지 pick → contact?svc=&fid=&pnu= → LX 라벨링 큐(피드백 고리)
```

**결정적 장면 P-1 "내 관내가 1cm까지"**: 지도 탭을 열면 카메라가 시 전역(A03 z12)에서 농경지 AOI(A01 z17)로 1,250ms 하강하며 배경이 세 번 갈린다(25cm → 2m → 1.08cm). 하강이 끝나는 순간 청록 스캔 스윕이 지나가고 필지가 도착한다(S1). 스파이크 `spikes/ximap-signature`가 이미 실측으로 증명(E0-S 결과 · 다이브 스트립 12장 · p95 16.8ms).

**결정적 장면 P-2 "필지에 손을 대면 대장이 답한다"**: 필지 클릭 → 락온 380ms → 카드에 PNU · 지목 · 면적 · 공시지가 · 소유구분(C04 국토정보기본도 2.0, P8로 남원만 PMTiles z12–17) + 판독 conf · 4시점 크롭(A12 crops). V-World 키(E01)가 살아나면 `LP_PA_CBND_BUBUN` GetFeature로 현행 값을 덧댄다(프록시 `/api/vworld/*`).

### 3.2 일반 시민(게스트)

```
scrub/index.html 필름 14레그(궤도→성층운→한반도→남원→여수→울주→국토→귀환→CI)
 → 마지막 남원 인계 판에서 커튼 1,000ms → **ximap.html?public=1** 같은 카메라 프레임(sessionStorage.lx_cam)
   공개 모드 = 열람만: 전국 하천(A05 river_vt pbf z6–14, 변환 없음) · 서남해 해양쓰레기 히트맵(A07) · 시군구 경계(A11) · 공개된 배포본 결과(A02 · A06)
 → 검색 '남원시 운봉읍' → 읍면동(A11) fit → 공개 결과 켜기 → 도착
 → 꼬리 3칸: 활용 사례 슬라이더(DEPLOYS 7장 · 2시점 스와이프) · 공지/문의(게스트 localStorage) · 활용 서비스 카드 → 기관 로그인 문
```

**결정적 장면 G-1 "필름이 지도였다"**: 필름 마지막 프레임과 XI맵 첫 프레임의 카메라(center · zoom · bearing 0 · pitch 0)가 같아 화면 전환 시 점프 0(S4 인계 · 연속 스크린샷 프레임 차 측정). 영상 재렌더 없음(Q6).

**결정적 장면 G-2 "우리 하천이 전국 지도에"**: z6에서 전국 하천 벡터타일(A05)이 헤어라인으로 흐르고, 하천 점유 건물 651,478건(B02)의 시군구 단계구분도가 그 위에 얹힌다 — cleanriver 운영 서버와 같은 데이터라 시연 표기가 아니라 **실측**.

### 3.3 LX 직원(모델 개발자)

```
login.html(직원) → dashboard.html 양산 라인 계기판(네 띠: 만드는 것 · 발행 대기 · 어디에 깔렸나 · 다음 것)
 → ai-project.html → 과제 → 라벨링(AXIS-Label 백엔드 D10 · 익산 황등 1.36cm B04 · 라벨 2,662) → 데이터셋 → 학습(B01 results.csv 실곡선) → 분석
   분석 = XI맵 프레임: ai-project-work?tab=analysis → ximap.html?card=&pick=frame → 프레임 그리기 → 모델 고르기 → 실행
   → POST /api/jobs → 워커(gcs env · A6000) → 타일 단위 결과 SSE → 지도 위 도착(스윕은 진행률에 묶임)
 → 카드 발행 요청 → (관리자 승인) → analysis-ai.html 진열대에 카드 +1 → 기관 덱 +1
```

**결정적 장면 S-1 "프레임을 그리면 GPU가 답한다"**: 익산 황등3지구 정사(B04 1.36cm, COG 변환 후 XYZ z15–22) 위에 300×300m 프레임을 그리고 차량 OBB 모델(B05 · `E:\drone_runs\car_v2_obb\run\weights\best.pt`)을 실행 → 워커가 512px 타일 단위로 추론하며 `/api/jobs/:id/events`(SSE)로 타일 좌표 + 폴리곤 청크를 밀어 준다 → 지도 위에서 스캔 스윕이 **실제 진행률**을 따라 움직이고, 지나간 자리에 차량 OBB가 청록으로 선다. 첫 결과까지의 시간과 처리 타일 수는 HUD에 실측으로 찍힌다(`처리 214/1,024 타일 · 41.2 s · A6000 #0`). 워커가 없는 환경(외부 시연)에서는 같은 프레임으로 **저장된 실측 결과를 재생**하며 `시연 실행 · 저장 결과 재생` 꼬리표를 단다.

**결정적 장면 S-2 "학습이 심장처럼 뛴다"**: 남원 비닐하우스 YOLO11x-seg 학습(B01 `Vinyl_house/runs/segment/train*/results.csv`, mask mAP50 .945)의 epoch 곡선이 `flow.js` 시계로 재생되고, PR·F1·혼동행렬·val_batch_pred가 카드로 선다 — 전부 실측 파일(P6 복사).

### 3.4 LX 관리자(관제)

```
admin-login.html(전용 입구 · lx_role=admin) → admin-home.html 운영 현황 [잉크 반전 · LX/OPS]
   중앙 판 = 전국 배포 지도(DEPLOYS 7점 · 상태색 · 긴급 맥동 6s) + 결재 대기 3(실카운트)
 → admin-infra.html 인프라 관제: 노드 카드(A6000 #0/#1 실측 · 향후 A100×4 ×2 노드 등록 자리) · 작업 대기열 · 스토리지(E: 실측 df) · 타일 트래픽 · 장애 경보
 → admin-tenants.html 기관·할당: 기관별 저장/GPU·h/분석 면적/동시 작업 쿼터 링 · 사용량 실측 · 초과 정책 · 데이터 격리 표시
 → admin-deploys.html 배포 제어: 카드 × 기관 매트릭스 · 버전 고정 · 단계 배포(일부 기관 먼저) · 롤백 · 모듈 on/off · 모델 교체 · GPU 배치 · 승인 흐름 · 계보(S2)
 → admin-publish.html 검토 데스크: 승인 = 증거판 → 카드 현상 → 기관 덱 미리보기
```

**결정적 장면 A-1 "숫자가 살아 있다"**: `GET /api/infra/gpu`가 `nvidia-smi --query-gpu=... --format=csv`(경로 `C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_*\nvidia-smi.exe`, env.md)를 6초마다 읽어 온도·사용률·메모리(48GB 중 사용량)를 JSON으로 준다. 게이지는 흰 헤어라인 링, 값은 Inter tabular 40ms 현상. 작업이 큐에 들어오면 대기열 행이 노드 카드로 리더선을 그리며 이동한다(S2). 실측이 불가한 항목(향후 A100 노드 · 연간 GPU·h 예측)은 `[추정] · infra.js 단가 2.8 GB/km² · 0.9 GPU·h/km²`로 표기.

**결정적 장면 A-2 "승인이 지도에 도착한다"**: 카드 발행을 승인하면 배포 지도에 새 점이 S1 도착으로 떨어지고, 계보 띠(모델 → 카드 → 배포본 → 기관)가 한 칸 자란다. 반려는 요청 행이 clip-path 750ms로 퇴장(S7).

### 3.5 해외 기관(키르기스스탄 · Land-XI Global)

```
portal-login-kgz-agri.html?locale=en  얼굴판 = 으슥아타 군 경계(geoBoundaries ADM2) 위 Sentinel-2 최신 장면(PC STAC · 구름 <10%)
 → 카드 덱: '농지 이용 실태 분석 (해외)' card-global-farm · '재해 피해 판독 (해외)' card-global-disaster
 → 지도(XI맵 글로벌 모드): 글로브(GIBS 어제 트루컬러) → 국가(EOX s2cloudless-2025) → 군(PC 월별 모자이크 · WorldCover · NDVI) → 현장(S2 10m 장면)
   프레임 = ADM2 경계 그대로 → 실행 = WorldCover 통계 API(실측 비율) + 월별 NDVI 곡선(PC statistics)
 → 재해 카드: 미얀마 EMSR798 AOI11 메이크틸라 — Maxar 전(2025-02-07) / 후(2025-04-03) 스와이프 + EMS 피해 점 38 → Overture 건물에 공간조인
```

**결정적 장면 K-1 "우리 군의 한 해가 흐른다"**: 시점 스크러버를 2025-03 → 2025-10으로 끌면 PC 월별 모자이크(`mosaic/register` searchid)가 크로스페이드하고, 농지 마스크(WorldCover 40) 안 평균 NDVI 곡선이 함께 그려진다 — 107개 장면 실측(global-map §3 시나리오 A). 작물 종류 구분은 공개 데이터로 불가하므로 카드 `gap`에 `AI 과업 · 학습데이터 필요`로 정직 표기.

**결정적 장면 K-2 "재해 전후가 한 선으로"**: 스와이프 핸들을 끌면 Maxar 0.5m 전·후 영상이 갈리고, EMS 판독 점(Damaged 23 · Destroyed 4 · Possibly 11)이 건물 폴리곤 등급색으로 선다. 라이선스 표기(EMS © EU · Maxar CC BY-NC · 공공 시연만).

---

## 4. XI맵 조작 문법 — 플랫폼의 심장

사용자 정의(메모리 `landxi-ximap-core`): "전국단위 위성·항공·드론 정사영상을 **실시간 분석할 수 있는 프레임과 그 결과를 보는** 핵심 GeoAI 맵." 문법을 여덟 동사로 고정한다. 화면은 이 동사만 안다.

### 4.1 여덟 동사

| # | 동사 | 조작 | 결과 | 부품(파일) | 자산 |
|---|---|---|---|---|---|
| V1 | **내려가다** (줌 사다리) | 휠·핀치·검색·카드 클릭 | 줌 구간마다 배경이 자동으로 갈린다. 갈리는 순간 타일 페이드 500ms, 현재 층 이름이 HUD에 뜬다(`V-World 위성 z14 · 2026-03` → `LX 항공 25cm 2023` → `LX 드론 1.08cm 2025-04`) | `map-ladder.js`(신설) — `ladder(map, [{src, minz, maxz, bounds}])` | 국내: A13 z5–12 → C01(P3) z12–18 → A03 z11–17 → A01/A09/B03/C02 z14–22. 글로벌: GIBS z0–9 → EOX z5–14 → PC S2 z9–17 → Maxar z14–18 |
| V2 | **프레임을 씌우다** | 도구 3종: 사각형 드래그 · 폴리곤 클릭 · 행정경계 선택(A11 읍면동 / geoBoundaries ADM2) | 프레임 안 영상 층·면적·예상 타일 수·예상 GPU·h([추정] infra.js)를 HUD가 즉시 계산. 프레임 밖은 무채 디밍 | `map-frame.js`(신설) — `frame.draw(mode)` · `frame.fromBoundary(code)` · `frame.toGeoJSON()` | A11 · C04 · geoBoundaries |
| V3 | **실행하다** | 프레임 위 '이 프레임 분석 ›' → 카드·모델 고르기(카드 `kind.input` 이 현재 층과 맞는 것만 활성) | `POST /api/jobs` → 작업 ID → 진행률에 묶인 스캔 스윕 | `map-run.js`(신설) + `arrive.js` | B05 · C09 · B01 모델 / 시연 = results.js 재생 |
| V4 | **도착하다** (S1) | 자동 | 스윕(청록 수직선 1.0s, 지나간 뒤에만 결과) → 락온 380ms(180 → 앰버 80 → 청록 120) → 숫자 40ms 현상 → `frame()` 900–1250ms 선행 | `arrive.js` — `arrive(map, layerId, {sweep, lock, count, fit})` (E0-S 스파이크 `ximap-signature.js:285` 를 부품화) | A02 · A04 · A06 |
| V5 | **시점을 끌다** (S3) | 하단 스크러버 0–3 소수 · 재생 1(6s 주기) · 정수 시점 750ms 자동 정지 · ←/→ ±0.25 · URL `?epoch=1.5` | 두 raster 층 크로스페이드, 변화 시점에 변화 지수(비지도 · 학습 결과 아님) 윤곽 | `timescrub.js` — `setEpoch(a,b,t)` | A01 4시점 · A03 2시점 · A09 2비행 · C02 3.67→1.44cm · 글로벌 PC 월별 모자이크 |
| V6 | **가르다** (S6) | 스와이프 핸들 · ←/→ ±4% · URL `?swipe=42` | 좌 원본 / 우 원본+결과 또는 시점 A/B. WebGL 컨텍스트 2 동기 | `map-gl.js swipe()` 공용 | 전 자산 · 미얀마 Maxar 전후 |
| V7 | **세우다** (3D · Q9 재상정) | 배경지도 서브메뉴 '지형·입체' 1개 · 기본 OFF · pitch ≤ 45 | 결과 폴리곤 `fill-extrusion`(높이 = conf 또는 height_m [추정]) + `raster-dem` terrarium. 지형은 장면 단위만(SwiftShader 2.4fps 절벽 · stack.md) | `map-gl.js setTerrain` 옵션 | A08 지형 z9–13 + 건물 5,109 · E02 AWS Terrarium z≤15 · B03 본사 DSM(terrarium 변환) · C02 용지 DSM |
| V8 | **열람하다** | 결과 체크 · 표 3종(지목별 = A02 속성 집계 / 필지별 / 도로지점별 = `준비 중 · 도로 결과 없음`) · 심각도 · 페이지네이션 · 통계 서랍 · 보고서 서랍 · 내보내기(GeoJSON · CSV BOM) | 표 행 ↔ 도형 ↔ 막대 삼각 호버 · 필지 카드 · 크롭 clip-path 1s | `map.js` · `map-stats.js` · `map-report.js` · `download.js` | A02 · A12 crops · C04 · stats/namwon-*.json(P10) |

### 4.2 화면 구성(PLATE-FULL · 1440 기준)

```
┌ 마스트 64 ── 워드마크 · 경로 · 기준일 AS_OF(prov) · 계정 칩 ───────────────────────────┐
│ 레일 72 │  지도 캔버스 = 콘텐츠 전부(#mw, 판이 열려도 캔버스 불변 · ≥ 60 %)              │
│         │  ┌ 좌 판 372(흰 · 헤어라인 · 지도 위 떠 있음) ─┐        ┌ HUD(우상) ────────┐│
│         │  │ 탭: 공간 정보 · 지역 · 분석 결과              │        │ 층 이름 · z · GSD  ││
│         │  │ 결과 목록(카드 배포본 순) · 레이어 12줄        │        │ 프레임 면적·타일수 ││
│         │  │ 검색(읍면동 32 · PNU · 지명 → flyTo)          │        │ 진행 214/1,024     ││
│         │  └───────────────────────────────────────────┘        └───────────────────┘│
│         │                                                        ┌ 우 정보 판(선택 시) ┐│
│         │   [프레임 도구 ▭ ⬠ ◎]  [배경지도 ▾]  [입체 ○]           │ 필지 카드 · 크롭     ││
│         │                                                        │ 오류 신고 › pick   ││
│         │  ┌ 하단 표(접힘 ↔ 3행 ↔ 10행) ────────────────────────┐ └───────────────────┘│
│         │  │ 지목별 · 필지별 · 도로지점별 | 심각도 | 페이저        │ ┌ 시점 스크러버 ───┐  │
│         │  └────────────────────────────────────────────────┘ │ 04 ─●── 06 · 08 · 10│  │
│         │                                                        └─ ▶ 6s · 변화 지수 ─┘  │
└─────────┴──────────────────────────────────────────────────────────────────────────────┘
```

- 판은 **지도 위에 떠 있는 흰 판**이다. 그림자·유리는 §7의 개정 규칙(지도 위 판 1단 깊이 허용)에 따른다.
- 모드 셋(기본/겹쳐보기/나란히보기)은 원본 기능을 유지하되 **한 축**으로 접는다: 기본 = V4, 겹쳐보기 = V5, 나란히보기 = V6. 탭 라벨은 원본 그대로 두고 동작만 바꾼다(기능 1:1).
- URL 상태: `?on=<resultId>&epoch=1.5&swipe=42&frame=<b64geojson>&card=&pick=frame|point&public=1&svc=<deployId>&result=<id>&embed=1` — 새로고침 복원 · 딥링크 · 대시보드/포털/분석에서 수신.

### 4.3 역할별 XI맵

| 세션 | 진입 | 켜지는 동사 | 숨김 |
|---|---|---|---|
| 게스트 `?public=1` | 필름 착지 | V1 V5 V6 V8(공개 결과만) | V2 V3 V7 · 내보내기 |
| LX 직원 | 레일 '지도 서비스' | V1~V8 전부 · 오류 신고 · pick | — |
| 영업 | 첫 화면 `ximap.html?on=namwon-farmland-2025&epoch=namwon_2506` 결과 켜진 채 | V1 V4(시연 실행 · 세션에 남지 않음) V5 V6 V8 | V2 V3(실제 큐) V7 · 조치 상태 변경 |
| 기관(남원) | 작업공간 지도 탭 · 자기 배포본 범위 안 | V1 V4 V5 V6 V8 · 필지 카드 · 오류 신고 | 다른 기관 결과 · LX 레일 · V2 V3(실행은 LX 몫 — two-tier 경계) |
| 해외 기관 | 글로벌 사다리 · EPSG:4326 · locale | V1 V4 V5 V6 V8 | 국내 층 전부 |

---

## 5. 화면별 설계

각 화면: 목적 · 레이아웃 · 결정적 장면 · 컴포넌트 · 데이터/자산 · API · 파일. 원본 기능은 인벤토리 § 번호로 대조한다.

### 5.1 ① 공개 사이트 — 필름 → 지도 착지 (인벤토리 §12)

- **레이아웃**: 필름 14레그 스크럽(기존 · 재렌더 0) → 커튼 1,000ms → **XI맵 공개 모드 인라인 판**(같은 카메라) → 꼬리 3칸(활용 사례 슬라이더 · 공지/문의 · 활용 서비스 카드) → 정부 표준 푸터.
- **원본 대응**: 노코드 4노드 플로우 = `chart.js` 부품 인라인 SVG(생산 관리 흐름도와 동일 문법) · Before/After = 남원 2504↔2510 스와이프(A01) · 특징 3종 = 실크롭 3장(A12) · 라인업 = `serviceCards('lx')` 15칩 실데이터 · 사례 = DEPLOYS 7장 · 문의 폼 = localStorage 게스트 저장소(관리자 문의 관리가 읽음).
- **결정적 장면 G-1 · G-2**(§3.2).
- **파일**: `landxi/proto/scrub/index.html` · `scrub-tail.js` · `scrub.css` · `site/{platform,usecase,notice,policy}.html` · 신설 `landxi/proto/js/camera.js` 규약 `sessionStorage.lx_cam {center, zoom, bearing:0, pitch:0, t}`.
- **자산**: 필름 레그(기존 mp4) · A05 · A07 · A11 · A01 · A12 · cards.js DEPLOYS.
- **전송 예산**: 첫 4초 ≤ 5MB(포스터 + leg01 · 이후 preload).

### 5.2 로그인 3문 (인벤토리 §11)

- ② `login.html`: 계정 2칸(직원 · 영업) + '관리자 사이트 ›'(Q7 추천안). 좌 = 플랫폼 소개(모토 "LX 전 직원이 Geo-AI 전문가" · 3축 · 비전) · 우 = 얼굴판(A01 2506 위 A02 청록 미니맵 6s 패닝, 정적 캔버스 스냅샷으로 WebGL 컨텍스트 절약). 가입은 직원·영업 신청만(Q1).
- ③ `admin-login.html`: 잉크 바탕 · `LX/OPS` 마크 · 관제 요약 한 줄(실측 GPU 2 · 큐 n · 기관 n).
- ④⑤ `portal-login-<tenant>.html`: 기관 CI(brand.js `CI_KEYS` 9) · 얼굴판 = 그 기관 첫 운영 배포본 실결과 미니맵. 안내 줄 "기관 작업공간은 기관 계정으로만".
- 세션 계약: MASTER-PLAN §7.1 `storage-keys.js` 그대로(`lx_logged_in` · `lx_role` · `lx_tenant_session` 상호 배타).

### 5.3 ② 대시보드 — AI 양산 라인 계기판 (인벤토리 §2)

- **목적**: 직원의 첫 화면. two-tier §6 "양산이라는 말의 뜻" 네 질문에 답한다.
- **레이아웃**(한 화면 745px 종료): 상단 큰 숫자 밴드(발행 카드 · 배포본 · 진행 학습 · 발행 대기 — 전부 cards.js/registry.js 실카운트) → 네 띠(지금 만드는 것 JOBS · 발행 대기 · 어디에 깔렸나 · 다음 것 PROMOTE_WATCH 3) → **작은 판 1개**(남한 격자 · DEPLOYS 마커 7 · 셀 클릭 → `ximap.html?result=`) → 원본 위젯(공지 스트립 `?notice=` · 백본 모델 카드 · 3탭 차트 중 프로젝트 용량 Top5 · 스토리지) 헤어라인 목록.
- **결정적 장면 D-1 "라인이 돈다"**: 진행 중 학습 meter가 `flow.js` 시계로 흐르고(시연 표기), 판 위 배포본 셀이 6초에 하나씩 점등한다(유휴 1개).
- **콘티**: '7일 방문' 추세 제거(Q8) · 디스크 수치 = infra.js 한 값 + `[추정]`.
- **파일**: `proto/dashboard.{html,js,css}` · `db-data.js` · `db-cells.js` · `db-geo.js` · `flow.js`.

### 5.4 ② ③ 데이터 관리 — 판이 주인공 (인벤토리 §3)

- **레이아웃**: 좌 372 목록(4탭 = 업로드 · 완료 · 발행 중 · 아카이브 = 파이프라인 단계) + 우 PLATE-FULL(폭 55–60%, 1920은 남는 폭 전부).
- **결정적 장면 M-1 "발행 4/4가 판 위에서 일어난다"**: 발행 실행 → 1/4 파선 footprint → 2/4 브래킷 정렬 → 3/4 타일 fade-in(실제 XYZ 타일 요청) → 4/4 청록 `arrive`. 편입 순간 `frame` 1250 + raster-fade.
- **카탈로그 실측**: AI Hub 토지피복 4권역 칩 수(B09 · B10 · C08) · aerial 153,295장/폴리곤 205만(D02) · drone 153,971장(D03) · 남원 5셋(D01) · OBB 6클래스 1,899(B11) · 라벨 품질 리포트(D02 `label_quality_report.json`).
- **커버리지 판**: 토지피복 칩 중심점 히트맵(META 전수) · LX 드론맵 인덱스 136,025셀(B07) · 25cm 도엽 인덱스(C01 TFW) · 도로 정사 302장 경계(C03).
- **자산 등급 표시**(card-architecture §5.2 `ASSET_TIERS`): 원본 정사영상 = `LX 보관 · 공유 불가`(편집 비활성 + 이유) · 타일 = 권한 부여 · 라벨/모델 = 사본 제공 · 결과 = 열람/다운로드. 공유 모달이 이 등급을 그대로 보인다.
- **API**: `POST /api/uploads`(청크 · 진행률) · `POST /api/publish {datasetId}` → 타일 작업(큐) · `GET /api/datasets?tenant=`(격리).
- **파일**: `proto/dataset.{html,js,css}` · `ds-data.js` · `ds-plate.js` · `ds-thumbs.js`.

### 5.5 ② 프로젝트 — 손끝 · 심장 박동 · 라인 (인벤토리 §4)

- **8단계 사이드바 그대로**(개요 · 파일 업로드 · 라벨링 · 데이터셋 · AI 학습 · AI 분석 · AI 모델 등록 · 카드 발행 요청).
- **라벨링 = 실백엔드**: AXIS-Label(D10 `E:\Auto_Label_project\app.py` FastAPI + SQLite + DINOv2·SAM2·YOLO 루프 · 임베딩 653MB)을 `/api/label/*`로 프록시. 화면은 익산 황등 1.36cm 정사(B04, COG→XYZ) 위에 검수 라벨 2,662(픽셀좌표 → 4326 변환)를 청록 점선 고스트로 깔고, 진짜 그리기 도구(사각형 드래그 · 꼭짓점 폴리곤 · 원 · 꼭짓점 편집 · 1/2/Del/Ctrl+Z)로 저장한다. 자동 라벨 = SAM2 · YOLO-E · YOLO-World(D11) 호출 · 임베딩 유사도 히트맵(D10).
- **학습 = 실측 곡선**: B01 5모델 `results.csv` → `assets/models/namwon/*.json` + PR·F1·혼동행렬·val_batch_pred WebP(P6). 진행 중은 `flow.js` 시계(시연 표기). 향후 실학습은 `/api/train` 큐(워커 = `yolo` env).
- **분석 = XI맵 프레임 호출**: `ai-project-work?tab=analysis` → `ximap.html?card=<c>&model=<m>&pick=frame` → 프레임 확정 → `?frame=` 회수 → `POST /api/jobs`.
- **결정적 장면 S-1 · S-2**(§3.3). Roboflow 비교 Craft 게이트(라벨링 단독).
- **파일**: `proto/ai-project*.html` · `project-{label,labeling,train,analysis,deploy,files,create,data,ui}.js` · 신설 `tools/server/routes/label.mjs`(AXIS 프록시).

### 5.6 ② 분석 서비스 — 카드 진열대 · 실행은 지도 위에서 (인벤토리 §5)

- **3탭 유지**(실행 · 실행중 · 완료) · 상단 `지자체 사업 / 글로벌 사업` 분기 · 카드에 대상 배지 · 모듈 수 · 배포 지역.
- **실행 탭**: 과제 → 모델(과제 종속) → 영상(아카이브) 3단 픽커 유지 + **'지도에서 프레임 잡기 ›'**(XI맵 pick). 실행 = 모달 없이 `#run-plate`(그 영상 실타일 · A01/A03/B04) 위 스캔이 진행률을 따른다. 영업 = 시연 실행(`addRun` 호출 없음 · S1 연출만).
- **완료 탭**: 결과가 **판독한 영상 위에** 선다(`imagery.js` 타일 기본 ON · bounds 클립) · 편집(선택·이동·삭제) 실동작 · 저장 = localStorage + `시연 · 이 브라우저에 저장`(Q5c) · 다운로드 = 실파일 GeoJSON.
- **장치 렌더러**(cards.js `needsOf`): 히트맵 = 여수 grid100(A06) · 타임라인 = 변화 4시점(A04) · 등급 = 준비 중(도로 결과 없음) · 영상 플레이어 = 국산리 2비행 스크럽(A09).
- **카드 상세**: 계보 띠(S2 · 모델 → 카드 → 배포본 → 기관) · 첫 실측 결과 미니맵 · 이식 마법사(`transplantAssets` "가져갈 것 / 현지에서 준비할 것") · `prov()` 실측 줄.
- **파일**: `proto/analysis-ai.html` · `analysis-{run,cards,map,kind,data}.js` · `analysis.css`.

### 5.7 ② ④ ⑤ XI맵 (인벤토리 §6) — §4 전문. 추가 구성:

- **배경지도 서브메뉴**: 위성(A13) · 일반 · 야간 · 하이브리드 라벨 · **LX 보유 정사(자동 사다리)** · 지형·입체(V7) · 오프라인 폴백(`setBase` 로컬: C01 남원·전주 도엽 + A11 무채 채움 + 캡션 `오프라인 · 로컬 배경`).
- **레이어 12줄**: 실자료 있는 줄만 켜진다(A02 · A04 · A05 · A06 · A07 · A08 · A10 · B02 · B06 · B09 · C04 · C09) · 없는 줄 = `시연 · 지도 미연결` 라벨.
- **검색**: 읍면동 39(A11) → PNU(C04 PMTiles 속성) → V-World `req/search`(E01 갱신 후 프록시).
- **통계 서랍**(`stats-standard?task=&embed=1`): 지역별/클래스별 · 기간 칩 1/3/6/12개월이 `analyzedAt`로 실제 필터 · 시연 기준 2줄 disabled + 사유.
- **보고서 서랍**(`report-standard-issue` / `report-standard`): 접수 → 생성 → 완료(`flow.js`) · CSV BOM · 요청자 = 현재 계정.
- **성능 예산**: rAF p95 ≤ 20ms · WebGL 컨텍스트 ≤ 2(스와이프 시) · INP ≤ 200ms · 타일 페이드 500.
- **파일**: `proto/ximap.html` · `map.js` · `map.css` · `map-gl.js`(`createMap(el,{mode:'2d'|'3d'|'globe'})` 격상 · 회전/피치 잠금 해제 · maxZoom 22) · 신설 `map-ladder.js` · `map-frame.js` · `map-run.js` · `arrive.js` · `timescrub.js` · `map-stats.js` · `map-report.js` · `js/sources.js`(사다리 소스 표 · 글로벌 소스 URL 빌더 한 곳).

### 5.8 ② 서비스 지원 — Geo-AI가 보이는 게시판 (인벤토리 §7)

- 활용 사례 = DEPLOYS 7장 카드 · 모달 상단 2시점 스와이프(A01 2504↔2510 · A09 A68↔A71 · A10 제주 2020↔2022) · stats 접힘(시연).
- 문의 = 유형(일반 · 오탐/누락 · 기관 · 게스트) + **지도 위치 첨부**(XI맵 `?card=&pick=point` → `?sel=&pnu=&lnglat=` 회수 · 크롭 미리보기) → `lx-feedback` 큐 → 관리자 문의 관리 → '라벨링 큐로 보내기 ›'(피드백 고리 완성).
- 공지 열람 판 '이 공지가 가리키는 곳'(S2 한 줄 + `ximap?card=`) · FAQ '그 화면 열기' · 매뉴얼 실캡처 clip-path 1s.
- 기관은 포털 안 `portal-support-<tenant>.html`(생성기) — `lx-admin-v1:*` 저장소를 `audience:'tenant'`로 읽기만.

### 5.9 ③ LX/OPS 관제 — 관리자 사이트 (인벤토리 §8 · §9 · 생산화 스펙)

**공통**: `html[data-site=admin]` · 잉크 바탕 `#010102` + 흰 글자 · 색 추가 0(청록·파랑·빨강 역할 그대로) · 마크 `LX/OPS` · 레일 8(운영 현황 · **인프라 관제** · **기관·할당** · **배포 제어** · 카드 발행 · 데이터 관리 · 서비스 관리 · MY) — 셋은 `produce.html` 6탭(인프라 · 능동 운영 · 매칭 · 포털 생산 · 화면 요구 · 개발 관리)을 1급 화면으로 승격한 것이다(기능 1:1 · 구조 자유).

#### 5.9.1 운영 현황 `admin-home.html`
- 중앙 판 = 전국 배포 지도(MapLibre 잉크 스타일 · DEPLOYS 7점 · 상태색 · `actionsFor` high = 긴급 맥동 6s · 결재 핀) · 좌 결재 대기 3(실카운트 `pendingCounts()` + `lx_publish_v1` 대기 수) · 우 관리 네 축(개발 · 인프라 · 포털 · 화면 요구) 요약.
- 결정적 장면 A-2(승인 → 점 도착 · 반려 → 행 퇴장).

#### 5.9.2 인프라 관제 `admin-infra.html`(신설 · = produce `?tab=infra` 승격)
| 구역 | 내용 | 실측/추정 | 소스 |
|---|---|---|---|
| 노드 카드 | 현재 노드 1(Threadripper 3995WX 64C · 512GB) · GPU 카드 2(A6000 48GB #0/#1: 사용률 · 메모리 · 온도 · 전력 · 현재 작업) · **향후 노드 자리 2**(A100 80GB×4 각, `등록 대기` 점선) | 실측 6s 폴링 / 향후 = `준비 중` | `GET /api/infra/nodes` · `GET /api/infra/gpu`(nvidia-smi csv) |
| 작업 대기열 | 큐 상태(대기 · 실행 · 완료 · 실패) · 작업당 카드 · 모델 · 프레임 면적 · 타일 수 · 진행 · 기관 · 배정 GPU · 우선순위 · 취소/재시도 | 실측 | `GET /api/jobs?status=` · `POST /api/jobs/:id/{cancel,retry,priority}` |
| 모델 배치 | 어느 모델이 어느 GPU에 상주(warm)하는가 · VRAM 점유 · 언로드 | 실측 | `GET /api/infra/models` · `POST /api/infra/models/:id/{load,unload}` |
| 스토리지 | E: 여유 2,085GB / 사용 5.4TB · 타일 산출물 폴더 크기 · 기관별 격리 디렉터리 크기 · `CPL_TMPDIR` | 실측(`df` · `du` 캐시) | `GET /api/infra/storage` |
| 타일 트래픽 | 세트별 요청 수/일 · 대역폭 · 캐시 히트 | 실측(serve 로그) | `GET /api/infra/tiles` |
| 장애 경보 | GPU 온도/메모리 임계 · 워커 heartbeat 끊김 · 큐 정체(대기 > n분) · 디스크 < 10% · V-World 키 만료(E01 `EXPIRE_KEY` 실호출) | 실측 · 임계는 설정 | `GET /api/infra/alerts` · SSE `/api/infra/events` |
| 용량 계획 | 배포본 × 프로파일 × 카드 kind → 저장 · GPU·h · 트래픽 · 증설 시점(`infra.js capacityPlan` · `costOfNewRegion`) | **[추정]** 단가 출처 병기 | `infra.js`(클라이언트 계산) |

- 결정적 장면 A-1(§3.4). 인터랙션: 큐 행 → 노드 카드 리더선(S2) · GPU 링 값 40ms 현상 · 경보 = 빨강 글자만(법전 warn 자리) · 향후 노드 등록 = 폼(호스트 · GPU 수 · 모델 · 토큰) → `POST /api/infra/nodes`.

#### 5.9.3 기관·할당 `admin-tenants.html`(신설 · = 사용자 관리 '기관' 패싯 + produce 포털 생산 승격)
- 좌 기관 목록(TENANTS: 남원 · 광주전남 · +해외) · 우 열람 판: **쿼터 링 4**(저장 GB · GPU·h/월 · 분석 면적 km²/년 · 동시 작업 수) — 사용량 실측(`/api/tenants/:id/usage`) vs 할당(`PUT /api/tenants/:id/quota`) · 초과 정책(대기 · 차단 · 알림) · **데이터 격리 표시**(기관 디렉터리 `data/tenants/<id>/` · 결과 GeoJSON/타일 접근 토큰 · "LX 원본 보관 · 타일만 공유" 등급) · 배포본 목록 · 포털 CI 라이브 미리보기(`cssVars` · `brandGuard`) · 화면 요구(REQUESTS) 타임라인.
- 결정적 장면 T-1 "쿼터를 돌리면 링이 따라온다": 할당 슬라이더를 끌면 링의 여유 구간이 500ms로 자라고, 초과 예상 월이 `[추정]` 점선 고스트로 뜬다.

#### 5.9.4 배포 제어 `admin-deploys.html`(신설 · = produce 매칭·능동 운영·개발 관리 승격)
- **카드 × 기관 매트릭스**(행 = CARDS 9 · 열 = TENANTS): 셀 = 배포본 상태(운영 · 구축 · 예정 · 없음) + 버전 칩.
- 셀 열람 판: **버전 고정**(카드 v · 모델 v · `VERSION_RULE` major/minor/patch → `updateState` 요구 행) · **단계 배포**(canary: 기관 1곳 먼저 → 관찰 기간 → 전체) · **롤백**(이전 버전 한 클릭 · 결과 층 원복) · **모듈 on/off**(공통 7 잠금 · 전용 n 토글 · `needsOf` 장치 미리보기) · **모델 교체**(models.js 후보 · mAP 실측 비교 B01/D04) · **GPU 배치**(노드/GPU 지정 · 우선순위) · **승인 흐름**(직원 요청 → 관리자 승인 → 기관 확인) · **계보**(S2: 모델 → 카드 → 배포본 → 기관, 호버 시 IoU · 모듈 수 · 배포 상태 실측).
- 능동 운영 판: 신뢰도 × IoU 산점 + `THRESHOLDS`(0.60 · 0.70 · 365일 · 100건) 기준선 · `actionsFor` 판정 라벨 · 능동 비율(≤100%).
- API: `GET /api/deploys` · `POST /api/deploys/:id/{pin,rollout,rollback,modules,model,gpu}` · `GET /api/deploys/:id/lineage`.
- 결정적 장면 R-1 "롤백이 지도에서 보인다": 롤백을 누르면 그 기관 배포 지도 점이 앰버 380ms → 이전 버전 색으로 정착하고, 계보 띠가 한 칸 되돌아간다.

#### 5.9.5 카드 발행 관리 · 서비스 관리 · 데이터 관리(공유) · MY — 인벤토리 §8 · §9 · §10 원본 기능 그대로, 잉크 반전 골격. 검토 데스크 승인 = 증거판 `frame` 1250 → 청록 폴리곤 숨 한 번 + 앰버 380 → 카드 clip-path 1s 현상 → '진열대에서 보기 ›' '기관 홈에 놓기 ›' + 기관 카드 덱 미리보기(`deck-card.js` 부품).

### 5.10 ④ 기관 포털(남원 GeoVision · 광주전남 AI) — 생성기 산출

- 골격 한 벌(레일 72 · 마스트 64 · 카드 덱 · 작업공간 5탭 · 지도 · 보고서 서식 · 로그인 · 서비스 지원 · MY) + CI 한 벌(`CI_KEYS` 9). `LOCKED` 유지.
- 카드 덱 얼굴 = 정적 미니맵(결과 청록 · 호버 4px + 1단 줌) · KPI 밴드 → 덱 필터 · 운영-결과없음 = 사유 한 줄(Q2).
- 작업공간 지도 탭 = XI맵 기관 모드(§4.3) · 분석 결과 탭 = 결과 줄 → `__fly` + 락온 + 크롭 · 현황 = 읍면동 무채 헤어라인 + 히트맵(여수 grid100 4단 파랑) · 드론 플레이어 = 국산리 2비행 스크럽(A09) · 오류 신고 → `contact?svc=&fid=&pnu=`.
- **결정적 장면 P-1 · P-2**(§3.1). Craft 게이트 "기관이 자기 것으로 믿는 사이트인가".
- 파일: `tools/gen/portal-gen.mjs` · `assets/data/{portal,brand,studio}.js` · `portal-ui.js` · `portal.css` · 산출 `portal-<tenant>.html` · `portal-dp-*.html` · `portal-support-<t>.html` · `portal-my-<t>.html`.
- 실데이터 충분: nw-farm-25(A01 · A02 · A03 · B01 · B09 · C09) · nw-change(A04) · gj-marine-25(A06 · A07 · B13). 결손 정직: nw-road-26(좌표 없음 → 갤러리·모델 카드만) · nw-crowd-27(`예시` 또는 제외) · nw-living-23(B11 EXIF 확인 후 포인트).

### 5.11 ⑤ Land-XI Global — 글로벌 에디션

- **생성기 확장 3축**: `locale`(ko · en · ru — 마스트 · 탭 · 단위 · 날짜) · `crs`(EPSG:4326 표기 · 면적 ha/km²) · `ladder`(GIBS → EOX → PC S2 → Maxar). 골격·타이포·간격은 `LOCKED` 그대로(Paperlogy는 라틴 글리프 확인 · 키릴은 Pretendard 대체 여부 검증 필요 — 미결).
- **테넌트 후보**(global-map §2 실사업): `kgz-agri`(키르기스 농업부 · 으슥아타 시범 · L2) · `kgz-land`(토지자원청 · 비슈케크·으슥아타·소쿨룩 연속지적 시범 · L1). 두 기관은 `portal.js TENANTS`에 `scope:'global'`로 등록.
- **글로브 첫 화면**: GIBS `VIIRS_NOAA20_CorrectedReflectance_TrueColor` 어제 날짜(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`) · Natural Earth 국경(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json`) 위 **LX 사업국 38+1 채색**(내부자료 목록 · ISO3) · USGS 지진(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` 1분) · GIBS 화재 · EMS 최신 활성화(사전 수집 JSON).
- **사다리**: z0–5 GIBS · z5–9 EOX `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg`(비상업 · 수출 배포본은 2017판/GIBS) · z9–14 PC 월별 모자이크 `…/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=visual…` + WorldCover(PC item 타일) + NDVI(`expression=(B08-B04)/(B08+B04)&asset_as_band=true&colormap_name=rdylgn`) · z14–17 PC 장면 / Maxar(재해).
- **카드 2**: `card-global-farm`(시나리오 A · 으슥아타 · WorldCover 실측 비율 농경지 33.0% · 107장면 월별 NDVI) · `card-global-disaster`(시나리오 C · 미얀마 EMSR798 AOI11 · EMS 점 38 · Maxar 전후). 작물 분류는 `gap: AI 과업 · 학습데이터 필요`.
- **전처리(빌드 1회)**: `kgz-adm2.geojson`(geoBoundaries LFS 실파일 URL) · `ysykata-landcover.json` · `ysykata-ndvi-2025.json`(PC statistics 캐시) · `mm-meiktila-damage.geojson`(EMS ZIP → Overture 공간조인) · Maxar COG → XYZ z12–18(선택). CORS 없는 소스(FIRMS · EMS API · MS buildings)는 크론 수집 → 정적.
- **결정적 장면 K-1 · K-2**(§3.5).
- 파일: `tools/gen/portal-gen.mjs`(locale · ladder) · `landxi/proto/js/sources.js`(글로벌 URL 빌더 · Overture 릴리스 날짜 1곳) · `assets/data/geo/global/*` · `assets/data/i18n/{ko,en,ru}.json`.

---

## 6. 백엔드 계약 — 제품이 요구하는 API(인프라 패널과 접점)

원칙: 브라우저는 **정적 사이트 + 얇은 API**. 무거운 일(타일 · 추론 · 학습)은 작업 큐와 GPU 워커가 한다. 현 PC(A6000×2)에서 시작해 A100×4 서버 2대(8장)로 **노드 추가만으로** 늘어난다.

```
[브라우저]  MapLibre 5.6.0 + deck.gl 9.3.10(vendor) + pmtiles 4.x
     │ HTTPS
[API 게이트웨이]  tools/server/index.mjs (Node 22, 현 serve.mjs 확장)
     ├ /tiles/{set}/{z}/{x}/{y}.webp · /pmtiles/*.pmtiles (Range 206)      ← 정적 · 기관 토큰 검사
     ├ /api/vworld/*   V-World 프록시 + 디스크 캐시(E01 키 서버 보관)
     ├ /api/label/*    AXIS-Label(D10 FastAPI) 프록시
     ├ /api/jobs       작업 큐(SQLite → Redis/RQ로 승격 가능) · SSE /api/jobs/:id/events
     ├ /api/infra/*    nvidia-smi · df · 큐 · heartbeat 집계
     ├ /api/tenants/*  쿼터 · 사용량 · 격리 디렉터리
     └ /api/deploys/*  cards.js DEPLOYS 오버레이 정본(JSON 파일 → DB)
[워커 노드 n]  tools/worker/infer_worker.py (conda gcs: GDAL 3.12.4 · rasterio · torch cu118 · ultralytics)
     heartbeat 5s → 작업 pull → 프레임 ∩ 영상 → 512px 타일 추론(infer_orthomosaic.ipynb 응용) → 폴리곤 청크 push → 완료 시 GeoJSON/PMTiles 저장(data/tenants/<id>/results/)
[타일 파이프라인]  tools/prepare-assets.py (VRT → XYZ WebP z10–22 · ogr2ogr -f PMTiles · DSM → terrarium)
```

### 6.1 작업(Job) 계약
```jsonc
POST /api/jobs
{ "cardId":"card-farm", "modelId":"yolo11x-seg-vinyl-house", "deployId":"dp-nw-farm-25",
  "tenant":"namwon", "frame":{ "type":"Polygon", "coordinates":[...] },
  "imagery":"namwon_2506", "priority":"normal", "demo":false }
→ 202 { "jobId":"j_2026092401", "tiles":1024, "estGpuH":0.31, "estNote":"[추정] 0.9 GPU·h/km²" }

GET /api/jobs/:id/events  (SSE)
event: tile     data: {"z":18,"x":223421,"y":103211,"done":214,"total":1024,"gpu":"A6000#0","ms":41200}
event: features data: {"type":"FeatureCollection","features":[...청크 50건...]}
event: done     data: {"resultId":"r_...","count":1674,"url":"/api/results/r_....geojson","pmtiles":"/pmtiles/r_....pmtiles"}
```
- `demo:true`(영업 · 워커 없음) = 서버가 저장된 실측 결과(results.js)를 같은 이벤트 형식으로 재생 · 세션에 남기지 않음 · 화면은 `시연 실행` 꼬리표.
- 기관 격리: `tenant`가 세션과 다르면 403 · 결과 저장 경로와 타일 토큰이 기관별.

### 6.2 인프라 계약
```
GET /api/infra/gpu     → [{ "node":"tr64", "idx":0, "name":"RTX A6000", "memUsedMB":23450, "memTotalMB":49140, "util":37, "tempC":61, "powerW":142, "job":"j_..." }, ...]
GET /api/infra/nodes   → [{ "id":"tr64", "cpu":"3995WX 64C", "ramGB":512, "gpus":2, "state":"online", "heartbeat":"<ISO>" }, { "id":"a100-1", "state":"planned", "gpus":4 }, ...]
GET /api/infra/storage → { "volumes":[{ "mount":"E:", "freeGB":2085, "usedGB":5400 }], "tenants":{ "namwon":{ "GB":12.4 } } }
GET /api/infra/alerts  → [{ "level":"warn", "kind":"vworld-key", "msg":"EXPIRE_KEY", "since":"2026-09-24" }]
GET /api/tenants/:id/usage → { "storageGB":12.4, "gpuHMonth":3.1, "areaKm2Year":41, "concurrent":1, "quota":{...} }
```

### 6.3 전처리 작업 목록(ASSET-LEDGER §5.3 P1–P12 채택 + 추가)
P1 PMTiles 패키징 · P2 `map-gl.js` 엔진화 · P3 2023 25cm 남원 도엽 XYZ(C01) · P4 남원 전역 4클래스 추론(C09) · P5 토지피복 GT 모자이크(B09) · P6 모델 카드 자산(B01) · P7 OBB EXIF(B11) · P8 남원 필지 PMTiles(C04) · P9 V-World 프록시(E01) · P10 읍면동 집계 JSON · P11 지형 z14–15 미러(E02) · P12 vendoring. **추가**: P13 B04 익산 정사 COG→XYZ + 라벨 픽셀→4326(라벨링 실동작) · P14 B03 본사 정사 XYZ + DSM terrarium(로그인 얼굴판 · 3D 후보) · P15 글로벌 정적 캐시(§5.11) · P16 `infer_worker.py` + SQLite 큐 · P17 `nvidia-smi` 폴러.

---

## 7. 디자인 법전 개정 — 무엇을 지키고 무엇을 바꾸는가(근거 포함)

사용자 판정(8차): "법전의 인쇄물식 제약(그림자·깊이·모션 1개 금지)이 WebGL 감각을 구조적으로 막았다." 그러나 사용자가 과거 확정·선호한 것은 존중한다. `design/system.md` v2 제안:

| 항목 | 현행 | 제안 | 근거 |
|---|---|---|---|
| 서체 Paperlogy 700/800 + Pretendard + Inter 숫자 · 바닥 14px | 유지 | **유지** | 사용자 확정(8/27 T3) |
| 흰 바탕 90/8/2 · 잉크 · 액센트 #006DF7 · 틴트 2단 | 유지 | **유지**(LX 워크벤치 · 포털) · 관리자만 명도 반전(Q3) | 사용자 확정 · B안 에디토리얼 아틀라스 |
| 청록 = AI 결과 · 앰버 = 탐지 순간 380ms · 빨강 = 조치 글자만 | 유지 | **유지** — 색 역할 한 줄은 플랫폼 문법의 뼈대 | 색 역할이 곧 S1 도착 문법 |
| 라운드 0 | 유지 | **유지**(에디토리얼 · 브래킷) | Vantor · 인쇄 아틀라스 레퍼런스 |
| **그림자 0** | 전면 금지 | **개정: 지도 위에 떠 있는 판(plate)에 한해 1단 깊이 허용** — `0 24px 64px -32px rgba(1,1,2,.28)` 하나, 그 외 0 | 지도 캔버스 위 흰 판이 그림자 없이 놓이면 판과 지도가 한 평면으로 붙어 "지도 위 대장"이 아니라 "지도 옆 표"로 읽힌다(4차·7차 피드백). kepler.gl · Vantor 지도 UI 모두 판 1단 깊이 |
| **유리(backdrop-filter) 0** | 전면 금지 | **개정: 지도 위 판·HUD에 한해 `backdrop-filter: blur(12px)` + 흰 88%** 허용 · 문서 화면(표 · 폼)은 금지 | 사용자 초기 확정 방향이 "밝은 지도 바탕 + **흰 유리 패널**"(8/25). 법전이 이를 지운 것이 WebGL 감각 손실의 한 원인. 지형 위 판이 스크롤될 때 아래 영상이 비쳐야 '지도가 주체'로 읽힌다 |
| 그라디언트 0 | 전면 금지 | **부분 개정: 데이터 램프(범례 · 히트맵 · NDVI 색상표)만 허용** — 장식 그라디언트는 금지 | 색상표 없는 히트맵·NDVI는 존재할 수 없다(A07 · WorldCover · rdylgn) |
| **유휴 모션 화면당 1개 ≥ 6s** | 전면 | **개정: 지도 화면은 "데이터에 묶인 살아 있는 층"을 층 수만큼 허용**(타일 페이드 500 · 스캔 스윕 · 긴급 맥동 · 스크럽 재생 · 실측 게이지 갱신) · 장식 모션은 여전히 0 · 문서 화면은 1개 유지 | S1·S3·S5·A-1은 모두 실데이터에 묶인 시간 축 품질이며 "1개"로는 살아 있는 지도가 불가능(C-35 · C-36). 판정 기준을 "장식이냐 데이터냐"로 바꾼다 |
| 이징 하나 · 지속 500/750/1000/1250 · 호버 180 · 락온 380 · 숫자 40 · 스태거 60 | 유지 | **유지 + 타일 페이드 500 · 재생 주기 6,000 명시** | E0-S 스파이크가 이 사다리로만 합격 |
| 지형·3D 보류(D22) | 보류 | **개정: V7 '지형·입체' 1개 모드 · 기본 OFF · pitch ≤ 45 · 장면 단위** — Q9 재상정을 지금 답한다 | 사용자 8/25 핵심 서사 "결과가 입체로 겹친다" · 4090 96fps 실측 · SwiftShader 절벽은 티어 강등으로 |
| 명명 레이아웃 5종(PLATE-FULL · SPLIT-5050 · LEDGER · EVIDENCE-PAIR · CHIP-RAIL) | 유지 | **유지 + `PLATE-HUD`(지도 위 계기) 1종 추가** | XI맵 · 관제가 요구 |
| 아이콘 헤어라인 세트 · 브래킷 12px | 유지 | **유지** | 7차 피드백 장치 |
| 3-비평가 게이트 | 스크린샷 | **개정: Craft 입력 = 영상 클립 + 프레임 스트립 + 세 사용자 관점 체크(§1)** | 사용자 "판정은 동작 영상" |

관리자 사이트 명도 반전 시 색 규칙: 바탕 `#010102` · 글자 `#FFFFFF` · 헤어라인 `#2A2A2E` · 틴트 = 잉크 위 흰 6% · 액센트·청록·앰버·빨강 그대로(잉크 위 대비 4.5 통과 확인 필요 — 빨강 `#D1352B`는 잉크 위 4.0 미달 가능 → `#FF6B5E`로 반전 전용 1값 허용, 근거 KWCAG).

---

## 8. 콘티 원칙 — 표기 규칙(전 화면 공통 `prov()` 부품)

| 꼬리표 | 언제 | 예 |
|---|---|---|
| `실측` | 파일·API에서 온 값 | `2,098 필지 · 기준 2026.06.08 · results/namwon-farmland-2025.geojson` |
| `시연` | 저장된 실측을 재생하거나 시계(`flow.js`)로 흐르는 것 | `시연 실행 · 저장 결과 재생` · `시연 · 이 브라우저에 저장` |
| `[추정]` | 단가 계산 · 높이 추정 · 용량 예측 | `[추정] 0.31 GPU·h · 0.9 GPU·h/km² 남원 실측 단가` · `height_m [추정]` |
| `준비 중 · 이유` | 자산 없음 · 키 만료 · 대상국 미정 | `준비 중 · 도로 결과 좌표 없음` · `준비 중 · V-World 키 재발급 대기` |

금지: 담당자명 · 대기 일수 · 활동 기록 · KPI 추세('7일 방문') · 운영 리포트 서사. 글로벌 수치는 API 응답만(WorldCover 비율 · NDVI · EMS 점 수).

---

## 9. 실행 순서 — 한 화면을 운영 수준으로 끝까지, 영상으로 판정, 확산

사용자 교훈(8차): "감사 → 화면별 버그수정 팬아웃은 '고친 목업'만 낳는다. 한 화면을 운영 수준으로 먼저 끝까지 만들어 영상으로 판정받고 확산." 따라서 MASTER-PLAN Wave 체계는 유지하되 **수직 조각을 앞세운다**.

| 단계 | 내용 | 산출 · 판정 | 기간[추정] |
|---|---|---|---|
| **V0 XI맵 남원 운영판** | E0-S 스파이크(S1·S3·S6 실측 합격)를 제품 `ximap.html`로 이식 + V1 사다리(P3 C01 25cm · A03 · A01) + V2 프레임 + V8 필지 카드(P8 C04) + 시연 실행(SSE 재생) + §7 법전 개정 4항(판 깊이 · 유리 · 데이터 모션 · 타일 페이드) | 12s 영상 + 프레임 스트립 → 세 사용자 체크 → `SendUserFile` | 5–7일 |
| **V1 실추론 조각** | `infer_worker.py`(gcs) + SQLite 큐 + SSE · B05 차량 OBB × B04 익산(P13) 실추론 · `admin-infra.html` nvidia-smi 실측 게이지 | "프레임 → GPU → 도착" 영상 · 관제 게이지 영상 | 5–7일 |
| **V2 기관 포털 남원 farm-25** | XI맵 기관 모드 착지 · 카드 덱 · 5탭 · P-1/P-2 · 로그인 얼굴판 | 공무원 관점 영상 | 4–5일 |
| **V3 게스트 인계 + 공개 모드** | 필름 → XI맵 `public=1` 카메라 인계(S4) · A05 · A07 | 시민 관점 영상 | 4–5일 |
| **V4 관제 3화면** | 기관·할당 · 배포 제어 · 운영 현황 지도 · 결재 = 장면 | 관리자 관점 영상 | 7–10일 |
| **V5 글로벌 에디션** | 생성기 3축 · KGZ 테넌트 2 · 카드 2 실API · 미얀마 스와이프 | 해외 기관 관점 영상(en) | 7–10일 |
| **W 확산** | MASTER-PLAN Wave 1–3 나머지(프로젝트 라벨링 실백엔드 · 데이터 관리 판 · 서비스 지원 · 반응형 · 폐쇄망 · 접근성) | 인벤토리 대조 결손 0 · 골든 패스 녹화 | 4–6주 |

각 단계는 **자기 e2e 스펙 + 영상 + 세 사용자 체크**를 소유하고, 소유 파일 밖 수정 0(MASTER-PLAN §3 충돌 규칙). 영상 생성 API는 어느 단계에서도 호출하지 않는다(Q6).

---

## 10. 리스크 · 미결(사용자 결정 필요)

| # | 항목 | 추천 |
|---|---|---|
| U1 | 법전 개정 4항(판 깊이 · 유리 · 데이터 모션 · 램프)을 채택하는가 | 채택 — V0 영상으로 전후 비교 제출 후 확정 |
| U2 | V7 지형·입체 재상정(Q9)을 V0에 넣는가 | V0는 2D로 합격 먼저 · V1에서 `fill-extrusion` 1모드 스파이크 |
| U3 | V-World 키 재발급(E01) — 필지 카드를 C04 PMTiles로 먼저 가는가 | C04 먼저(키 없이 가능) · 키 오면 GetFeature 덧댐 |
| U4 | 글로벌 배경 라이선스 — EOX 2018+ 비상업 | 공공 시연 = 2025판 · 수출 배포본 = 2017판/GIBS/PC(자동 전환 `portable:true`) |
| U5 | 키릴 서체 — Paperlogy/Pretendard 커버리지 | 검증 후 미달 시 Pretendard JP/Inter 라틴·키릴 폴백 1줄 예외 |
| U6 | 관리자 반전 빨강 대비 | `#FF6B5E` 반전 전용 1값 |
| U7 | 인파관리(crowd-27) 실데이터 0 | 카드 유지 · `준비 중 · 드론 영상 없음` · 포털 덱 사유 한 줄 |
| U8 | 워커 큐 기술(SQLite → Redis/RQ) | 현 PC는 SQLite 파일 큐 · A100 노드 붙일 때 Redis — 계약(§6.1)은 동일 |
| U9 | AXIS-Label 프록시(D10)가 포트 80·443 점유(cleanriver Docker)와 충돌 | 4173 게이트웨이 뒤 8001로 |

---

## 부록 A. 화면 × 결정적 장면 × 자산 한 표

| 화면 | 장면 ID | 한 줄 | 자산 ID / URL |
|---|---|---|---|
| 게스트 필름 → XI맵 | G-1 | 필름 마지막 프레임 = 지도 첫 프레임(점프 0) | 필름 레그 · `lx_cam` |
| XI맵 공개 | G-2 | 전국 하천 벡터타일 + 하천 점유 단계구분도 | A05 · B02 · A11 |
| 포털 지도 | P-1 | 시 전역 → 1cm 하강 3단 배경 전환 + 스캔 도착 | A03 · C01 · A01 · A02 |
| 포털 필지 | P-2 | 필지 클릭 → PNU·지목·공시지가 + 4시점 크롭 | C04 · A12 · E01 |
| 프로젝트 분석/XI맵 | S-1 | 프레임 → GPU 타일 추론 → SSE 도착(실측 진행률) | B05 · B04 · B03 |
| 프로젝트 학습 | S-2 | results.csv 실곡선 + PR/F1/혼동행렬 | B01 · D04 |
| 관제 인프라 | A-1 | nvidia-smi 6s 실측 게이지 · 큐 → 노드 리더선 | env.md · `/api/infra/gpu` |
| 관제 운영 현황 | A-2 | 승인 → 배포 지도 점 도착 · 반려 → 행 퇴장 | cards.js DEPLOYS |
| 관제 기관·할당 | T-1 | 쿼터 슬라이더 → 링 500ms · 초과 월 [추정] | infra.js · `/api/tenants` |
| 관제 배포 제어 | R-1 | 롤백 → 지도 점 앰버 380 → 이전 버전 정착 · 계보 한 칸 되감김 | registry.js VERSION_RULE |
| 글로벌 농지 | K-1 | 월별 S2 모자이크 스크럽 + 농지 NDVI 곡선(107장면) | PC STAC/mosaic · WorldCover · geoBoundaries KGZ |
| 글로벌 재해 | K-2 | Maxar 전후 스와이프 + EMS 피해 점 → Overture 건물 등급 | EMSR798 · Maxar Open Data · Overture PMTiles |
| 대시보드 | D-1 | 양산 라인 네 띠 · 학습 meter 흐름 · 배포 셀 점등 | cards.js · registry.js · flow.js |
| 데이터 관리 | M-1 | 발행 4/4가 판 위에서(실타일 fade-in → 청록 도착) | A01~A10 · B07 · C01 |
| 로그인 | L-1 | 얼굴판 실결과 미니맵 6s 패닝 · 관제 요약 한 줄 | A01 · A02 · `/api/infra` |

## 부록 B. 신설·격상 파일 목록

```
landxi/proto/map-ladder.js      줌 사다리(국내·글로벌 소스 표 · 전환 HUD)
landxi/proto/map-frame.js       프레임 도구 3종 · 면적/타일/GPU·h [추정] · URL frame=
landxi/proto/map-run.js         POST /api/jobs · SSE 수신 · 진행률 → arrive 스윕
landxi/proto/arrive.js          S1 부품(E0-S ximap-signature.js:285 분리)
landxi/proto/timescrub.js       S3 부품(setEpoch 두 층 · 재생 6s · 750 정지)
landxi/proto/lineage.js         S2 계보 띠
landxi/proto/provenance.js      S5 prov() 꼬리표 4종 + 프로비넌스 카드
landxi/proto/flow.js            S7 시연 시계 · transit
landxi/proto/js/camera.js       S4 lx_cam 규약
landxi/proto/admin-infra.{html,js,css}     인프라 관제(= produce ?tab=infra 승격)
landxi/proto/admin-tenants.{html,js}       기관·할당
landxi/proto/admin-deploys.{html,js}       배포 제어(매칭·능동 운영·개발 관리 승격)
landxi/proto/admin-login.{html,js}         관제 전용 입구
landxi/assets/data/geo/global/*            kgz-adm2 · ysykata-* · mm-meiktila-damage
landxi/assets/data/i18n/{ko,en,ru}.json
landxi/assets/models/namwon/*              B01 결과 곡선 · 이미지(P6)
tools/server/index.mjs · routes/{jobs,infra,tenants,deploys,vworld,label}.mjs
tools/worker/infer_worker.py · tools/worker/gpu_poll.py
tools/gen/portal-gen.mjs                   locale · crs · ladder 3축
design/system.md                           v2 개정(§7)
tests/e2e/{proto-ximap-frame,proto-admin-infra,proto-global}.spec.mjs · motion-law.spec.mjs
```
