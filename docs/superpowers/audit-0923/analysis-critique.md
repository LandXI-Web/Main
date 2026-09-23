# 비평 — 분석 서비스 · 발행 카드 목록 (영역키 `analysis`)

- 비평자: Fable(수석 플랫폼 기획 · UI/UX 디렉터) · 2026-09-23 · 읽기 전용(소스 수정 0)
- **복원 문서(2026-09-24)**: 원 비평 에이전트는 이 파일을 쓰지 못했다(하네스 거부 — 저널 `wf_ce82e913-c2e` `critique:analysis` result 줄 "NOT WRITTEN"). 이 문서는 그 구조화 결과(verdict · ux_problems · interactive_proposals · must_fix_first)를 원 에이전트가 남긴 문서 골격(§0 한 줄 판정 / §1 무엇으로 읽히나 / §2 UX 문제 / §3 놓친 자산 / §4 제안 A1–A11 / §5 가장 먼저 고칠 것 / §6 발주자 확인 / 부록 A 보강 실측) 그대로 옮긴 것이다. 문장은 원문이고 순서만 골격에 맞췄다.
- 근거: 실측 감사 `audit-0923/analysis.md`(완성도 68 % · 몰입감 3/10), 스크린샷 97장, 소스(`analysis.js` `analysis-cards.js` `analysis-run.js` `analysis-data.js` `analysis-kind.js` `analysis-map.js` `publish-cards.js` `publish-card-edit.js` `download.js` `map-gl.js` `roles.js` `cards.js` `results.js` `imagery.js` `change.js` `registry.js`), 9/20 스펙 4종, 원본 인벤토리 §7 · §8, 법전 `design/system.md`
- 보강 실측(`shots/audit-0923/analysis/c1-tiles.mjs` → `c1.json` · `c1-*.png`): 완료 + 실행 탭 전 구간 `assets/tiles/**` 요청 **0건** · V-World 185건 · grid100 0건 · pageerror `ReferenceError: downloadGeoJSON is not defined` · 여수 장치 2종 '원천 대기'. 타일 실존 확인: `GET /landxi/assets/tiles/namwon_2506/14/13987/*.webp` → 200(878 B), 디스크 `landxi/assets/tiles` 63 MB · 10세트.

---

## 0. 한 줄 판정

지금 분석 서비스는 **"잘 정리된 분석 업무 관리 화면"** 으로 읽힌다 — 카탈로그(진열대) · 주문서(실행 폼) · 대장(실행중 · 완료) · 표(필지). 콘솔 오류 0, 법전 위반 0, 원본 기능 1:1, 레지스트리만 읽는 구조(R5)까지 업무 시스템으로는 흠이 적다. 그런데 **AI 가 실제 영상을 읽어 결과를 내는 장면이 한 컷도 없다.** 실행의 클라이맥스는 파란 막대 모달이고, 결과는 V-World 위성 위 청록 점이며, 새로 실행한 분석은 '산출물 없음' 으로 끝난다.

가장 뼈아픈 사실: 저장소에 남원 4시점(2504 · 2506 · 2508 · 2510) · 국산리 2 · 제주 3 드론·항공 정사영상 타일 63 MB, 변화 지수 타일(`namwon_change_2504_2510`), 여수 해양쓰레기 100 m 격자 GeoJSON 2종이 이미 있는데 **이 화면은 그 가운데 한 장도 요청하지 않는다**(`c1.json tileReqsTotal:0`). '정사영상' 토글은 V-World 지명 레이어를 켠다(`analysis-run.js:443 setHybrid`). XI맵은 같은 타일을 `map-gl.js setEpoch()` 로 이미 띄운다. 즉 문제는 "기능이 없다" 가 아니라 **"있는 자산과 있는 부품을 이 화면이 쓰지 않는다"** 이다.

- 완성도 **68 %**(동의 — 다운로드 P0 · 역할 누수 P1 · 결과 없는 실행 P1 이 닫히면 80 % 선)
- 몰입감 **3/10**(동의 — 사용자가 거부한 '딱딱한 업무 시스템 목업' 문법 그대로. 단 뼈대가 좋아 `analysis-map.js` 한 부품만 살려도 6–7 까지 오를 구조)
- 지난 감사 대조: A1m · P2m · A2m · A3m · A6m 해결, A4m 대부분 해결(편집은 표시만), C7 기준일 3종 미해소.

