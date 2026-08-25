# landxi7 원본 기능 인벤토리

- 원본: https://mini531.github.io/namwon-smart-village/landxi7/ (GNB 기준, 좌측 아이콘 사이드바 `include/header.html`)
- 대상 저장소 상태: `plan1-foundation` 브랜치, 2026-08-26 기준
- 클라이언트 규칙: **기능은 유지, 프론트 디자인만 개편, 추가·삭제 없음**
- 방법: Playwright(`channel:'chrome'`, 1440×900, headless)로 GNB에서 도달 가능한 전 페이지를 순회하며 스크린샷(`shots/original/`) 확보 + 각 페이지 원본 HTML/JS 소스를 직접 읽어 버튼·탭·표·폼·모달·딥링크 파라미터를 채록. 우리 구현(`landxi/*.html`, `landxi/proto/*.html`, `landxi/assets/js/pages/*.js`)과 대조.
- 상태 기호: **있음**(1:1 구현) · **부분**(일부만/다른 형태로 구현) · **없음**(미구현) · **추가됨(위반)**(원본에 없는데 우리 쪽에만 있음)

## 0. 페이지·기능 총계

- GNB에서 도달 가능한 페이지(템플릿 기준, `?pid=`류 파라미터 변주 제외): **35개**
  - 사이드바 직결 11 + 워크플로우 하위 7 + 서비스지원/관리 하위 각 5 + 인증 4 + 카드발행 3 + 데이터관리 프래그먼트 4 + XI맵 통계/보고서 3(신규 발견, `?embed=1` iframe 전용) + 홈/대시보드 등
- 채록한 개별 기능(버튼·탭·필터·폼필드·모달·표) 합계: **약 340개** (표 행 수 기준, 부록 A 참고)
- 스크린샷: `shots/original/*.png` 56장 (페이지 기본 상태 + 탭/모드/딥링크 상태 변형 포함)
- 상태 요약: **있음 22 / 부분 11 / 없음 약 300 / 추가됨(위반) 0건** — 현재 `plan1-foundation`은 `dashboard.html·home.html·login.html`(+ `landxi/dev/*` 컴포넌트 시트)만 실제 코드로 존재하는 1차 스캐폴딩 단계이며, 나머지 32개 원본 페이지(데이터 관리·프로젝트·분석·XI맵·카드발행관리·서비스지원/관리·마이페이지·회원가입 등)는 전부 **없음**. 원본에 없는 기능을 새로 만든 사례(추가됨/위반)는 발견되지 않음. 단, `home.html`의 4/6 씬이 `data-todo` 스텁으로 남아 있어 "완성된 것처럼 보이지만 실제로는 없음" 리스크가 가장 크다.

---

## 1. 좌측 내비게이션 트리 (원본, `include/header.html` 그대로)

```
app-sidebar
├─ sb-top (상단 그룹)
│   1. 대시보드           dashboard.html          data-menu="dashboard"
│   2. 데이터 관리         dataset.html            data-menu="media"
│   3. 프로젝트           ai-project.html         data-menu="project"
│   4. 분석 서비스         analysis-ai.html        data-menu="analysis"
│   5. 지도 서비스(XI맵)   ximap.html              data-menu="map"
│   ※ 주석: "메뉴 순서 = 대시보드 > 데이터 관리 > 프로젝트 > 분석 서비스, XI 맵 → 지도 서비스
│      (2026.08.21 회의록 결정 2·7)" — 이 순서 자체가 최근 확정된 사양임에 유의
└─ sb-bottom (하단 그룹)
    6. 서비스 지원         notice.html             data-menu="support"
    7. 카드 발행 관리       admin-publish.html      data-menu="publish-admin"
    8. 서비스 관리         admin-notice.html        data-menu="admin"
    9. MY (flyout, 아이콘 hover/클릭 시 펼침)      data-menu="my"
        ├─ 마이 페이지      mypage.html
        └─ 로그아웃        (data-action="logout", localStorage 정리 후 home.html)
```

