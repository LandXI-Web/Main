# 실측 감사 — 분석 서비스 · 발행 카드 목록 (영역키 `analysis`)

- 일자: 2026-09-23 · 감사 방식: **읽기 전용**(소스 수정 0). 실제 Chrome(Playwright)으로 `http://localhost:4173` 에서 열고 컨트롤을 전부 눌렀다.
- **복원 문서(2026-09-24)**: 원 감사 에이전트는 이 파일을 쓰지 못했다(하네스가 서브에이전트의 보고서 파일 작성을 거부 — 워크플로 저널 `wf_ce82e913-c2e/journal.jsonl` 의 `audit:analysis` result 줄에 "NOT WRITTEN" 으로 남아 있다). 이 문서는 그 구조화 결과(pages · findings)와 원시 증거 `shots/audit-0923/analysis/{a1,a2,a3,a4,a5,c1}.json` 을 그대로 옮긴 것이다. 문장을 새로 지어내지 않았고, 수치·파일:줄·증거 파일명은 원문 그대로다.
- 스크립트: `shots/audit-0923/analysis/a1-shelf.mjs`(진열대) · `a2-run.mjs`(분석 실행) · `a3-done.mjs`(실행중·완료·편집·공유·다운로드) · `a4-roles.mjs`(역할 게이트 · ai-card) · `a5-cardedit.mjs`(카드 편집 폼) · `c1-tiles.mjs`(비평 보강 — 타일 요청 계측) · 원자료 `a1.json` … `a5.json` · `c1.json`
- 스크린샷: `shots/audit-0923/analysis/*.png` 97장(`01-shelf-1440.png` … `87-cardnew-project.png`, `c1-*.png`)
- 계정: `localStorage.lx_logged_in=1` + `lx_role ∈ {admin, staff, sales}`. 관문 확인: admin → `admin-home.html?denied=analysis-ai.html`(`a4.json adminAnalysis`), sales → 열림.
- 대조 기준: `design/system.md` §1–§7, 9/20 스펙 4종(`two-tier` · `card-architecture` · `platform-roles` · `production`), 원본 인벤토리 §7 분석 서비스 · §8 카드 발행, 지난 감사 `review/2026-09-20-auto-audit.md` A1m–A6m · P2m · C7

---

## 0. 한 줄 판정

**잘 정리된 업무 화면이다. 뼈대(카드 진열대 · 3단 픽커 · 실행 대장 · 실 GeoJSON 4건)는 서 있으나, 영업 계정의 유일한 권한인 다운로드가 `ReferenceError` 로 죽어 있고, 영업이 실행·편집·취소·이식을 전부 할 수 있으며, 새로 실행한 분석은 결과 없이 끝난다. 저장소의 정사영상 타일 63 MB 를 한 장도 요청하지 않는다(`c1.json tileReqsTotal: 0`).**

- 완성도 추정: **68 %** (원본 인벤토리 §7 · §8 + 9/20 스펙 대비)
- 몰입감·인터랙티브 점수: **3 / 10**

---

## 1. 페이지 상태