## 1. 탭별 — 무엇으로 읽히나

| 탭 · 화면 | 지금 읽히는 것 | 되어야 할 것 |
|---|---|---|
| 서비스(진열대) | 상품 카탈로그의 목차 — 88 px 흐린 크롭 + 글자 세 줄, 카드 7장 중 결과 크롭 2장. 카드를 골라도 결과가 지도에 서지 않는다(`01-shelf-1440.png`) | 'AI 서비스 한 벌' 의 얼굴 — 첫 실측 결과 미니 지도 |
| 분석 실행 | 주문서 — 3단 픽커 + 청록 사각형 범위 | AI 가 읽을 영상이 판에 깔린 준비 화면 |
| 실행중 | 멈춘 대장 — '처리 중' + 정지 막대 | 살아 있는 대기열(양산 라인) |
| 완료 | 결과가 '놓여 있을 뿐 도착하지 않는다' — `frame(..., {instant:true})`(`:468`), 큰 숫자 · 막대 · 히스토그램 한 번에 찍힘 | 결과가 판독한 영상 위에 **도착**한다(S1) |
| ai-card · ai-card-edit | 다른 대장(모델 8장) + 원본 폼 | 진열대와 같은 대장 + 스펙 필드 |

## 2. UX 문제 — 심각도 순