- 활성 메뉴 판정은 `assets/js/layout.js`의 `fileMenuMap` + 접두어 규칙(`map-`,`dataset-`,`report-`,`stats-`,`analysis-`,`history-`,`ai-`,`admin-`,`info-`)으로 처리 — 즉 원본 코드는 `dashboard2/3.html`, `map-home~4.html`, `history*.html` 같은 페이지도 활성 매핑 대상으로 예비해 두었지만, 실제로 GNB/링크로 도달 가능한 것은 위 9개 뿐. (구버전/시안 잔존 페이지는 부록 C 참고)
- 상단에 `.gnb-header/.gnb-nav` 형태의 별도 드롭다운 GNB는 **없음** — `layout.js`에 관련 코드가 남아있으나(모바일 드로어·호버 드롭다운 등) landxi7 헤더 마크업(`include/header.html`)에는 대응 요소가 없어 죽은 코드. 실제 헤더는 아이콘 전용 사이드바 하나뿐.
- 서비스 지원/서비스 관리 각 하위 5개 페이지는 사이드바가 아니라 **페이지 상단 `admin-tabnav`**(`class="panel-tab"` 링크 묶음)로 서로 연결됨.

### 우리 구현 상태 (좌측 내비 전체)
| 원본 메뉴 | 우리 구현 | 비고 |
|---|---|---|
| 좌측 아이콘 사이드바 자체 | **없음** | `landxi/dashboard.html·home.html·login.html`은 각자 독립 페이지로, 공용 GNB/사이드바 셸이 아직 없음(`landxi/dev/shell.html`에 셸 컴포넌트 초안만 존재) |
| 9개 메뉴 항목 + active 상태 | **없음** | 위와 동일 사유 |
| MY 플라이아웃(마이페이지/로그아웃) | **없음** | `AuthState`(로그인 상태 localStorage)는 `landxi/assets/js/shell.js`에 이식됨(있음), 그러나 MY 메뉴 UI 자체는 없음 |

---

## 2. 대시보드 — `dashboard.html`

원본 위치: 로그인 후 첫 화면. 딥링크 파라미터 없음(고정 URL).

| 기능 | 원본 위치 | 동작 | 우리 구현 상태 | 비고 |
|---|---|---|---|---|
| 상단 공지 스트립 | `.notice-strip` | `support-data.js`의 `SP_NOTICES`에서 pinned→최신순 1건 표시, 클릭 시 `notice.html?notice=<id>` | **있음** | `landxi/dashboard.html #dashNotice` → `notice.html`(단, `?notice=`딥링크 파라미터 연결은 `dashboard.js` 미확인 — 페이지 자체가 없어 검증 불가) |
| KPI 5종 (전체 사용자/발행 분석 카드/카드 발행 승인 대기/가입 승인 대기/미답변 문의) | `.ws-kpi-grid` | 각 카드가 관리 페이지로 링크(`admin-users/ai-card/admin-publish?status=대기/admin-inquiry`) | **부분** | `landxi/assets/data/dashboard.js`에 5개 값 모두 보유하나, `dashboard.js renderKpis()`가 "가입 승인 대기"를 별도 타일 없이 전체사용자 부제로 통합 → 화면상 4타일만 노출. 카드 클릭 시 이동할 대상 페이지(`admin-users.html` 등)는 전부 미구현 |
| AI 백본 모델 상태 카드 | `#backbone-card` | 모델명·버전·최종 적용일·연결 과제 수 정적 표시 | **있음** | `landxi/dashboard.html` "백본 모델" 섹션, `DASH.backbone` 동일 필드 |
| 운영 지표 3탭 차트(프로젝트 용량 Top5 / 7일 방문 / 스토리지 도넛) | `#projChart #visitChart #storeChart`(ECharts) | 지연 로딩(idle) 후 렌더 | **있음** | `landxi/dashboard.html` `.tabs`(3탭 동일 구성), `dashboard.js initCharts()`. 단 스토리지는 도넛→세그먼트 막대바로 형태 변경(기능 동일, 시각화만 다름) |
| 카드 발행 승인 대기 목록 + 빈 상태 | `#apList / #apEmpty` | 대기 카드 리스트, 클릭 시 `admin-publish.html?open=<id>` | **부분** | `landxi/dashboard.js`의 "처리 대기 큐"가 카드/가입/문의 3종을 하나로 합쳐 표시(같은 데이터, UI 통합) — 개별 "카드 발행 관리로" 진입 링크는 있음 |
| 사용자·콘텐츠 관리 타일 4종(사용자/공지/문의/FAQ) | `.support-grid` | 각 관리 페이지 링크 | **부분** | `landxi/dashboard.js TILES` 동일 4종 존재. 링크 대상 페이지 전부 미구현 |
| 상단 날짜(`기준일 현재`) | `#dash-now-date` | 오늘 날짜 표시 | **있음** | `#dashDate` |

---

## 3. 데이터 관리 — `dataset.html` (+ 프래그먼트 4종)