| 페이지 · 탭 | 판정 | 요지 | 증거 |
|---|---|---|---|
| `analysis-ai.html` — 서비스(카드 진열대) | **complete** | 분기 탭(지자체 7 / 글로벌 2), 집계 밴드, 3축 필터(분야 · 상태 · 배포 지역), 검색, 빈 상태, 방향키 이동, 카드 상세 7구역 탭, 이식 마법사까지 모두 동작. 콘솔 오류 0, 법전 위반 0. 화면 안에 개발자 말투가 남아 있다(`analysis-cards.js:190,204`) | `01-shelf-1440.png` · `02-detail-*.png` · `07-transplant.png` · `08b-dep-after-transplant.png` · `a1.json` |
| `analysis-ai.html?tab=run` — 분석 실행 | **partial** | 영상/과제/모델 3단 선택기, 선택 범위 실지도, 모델 선택 모달, 진행 모달 동작. 그러나 새 실행의 `resultId` 가 `null` 이라 완료 탭에는 '산출물 없음' 만 뜬다. 진행 모달 '분석 결과 보기' 는 시드 실행(주천면 비닐하우스 72 %)을 연다. 영상과 과제 지역이 맞는지 검사하지 않는다(여수 해양쓰레기 과제에 남원/제주 영상 선택 가능) | `22-run-selected.png` · `24-progress-early.png` · `26-after-result-btn.png` · `27-done-with-new.png` · `a2.json` |
| `analysis-ai.html?tab=running` — 실행중 | **partial** | 상태/등록자 필터, 검색, 새로고침, 페이지, 다시 시도, 취소/삭제 동작. 시드 3건은 정지 상태(72 % 가 6.5 초 동안 변화 없음) | `40-running.png` · `43-running-fail-detail.png` · `a3.json runningLive` |
| `analysis-ai.html?tab=done` — 완료 | **partial** | 실 GeoJSON 4건을 청록 오버레이로 띄우고, 필지 표(PNU 분해), 행 클릭 줌, 공유 9역할, 삭제 동작. **다운로드는 `ReferenceError` 로 죽어 있다.** 편집은 표시만 하고 반영하지 않는다(이동 불가, 저장 후 수치 원복). 장치 5종 가운데 표 1종만 실제로 그려진다. 1280 폭에서 표 헤더가 겹친다 | `50-done-1440.png` · `57-edit-marked.png` · `58-edit-saved.png` · `60-download.png` · `64-done-1280.png` · `a3.json` |
| `ai-card.html` | **partial** | 원본 기능(검색 구분, 공개 여부, 초기화/검색, 페이지, 빈 상태) 모두 동작. 그러나 목록이 `publish-data.js` 의 모델 단위 8장이고, 분석 서비스 진열대(`cards.js` 서비스 카드 9장)와 **다른 대장**이다(9/20 platform-roles §4 위반). 390 폭 가로 넘침 562 px | `80-aicard-1440.png` · `85-aicard-390.png` · `a4.json aicards` |
| `ai-card-edit.html` | **partial** | 원본 폼 필드와 검증은 1:1. 스펙이 요구한 대상 사업(지자체/글로벌) · 전용 모듈 · 이식 가능 필드는 없다. '발행자 김○○' 담당자 표기 | `83-aicard-edit-view.png` · `86-cardnew-validate.png` · `87-cardnew-project.png` · `a4.json editText` · `a5.json` |
| `analysis-ai.html` · `ai-card.html` @ 390×844 | **broken** | 가로 넘침 137 px / 562 px, 마스트헤드 글자 겹침, 본문 빈 면 | `10-shelf-390.png` · `64-done-390.png` · `85-aicard-390.png` |

모듈: `analysis.js`(셸 · 탭 · URL 상태) · `analysis-cards.js`(진열대 · 상세 · 이식 마법사) · `analysis-run.js`(실행 · 실행중 · 완료 · 편집 · 공유 · 다운로드, 641줄) · `analysis-data.js`(아카이브 · 실행 대장 · localStorage) · `analysis-kind.js`(종류 선언 → 입력 · 장치) · `analysis-map.js`(MapLibre 판) · `analysis.css` · `publish-cards.js`(ai-card) · `publish-card-edit.js`(ai-card-edit).

---

## 2. 측정 요약 (계산 스타일 · 1440×900 기준, `a1–a4.json m_*`)

| 항목 | 진열대 | 분석 실행 | 실행중 | 완료 | 편집 | 공유 | ai-card |
|---|---|---|---|---|---|---|---|
| 콘솔 오류 / pageerror | 0 / 0 | 0 / 0 | 0 / 0 | 0 / **1**(`ReferenceError: downloadGeoJSON is not defined`) | — | — | 0 / 0 |
| 가로 · 세로 넘침 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| 14px 미만 글자 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 그림자 / 라운드 / 그라디언트 / 유리 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 잘린 글자(`clipped`) | 0 | **5**(제주 썸네일 캡션) | 0 | **13**(완료 목록 부제 · `총 2,098건 …`) | 13 | 13 | 1(`발행 카드 8건`) |
| 1280 넘침(h·v) | 0 · 0 | 0 · 0 | — | 0 · 0 · clipped **21** | — | — | 0 · 0 · clipped 1 |
| 1920 넘침 | 0 · 0 | 0 · 0 | — | clipped 12 | — | — | — |
| 390 넘침(h) | **137** | **137** | — | **137** | — | — | **562** |