- **[P0] 다운로드가 죽어 있다(F1)**: `analysis-run.js:599,601` 이 `downloadGeoJSON`/`downloadNote` 를 부르는데 `:7-15` import 에 `./download.js` 가 없다. `ReferenceError` 재현(`c1.json`). 모듈은 있다(`download.js:23-52`, `support.js` 는 잘 쓴다). 영업용 계정의 유일한 권한(export)이 이 버튼이다.
- **[P1] 영업용 계정이 실행·편집·취소·이식을 할 수 있다(F2)**: `roles.js` sales caps=`['export']` 인데 화면은 `allowed('edit')` 하나를 공유·삭제에만 건다(`:587-590`). 분석 실행(`analysis-cards.js:279`, `analysis-run.js:157`) · 결과 편집(`:435`) · 취소(`:307`) · 다른 지역에 이식(`analysis-cards.js:270`)은 검사 없이 선다. 관문이 메뉴를 막아도 화면 안 caps 가 안 닫혔다. 영업 실행 결정(Q4) 전 정본은 caps — 세우지 않는 것이 맞다.
- **[P1] 분석을 실행해도 결과가 없다(F3)**: `startRun` 이 `resultId:null` 로 실행을 만든다(`:189`). 같은 카드·영상의 실측 결과(`results.js` 4건)가 있는데 연결하지 않아 완료 탭은 '산출물 없음'. '분석 결과 보기'(`:212`)는 `tab=running` 으로 보내 완료된 실행이 목록에 없고 첫 시드(주천면 72 %)가 대신 열린다 — '내가 돌린 것이 어디 갔나'.
- **[P1] 실행중 판이 정지 화면이다(F4)**: `run-green-2604 pct:72` 고정(`analysis-data.js:73`), 6.5초 변화 0. `startRun` 엔 380 ms 타이머가 있는데 시드엔 없다. '처리 중' 상태어 + 멈춘 막대 = 고장의 문법. 법전 §4 유휴 규칙(화면당 움직이는 요소 1개 · 실데이터 · 주기 ≥ 6 s)이 딱 이 자리다.
- **[P1] 편집이 표시만 한다(F5)**: '이동' 도구로 도형이 안 움직이고 지도 클릭 선택도 없다(`map.on('click')` · `queryRenderedFeatures` 0). 저장은 `saveEdit(runId, moved.length, removed.length)` 건수만 남기고 `dedit` 를 버린다(`:447-451`). 2,097 → 저장 후 2,098 원복. LX 핵심 권한 '품질 책임(수정·삭제)'(two-tier §3)이 겉모양만 있다.
- **[P1] 발행 카드 대장이 둘이다(F6)**: `ai-card.html` = `publish-data.js` 8장(모델 단위), 진열대 = `cards.js` 9장(서비스 단위). platform-roles §4 '발행 카드 목록 = 분석 서비스 진열대' 위반. `ai-card-edit` 폼에 대상 사업 · 전용 모듈 · 이식 가능 필드 없음(`publish-*.js` scope/global/portable 0건). 마스트헤드 기준일도 다르다(06.08 vs 08.27).
- **[P2] '정사영상' 버튼이 정사영상을 켜지 않는다(F7 + 보강)**: `data-layer=ortho` → `setHybrid()`(`:443`) = V-World 지명. 도구 상자 '지명 표시'(`:354,401`)와 같은 일을 하는 버튼이 이름만 다르게 둘. 실제 정사영상 타일(`imagery.js` 11세트 tiles)은 이 화면 어디서도 요청되지 않는다(`c1.json tileReqsTotal:0`). 줌 15.5 에서도 V-World 위성(`c1-done-zoomed.png`) — 1.69 cm 드론 영상으로 판독한 결과를 수 m 급 위성 위에 얹어 보여주는 셈.
- **[P2] 개발자 말투가 사용자 화면에 있다(F9)**: '화면은 카드 이름을 모른다 — 이 선언(kind)만 보고 장치를 켠다'(`analysis-cards.js:204`), '법정 조사 주기는 레지스트리에 없다'(`:190`), '원천 대기 — 이 카드의 선언이 켠 자리다'(`analysis-run.js:489`), '시드 실행 · 지도에 올릴 도형이 없다'(`:438`). 코드 주석이 화면으로 새어 나왔다.
- **[P2] 자리 값과 담당자명(F13 · F15 · F18)**: 이식 마법사 '광주전남특별시 29 · 12345 km²'(`registry.js:101-104`) 실측도 [추정]도 아님. '발행자 김○○ · 수정자 김○○' 는 법전 §5 담당자명 금지. 진행 모달 '처리 단위 336/1,200' 은 면적×1000 으로 만든 단위이고 뜻 설명 없음.
- **[P2] 기준일 3종(F14 · C7 잔존)**: 마스트헤드 2026.08.27(`analysis.js:47`) · 실행 대장 `AS_OF` 2026-06-08 · ai-card 2026.06.08. 셸 `AS_OF` 하나로(Q5 b).
- **[P2] 장치가 선언만 있다(F8)**: 종류 선언 5종 중 표 1종만 렌더러. 그런데 히트맵은 여수 결과 2건에 grid100 GeoJSON 이 실제로 있고(`results.js:275,364`), 타임라인은 남원 4시점 타일 + `change.js` 변화 지수 폴리곤·격자가 있다. '원천 대기' 가 아니라 '렌더러 대기' — 문구부터 사실과 다르다.
- **[P2] 반응형 붕괴(F11 · F12)**: 390 마스트헤드 공지·기준일 겹침 + 본문 빈 면 + 가로 넘침 137/562 px(`10-shelf-390.png`, `85-aicard-390.png`). 1280 표 헤더 '탐지 클래스'/'면적 m²' 겹침 + 잘린 글자 21곳(`64-done-1280.png`). 1440 에서도 13곳('3…' '경…') — 본번 44 px · 부번 40 px 컬럼이 좁다. 시연은 늘 노트북(1280)에서 한다.
- **[P2] 과제·영상 지역 불일치를 검사하지 않는다(F10)**: 여수 해양쓰레기 과제에 남원·국산리·제주 영상 11장 전부 선택 가능(`analysis-kind.js:21 ortho:()=>true`). `DEPLOYS.region` 과 `imagery.bounds` 가 다 있는데 맞춰 보지 않는다. '과제 변경 ›' 은 진열대로 돌아가는 링크일 뿐, 영농 카드 모델 4종 중 첫 번째만 쓴다(`analysis-run.js:29`).
- **[P3] 해양쓰레기 클래스명 영문 그대로(F16)**: styrofoam, buoy_bottle, other_debris 등 8종. 행정에 쓰는 결과가 영문 스네이크 케이스면 '개발 중' 으로 읽힌다.
- **[P3] 여수 결과 지도의 회보라 결손 사각형이 말없이 드러난다(F17)**. 법전 §5 '결손은 점선 무채 + 이유 한 줄' 이 지도에는 없다.
- **[구조] 진열대가 '상품 카탈로그의 목차' 로 읽힌다**: 88 px 흐린 크롭 + 글자 세 줄, 카드 7장 중 결과 크롭 2장. 카드를 골라도 화면 어디서도 결과가 지도에 서지 않는다(`01-shelf-1440.png`). 카드 = 'AI 서비스 한 벌' 인데 벌이 아니라 줄로 보인다.
- **[구조] 완료 탭의 결과가 '놓여 있을 뿐 도착하지 않는다'(strategy S1)**: `drawMap` 이 `frame(..., {instant:true})`(`:468`)로 이동 애니메이션을 꺼 두었고, 큰 숫자·막대·히스토그램은 한 번에 찍힌다. 법전 §4(숫자 글자별 40 ms 현상 · 텍스트 인 60 ms 스태거)가 이 화면에 적용되지 않았다.