원본 구조: 지도 배경(OpenLayers) 위 좌측 플로팅 패널, 4개 탭이 `fetch()`로 프래그먼트를 지연 로드하고 `?tab=` 으로 히스토리 관리(`dataset.html?tab=upload|manage|publishing|archive`).

| 기능 | 원본 위치 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|---|
| 배경 지도(전국 뷰, 클릭 시 상세 패널 닫힘) | `#ds-map`(OL) | `NamwonMap.initMap`, 탭 전환해도 재초기화 없음 | **없음** | |
| 탭 4종: 데이터 업로드 / 업로드 완료 / 레이어 발행중 / 아카이브 | `#ds-tabs` | 클릭 시 `dataset-upload.html` 등 프래그먼트 fetch, `?tab=` 로 URL 동기화, 탭 전환 시 필터칩/하단패널 상태 초기화 | **없음** | |
| **업로드 탭**: 파일형식 필터(전체/ECW/TIF/ZIP/SHP/XLSX/기타), 검색, 업로드 폼(파일명/업로드상태), 업로드 중 카드별 일시정지·재개·이어올리기·업로드취소·세부정보, 디스크 증량 신청 모달(32~1024GB 프리셋+직접입력, 사유) | `dataset-upload.html` | | **없음** | 증량 신청 모달은 `mypage.html`에도 동일 패턴 존재(공용 컴포넌트로 추정) |
| **업로드 완료 탭**: 파일형식 필터, 검색, 레이어 발행 폼(발행유형/기준일자/데이터명/출처/설명/공유권한 표+기관명·권한명), "지도 레이어 발행" 실행 | `dataset-manage.html` | | **없음** | |
| **레이어 발행중 탭**: 파일형식 필터, 검색, 발행 취소 | `dataset-manage-publishing.html` | | **없음** | |
| **아카이브 탭**: 유형 필터(전체/정사영상/이미지셋/공간정보), 검색, 데이터 카드 표시/숨김 토글, 공유 설정 모달, 공간 편집, 삭제, 밴드/속성 표(공간정보 상세), 데이터셋 상세(속성명/속성정보/데이터명/출처/설명) | `dataset-archive.html` | | **없음** | |

---

## 4. 프로젝트 — `ai-project.html` 목록 + 워크플로우 캔버스 8스텝

### 4-1. 목록 `ai-project.html`
| 기능 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|
| 프로젝트 검색 | 텍스트 검색 | **없음** | |
| 프로젝트 카드/행 목록 + 페이지네이션(처음/이전/다음/마지막) | `assets/js/ai-project-data.js` 시드 데이터 | **없음** | |
| "AI 개발 프로젝트 만들기" 진입 | → `ai-project-create.html` | **없음** | |

### 4-2. 프로젝트 상세 — 슬림 사이드바(Roboflow형, `project-sidebar.js`) 4그룹 8스텝
`<div id="project-sidebar" data-active="...">`가 `?pid=`를 유지하며 아래 트리를 렌더링 (2026.08.21 회의록 결정 4: AI 모델 등록을 Deploy 단, 카드 발행 요청 바로 위로 배치):

```
[뒤로: 프로젝트 목록]  [현재 프로젝트명]
Project
  ├─ 프로젝트 개요        ai-project-view.html?pid=N
Data
  ├─ 파일 업로드          ai-project-files.html?pid=N
  ├─ 라벨링              ai-project-work.html?pid=N&tab=labeling
  └─ 데이터셋            ai-project-dataset.html?pid=N
Models
  ├─ AI 학습             ai-project-work.html?pid=N&tab=training
  └─ AI 분석             ai-project-work.html?pid=N&tab=analysis
Deploy
  ├─ AI 모델 등록         ai-project-models.html?pid=N
  └─ 카드 발행 요청        ai-project-deploy.html?pid=N
```
(주석: "클래스 관리 메뉴 폐지 — 클래스 등록·삭제는 라벨링 화면에서 수행" → 원본 자체의 최근 개편이므로 우리 구현이 폐지된 메뉴를 되살리면 안 됨)