DOM 위의 법전 준수(§1–§2)는 깨끗하다. 문제는 규칙 위반이 아니라 **죽은 버튼 · 새는 권한 · 쓰지 않는 자산**이다.

보강 계측(`c1.json`, 완료 탭 + 실행 탭 전 구간): `assets/tiles/**` 요청 **0건** · V-World 요청 **185건** · grid100 요청 **0건** · '정사영상' 토글 `aria-pressed=true` 시 켜지는 것은 하이브리드(지명) 레이어(`hybVisible:true`) · 여수 결과의 장치 상자 2개(`구간 등급 범례` · `영상 플레이어`)는 '원천 대기 — 이 카드의 선언이 켠 자리다'.

---

## 3. 역할(계정) 관문과 화면 안 권한 (`a4.json`)

| 항목 | admin | staff | sales |
|---|---|---|---|
| `analysis-ai.html` 진입 | `admin-home.html?denied=analysis-ai.html` | 열림 | 열림 |
| 레일 | — | 7 | `분석 서비스 · 지도 서비스 · 활용 사례 · MY` |
| `분석 실행` 버튼 | — | 활성 | **활성**(`salesRunBtn.d:false`) → 눌러서 실행 생성(`salesRunStarted:true`) |
| `결과 편집` 진입 · 저장 | — | 가능 | **가능**(`salesEditBtn:true` · `salesEditing:true`) |
| 실행 `취소` | — | 가능 | **가능**(`salesCancel:true`) |
| `다른 지역에 이식 ›` | — | 가능 | **가능**(`salesTp:true`) |
| `공유 설정` · `삭제` | — | 가능 | 숨김(`salesShare:false` · `salesDel:false`) — `allowed('edit')` 가 이 둘에만 걸려 있다 |
| 프로젝트 링크 | — | 이동 | `ximap.html?denied=ai-project.html` |
| `영상 업로드` | — | `dataset.html` | `ximap.html?denied=dataset.html`(막다른 길) |
| `ai-card.html` | 열림 | denied | `ximap.html?denied=ai-card.html` |

`roles.js` 의 sales caps 는 `['export']` 뿐이다. 화면이 확인하는 권한은 `allowed('edit')` 하나이고, 그것도 공유·삭제에만 걸려 있다(`analysis-run.js:587-590`).

---

## 4. 결함 목록 (F1–F19)