## 3. 놓친 자산 — 있는데 쓰지 않는 것

| 자산 · 부품 | 어디 있나 | 이 화면이 쓰는가 | 쓰면 열리는 것 |
|---|---|---|---|
| 정사영상 타일 10세트 63 MB(남원 4시점 · 국산리 2 · 제주 3 · 남원 전역 2) | `landxi/assets/tiles/**` · `imagery.js` | **0건**(`c1.json`) | A1 결과가 판독한 영상 위에 선다 |
| `map-gl.js setEpoch()` · `swipe()` · `fit()` | XI맵이 이미 쓴다(`:121-128,265-269`) | 아니오(자체 `analysis-map.js`) | A1 · A5 |
| 여수 grid100 GeoJSON 2종 | `results.js:275,364` → `assets/data/geo/results/*-grid100.geojson` | **0건**(`gridReqs:0`) | A6 히트맵 |
| `change.js` 변화 지수 4시점 pair 3 + 폴리곤 · 격자 | `assets/data/change.js` · `geo/namwon-change*.geojson` | 아니오 | A6 타임라인(반드시 '변화 지수(비지도) · 학습 결과 아님') |
| `frame()` duration | `analysis-map.js:90` — 있는데 `instant:true` 로 꺼 둠 | 꺼 둠 | A3 도착 |
| `setPick()` 파랑 2 px · 흰 점선 | `analysis-map.js:81` | 표에서만 | A4 지도에서 고르기 |
| `CROPS` 결과 크롭 | `assets/data/crops.js` | 진열대 88 px 만 | A8 카드 얼굴 |
| `dive.html` `#swipe` 마크업 · `js/swipe.js` | 구 스파이크 | 아니오 | A5 |
| 클래스 한글 표(`map-data.js clsLabel`) | XI맵 | 아니오(F16) | 클래스 8종 한글 |

## 4. 인터랙티브 제안 A1–A11

의존: **A1 → A3 · A5 · A8**(A1 이 바탕) · **A2 는 결과 연결(must-fix 3) 선행** · Craft 게이트는 **A1 + A3 + A7** 세 개를 붙인 뒤 '재스킨 → 제품' 으로 넘어가는지 먼저 판정.