| 기능 | 원본 위치 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|---|
| 프로젝트 개요(정보 열람) | `ai-project-view.html` | 프로젝트 메타 정보 표시 | **없음** | |
| 구성원 초대 모달 | `ai-project-view.html #ap-modal-invite` | 아이디(이메일) 확인→이름 자동입력, 역할(편집자/뷰어) 선택, 초대 | **없음** | |
| 파일 업로드 | `ai-project-files.html` | | **없음** | |
| 라벨링 워크스페이스 | `ai-project-work.html?tab=labeling` | 지도(OL) + 좌측 사이드패널 클래스/라벨 2탭, 클래스 일괄변경·공유설정 모달 | **없음** | |
| AI 학습 | `ai-project-work.html?tab=training` | | **없음** | |
| AI 분석 | `ai-project-work.html?tab=analysis` | `analysis-done-polygons.js` 결과 오버레이 | **없음** | |
| 데이터셋 | `ai-project-dataset.html` | | **없음** | |
| AI 모델 등록 | `ai-project-models.html` | 빈 상태: "등록된 모델이 없습니다" | **없음** | |
| 카드 발행 요청 | `ai-project-deploy.html` | 요청 이력 표(상태/과제명/학습결과/모델명/과제유형/요청자/요청일), 빈 상태: "발행 요청 이력이 없습니다" | **없음** | |
| 프로젝트 만들기 마법사 | `ai-project-create.html` | | **없음** | |

`landxi/proto/workflow.html`("국토 조사 보드 · 남원시 비닐하우스 9,664동")은 원본의 워크플로우 캔버스와 이름만 유사할 뿐 내용·목적이 다른 별개 프로토타입(칸반형 보드) — **원본 기능의 대체가 아님**, 별도 탐색용 스파이크로 취급.

---

## 5. 분석 서비스 — `analysis-ai.html`

플로팅 패널 3탭(전부 DOM에 동시 존재, JS로 `.is-active` 토글 — URL 파라미터 없음).

| 기능 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|
| 탭: 분석 실행 | 분석 과제 선택 → 모델 선택(과제 종속, 초기 hidden) → 영상/이미지(아카이브) 선택 3단 픽커 | **없음** | |
| 탭: 분석 실행중 | 상태 필터칩(전체/대기 중/처리 중/처리 실패), 등록자 필터(내 것/공유받은 것), 새로고침, 검색(분석명/과제명/범위정보 + 분석과제/기준일자), 페이지네이션 | **없음** | |
| 탭: 분석 완료 | 유사 필터+검색, 결과 편집(지도 오버레이, `analysis-done-polygons.js`), 이동/삭제, 공유 설정 모달(×2 변형) | **없음** | |

---

## 6. 지도 서비스(XI맵) — `ximap.html`

원본에서 가장 큰 페이지(5,480줄). 비교 모드 3종(기본/겹쳐보기/나란히보기), 지역·탐지결과 조회, 통계/보고서 발급이 iframe(`?embed=1`)으로 연결된다.

| 기능 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|
| 비교 모드 탭: 기본 / 겹쳐보기 / 나란히보기 | 좌(L)/우(R) 영상 선택→변경, 슬라이더 디바이더 | **없음** | |
| 좌측 패널: 공간 정보 / 지역 구분 / 분석 결과 3탭 | | **없음** | |
| 지역 검색(시도/시군구/읍면동), 지역 설정 저장 | | **없음** | |
| 탐지 결과: 기본 정보/탐지 정보 탭, 클래스별 범례, 심각도, 주소, 탐지일시, 페이지네이션(1~5+처음/이전/다음/마지막) | | **없음** | |
| 탐지 결과 상세 표 3종(지목별/필지별/도로지점별) — 시도/시군구/읍면동/리/산/본번/부번 단위 집계 | | **없음** | |
| AI 분석 결과 레이어 토글, 전체 지우기 | | **없음** | |
| **통계 자세히 보기** → `stats-standard.html?task=<key>&embed=1` iframe 모달 | 지역별/클래스별 통계 탭, 검색(실행자/기준일/클래스), 기간 필터(1/3/6/12개월), "분석 결과 찾기" 모달 | **없음** | 원본 크롤 시 `<a href>`로는 발견되지 않고 `ximap.html`의 JS 문자열(`FILE_MAP`)에서 확인 — 딥링크 파라미터 `?task=road_ortho|road_camera|silage_bale|feed_crop_growth|feed_crop_harvest|farmland|greenhouse` |
| **보고서 발급** → 모달 내 탭(보고서 발급 요청/발급 내역), 각각 `report-standard-issue.html?task=…&embed=1` / `report-standard.html?task=…&embed=1` iframe | 발급 요청 폼(보고서 제목/탐지 클래스/대상 지역), 발급 내역 표+검색+기간필터 | **없음** | `?embed=1` 모드는 헤더/풋터/사이드바 숨김 + 필수 입력 해제(발급 요청 폼 제외) + "통계 보기" 버튼 자동 클릭까지 처리하는 공용 임베드 프로토콜(`layout.js`) — 우리 구현에 대응 개념 없음 |