| ID | 심각도 | 종류 | 제목 | 상세 | 증거 |
|---|---|---|---|---|---|
| **F1** | **P0** | broken | 완료 탭 다운로드 버튼이 `ReferenceError` 로 죽어 있다 | `analysis-run.js:599,601` 에서 `downloadGeoJSON` / `downloadNote` 를 부르지만 import(`:7-15`)에 `./download.js` 가 없다. 눌러도 파일이 받아지지 않는다. 커밋 `e62d7eb`('내려받기를 실제로 동작하게')의 주석과 반대 결과다. 영업 계정의 유일한 권한(export)이 이 버튼이다 | `a3.json pageerror` · `download:'NO DOWNLOAD'` · `60-download.png` · `c1.json pageerrors` |
| **F2** | P1 | system-violation | 영업용 계정이 실행·편집·취소·이식을 할 수 있다(역할 게이트 누수) | sales caps 는 `['export']` 인데 화면은 `allowed('edit')` 를 공유·삭제에만 건다(`analysis-run.js:587-590`). 그래서 sales 는 분석 실행(`:157`, `analysis-cards.js:279`), 결과 편집 진입과 저장(`:435`), 실행 취소(`:307`), 이식 요청(`analysis-cards.js:270`)을 모두 할 수 있다. 프로젝트 링크와 업로드 버튼은 누르면 거부 리다이렉트로 XI맵에 떨어진다 | `a4.json salesRunStarted:true · salesEditing:true · salesCancel:true · salesProjClick` · `73-sales-run-progress.png` · `76-sales-edit-open.png` · `71-sales-project-denied.png` |
| **F3** | P1 | interactive | 분석을 실행해도 결과가 없고, '분석 결과 보기' 가 다른 실행을 연다 | 새 실행의 `resultId` 가 `null`(`analysis-run.js:189`). 완료 탭에는 '산출물 없음' 만 뜨고 지도와 표도 비어 있다. 진행 모달 '분석 결과 보기'(`:212`)는 `tab=running` 으로 보내는데, 이미 완료된 실행은 그 목록에 없어서 시드 '주천면 비닐하우스 72 %' 가 대신 열린다 | `26-after-result-btn.png` · `27-done-with-new.png` · `a2.json rpText · dpNew` |
| **F4** | P1 | interactive | 실행중 목록이 정지 화면이다 | 시드 `run-green-2604` 가 `pct:72` 로 고정(`analysis-data.js:73`). 6.5초 동안 판에 변화가 없다. '처리 중' 표시와 멈춘 막대가 함께 있어 고장처럼 읽힌다 | `a3.json runningLive:'static (no change over 6.5s)'` · `40-running.png` |
| **F5** | P1 | incomplete | 결과 편집이 표시만 하고 지도와 수치에 반영되지 않는다 | '이동' 도구로 도형을 옮길 수 없다. 지도 클릭으로 도형을 고를 수도 없다(`map.on('click')` · `queryRenderedFeatures` 없음). 편집은 표에서만. 저장하면 건수가 2,097 → 2,098 로 원복되고 세션 메모 한 줄만 남는다(`analysis-run.js:447-451,582`). LX 핵심 권한 '품질 책임(수정·삭제)' 이 겉모양만 있다 | `a3.json chg3:'2'(드래그 무반응) · popup:0 · dpN:'2,097' · afterSave` · `57-edit-marked.png` · `58-edit-saved.png` |
| **F6** | P1 | missing-feature | 발행 카드 대장이 둘로 갈라져 있고, 발행 폼에 스펙 필드가 없다 | `ai-card.html` 은 `publish-data.js` 모델 단위 카드 8장, 진열대는 `cards.js` 서비스 카드 9장. platform-roles §4 '발행 카드 목록 = 분석 서비스 진열대' 위반. `ai-card-edit` 에 대상 사업 · 전용 모듈 · 이식 가능 필드 없음(`publish-*.js` 에서 `scope/global/portable` grep 0건) | `80-aicard-1440.png` vs `01-shelf-1440.png` · `84-aicard-edit-new.png` · card-architecture §3 |
| F7 | P2 | broken | '정사영상' 토글이 실제로는 지명(하이브리드) 레이어를 켠다 | `analysis-run.js:443` 에서 `data-layer=ortho` 가 `setHybrid()` 를 호출. 위성 바탕이 보이는데 기본값은 꺼짐(`aria-pressed=false`). '지명 표시' 도구와 같은 일을 하는 버튼이 이름만 다르게 둘 있다 | `analysis-run.js:433,443` · `53b-done-ortho-toggle.png` · `c1.json orthoPressed · hybVisible` |
| F8 | P2 | incomplete | 종류 선언이 켜는 장치 5종 중 표 1종만 실제로 그려진다 | 구간 등급 범례와 영상 플레이어는 '원천 대기 — 이 카드의 선언이 켠 자리다' 점선 빈 상자. 히트맵과 타임라인은 한 번도 렌더되지 않는다. 이원화 §5 의 튀는 구조 흡수 장치가 선언만 있고 렌더러는 없다 | `51-done-3-yeosu-marine-2026-drone.png` · `analysis-run.js:481-489` · `c1.json devboxes` |
| F9 | P2 | ux | 개발자 말투가 사용자 화면에 노출된다 | '화면은 카드 이름을 모른다 — 이 선언(kind)만 보고 장치를 켠다', '법정 조사 주기는 레지스트리에 없다', '원천 대기 — 이 카드의 선언이 켠 자리다', '시드 실행 · 지도에 올릴 도형이 없다' | `analysis-cards.js:190,204` · `analysis-run.js:438,489` · `02-detail-kind-full.png` |
| F10 | P2 | incomplete | 영상·과제 지역을 맞춰 보지 않고, 과제는 카드의 첫 모델로 고정된다 | 해양쓰레기(여수) 과제에서도 남원·국산리·제주 정사영상 11장을 고를 수 있다(`analysis-kind.js:21 ortho:()=>true`). 과제 '변경' 은 진열대로 돌아가는 링크일 뿐. 영농 카드의 모델 4종 중 첫 번째만 쓴다(`analysis-run.js:29`) | `29-run-marine.png` · `a2.json marine` |
| F11 | P2 | ux | 1280 폭에서 완료 탭 표 헤더가 겹치고 글자 21곳이 잘린다 | '탐지 클래스' 와 '면적 m²' 가 겹친다. 본번과 클래스가 '3…', '경…' 으로 잘린다. 신뢰도 히스토그램 축이 푸터 버튼에 가린다. 1440 에서도 잘린 글자 13곳 | `64-done-1280.png` · `a3.json m_1280 clipped 21` |
| F12 | P2 | ux | 390 모바일에서 두 화면 모두 가로로 넘친다 | `analysis-ai` 가로 넘침 137 px + 마스트헤드 글자 겹침. `ai-card` 562 px | `10-shelf-390.png` · `85-aicard-390.png` · `a4.json aicard_390` |
| F13 | P2 | data-honesty | 이식 프로파일에 자리 값(12345 km², 52130-xx)이 노출된다 | 이식 마법사에 '광주전남특별시 29 · 12345 km²'. 국산리 코드 '52130-xx'. 실측 표기도 [추정] 표기도 없다 | `registry.js:101-104` · `07-transplant.png` |
| F14 | P2 | data-honesty | 기준일이 세 가지로 갈린다(지난 감사 C7 미해소) | 마스트헤드 2026.08.27(`analysis.js:47`) · 실행 대장 `AS_OF` 2026-06-08(`analysis-data.js:13`) · ai-card 마스트헤드 2026.06.08 | `01-shelf-1440.png` · `80-aicard-1440.png` |
| F15 | P2 | data-honesty | 카드 편집 화면에 담당자명 '김○○' 가 있고, 지도 캡션 대비가 부족하다 | '발행자 김○○ · 수정자 김○○' 는 법전 §5 담당자명 금지. 지도 하단 캡션은 영상 위 회색 글자라 거의 읽히지 않는다 | `83-aicard-edit-view.png` · `a4.json editText` |
| F16 | P3 | ux | 해양쓰레기 클래스명이 영문 원문 그대로다 | styrofoam, buoy_bottle, other_debris 등 8종 미번역 | `51-done-3-yeosu-marine-2026-drone.png` |
| F17 | P3 | ux | 여수 결과 지도에 사각형 결손 타일이 표시 없이 드러난다 | 위성 바탕에 큰 회보라 사각형. 법전 §5 '결손은 점선 무채 + 이유 한 줄' 이 지도 결손에는 적용되지 않았다 | `51-done-3-yeosu-marine-2026-drone.png` |
| F18 | P3 | data-honesty | 진행 모달의 '처리 단위' 가 면적×1000 으로 만든 단위다 | 시연 표식은 있다. 그러나 단위의 뜻을 설명하지 않는다 | `analysis-run.js:205,219` · `24-progress-early.png` |
| F19 | P2 | interactive | 몰입감이 사용자 기준에 크게 못 미친다(3/10) | 진열대는 흐린 88 px 크롭과 글자 표. 실행의 클라이맥스는 파란 막대 모달. 결과 지도는 평면 청록 점뿐이고, 지도에서 고르기 · 팝업 · 시점 스와이프 · 타임라인 · 히트맵이 없다. 지도 위 스캔 후 탐지 점등 같은 Geo-AI 장면이 전무하다. 사용자가 거부한 '딱딱한 업무 시스템 목업' 문법에 그대로 머물러 있다 | `01-shelf-1440.png` · `24-progress-early.png` · `50-done-1440.png` |