| # | 제안 | 무엇을 | 묶인 기능 | 왜 Geo-AI 인가 | 난이도 |
|---|---|---|---|---|---|
| **A1** | 결과가 판독한 영상 위에 선다 | 완료 탭 '정사영상' 토글을 `setHybrid` 에서 `imagery.js` 타일 레이어로(`map-gl.js setEpoch` 재사용, `run.imageryId → archiveById().tiles`). 기본값 ON, 결과 레이어 아래 · V-World 위에 bounds 로 잘라 깐다. 지명은 도구 상자 '지명 표시' 하나로 통일. 실행 탭 선택 범위 지도(`#run-plate`)도 청록 사각형 대신 그 영상 타일. 몰입감의 첫 단추이자 가장 싼 단추 — A3 · A5 · A8 의 바탕 | 완료 탭 정사영상/결과 토글(`analysis-run.js:433,443`) · `#run-plate drawPlate` · `analysis-map.js mountMap` · `map-gl.js setEpoch()` · `imagery.js tiles` | AI 는 이 영상을 읽었다. 1.69 cm 드론 영상 위 청록 경계가 곧 '판독의 증거' 다. 위성 위 점은 그 증거를 지운다 | M |
| **A2** | 실행 = 지도 위 스캔(진행 모달 대체) | `startRun` 380 ms 타이머 유지. 모달 대신 실행 탭 선택 범위 지도가 판이 된다(화면당 일탈 1회). 진행률에 맞춰 영상 위를 훑는 수평 스캔선(잉크 1 px + 틴트 띠) → 지나간 자리에서 결과 도형이 청록 점등, 점등 순간만 앰버 380 ms. 우 판 '실행 요약' → '진행' 판(단계 5 · 처리 단위 + 단위 설명 한 줄). 끝나면 '완료 탭에서 보기' 가 그 실행을 연다(`commit({tab:'done', run:id})`). 선행: must-fix 3 | `startRun(:183-236)` · `RUN_STEPS` · `#run-plate` · `setResult/setPick` · `commit()` | 'AI 가 읽는다' 를 보여주는 유일한 장면. 스캔 후 점등은 법전 §2 앰버 규칙(탐지 순간 380 ms)이 애초에 상정한 그림 | L |
| **A3** | 결과 도착(S1) | 완료 목록에서 실행을 고르면 지도가 `frame(..., {duration:1100})` 로 결과 범위까지 날아가고(지금 `instant:true`), 도착 직후 도형이 클래스 순서로 60 ms 스태거 점등, 우 판 큰 숫자 2,098 이 글자별 40 ms 현상. 실행중 → 완료로 넘어온 실행은 자동 선택 | `drawMap frame()(:468)` · `dp-nums` · `bars` · `hist(drawPanel)` | 결과가 '놓여 있는 것' 과 '도착하는 것' 의 차이가 플랫폼의 체감(strategy §4 S1) | S |
| **A4** | 지도에서 고르고 옮긴다(편집 실동작) | `res-fill` 에 `map.on('click')` + `queryRenderedFeatures` → 표 행 하이라이트 · 각진 팝업(클래스 · 면적 · 신뢰도 · PNU). 편집 모드: 클릭 = 선택(`setPick`), '이동' 도구에서 드래그 = 도형 좌표 평행 이동(`dfeat[i].geometry` 갱신 → `setResult` 재호출), '삭제' = 흰 점선. 저장은 `dfeat` 와 건수·면적을 실제로 갱신해 `saveEdit` 에 좌표 변화까지 남긴다. 우 판 2,097 이 저장 후에도 2,097 | 결과 편집 도구(`drawMapBar :427-452`) · `#dm-chg` · `saveEdit` · `setPick` · `bindParcel` | two-tier §3 '품질 책임 = LX'. 지도에서 고치는 손이 있어야 LX 가 판독의 주인으로 읽힌다 | L |
| **A5** | 시점 스와이프(S3 의 분석 서비스판) | A1 위에, 완료 탭 도구 상자에 '시점' 버튼. 남원 결과(2025.06 판독)에서 2504 → 2510 4시점을 하단 띠로, 끌어서 좌우 비교(`map-gl.js swipe()` + `map.css .mw[data-mode=overlay]` clip-path). 다른 시점을 고르면 결과 도형은 그대로 두고 바탕만 바뀐다 — '이 필지가 4월엔 비어 있었고 6월엔 경작지로 판독됐다' | XI맵 겹쳐보기(`map.js MODES overlay` · `map-gl.js swipe():265`) · `EPOCHS` 띠(`map.js:457`) · `imagery.js` 남원 4시점 · `dive.html #swipe` | 국토는 시간이 있는 대상이다. 시점 없는 결과는 사진이지 조사가 아니다 | M |
| **A6** | 장치 렌더러 채우기 — 데이터 있는 두 종부터 | ① 히트맵: `results.js grid`(여수 grid100 2종)를 격자 fill 로, 밀도 = 청록 alpha 5단(0.08–0.6). 해양쓰레기 카드 `kind.viz` 에 heatmap 한 줄(two-tier §5 확장 방식). ② 타임라인: 변화 탐지 카드에 `change.js` 4시점 pair 3개를 시간축으로, 끌면 그 시점 타일(A1) + 변화 지수 폴리곤(반드시 '변화 지수(비지도) · 학습 결과 아님' 표기, `change.js:2`). 데이터 없는 장치(영상 플레이어 · 구간 등급)는 점선 유지하되 문구를 '드론 영상이 아직 없다 — 데이터 관리에서 올리면 여기 선다' 로 | `devBox 5종(:478-489)` · `needsOf/kind` · `results.js grid` · `change.js CHANGE` · `assets/tiles/namwon_change_2504_2510` | '튀는 구조를 흡수하는 장치'(§5)가 선언만 있고 렌더러가 없으면 설계가 아니라 슬로건이다. 두 종을 실제로 그려야 세 번째 카드가 믿어진다 | L |
| **A7** | 실행중 판의 심장 박동 | 시드 3건에 6 s 주기 tick 하나(법전 §4 유휴 규칙: 화면당 1개 · 실데이터에 묶인 것 = pct · step). 72 % 가 6 s 마다 1–2 % 오르고 단계가 넘어가며 100 % 에서 완료 탭으로 이동 + 토스트. 대기 중 건은 처리 중 건이 끝나면 시작. `prefers-reduced-motion` 은 정지 | `patchRun` · `renderRunning draw()/drawPanel(:244-326)` · `RUN_STATE` · `startRun` 타이머 패턴(`:220-235`) | 처리 중인데 멈춘 막대는 고장의 문법이다. 살아 있는 대기열이 '양산 라인'(two-tier §6)을 보여준다 | S |
| **A8** | 진열대 — 카드를 고르면 결과가 선다 | 카드 상세 `cd-img`(16/9 정지 크롭) 자리를 그 카드의 첫 실측 결과 bbox 미니 지도(A1 타일 + 청록)로. 카드 hover 180 ms 에 4 px 이동 + 브래킷 성장, 선택 시 `clip-path inset(100% 0 0)→0` 1 s 리빌. '결과 2' 탭의 실측 수치는 글자별 현상. 준비 중 카드는 지금처럼 점선 무채 | `drawDetail(analysis-cards.js:163-295)` · `cardResults()` · `cardCrop()` · `#cd-results` · `results.js stats.bbox` | 진열대는 'AI 서비스 상품' 의 얼굴이다. 상품이 무엇을 하는지 그림 한 장으로 말해야 한다 | M |
| **A9** | 과제 ↔ 영상 맞춤 | `inputSets()` 에서 카드 배포 지역(`DEPLOYS.region`)과 `imagery.bounds` 를 대조해 지역 안 영상을 먼저, 밖 영상은 회색 + '배포 지역 밖' 한 줄(선택은 막지 않는다 — 이식 시연을 위해). '과제 변경 ›' 은 각진 표 모달로 카드 7장을 고른다. 영농 카드 모델 4종은 '03 모델' 에서 실제로 고를 수 있게(`modelsOfCard(card)` 전부) | `inputSets(analysis-kind.js:516)` · `openModelPick(:169)` · `#ch-card(:155)` · `renderRun svc=modelsOfCard(card)[0](:29)` | 여수 과제에 제주 영상을 올릴 수 있는 폼은 'AI 를 아는 화면' 이 아니다 | S |
| **A10** | 영업용 = 시연 실행(Q4 ② 채택) | sales 에서 '분석 실행' 을 세우면 A2 스캔 연출만 돌고 `addRun` 을 호출하지 않는 '시연 실행' 으로. '결과 편집' · '취소' · '이식' 은 `allowed('edit')`/`allowed('run')` 으로 세우지 않는다. sales 판 푸터에 '열람 계정 — 실행·수정은 LX 직원' 한 줄(`dp-hint` 부품 재사용) | `allowed()` · `roles.js caps` · `startRun` · `dp-hint(:590)` | 영업의 목적은 '돌아가는 모습' 이다. 세션을 오염시키지 않고 보여주는 길이 A2 다 | M |
| **A11** | 이식 마법사에 지도 한 칸 | 프로파일 칩을 고르면 우측 미니 지도가 남원 → 광주전남 bbox 로 `frame()` 1100 ms 이동, 보유 영상이 있으면 그 bounds 를 점선으로. '12345 km²' 자리 값은 실측 또는 [추정] | `openTransplant(analysis-cards.js:302-373)` · `PROFILES` · `frame()` · `mountMap` | 이식은 '카드를 다른 땅에 심는 일' 이다. 땅이 안 보이면 폼이다 | S |