---

## 7. 서비스 지원 (공지·FAQ·문의·활용사례·매뉴얼)

5개 페이지가 상단 `admin-tabnav`로 서로 연결: **공지사항 / 자주 묻는 질문 / 문의하기 / 활용사례 / 매뉴얼**

| 페이지 | 기능 | 우리 구현 | 비고 |
|---|---|---|---|
| `notice.html` | 구분·검색어 필터, 표(구분/제목/등록일), 상세 클릭, `?notice=<id>` 딥링크(대시보드 공지 스트립에서 진입), 페이지네이션 | **없음** | `landxi/dashboard.html`이 이 페이지로 링크만 함 |
| `faq.html` | 구분·검색어 필터, 아코디언 목록(`support-data.js`) | **없음** | |
| `contact.html` | 문의 등록 폼(제목/내용/첨부파일), 내 문의 내역 표(제목/상태/등록일시), 상태·등록일 검색, 기간필터, 삭제 | **없음** | |
| `usecase.html` | 검색어, 카드형 사례 목록, 상세 모달(`caseModal`: 제목/일자/본문/첨부), 페이지네이션 | **없음** | 원본 `home.html`의 "서비스 활용 사례" 섹션과 동일 데이터/모달을 재사용 |
| `manual.html` | 매뉴얼 콘텐츠(카테고리별) | **없음** | |

---

## 8. 카드 발행 관리 — `admin-publish.html` (+ `ai-card*`, `ai-publish-create.html`)

| 기능 | 원본 위치 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|---|
| 상태 필터 탭(전체/대기/검토중/승인/반려) | `admin-publish.html` | `?status=<라벨>` 딥링크로 초기 필터 지정(대시보드 KPI가 `?status=대기`로 진입) | **없음** | |
| 검색/초기화 | | | **없음** | |
| 발행 승인 상세 열람 | `?open=<id>` 딥링크(대시보드 목록 클릭 진입) | 개요/구성원/라벨링/학습 결과/분석 결과 탭, 지도(OL) 탐지결과 오버레이(도로파손/카메라 탐지 스타일링), 상태 변경(대기→검토중→승인/반려), 반려 사유 입력, 권한 선택 | **없음** | |
| 클래스 일괄 변경 모달 | | 클래스/라벨 탭 | **없음** | |
| 카드 발행 목록(공개 화면) | `ai-card.html` | 검색어·공개 여부 필터, 페이지네이션, 빈 상태(발행된 카드가 없습니다) | **없음** | |
| 카드 발행/편집 폼 | `ai-card-edit.html` | 모델명/모델유형/알고리즘/사용여부/모델설명/도커 이미지명·태그/탐지형태/타일링크기/모델 설명 화면(이미지 업로드) | **없음** | |
| 카드 발행 요청 생성 | `ai-publish-create.html?pid=N` | 프로젝트에서 진입, 프로젝트별 발행 요청 폼 | **없음** | `ai-project-deploy.html`(프로젝트 사이드바 "카드 발행 요청")과 사실상 동일 기능의 전역 진입점 — `project-sidebar.js`가 `a[href="ai-publish.html"]`를 프로젝트 스코프 링크로 자동 치환 |

---

## 9. 서비스 관리 (공지·문의·FAQ·사용자·지도 속성)

5개 페이지, 상단 `admin-tabnav`로 연결: **공지사항 관리 / 문의 관리 / 자주 묻는 질문 관리 / 사용자 관리 / 지도 속성 관리**

| 페이지 | 기능 | 우리 구현 | 비고 |
|---|---|---|---|
| `admin-notice.html` | 구분·게시기간 검색, 표(구분/제목/게시시작/게시종료/등록자/등록일시), 등록/수정 폼(구분/제목/게시기간 프리셋 1~4주+커스텀/팝업 설정/내용/첨부파일), 삭제, 기간필터(1/3/6/12개월), 페이지네이션 | **없음** | |
| `admin-inquiry.html` | 상태·등록일 검색, 표(제목/상태/등록일시/등록자/답변일시/답변자), 답변 작성/수정/삭제 | **없음** | |
| `admin-faq.html` | 구분·검색어, 표(구분/제목/등록자/등록일시), 등록/수정(구분/제목/내용/첨부), 삭제 | **없음** | |
| `admin-users.html` | 아이디·이름·전화번호·부서·계정상태·처리상태·가입일 검색, 사용자 표(11열), 승인/거부, 로그인 이력 모달, 비밀번호 변경 이력 모달(각각 빈 상태 문구 보유) | **없음** | |
| `admin-map.html` | 지도 표시 스타일(LX맵 구분), 기본 배경지도, 탐지 결과 색상·두께 설정, 값 변경/기본값 복원/취소/저장 | **없음** | `assets/js/map-props.js` |