---

## 5. 원본 기능 인벤토리 대조 (§7 분석 서비스 · §8 카드 발행)

| 원본 기능 | 상태 | 비고 |
|---|---|---|
| 서비스 카드 목록 · 분야/상태/지역 필터 · 검색 | 있음 | 9장(지자체 7 · 글로벌 2). 글로벌은 `준비 중` 비활성(`a1.json globalRunBtn`) |
| 카드 상세(모델 · 배포 지역 · 결과 · 종류 선언) | 있음 | 7구역 탭. 개발자 말투(F9) |
| 이식(다른 지역에 배포본 복제 요청) | 있음 | 마법사 동작 · 세션에 `예정` 배포본 추가(`08b-dep-after-transplant.png`). 자리 값(F13) |
| 분석 실행 — 영상 선택(아카이브 4묶음 · 검색 · 페이지) | 있음 | 아카이브 11 · 묶음 전체 9/최근 4/공유 3/내 영상 8(`a2.json facet_*`) |
| 분석 실행 — 과제 · 모델 선택 | 부분 | 모델 모달 동작(2행). 과제 변경은 진열대 링크(F10) |
| 분석 실행 — 영상 업로드 | 부분 | `dataset.html` 링크만. sales 막다른 길(F2 · dataset F4) |
| 실행중 — 상태 · 등록자 · 검색 · 다시 시도 · 취소 | 있음 | 정지 화면(F4) |
| 완료 — 지도 · 필지 표 · 행 클릭 줌 · 공유 · 삭제 | 있음 | 실 GeoJSON 4건 · PNU 분해 표 · 공유 9역할 |
| 완료 — 다운로드 | **깨짐** | F1 |
| 완료 — 결과 편집(이동 · 삭제 · 저장) | 부분 | 표시만(F5) |
| 딥링크 `?tab=done&run=` · `?svc=`(포털 맥락) | 있음 | `a3.json deep · svc` |
| 발행 카드 목록(ai-card) — 검색 · 공개 여부 · 페이지 | 있음 | 다른 대장(F6) |
| 카드 편집 폼 — 필드 · 검증 문구 원본 그대로 | 있음 | 스펙 필드 없음(F6) · 담당자명(F15) · `a5.json errs:0` |