## 5. 가장 먼저 고칠 것 (9)

1. **`download.js` import 한 줄(F1 · P0)**: `analysis-run.js:7-15` 에 `import { downloadGeoJSON, downloadNote } from './download.js'`. 영업용 계정의 유일한 권한이 살아난다. Sonnet · 10분.
2. **역할 게이트를 화면 안까지(F2 · P1)**: '분석 실행' '결과 편집' '취소' '다른 지역에 이식 ›' 를 `allowed('run')` · `allowed('edit')` 로 세운다. Q4 답 전까지는 caps 정본대로 세우지 않는다. Sonnet · 반나절.
3. **새 실행에 결과를 연결하고 '분석 결과 보기' 가 그 실행을 연다(F3 · P1)**: 같은 serviceId 의 `RESULTS` 가 있으면 `resultId` 로 잇고 `demo:true` + 시연 꼬리표 유지, 없으면 '산출물 없음' + 이유. 완료 시 `commit({tab:'done', run:id})`. Sonnet · 반나절.
4. **'정사영상' 토글이 정사영상을 켠다(F7 + A1)**: `map-gl.js setEpoch` 재사용으로 `imagery.js` 타일을 완료·실행 탭 지도에 깐다. 몰입감의 첫 단추이자 가장 싼 단추. Opus 5 · 1–2일.
5. **실행중 판에 박동(F4 = A7) · 결과 도착(A3)**: 둘 다 S. Opus 5 · 각 반나절.
6. **문구·정직성 일괄(F9 · F13 · F14 · F15 · F16 · F18)**: 개발자 말투 4문구를 사용자 문장으로, 김○○ 제거, 12345 km² → 실측/[추정], 기준일 `AS_OF` 하나(06.08 통일), 해양쓰레기 클래스 8종 한글 표기 표, 처리 단위 뜻 한 줄, 지도 결손 사각형에 점선 + 이유. Sonnet · 반나절.
7. **1280 · 390(F11 · F12)**: 표 컬럼 최소폭(본번·부번 56 px), 1280 에서 '면적 m²' 헤더 줄바꿈 금지, 390 은 3열 → 1열 스택 + 마스트헤드 공지 숨김. Sonnet · 1일.
8. **발행 카드 대장 통일(F6)**: `ai-card.html` 을 `cards.js` 로, 폼에 대상 사업 · 전용 모듈 · 이식 가능 필드(card-architecture §3). 카드 발행 관리 영역과 공동 작업. Opus 5 · 2일.
9. **그 뒤 A2(스캔) · A4(편집 실동작) · A5(시점) · A6(장치 렌더러)** — Opus 5.5 · Craft 비평가 필수. A1 + A3 + A7 세 개만 붙인 뒤 '재스킨 → 제품' 으로 넘어가는지 먼저 판정.