---

## 10. 마이페이지 — `mypage.html`

| 기능 | 동작 | 우리 구현 | 비고 |
|---|---|---|---|
| 회원 정보(이름/아이디/전화번호/직위/부서) 열람·수정 | | **없음** | |
| 내 디스크 사용 현황 + 증량 신청 모달(32~1024GB 프리셋/직접입력/사유) | 신청 이력 표(신청용량/사유/신청일시/처리여부/처리내용) | **없음** | `dataset.html` 업로드 탭과 동일 모달 패턴 |
| 본인 확인 모달(현재 비밀번호) → 비밀번호 변경 모달 | | **없음** | |
| 브랜드 심볼(사이드바 로고) 업로드 — 가로 크기 지정 | `applyCustomSymbol()`(layout.js)로 계정별 localStorage 적용 | **없음** | |
| 계정 탈퇴/초기화 | | **없음** | |

---

## 11. 인증 — `login.html` / `signup.html` / `find-id.html` / `find-password.html`(+result)

| 페이지 | 기능 | 우리 구현 | 비고 |
|---|---|---|---|
| `login.html` | 아이디(이메일)/비밀번호 입력, 로그인 실행(`localStorage lx_logged_in`), 아이디 찾기/비밀번호 찾기/계정 신청하기 링크 | **부분** | `landxi/login.html` 폼 필드·"아이디 저장" 체크박스까지 1:1. `AuthState`/오픈리다이렉트 방지(`safeNext`)까지 이식됨(있음). 단 "아이디 찾기"/"비밀번호 찾기" 버튼이 원본처럼 전용 페이지로 이동하지 않고 `NotifyUI.alert()` 안내 문구만 뜸 — 실제 폼(이름+전화번호/이메일) 미구현 |
| `signup.html` | 다단계(다음/이전) 계정 신청 폼: 이메일/비밀번호/비밀번호 확인/이름/연락처/소속부서/직위 | **없음** | `landxi/login.html`에 `signup.html` 링크는 있으나 대상 페이지 없음(깨진 링크) |
| `find-id.html` | 이름+전화번호로 아이디 찾기 | **없음** | |
| `find-password.html` (+ `find-password-result.html`) | 이름+아이디(이메일)로 비밀번호 찾기, 결과 페이지 | **없음** | |

---

## 12. 홈 — `home.html`

원본은 정적 마케팅 랜딩(리다이렉트 대상). 우리 구현은 6씬 스크롤텔링으로 완전히 재설계됨 — **구조 자체가 다르므로 "부분" 항목이 많고, 일부는 명시적 TODO 스텁**.

| 원본 섹션 | 원본 기능 | 우리 구현 | 비고 |
|---|---|---|---|
| Hero | 헤드라인, 로그인 CTA | **있음** | `landxi/home.html` scene 1(궤도) — 문구는 재작성됐지만 로그인 CTA·구조적 역할 동일 |
| Trust 스트립 | 신뢰 로고/지표 | **부분** | scene 1 "ORBIT" 스트립(위성/항공/드론 자산 수)으로 대체 — 다른 정보지만 같은 위치 |
| 노코드 워크플로우 4-node 플로우 | 데이터→모델→학습→평가 시각화 | **없음(스텁)** | scene 5 "만드는 법" `data-todo="pipeline-canvas"` — 자리만 있고 미구현 |
| Before/After 슬라이더(원본 vs AI 분석 결과) | 이미지 비교 슬라이더 | **없음** | |
| 특징 섹션 3종(모델 재사용/드론·항공·위성 통합/지도 결과 확인) | | **없음** | |
| 서비스 라인업(13종 칩) | | **부분** | scene 2 "전국 서비스 현황"에 `.lineup__chips` 컨테이너와 KPI(공공분석서비스 13종 등) 존재 — 칩 렌더 로직은 `home.js` 확인 필요하나 마크업상 자리는 대응 |
| 서비스 활용 사례(카드+모달) | `usecase.html`과 데이터 공유 | **없음(스텁)** | scene 3 "서비스 스토리" `data-todo="story-deck"` |
| CTA 밴드("지금 로그인하고 분석을 시작하세요") | | **있음(변형)** | scene 1 히어로의 로그인 CTA로 통합 |
| 서비스 문의(폼: 이름/소속/전화번호/문의내용 + 모달) | | **없음(스텁)** | scene 6 "문의" `data-todo="contact-footer"` — "문의 카드 3종과 정부 표준 푸터가 이 자리에 들어갑니다" 주석만 존재 |
| 통합조사 시뮬레이터 | (원본에 없는 신규 섹션 아이디어) | **없음(스텁)** | scene 4, `data-todo="survey-simulator"` — **원본에 대응 기능 없음.** 클라이언트 요구사항(추가 없음)과 배치될 수 있으므로 확인 필요 — 부록 D 참고 |
| 정부 표준 푸터(개인정보처리방침/이용약관/LX 로고/고객센터/Family Site) | `include/footer.html` | **없음** | |