---

## 6. 지난 감사(9/20) 대조

| 9/20 항목 | 상태 |
|---|---|
| A1m 진열대 없음 | **해소** |
| P2m 카드 상세 자리 화면 | **해소** |
| A2m 실행 폼 자리 화면 | **해소** |
| A3m 실행중 정지 | **해소**(목록 · 필터) — 단 막대는 여전히 정지(F4) |
| A4m 완료 탭 지도 없음 | **대부분 해소** — 편집은 표시만(F5) |
| A5m 공유 · 다운로드 | **부분 해소** — 공유 ✔ · 다운로드 ✕(F1) |
| A6m 딥링크 | **해소** |
| C7 기준일 불일치 | **미해소**(F14) |

---

## 7. 고칠 순서 (감사자 제안)

1. **[P0] F1** — `analysis-run.js` import 한 줄. 영업 계정의 유일한 권한이 살아난다.
2. **[P1] F2** — `분석 실행` · `결과 편집` · `취소` · `다른 지역에 이식 ›` 를 `allowed('run')` / `allowed('edit')` 로 세운다. 영업 계정의 실행은 결정 질문(Q4)에 달려 있으나, 답 전까지는 caps 정본대로 세우지 않는다.
3. **[P1] F3** — 새 실행에 같은 serviceId 의 실측 결과를 `resultId` 로 잇고(`demo:true` · 시연 꼬리표), '분석 결과 보기' 가 그 실행을 연다(`commit({tab:'done', run:id})`).
4. **[P1] F4 · F5** — 실행중 판에 유휴 1개 시계, 편집이 지도와 수치에 실제로 반영.
5. **[P2] F7 · F19** — '정사영상' 토글이 정사영상을 켠다(`map-gl.js setEpoch` 재사용) — 몰입감의 첫 단추이자 가장 싼 단추.
6. **[P2] 문구 · 정직성 일괄** — F9 · F13 · F14 · F15 · F16 · F18.
7. **[P2] F11 · F12** — 1280 표 컬럼 최소폭, 390 1열 스택.
8. **[P1] F6** — 발행 카드 대장 통일(카드 발행 관리 영역과 공동).

— 근거: `shots/audit-0923/analysis/*.json` 6종 · 스크린샷 97장 · `landxi/proto/analysis-*.js` · `publish-cards.js` · `publish-card-edit.js` · `landxi/assets/data/{roles,cards,results,imagery,registry}.js`. 소스 수정 0.