## 6. 발주자 확인 (→ MASTER-PLAN §4 결정 질문으로 이관, 2026-09-24 확정)

- 영업용 실행(① CTA 제거 / ② 시연 실행 추천 / ③ 허용) → **Q4 = ② 채택**. Wave 0 는 임시 ①(CTA 차단).
- 기준일 · 대표 수치(셸 `AS_OF` 하나, 동/필지 병기) → **Q5 (a)① (b) 06.08**.
- 신규: 편집 저장의 실체(세션 vs localStorage, '시연 · 세션 저장' 표기) → **Q5 (c) localStorage + '시연 · 이 브라우저에 저장'**.
- 신규: 해양쓰레기 viz 에 heatmap, 변화 탐지에 timeline 선언 추가는 `cards.js` 정본 수정이며 two-tier §5 표(해양쓰레기 = 영상 플레이어 · 구간 등급)와 어긋남 — 표 갱신 여부 → **Q5 (d) 갱신 승인**.

## 부록 A — 보강 실측

`shots/audit-0923/analysis/c1-tiles.mjs` → `c1.json`: `tileReqs: []` · `vworldReqs: 185` · `pageerrors: ["ReferenceError: downloadGeoJSON is not defined"]` · `orthoPressed: "true"` · `hybVisible: true` · `tileReqsAfterDone: 0` · `tileReqsAfterRun: 0` · `gridReqs: 0` · `devboxes: ["구간 등급 범례 | 원천 대기 — 이 카드의 선언이 켠 자리다", "영상 플레이어 | 원천 대기 — 이 카드의 선언이 켠 자리다"]` · `tileReqsTotal: 0`. 스크린샷 `c1-done-ortho-on.png` · `c1-done-zoomed.png` · `c1-run-picked.png` · `c1-yeosu-devices.png`.