---

## 13. 딥링크 파라미터 총정리

| 파라미터 | 사용 페이지 | 의미 |
|---|---|---|
| `?tab=` | `dataset.html`(upload/manage/publishing/archive) | 데이터 관리 4탭 상태, `history.pushState`로 동기화 |
| `?tab=` | `ai-project-work.html`(labeling/training/analysis) | 프로젝트 워크스페이스 활성 탭 |
| `?pid=` | `ai-project-view/files/work/dataset/models/deploy.html`, `ai-publish-create.html` | 프로젝트 ID (없으면 `ai-project.html`로 리다이렉트) |
| `?status=` | `admin-publish.html` (예: `대기`) | 카드 발행 승인 상태 필터 초깃값 |
| `?open=` | `admin-publish.html` (예: `pa-1`) | 특정 승인 요청 상세를 열어서 진입 |
| `?notice=` | `notice.html` (예: `8`) | 특정 공지 상세로 스크롤/오픈 |
| `?task=` | `stats-standard.html`, `report-standard.html`, `report-standard-issue.html` | 표준 분석 과제 키(`road_ortho`,`road_camera`,`silage_bale`,`feed_crop_growth`,`feed_crop_harvest`,`farmland`,`greenhouse`) |
| `?embed=1` | 위 3개 XI맵 통계/보고서 페이지(iframe 전용) | 헤더/풋터/사이드바 숨김, 필수입력 해제(발급요청 폼 제외), "통계 보기" 버튼 자동 클릭, 모달 close/submit을 `postMessage`로 부모에 전달 |
| `?next=` | (우리 구현 `login.js`에만 존재) | 로그인 후 리다이렉트 대상 — 원본 `login.html` 소스에는 없는 파라미터. 오픈 리다이렉트 방지 로직과 함께 도입된 것으로, 기능 확장이라기보다 보안 보완이라 위반으로 보기 어려우나 명시 기록 |

---

## 14. 위반 사항 요약 (추가됨/누락됨)

**추가됨(원본에 없는데 우리 쪽에 있음): 0건 확정.** 코드로 배포된 3개 페이지(`dashboard/home/login.html`) 범위 내에서는 원본에 없던 기능을 만든 사례를 찾지 못함. 다만 아래 1건은 "설계상 존재 위험"으로 반드시 확인 필요:

- **`home.html` scene 4 "통합조사 시뮬레이터"** — 원본 `home.html` 어디에도 대응 섹션이 없다. 현재는 `data-todo="survey-simulator"` 스텁이라 실제 위반은 아니지만, 이 자리를 실제로 채워 넣는 순간 "추가·삭제 없음" 규칙 위반이 된다. 구현 전 클라이언트 확인 필요.
- design-canvas의 `A/B/C-Workflow.dc.html`(디자인 목업)도 원본 워크플로우 캔버스와 이름은 같지만 구성이 다를 수 있어 실제 구현 착수 전 원본 8스텝 사이드바 구조(4-2절)와 대조 필요.

**누락됨(원본에 있는데 우리 쪽에 없음): 사실상 전부.** `plan1-foundation`이 1차 스캐폴딩 단계이므로 예상된 상태이며 "위반"이라기보다 "TODO"에 해당하나, 규모 파악을 위해 클러스터별로 다시 정리:

1. 좌측 GNB/사이드바 셸 전체 (9개 메뉴 트리, active 상태, MY 플라이아웃)
2. 데이터 관리 — 4탭 전체(업로드/업로드완료/레이어발행중/아카이브), 배경 지도
3. 프로젝트 — 목록 + 워크플로우 8스텝(개요/파일업로드/라벨링/데이터셋/AI학습/AI분석/AI모델등록/카드발행요청) 전체, 프로젝트 생성 마법사
4. 분석 서비스 — 3탭(실행/실행중/완료) 전체
5. XI맵 — 3비교모드, 지역/탐지결과 조회, 통계·보고서 발급(embed iframe) 전체
6. 서비스 지원 5페이지(공지/FAQ/문의/활용사례/매뉴얼) 전체
7. 카드 발행 관리 — 승인 큐, 상세 검토, 공개 카드 목록·편집 전체
8. 서비스 관리 5페이지(공지/문의/FAQ/사용자/지도속성 관리) 전체
9. 마이페이지 전체
10. 회원가입/아이디찾기/비밀번호찾기 전용 폼(로그인 화면의 안내 alert만 존재)
11. `home.html`의 4/6 씬(노코드 플로우, Before/After, 특징 3종, 활용사례 모달, 문의 폼, 푸터)

---

## 부록 A. 스크린샷 목록 (`shots/original/`)

기본 상태(35개 템플릿) + 탭/모드/딥링크 변형(21개) = 56개 PNG. 파일명 규칙: `<페이지>_<변형>.png`.

주요 변형 스크린샷:
- `dataset_tab-{manage,publishing,archive}.png` — 데이터 관리 4탭
- `analysis-ai_tab-{running,done}.png` — 분석 서비스 3탭
- `ximap_mode-{overlay,sidebyside}.png` — XI맵 비교 모드
- `ai-project-view_pid_1_tab_overview.png`, `ai-project-work_pid_1_tab_{labeling,training,analysis}.png`, `ai-project-{files,dataset,models,deploy}_pid_1.png` — 프로젝트 워크플로우 8스텝
- `admin-publish_status_대기.png`, `admin-publish_open_pa-1.png` — 카드 발행 관리 딥링크
- `notice_notice_8.png` — 공지 상세 딥링크
- `stats-standard_task-farmland{,_embed}.png`, `report-standard_task-farmland{,_embed}.png`, `report-standard-issue_task-farmland{,_embed}.png` — XI맵 통계/보고서 embed 모달
- `login_empty-submit-error.png` — 로그인 빈 값 제출 에러 상태

## 부록 B. 데이터 소스 (`assets/data/*.js`)

원본에서 확인된 데이터 스크립트: `support-data.js`(공지/FAQ/활용사례), `dataset-archive-data.js`, `analysis-done-polygons.js`, `ai-project-data.js`, `ai-project6-store.js`(프로젝트 상태 스토어), `admin-info-data.js`, `stats-config.js`, `report-config.js`, `report-regions.js`. 전부 클라이언트 사이드 목업(시드 배열) — 실제 API 연동 없음.

## 부록 C. GNB에서 도달 불가능한 잔존 페이지 (조사 범위 밖, 참고용)

`assets/js/layout.js`의 `fileMenuMap`/접두어 규칙에는 존재하지만 어떤 링크로도 연결되지 않는 구버전/시안 페이지들 (HTTP 200이지만 고아 상태):
`dashboard2.html`(LX 직원 대시보드), `dashboard3.html`(동일 제목, 다른 시안), `map-home.html`(지도 홈), `map-home2.html`(지도 홈 시안 A·흰색), `history.html`(AI 분석 결과), `history-road.html`(AI 분석 결과 열람), `report-silage.html`/`report-silage-issue.html`(조사료 탐지 결과 보고서 — `report-standard.html?task=silage_bale`로 일반화되기 전 구버전으로 추정).
→ 이번 인벤토리 범위(GNB 도달 가능 페이지)에서 **제외**. 향후 이식 시 "이미 폐기된 시안"으로 간주하고 `report-standard.html?task=silage_bale` 등 현재 버전만 기준으로 삼을 것.

## 부록 D. 확인 필요 사항 (클라이언트 확인 권장)

1. `home.html` scene 4 "통합조사 시뮬레이터" — 원본에 없는 신규 개념. 유지/제거 여부 확인 필요.
2. 로그인 화면 "아이디 찾기/비밀번호 찾기"가 원본처럼 전용 폼 페이지로 갈지, 현재처럼 안내 alert로 남을지 확인 필요(원본은 전용 폼 페이지 보유).
3. `home.html`의 6씬 재구성이 원본 랜딩 페이지의 정보 구조(Hero→Trust→Flow→Before/After→Features×3→Lineup→Cases→CTA→Contact→Footer)를 실질적으로 대체하는지, 아니면 완전히 새 IA로 갈 것인지 — 클라이언트 규칙("추가 없음")과의 정합성 확인 필요.
