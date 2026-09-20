# Land-XI UI/UX 자동 전수 감사 — 2026-09-20

- 대상: 구현 화면 6(+보조 7) · 검토 원판 20(`B5-*`, masters.mjs `review`) · 원본 인벤토리 전 페이지
- 기준: (a) `docs/superpowers/specs/2026-08-26-landxi7-function-inventory.md` (b) `design/system.md` (c) `design-canvas/v2/NOTES.md` 반려 이력 · 허브 `landxi/proto/review/index.html` D번호 · `tools/review/masters.mjs` STATUS
- 방법: `PORT=4188 node tools/serve.mjs` + Playwright(`channel:'chrome'`) 1440×900 / 1280×800 / 1920×1080 / 390×844 / `reducedMotion`. 전 페이지 계산 스타일 스캔(글자 크기 · 색 · radius · shadow · gradient · backdrop), 전 `a[href]` 상태 코드 확인, Tab 30회 포커스 순서, 컨트롤 전수 클릭. 원판은 PNG 육안 + `.dc.html` 을 브라우저에 올려 계산 스타일 실측.
- 증거: 스크린샷 165장 + 원시 측정 JSON 4개 = `shots/audit-0920/` (`_general.json` 일반 패스 · `_interact.json` 상호작용 · `_scrub.json` 필름 · `_masters.json` 원판 실측). 아래 `[그림]` 은 전부 이 폴더 기준 파일명.
- 한계(숨기지 않음): ① `shots/original/` 은 이 PC에 시트 3장뿐(개별 56장은 gitignore로 부재) — 원본 대조는 인벤토리 문서와 원본 라이브 URL로 했다. ② 파리티 %는 인벤토리 표의 **기능 행** 기준 수작업 집계(분모를 같이 적음). ③ B6 원판은 동시 작업 중이라 비평하지 않았다(파일 존재만 확인). ④ 인벤토리 §0의 "35 템플릿"은 중복 집계 방식이 문서에 없어 재현 불가 — §0 표는 인벤토리에 **이름이 나온 모든 페이지 39행**(35 템플릿 + 프래그먼트·결과 페이지 분리)으로 적었다.

발견 건수: **P0 3 · P1 19 · P2 43 · P3 16 = 81건** (§1 · §2 표의 ID 행 기준)

---

## §0 한 장 요약

등급: A = 기준 이상 · B = 기준 충족, 다듬기 필요 · C = 기준 미달 항목 다수 · D = 깨짐/허접 위험. `—` = 평가 대상 없음.
파리티 = (그려졌거나 동작하는 인벤토리 기능 행) / (인벤토리 기능 행). 원판만 있는 화면은 "원판 파리티".

| # | 원본 페이지 | 원판 | 구현 | 파리티 | 등급 | 가장 큰 문제 1줄 |
|---|---|---|---|---|---|---|
| 1 | `home.html` | LIVE-Main(구현본이 원판) | `scrub/index.html` | 3/11 섹션(27 %) | **A−**(연출) / C(기능) | 로그인 진입점이 16.6화면 스크롤 뒤 1곳뿐, 원본 라인업·활용사례·문의 폼·푸터 없음(M1·M3) |
| 2 | `login.html` | B5-Login 적용 | `login.html` | 폼 4/4 · 링크 0/3 | **B+** | `아이디 찾기`·`비밀번호 찾기`·`계정 신청하기` 3링크 전부 404(L1) |
| 3 | `signup.html` | B6 설계 중 | 없음 | 0 | — | 로그인에서 404로 도달 |
| 4 | `find-id.html` | B6 설계 중 | 없음 | 0 | — | 〃 |
| 5 | `find-password.html` | B6 설계 중 | 없음 | 0 | — | 〃 |
| 6 | `find-password-result.html` | B6 설계 중 | 없음 | 0 | — | — |
| 7 | `dashboard.html`(관리자) | B5-Dashboard-Data 적용 | `dashboard.html` | 위젯 7/7 · 딥링크 대상 0/9 | **B** | 화면 밖으로 나가는 링크 9종 전부 404, KPI 5 중 4개는 링크가 아님(D1·D2) |
| 8 | (dashboard2 · 사용자) | B5-Dashboard-User 검토 | 없음 | 원판만 | **C** | 14px 미만 글자 46곳 · gradient 3 · `전월 대비 +15 %` · 시연 표식 0(U1) |
| 9 | (dashboard3 · 뷰어) | B5-Dashboard-Viewer 검토 | 없음 | 원판만 | **B−** | 푸터에 설계 메모 문장이 그대로 노출, 레일 마크 없음(U2) |
| 10 | `dataset.html` | B5-DataMgmt 적용 | `dataset.html` | 컨트롤 전수(파리티 문서 §11) | **B+** | 타일 26개 전부 키보드 접근 불가, 우 패널이 최대 868/385px로 넘침(S1·S7) |
| 11 | `dataset-upload.html` | B5-DataMgmt-Upload 적용 | `?tab=upload` | 9/9 | **B** | 검색 0건일 때 빈 상태·건수·현황판이 반응 안 함(S3) |
| 12 | `dataset-manage.html` | 〃 | `?tab=manage` | 4/4 | **B** | 발행 폼의 `공유 권한`·제출 버튼이 패널 스크롤 아래로 잘림(S7) |
| 13 | `dataset-manage-publishing.html` | 〃 | `?tab=publishing` | 3/3 | **B+** | 캡션 말줄임 7/7(S5) |
| 14 | `dataset-archive.html` | 〃 | `?tab=archive` | 7/8 | **B−** | `삭제`가 확인 없이 즉시 삭제, `공간 편집`은 지도 이동 토스트뿐(S2·S16) |
| 15 | `ai-project.html` | B5-Projects 검토 | 없음 | 원판 3/3 · 상태 0/2 | **B−** | 레일 마크 깨짐(P1m), 썸네일 저해상 업스케일, 0건·검색 0건 상태 없음 |
| 16 | `ai-project-create.html` | B5-Project-Create · -Review 검토 | 없음 | 원판 1/1 | **B** | 검토 판이 같은 7필드를 좌·우 두 번 보여주고 우측 360px가 빈다(P7m) |
| 17 | `ai-project-view.html` | B5-Project-Overview · -Delete 검토 | 없음 | 원판 2/2 | **C+** | 구성원 3행이 `—` 빈 행 — 깨진 화면으로 읽힘, 렌더 PNG가 소스와 다름(P4m·H3) |
| 18 | `ai-project-files.html` | B5-Project-Data 검토 | 없음 | 원판 1/1 · 업로드 진행/실패 0 | **B** | 업로드 진행·실패·0건 상태 미작성(P10m) |
| 19 | `ai-project-work.html`(라벨링·학습·분석) | B5-Project-Labeling · -Train · -Analysis 검토 | 없음 | 원판 3/3 탭 | **B−** | 툴바 라벨 겹침·절단(Labeling), 컬럼 밖 글자·12px 8곳(Train), 캔버스 밖 글자(Analysis) |
| 20 | `ai-project-dataset.html` | B5-Project-Data(하단 띠) | 없음 | 부분 | **C** | 데이터셋이 Data 판 하단 2행으로만 존재 — 만들기 폼·상세 미작성 |
| 21 | `ai-project-models.html` | B5-Project-Deploy(빈 상태) | 없음 | 원판 1/1 | **B** | 등록 폼/등록 후 상태 미작성 |
| 22 | `ai-project-deploy.html` | B5-Project-Deploy 검토 | 없음 | 원판 1/1 | **B** | 13px 2곳, 소개 글이 팝오버 밑으로 잘린 채 |
| 23 | `analysis-ai.html` | B5-Analysis ×4 검토 | 없음 | 12/14(NOTES §19.3) | **B** | 준비 중 10개 서비스가 실측 5개와 구분 없이 같은 CTA(A1m), 미결 수치 9,664 vs 1,674 |
| 24 | `ximap.html` | B5-Map ×3 검토 | 없음 | 모드 2/3 · 상태 유보 5묶음 | **B+** | `나란히보기`·지역 구분·펼친 표·서약 모달 미작성 — 허브 D13 "38 상태 1:1" 문구와 불일치(X1m) |
| 25 | `stats-standard.html` | **없음** | 없음 | 0 | **—(공백)** | 원판·구현·B6 어디에도 없음(X2m) |
| 26 | `report-standard.html` | **없음** | 없음 | 0 | **—(공백)** | 〃 |
| 27 | `report-standard-issue.html` | **없음** | 없음 | 0 | **—(공백)** | 〃 |
| 28 | `notice.html` | B6 설계 중 | 없음 | 0 | — | 대시보드·데이터 관리 마스트헤드가 이 404로 링크 |
| 29 | `faq.html` | B6 설계 중 | 없음 | 0 | — | — |
| 30 | `contact.html` | B6 설계 중 | 없음 | 0 | — | — |
| 31 | `usecase.html` | B6 설계 중 | 없음 | 0 | — | — |
| 32 | `manual.html` | B6 설계 중 | 없음 | 0 | — | — |
| 33 | `admin-publish.html` | B6 설계 중 | 없음(대시보드가 `?status`·`?open` 을 자기 자신에게) | 0 | — | 대시보드 증거 카드의 `검토 ›` 가 갈 곳이 없음 |
| 34 | `ai-card.html` | B6 설계 중 | 없음 | 0 | — | — |
| 35 | `ai-card-edit.html` | B6 설계 중 | 없음 | 0 | — | — |
| 36 | `ai-publish-create.html` | B6 설계 중 | 없음 | 0 | — | — |
| 37 | `admin-notice/inquiry/faq/users/map.html`(5) | B6 설계 중 | 없음 | 0 | — | 대시보드 관리 타일 4개가 404 |
| 38 | `mypage.html` | B6 설계 중 | 없음 | 0 | — | 대시보드 MY 플라이아웃이 404 |
| 39 | 좌측 레일(공용 셸) | 원판마다 다름 | 화면마다 복제 | 이동 2/9 | **C** | 공용 셸 부재 — 레일·푸터·마스트가 3변종(C1) |

보조 화면(원본에 없음): 검토 허브 **B−**(D번호 충돌 H1) · 원판 갤러리 **B−**(stale 렌더 H3) · 필름 타임라인 **B+** · `dive.html`/`workflow.html`/`system.html` = 메인·로그인에서 링크되는 구 스파이크(M2·L3).

---

## §1 화면별 상세

### 1.1 메인 — `landxi/proto/scrub/index.html`

증거: `[그림] scrub-1440-0000 … -1000.png`(16정지점) · `scrub-1280-*` · `scrub-1920-*` · `scrub-rm-*` · `scrub-mobile-*` · `_scrub.json`.
동작 확인: 14레그 전부 재생, 콘솔 오류 0, 실패 요청 0, 14px 미만 글자 0(전 정지점), reduced-motion에서 영상 0 로드·포스터만·애니메이션 0(`_scrub.json` rm: 2.17 MB/38요청), 1280·1920·390에서 가로 넘침 0, 남원·여수 인계에서 MapLibre 판 마운트(maps 1→2). **연출 품질은 현 산출물 중 최고 — 기준점으로 삼을 것.**

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| M1 | P1 | 로그인 진입점이 마감 CTA 1곳뿐. 1440×900에서 문서 높이 16,661px(=16.6화면)를 다 내려야 `로그인하고 시작하기`가 나온다. 마스트헤드에 로그인 없음. 원본 Hero는 첫 화면에 로그인 CTA. | `scrub/index.html:20-31`(마스트 내비 3) · `:329` · `_scrub.json` dom.h · `scrub-1440-0000.png` |
| M2 | P1 | 마스트헤드 내비 `체계 · 리포트 · 워크플로우`가 제품 IA가 아니다: `../system.html`(컴포넌트 시트) · `../dashboard.html`(로그인 관문 뒤, 라벨은 "리포트") · `../workflow.html`(인벤토리 §4가 "원본 기능의 대체가 아님 · 별도 스파이크"로 못박은 칸반). 방문자에게 내부 작업물이 노출된다. | `scrub/index.html:24-26` · `legacy-workflow.png` · `legacy-system.png` |
| M3 | P1 | 원본 `home.html` 11섹션 중 서비스 라인업(13칩) · 활용사례(카드+모달) · 서비스 문의 폼 · 정부 표준 푸터 · Before/After · 노코드 플로우 없음. 인벤토리 부록 D-3("6씬 재구성이 원본 IA를 대체하는지 클라이언트 확인 필요")이 허브에 D번호로 올라온 적이 없다 — **미결 상태로 '적용' 표기 중.** | 인벤토리 §12 · 부록 D-3 · 허브 화면 현황 표 |
| M4 | P2 | `LIVE` 점멸 표시. 실시간 데이터가 없다 — system.md §5 "장식 숫자·지어낸 운영 서사 금지"의 취지에 어긋나는 장식 상태어. | `scrub/index.html:29` · `system.css:150-151` |
| M5 | P2 | 전송량: 1440 전체 스크롤 시 mp4 **57.3 MB** 전량을 fetch → blob(14레그 `preload=auto`, 1280/1920은 42.3 MB에서 멈춤 = 미도달 4레그), 최초 4초 ≈ 9 MB. 모바일 11.8 MB. 허브 예산(≤60/≤20) 안이지만 **첫 화면만 보고 떠나는 방문자도 9 MB**. 포스터 14장은 `loading` 미지정(eager, 0.67 MB). | `_scrub.json` byType · dom.preload · dom.posters |
| M6 | P2 | 마감 화면에 마스트헤드·푸터·정책 링크가 없다(검은 면 + CI + CTA 1). 원본 푸터(개인정보처리방침 · 이용약관 · 고객센터 · Family Site 7)는 공공 서비스 필수 요소. | `scrub-1440-1000.png` · 원본 `include/footer.html` |
| M7 | P3 | Tab 순서 6·7번째가 화면에 없는 MapLibre attribution 버튼 2개(접근 이름 없음). | `_scrub.json` 1440.tabs |
| M8 | P3 | 점프 스크롤 직후(0.565) 항로는 `울주` 점등, 계기판 좌표는 여수(127.7391, 34.5693). lerp 중간 상태가 그대로 읽힌다. | `scrub-1440-0565.png` |

제안 → A1 · A2 · A9.

### 1.2 로그인 — `landxi/proto/login.html`

증거: `login-1440/1280/1920.png` · `login-empty-submit.png` · `login-bad-email.png` · `login-focus-email.png` · `login-1440-reduced.png`.
동작 확인: 빈 제출 시 원본 에러 2종, 포커스 밑줄 스윕, 성공 → `dashboard.html`, `?next=` 안전 리다이렉트, reduced-motion에서 영상 정지(`paused:true`), 14px 미만 0, radius/shadow/gradient 0, 3뷰포트 넘침 0.

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| L1 | **P0** | 폼의 보조 경로 3개가 전부 404: `find-id.html` · `find-password.html` · `signup.html`. | `login.html:66,76` · `_general.json` `__links` |
| L2 | P2 | 카드 아래 정책 링크 3개는 `preventDefault`만 걸린 무동작 앵커 — 누르면 아무 일도 없다. | `login.js:98` · `_interact.json` login.policyClick = 대화상자 0 |
| L3 | P2 | 워드마크 링크가 `dive.html`(구 스파이크, Arial 혼입)로 간다. 대시보드·데이터 관리 레일 마크는 `scrub/index.html`. 홈이 두 개다. | `login.html:21` · `legacy-dive.png` |
| L4 | P2 | 채운 파란 `로그인` 버튼(194×56)은 system.md §2 "채운 파란 버튼은 여전히 없다"와 정면 충돌. NOTES §14(5차)에 "로그인 예외"로 적혀 있지만 **법전에는 예외가 없다** — 구현 에이전트는 법전만 읽는다(system.md 1행). | `login.html:70` 주석 · `system.md:18,24` |
| L5 | P3 | 이메일 형식 검증 없음(`abc` + 아무 비밀번호 → 대시보드 진입). 원본도 에러 2종뿐이라 파리티 위반은 아니나, B6 Signup의 이메일 규칙과 맞춰야 한다. | `_interact.json` login.badEmail |
| L6 | P3 | placeholder `#CCCCCC` = 1.61:1. | `_interact.json` login.placeholderColor |

### 1.3 관리자 대시보드 — `landxi/proto/dashboard.html`

증거: `dashboard-1440-full.png` · `dashboard-tab-{proj,visit,store}.png` · `dashboard-seg-train.png` · `dashboard-cell-hover.png` · `dashboard-cell-click-404.png` · `dashboard-my-flyout.png` · `dashboard-open-pa1.png` · `dashboard-1024-full.png`.
동작 확인: 탭 3 전환 + ←→ 키, 판 모드 토글 2, 셀 호버 콜아웃(실값), KPI 카운트업, `?open=` 하이라이트, 1024에서 세로 스택(1024×1673, 넘침 0), reduced-motion 애니메이션 0, radius/shadow/gradient 0.

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| D1 | **P0** | 화면 밖으로 나가는 링크 9종 전부 404: 공지 `../notice.html?notice=8` · 탭 패널 `../ai-project.html` · 관리 타일 `../admin-users/notice/inquiry/faq.html` · MY `../mypage.html` · **판 셀 클릭 → `ximap.html?cell=…` 404 페이지로 이탈**. | `dashboard.js:183,289` · `db-data.js:105,111` · `dashboard.html:33,83` · `dashboard-cell-click-404.png` |
| D2 | P1 | KPI 5개 중 4개가 `<div>`(링크 아님). 원본은 5개 모두 관리 페이지로 링크(인벤토리 §2). 유일한 링크(`카드 발행 승인 대기`)도 자기 페이지 앵커. | `dashboard.js:91-92` · `_interact.json` dashboard.kpi |
| D3 | P1 | 레일 6항목(프로젝트·분석·지도·지원·카드 발행·서비스 관리)을 누르면 **같은 화면 안에서 스크롤/포커스 이동**한다. 메뉴를 눌렀는데 화면이 안 바뀌면 사용자는 고장으로 읽는다. 데이터 관리 화면의 같은 레일은 토스트 `원본 ai-project.html — 콘티 밖`을 띄운다 — 같은 부품이 화면마다 다르게 동작. | `dashboard.js:44,62-72` · `dataset.js:71-75` · `_interact.json` dashboard.rail / dataset.rail |
| D4 | P2 | 개발 주석이 화면 글자로 나온다: `?status=대기`(×2) · `?open=pa-1` · `?open=pa-6`. | `dashboard.js:89,284` · `dashboard.html:101` · `dashboard-1440-full.png` |
| D5 | P2 | 글자 바닥 14px 위반 3곳: 레일 라벨 **12.5px** · 마크 `LAND` 13px · 축 단위 13px. 원판 `B5-Dashboard-Data.dc.html`도 11px·12px×10. | `dashboard.css:53,60,207` · `_masters.json` B5-Dashboard-Data.small |
| D6 | P2 | `Paperlogy 400` 1곳 렌더(법전: 700/800 두 굵기뿐 — 400은 웹폰트 파일이 없어 합성 굵기). | `_general.json` dashboard@1440.fonts |
| D7 | P2 | `시연`/`추정` 출처가 KPI(21명·8건·6건)·방문 차트(812…5,575회)·프로젝트 용량에서는 **`title` 속성에만** 있다. 승인 카드에는 보이는 칩으로 붙어 있어 한 화면 안에서 정직 규칙이 두 방식. 키보드·터치로는 출처를 볼 수 없다. | `dashboard.js:214-216,281-283` · `dashboard-tab-visit.png` |
| D8 | P2 | `#CCCCCC` 글자(1.61:1)로 읽어야 하는 정보: 요일 라벨 7 · `잔여 139.5TB` · `(측정 10 · AOI 미지정 4)`. | `_interact.json` dashboard.contrast |
| D9 | P2 | MY 플라이아웃: `role` 없음 · Esc로 닫히지 않음. 판의 셀 9개는 `tabindex=0`이 0개 — 키보드로 판을 탐색할 수 없다(레일 '분석/지도'를 눌러야만 셀 포커스). | `_interact.json` dashboard.myRole/myEsc/cellsFocusable |
| D10 | P3 | 탭을 `사용자 이용 현황`·`전체 스토리지`로 바꿔도 `전체 보기 ›`는 계속 `ai-project.html`. | `_interact.json` dashboard.more-* |
| D11 | P3 | 푸터 `Family Site ▾`는 `<span tabindex=-1>` 무동작(원본은 7링크 드롭다운), 주소·Copyright 없음. | `dashboard.html:122` · `dashboard.js:293` |
| D12 | P1 | 허브 D17 "OK → 구현 + 역할 전환(MY)" — 사용자·뷰어 대시보드 미구현, 역할 전환 UI 없음. | 허브 D17 · masters.mjs:17-18 |

### 1.4 데이터 관리 — `landxi/proto/dataset.html` (4탭)

증거: `dataset-{upload,manage,publishing,archive}-1440.png` · `-selected.png` · `-empty.png` · `-pp4.png` · `-pp16.png` · `dataset-modal-quota(-error).png` · `dataset-modal-share.png` · `dataset-manage-pubform.png` · `dataset-publishing-fail.png` · `dataset-archive-a1.png` · `dataset-archive-delete.png` · `dataset-manage-1280x720-selected.png` · `dataset-rail-deadend.png`.
동작 확인: KPI 카드 = `?tab=` + 뒤로가기, 필터·검색, 쪽당 4/6/8/16 + 페이저, 업로드 상태 기계(일시정지·재개·취소·세부), 형식 검증(`bad.exe` → `허용 형식 아님`), 증량 모달(프리셋·직접 입력·사유 필수), 발행 폼, 좌표계 지정 → 재발행, 표시/숨김, 공유 모달, 메모(localStorage), 모달 Esc + 포커스 복귀(`quota-open`). 콘솔 오류 0, 14px 미만 0, radius/shadow/gradient 0. **기능 밀도는 구현 화면 중 최고.**

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| S1 | P1 | 타일 26개(6+8+7+5) 전부 키보드 접근 불가 — `div role=listitem` + click, `tabindex` 없음. 우 현황판 행(`.pb[tabindex=0]`)으로만 우회된다. "영상 썸네일이 1급 시민"(system.md §6)인 화면에서 1급 시민이 키보드에 없다. | `dataset.js:252,331,404,445` · `_interact.json` dataset.*.tileFocusable = 0 |
| S2 | P1 | 아카이브 `삭제`가 확인 없이 즉시 삭제(5→4), 되돌리기 없음. 같은 화면군의 프로젝트 삭제는 원판에 확인 모달이 있다(`B5-Project-Delete`). | `dataset.js:467` · `_interact.json` dataset.deleteConfirm · `dataset-archive-delete.png` |
| S16 | P1 | `공간 편집`은 편집기가 아니라 `… 범위로 이동` 토스트 + 지도 이동뿐(원본: 공간 편집). 파리티 문서가 "있음"으로 세고 있다면 과대 계상. | `dataset.js:473-475` |
| S3 | P2 | 검색 0건: 업로드 탭은 빈 상태 요소 자체가 없고(`#up-empty` 없음), 4탭 모두 툴바 건수(`6건`)와 우 현황판이 검색·필터를 따라가지 않는다 — 좌는 0장, 우는 6줄. | `dataset.html:80-97` · `_interact.json` dataset.*.emptyCount/sideWhenEmpty · `dataset-upload-empty.png` |
| S4 | P2 | 모달 포커스 트랩 없음 — Tab 10번째에 모달 밖(레일)로 나간다. `aria-modal="true"` 선언과 모순. | `dataset.js:807-817` · `_interact.json` dataset.modalTrap |
| S5 | P2 | 타일 캡션 말줄임 100 %(7/7 · 8/8 · 7/7 · 5/5). `NW_ortho_정…` 4장이 같은 글자로 보인다. 전체 이름은 `title`에만. | `_interact.json` dataset.*.truncated · `dataset-manage-1440.png` |
| S6 | P2 | 쪽당 16 = 80×49px 타일 · 이름 0 · 그리드 면적의 약 70 %(y 470–820)가 빈다 — system.md §6 "빈 띠 80px 초과 금지". 버튼 `title="4열 × 4"`는 실제(8열 × 2)와 다르고 NOTES §13.9도 4×4로 남아 있다. | `dataset.html:73` · `dataset.css:143,151-153` · `dataset-upload-pp16.png` |
| S7 | P2 | 우 패널 세로 넘침: 아카이브 상세 868/385px · 완료 상세 580/385 · 1280×720에서 522/205. 발행 이력·메모·`공유 권한`·제출 버튼이 스크롤 아래이고 스크롤 단서(페이드·룰)가 없다. | `_interact.json` dataset.archive.sideOverflow · side720 · `dataset-manage-pubform.png`(하단 `공유 권한` 절단) |
| S8 | P2 | 판 위 흰 글자 가독성: `NW_ortho…tif / GSD 1.08 cm` 라벨이 브래킷·밝은 영상과 겹친다. 업로드 타일의 파랑 `업로드중 63%`가 영상 위에서 안 읽힌다. | `dataset-manage-pubform.png` · `dataset-upload-1440.png` |
| S9 | P2 | 1280×720에서 타일 상태어와 `미리보기 없음`이 같은 자리에 겹쳐 글자가 깨져 보인다. | `dataset-manage-1280x720-selected.png`(2행 2열) |
| S10 | P2 | `#CCCCCC` 글자: 대기 타일 캡션 · `시연` 칩 · 숨김 자산 이름 · 푸터 주소 · `좌표계 없음`. | `_interact.json` dataset.ccc/footer |
| S11 | P2 | 8건 이하에서 그리드 아래 y 660–820(160px) 빈 띠. | `dataset-upload-1440.png` |
| S12 | P3 | SHP 썸네일(`NW_greenhouse…`)이 검은 점 노이즈로 렌더 — 깨진 그림으로 읽힌다. | `dataset-manage-pubform.png` 2행 3열 |
| S13 | P3 | 레일: MY 플라이아웃 없음(대시보드엔 있음). | `dataset.html:30-34` vs `dashboard.html:29` |
| S14 | P3 | 드롭존 캡션 `업… · 검증 3 · 허용 형식 · 1…` — 내부 용어 + 말줄임. | `dataset.html:90` |
| S15 | P3 | 진행 막대 `1400ms linear` — 모션 사다리(500/750/1000/1250)·이징 밖. 진행 표시라 타당하지만 법전에 예외 미기재. | `dataset.css:184,186,347` |

### 1.5 검토 허브 · 원판 갤러리 · 타임라인

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| H1 | P2 | D번호 충돌: `D19`·`D20`이 "결정 필요"(서체 · 마스코트)와 "확정된 결정"(레그 12 · 레그 03)에 **다른 뜻으로 두 번** 쓰였다. "D19 OK" 회신이 모호해진다. | `landxi/proto/review/index.html`(결정 필요 D19–D21 / 확정 D19 · D20) |
| H3 | P2 | 갤러리 렌더가 소스와 다르다: `renders/B5-Project-Overview.png`(작은 레일 라벨)을 지금 `.dc.html`로 다시 띄우면 큰 라벨 + 깨진 마크가 나온다. Overview · Data · Analysis · Deploy · Delete 5장이 같은 구 레일. 클라이언트가 보는 그림 ≠ 원판. | `masterlive-B5-Project-Overview.png` vs `renders/B5-Project-Overview.png` |
| H2 | P3 | 허브·갤러리 글자 10.5–13px 다수, `#8A8A8A`(3.45:1) · `#4A4A4A` · `#B7791F` 팔레트 밖. 클라이언트가 직접 읽는 화면. | `_general.json` hub/masters.small · `masters.mjs:77` |
| H4 | P3 | 허브 화면 현황 `카드 발행 · 서비스 지원/관리 · MY 미착수` — B6 원판 95장이 이미 작업 폴더에 있다(동시 작업, 참고). | `design-canvas/v2/B6-*.dc.html` |

타임라인(`film/timeline.html`): 16영상 `preload=metadata`, 콘솔 0, 넘침 0 — 문제 없음(요청 abort 로그는 metadata 프리로드의 정상 동작).

### 1.6 프로젝트 원판 11장 (D5)

증거: `design-canvas/v2/renders/B5-Project*.png` · `B5-Projects.png` · `_masters.json`.

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| P1m | **P0** | 레일 마크 깨짐. `LAND XI` 14px + 자간 .18em이 72px 칸에서 두 줄로 넘쳐 **좌측이 잘리고**(`LAND`가 x=0에 붙음) 위 아이콘이 상단에서 잘린다. +2px 개정 때 생긴 것으로 보이며 같은 머리를 쓰는 분석 4장 · 지도 3장도 동일. 클라이언트가 가장 먼저 보는 좌상단. | `B5-Projects.dc.html:40-42` · `renders/B5-Projects.png` · `B5-Analysis-List.png` · `B5-Map.png` · `masterlive-B5-Projects.png` |
| P3m | P1 | 셸 불일치: 프로젝트 11장에는 마스트헤드(공지 + 기준일)가 없고 분석·지도에는 있다. 레일 아이콘 세트가 구현본(`dashboard.js` ICON)과 다르다. 푸터는 대시보드형. | `renders/B5-Projects.png` vs `B5-Analysis-List.png` vs `dashboard-1440-full.png` |
| P10m | P1 | 미작성 상태: 목록 0건 · 검색 0건 / 파일 업로드 진행·실패 / `새로 학습하기` 폼(NOTES §15.6 ⑦ "판 없음") / Create 04·05 본문(§15.8 ⑰) / 구성원 초대 결과·오류 / 데이터셋 만들기 / 모델 등록 폼 / 로딩·에러 전반. "OK → 전체 구현" 전에 구현자가 지어내야 하는 화면이 8종. | NOTES:756,821 · 인벤토리 §4-2 |
| P4m | P2 | Overview `구성원 3`이 체크박스 + 빈 아바타 + `—` 3행. 이름을 지어내지 않으려는 의도지만 렌더는 **데이터 로드 실패**로 읽힌다. `최근 활동` 첫 줄은 날짜와 본문이 붙어 있다(`2026-06-06라벨 1,674…`). | `renders/B5-Project-Overview.png` 우 패널 y 455–545 · y 688 |
| P5m | P2 | Train: `완료 · 1 h 35 m · 2026.05.18`이 컬럼 우단(904) 밖 918까지, `시연` 칩이 `실패 0` 위에 겹침, `v2.0 0.80` 라벨이 곡선과 겹침, 오분류 행렬 12px×8. | `renders/B5-Project-Train.png` · `_masters.json` B5-Project-Train.small |
| P6m | P2 | Labeling 툴바: `도형 복사` · `공간 정보 불러오기` · `닫기` 라벨이 옆 버튼에 겹치거나 잘림, `#3 단` 라벨이 지도 도구에 가림. | `renders/B5-Project-Labeling.png` y 65–95 |
| P7m | P2 | Create-Review: 좌 표 7행과 우 요약 7행이 같은 내용, 우 패널 y 460–820 빈 면(360px), 대표 이미지가 저해상 확대. | `renders/B5-Project-Create-Review.png` |
| P8m | P2 | 목록 썸네일이 저해상 크롭의 372×224 업스케일(흐림). "대표 이미지" 개념(발주 원문 §15)의 첫인상이 약하다. | `renders/B5-Projects.png` 2행 |
| P9m | P2 | Project-Analysis 우 목록 글자가 캔버스 밖(x 1244–1457) — `시연` 칩이 1440에서 잘림. | `_masters.json` B5-Project-Analysis.clipped |
| P11m | P3 | Delete: 스크림 아래 `라벨링 이어하기`와 모달 `삭제`로 검정 CTA 2 — "화면당 검정 CTA 1"(NOTES §15.6). 파괴 동작이 1차 버튼과 같은 모양. | `renders/B5-Project-Delete.png` |

### 1.7 분석 서비스 원판 4장 (D10)

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| A1m | P1 | List: 결과가 있는 5개와 **준비 중 10개가 같은 카드 · 같은 `분석 실행` CTA**. `시연` 0 · `추정` 0. system.md §5 "결과 없는 서비스 = 준비 중"과 발주 2차 지시("숫자 · 추정 이런 것도 필요 없다")가 충돌한 채로 있다 — 지시는 숫자·칩을 빼라는 것이지 미제공 서비스를 제공 중처럼 보이라는 것은 아니다. | `renders/B5-Analysis-List.png` · `_masters.json` B5-Analysis-List.demo/est = 0 · NOTES:917 |
| P2m | P1 | 레일 활성 표시가 2개(`프로젝트` + 현재 메뉴) — 분석 4장 · 지도 3장 공통. | `renders/B5-Analysis-List.png` x 0–3 · y 197–237 / 255–295 |
| A4m | P1 | 미작성: 진행 오버레이 · 결과 편집 모드(§19.4 ①) · List 선택 0(⑨) · 업로드 탭 활성(⑭) · 과제/모델 픽커(§19.6 "의도적 생략"). 허브 D10의 확인 1건(9,664동 vs 1,674필지)도 미결. | NOTES:971,976,1020,1042 · 허브 D10 |
| A5m | P2 | List 썸네일 중복·무특징: `사료작물 재배지` = `방치폐기물 탐지`, `도로안전` = `불법 소각시설` 같은 크롭, 흐린 밭 크롭 다수 — 15장 중 서비스가 그림으로 구분되는 것은 5장 안팎. | `renders/B5-Analysis-List.png` |
| A2m | P2 | 앰버 채움 칩 `SCAN 72 %` · `DETECTED`가 정지 화면에 상시 노출. 법전은 "탐지/정지점 순간 380ms만". 구현 명세(등장·소멸 시점)가 원판에 없다. | `renders/B5-Analysis-Run-Progress.png` · `-Result.png` · system.md:20 |
| A3m | P2 | Run-Progress 우 패널 y 540–790 빈 면(250px), `산출물 GPKG · …` `#CCC`. | `renders/B5-Analysis-Run-Progress.png` |
| A6m | P3 | Run-Review 13px×4(소지도 지명). | `_masters.json` B5-Analysis-Run-Review.small |

### 1.8 지도 서비스 원판 3장 (D13)

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| X1m | P1 | 미작성: `나란히보기`(원본 3모드 중 1) · 지역 구분/지역 설정 캐스케이드 · 레이어 탭 내용 · 펼친 하단 표 · 검색 결과 · 배경지도/측정/그리기 서브메뉴 · 내보내기 보안 서약 모달(§20.5 ②–⑤). 허브 D13은 "원본 38 상태 1:1. OK → 구현"이라고 쓴다 — 과장. | NOTES:1109-1117 · 허브 D13 |
| X2m | P1 | **통계/보고서 3페이지(`stats-standard` · `report-standard` · `report-standard-issue`)는 원판도, 구현도, B6도 없다.** NOTES:1078이 "iframe 내용 = 별도 판"으로 넘긴 뒤 후속이 없다. 35페이지 중 유일하게 어느 트랙에도 속하지 않은 3장. | NOTES:1078 · `design-canvas/v2/` 파일 목록(B6에 Stats/Report 없음) |
| X3m | P2 | 위성 영상 위 흰 글자에 헤일로·판이 없다: HUD `창 안 · 경작지 167 · …`는 밝은 논 위에서 안 읽힌다. 검색 필드 안 탭 라벨이 840에서 잘림(`도로명`), 시점 스트립 `2025.06 표시 중` 겹침, 우하단 좌표 HUD가 캔버스 밖(x 1156–1473). | `renders/B5-Map.png` y 180–195 · y 830 · `_masters.json` B5-Map.clipped |
| X4m | P2 | 채운 파랑 칩 `기준` · `비교 대상` · `비닐하우스 · 단동` · `DETECTED 0.94` — §2의 파랑 허용 자리는 "선택 행/칩의 **글자와 테두리**". | `renders/B5-Map-Compare.png` · `B5-Map-Info.png` |
| X5m | P2 | 내부 키가 사용자 글자로: `namwon_2504` · `veg_gain` · `built_new` · `change.js 2504-2510`. | `renders/B5-Map-Compare.png` |

지도 3장은 검토 원판 중 **완성도가 가장 높다**(실타일 · 실좌표 투영 · 밀도). 위 5건은 구현 전 보정 대상.

### 1.9 사용자 · 뷰어 대시보드 원판 (D17)

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| U1m | P1 | 사용자: 14px 미만 **46곳**(12.5px×23 · 13.5px×22 · 11px) · gradient 3 · `전월 대비 +15 %`(§5 "KPI 추세 금지") · `8개/3개/24건/월별 42–84회/1,420 GB` 전부 `시연` 표식 0. 법전 §1·§2·§5 동시 위반 — 검토 원판 중 유일한 C등급. | `_masters.json` B5-Dashboard-User · `renders/B5-Dashboard-User.png` |
| U2m | P2 | 뷰어: 푸터에 `색 역할 — 파랑 정보/선택 · 검정 본문 · 청록 AI 결과 · 조치 항목 없음(빨강 0)` 설계 메모가 그대로 있고, 레일 마크가 없다. 지도 범례 흰 글자 가독성 낮음. | `renders/B5-Dashboard-Viewer.png` y 1032 |
| U3m | P2 | `dashboard2/3`은 인벤토리 부록 C가 "GNB 도달 불가 · 범위 제외"로 분류한 페이지. D17로 범위에 들어왔지만 인벤토리는 갱신되지 않았고, 역할별 레일 IA(사용자 = `MY 작업` 그룹 + 3항목 / 뷰어 = 3항목)의 근거 문서가 없다. | 인벤토리 부록 C · masters.mjs:17-18 |

### 1.10 원판도 구현도 없는 원본 페이지

- **B6 설계 중**(비평 제외): 서비스 지원 5 · 카드 발행 관리 4(`admin-publish` · `ai-card` · `ai-card-edit` · `ai-publish-create`) · 서비스 관리 5 · MY 1 · 인증 3(+결과 1). 작업 폴더에 `B6-{Support,Publish,Admin,My,Auth}-*.dc.html` 확인.
- **어느 트랙에도 없음**: `stats-standard.html` · `report-standard.html` · `report-standard-issue.html`(X2m) · `ximap` 나란히보기(X1m) · `ai-project-dataset` 독립 화면.

---

## §2 횡단 문제

| ID | 심각도 | 문제 | 증거 |
|---|---|---|---|
| C1 | P1 | **공용 셸이 없다.** 레일·마스트헤드·푸터가 `dashboard.{html,css,js}`와 `dataset.{html,css,js}`에 각각 복제되어 이미 갈라졌다: 레일 라벨 12.5px vs 14px · `카드 발행 관리` 1줄 vs 2줄 · MY 플라이아웃 유/무 · 클릭 동작(스크롤 vs 토스트) · 푸터 문구·마크업. 원판은 3번째(깨진 마크) · 4번째(구 렌더) 변종. 화면이 6 → 35로 늘면 35변종이 된다. | `dashboard.css:60` vs `dataset.css:64` · `dashboard.js:44-72` vs `dataset.js:36-75` · `dashboard.js:293` vs `dataset.js:869-871` |
| C2 | P1 | 내비 막다른 길: 레일 9항목 중 실제 페이지 이동은 2(대시보드 ↔ 데이터 관리). 메인 → 로그인 → 대시보드 → 데이터 관리 이후 갈 곳이 없다. | §1.3 D3 · `_interact.json` |
| C3 | P2 | 고객센터 번호·푸터가 화면마다 다르다: 로그인 `063-713-1218` / 대시보드 `063-713-1213` / 데이터 관리 `063-713-1213, 1216`. 원본은 로그인 1218 · 푸터 `063)713-1213, 1216` + 주소 + Copyright + Family Site 7링크. | `login.html:79` · `dashboard.js:293` · `dataset.js:869-871` · 원본 `include/footer.html` |
| C4 | P2 | 대비: `#CCCCCC` 글자 1.61:1(정보를 담은 글자에 쓰임 — D8 · S10) · 청록 `#0FA9A0` 글자 2.92:1(`처리 완료` · `2,098` — 큰 글자 기준 3:1도 미달) · 틴트 위 파랑 4.07:1(선택 탭 14px). `#686868` 5.57 · 파랑 4.64 · 빨강 4.94는 통과. | 계산값(WCAG 2.1 상대 휘도) · system.md:17,21 |
| C5 | P2 | `title` 속성에 의존하는 정보: 시연 출처(D7) · 타일 전체 이름(S5) · 레일 `원본 ai-project.html`(사용자에게 파일명 노출). 터치·키보드·스크린리더에서 사라진다. | `dashboard.js:49,214` · `dataset.js:63` |
| C6 | P2 | 카피 톤 혼재. 문장 0 규칙(e2e `not.toMatch(/습니다|세요/)`)으로 오류가 전보체(`신청 사유 필수` · `허용 형식 아님 — bad.exe …`)인데 로그인은 원본 경어(`아이디를 입력해 주세요.`). 내부 용어 노출: `콘티 밖` · `검증 3` · `?status=대기` · `change.js`. | `dataset.js:74` · `tests/e2e/proto-dataset.spec.mjs:124` · `_interact.json` |
| C7 | P2 | 기준일 3종: 구현 `2026.06.08` · 사용자/뷰어 원판 `2026.08.26` · 분석/지도 원판 `2026.08.27`. | `dashboard-1440-full.png` · `renders/B5-Analysis-List.png` · `B5-Dashboard-User.png` |
| C8 | P2 | 법전과 실제의 어긋남 3건이 법전에 미기재: 로그인 채운 파랑(L4) · 진행 막대 1400ms linear(S15) · 앰버 상시 칩(A2m). "구현 에이전트는 이 파일만 읽고 짠다"(system.md 1행)는 전제가 깨진다. | system.md:1,18,20,33 |
| C9 | P3 | 외부 CDN 의존: MapLibre(unpkg) · Pretendard/Paperlogy(jsDelivr). 공공기관 폐쇄망·방화벽에서 지도와 서체가 동시에 죽는다. | `dashboard.html:12,15` · `fonts-system.css` |
| C10 | P3 | 랜드마크·건너뛰기 링크는 구현 3화면 모두 있음(양호). 허브·갤러리·타임라인은 `main`/`nav` 0. | `_general.json` landmarks |

---

## §3 개선안 목록

### A1 · 메인에 로그인 진입점 (M1)
- **선택 1** — 마스트헤드 우측 `LIVE` 자리에 브래킷 링크 `로그인` 상시. 동기: 첫 화면에서 1클릭. 대가: "필름의 유일한 크롬은 헤어라인 하나" 연출이 조금 흐려진다.
- **선택 2** — 항로 레일(우측 7지점) 맨 아래에 8번째 항목 `시작 →`(마감으로 점프). 동기: 필름 문법 안에서 해결. 대가: 여전히 마감까지 1점프 + 1클릭.
- **선택 3** — 현행 유지 + 스크롤 힌트 옆 `건너뛰기`. 동기: 변경 최소. 대가: 재방문자에게 매번 16화면.
- **권장: 1**(M4 `LIVE` 제거와 같은 자리에서 해결).

### A2 · 메인 마스트 내비 정리 (M2)
단일안: `체계 · 리포트 · 워크플로우` 3링크 삭제 → `서비스 소개(=필름 처음) · 서비스 지원(notice) · 로그인`. `system.html`·`workflow.html`·`dive.html`은 허브에서만 링크. 로그인 워드마크도 `scrub/index.html`로(L3).

### A3 · 원본 홈 기능(라인업 · 활용사례 · 문의 · 푸터)의 자리 (M3 · M6)
- **선택 1** — 마감 CI 아래로 스크롤이 이어지는 **흰 종이 "아틀라스" 1장**(라인업 칩 · 활용사례 카드 3 · 문의 3카드 · 정부 푸터). 동기: 원본 1:1 회복, 폐기된 `B2-HomeAtlas`의 개념 재활용. 대가: 마감의 "끝" 연출이 약해진다 — 원판 1장 필요.
- **선택 2** — 활용사례·문의는 `서비스 지원`(B6)으로 보내고 메인은 **푸터만** 추가. 동기: 필름 보존. 대가: 비로그인 방문자가 사례·문의에 닿으려면 1클릭 더.
- **선택 3** — 현행 유지를 클라이언트가 명시 승인(허브에 D번호 신설). 동기: 0 공수. 대가: "기능 추가·삭제 없음" 규칙의 공식 예외가 된다.
- **권장: 2 + 허브에 D23으로 상정**(어느 쪽이든 미결 상태를 닫는 것이 먼저).

### A4 · 공용 셸 추출 (C1 · C2 · C3 · D3 · D11 · S13 · P3m)
- **선택 1** — `landxi/proto/shell.{js,css}` 1쌍: 레일(데이터 1곳) · 마스트헤드 · 푸터 · MY 플라이아웃 · `say` 토스트를 커스텀 엘리먼트 또는 `mountShell({active})`로. 미구현 메뉴는 **A5의 자리 화면**으로 이동. 동기: 35화면 확장 전 마지막 기회. 대가: dashboard/dataset e2e 40여 건의 셀렉터 수정.
- **선택 2** — 현 구조 유지, 값만 맞춘다(라벨 14px · 전화번호 · 푸터 마크업). 동기: 반나절. 대가: 다음 화면에서 다시 갈라진다.
- **선택 3** — 빌드 단계 도입(11ty/Vite partial). 동기: HTML 조각까지 공유. 대가: "정적 파일 그대로 GitHub Pages" 단순성 상실.
- **권장: 1.** 원판 생성기(`tools/design/gen-b5-*.mjs`)의 레일도 같은 데이터(`NAV`)를 읽게 해 P1m · P2m · P3m을 한 번에 없앤다.

### A5 · 미구현 메뉴의 동작 (D1 · D3 · L1 · C2)
- **선택 1** — **원판 PNG를 보여주는 자리 화면** 1종(`stub.html?m=project`): 셸 + 해당 메뉴의 검토 원판 렌더 + `설계 검토 중 · D5` 라벨. 동기: 막다른 길 0, 클라이언트가 실제 동선으로 원판을 본다(사용자 취향 메모: "동작하는 화면으로 판단"). 대가: 구현처럼 오해될 수 있음 → 워터마크 필수.
- **선택 2** — 레일 항목 비활성(`aria-disabled` + `준비 중` 점선) — system.md §5 문법. 동기: 가장 정직. 대가: 시연 동선이 2화면에서 끝난다.
- **선택 3** — 현행(스크롤/토스트) 유지. 대가: 고장으로 읽힘.
- **권장: 1**(404 9종 + 로그인 3링크도 같은 자리 화면으로 받는다 — B6 원판 도착 즉시 연결).

### A6 · 개발 주석 · 내부 용어 제거 (D4 · C5 · C6 · X5m · U2m · S14)
단일안: `.dim` 딥링크 주석 삭제, 레일 `title="원본 …html"` → 메뉴명, 토스트 `콘티 밖` → `준비 중`, 원판의 `namwon_2504`/`veg_gain`/`change.js`/푸터 색 메모 삭제. 출처가 필요하면 허브의 파리티 문서로.

### A7 · 정직 표식 방식 통일 (D7 · A1m · U1m)
- **선택 1** — **보이는 칩**으로 통일(`시연` · `추정` · `준비 중`), 패널당 1회(머리띠 우측). 동기: 법전 §5 그대로 · 접근성. 대가: NOTES §18 "판/패널 아래 글줄 0" 지시와 긴장 — 칩은 글줄이 아니라 머리띠 안이라 양립 가능.
- **선택 2** — 페이지당 1회(제목 부제 `… · 시연`, 데이터 관리 방식). 동기: 가장 조용함. 대가: 실측과 시연이 섞인 화면(대시보드 판 = 실측, 차트 = 시연)에서 구분이 사라진다.
- **선택 3** — `title` 유지 + `ⓘ` 포커스 가능한 버튼. 대가: 부품 1종 추가.
- **권장: 1.** 분석 List의 준비 중 10개는 카드 그림을 무채 + 점선 테두리 + CTA `준비 중`(비활성) — 숫자·칩을 빼라는 발주 지시와 충돌하지 않는다.

### A8 · 데이터 관리 타일 접근성 · 파괴 동작 (S1 · S2 · S4)
단일안: 타일 = `<button>` 또는 `tabindex=0 role=option` + 방향키 로빙, 모달 포커스 트랩(처음/끝 센티널), 삭제 = `B5-Project-Delete` 대화상자 그릇 재사용(자산명 + `복구할 수 없습니다`). 발행 취소 · 업로드 취소도 같은 그릇.

### A9 · 필름 전송량 (M5)
- **선택 1** — 레그 **지연 로드 창**: 현재 레그 ±2만 fetch(지금은 8~14 동시). 동기: 첫 4초 9 MB → 약 4 MB. 대가: 빠른 스크롤 시 포스터가 잠깐 보인다(엔진은 이미 포스터 폴백 보유).
- **선택 2** — 현행 + 포스터 `loading=lazy`(첫 장 제외)만. 동기: 위험 0. 대가: 0.6 MB 절감뿐.
- **권장: 1**, `navigator.connection.saveData`면 reduced-motion 경로(2.17 MB)로.

### A10 · 우 패널 넘침 · 빈 띠 (S6 · S7 · S11)
- **선택 1** — 우 패널을 **탭 2**(`정보` · `이력·메모`)로 나눠 385px 안에 넣고, 액션 줄은 패널 바닥 고정. 동기: 스크롤 0 · 제출 버튼 상시. 대가: 아카이브 12.2 피드백("아래 남는 공간에 메모")과 구도가 달라진다.
- **선택 2** — 스크롤 유지 + 하단 헤어라인 페이드 대신 **`n개 더 ↓` 룰** + 액션 줄 고정. 동기: 구도 유지. 대가: 여전히 숨은 내용.
- **선택 3** — 그리드 행 수를 건수에 맞춰 줄이고 남는 높이를 우 패널에 준다(좌 660px 이하일 때 우 패널이 아래로 자람). 동기: S11 빈 띠와 S7을 동시에. 대가: 좌우 높이가 달라진다.
- **권장: 2 + 3.** 쪽당 16은 4열×4(117×72, NOTES §13.9 원안)로 되돌리고 이름 1줄을 살린다 — 8×2(80×49)는 식별 불가.

### A11 · 원판 렌더 신뢰성 (P1m · P2m · H3)
단일안: ① 생성기 레일 마크를 구현본과 같은 2줄(`LAND`/`XI` 각 1줄, 13→14px, 자간 .16em)로 고정 ② 활성 막대는 `active` 인자 1개에서만 ③ `render.mjs` 전량 재실행 후 `masters.mjs` 재생성 ④ CI 가드: `.dc.html` mtime > PNG이면 실패. (본 감사는 원판을 수정하지 않았다.)

### A12 · 프로젝트 원판의 "빈 행" 문제 (P4m)
- **선택 1** — 구성원을 역할 요약으로: `소유자 1 · 편집자 2`(큰 수) + `구성원 관리 ›`. 동기: 지어낸 이름 0 · 깨져 보이지 않음. 대가: 원본의 행 단위 삭제 체크가 드로어 안으로.
- **선택 2** — 실제 로그인 계정 1행(내 계정) + `시연` 2행(`편집자 A` · `편집자 B`). 동기: 원본 구도 유지. 대가: 시연 표식이 늘어난다.
- **권장: 2**(원본 1:1이 우선 규칙).

### A13 · 통계/보고서 3페이지 (X2m)
- **선택 1** — 지도 서비스 우 패널 안 **드로어 2종**(통계 · 보고서 발급/내역)으로 원판 3장 신규. 동기: iframe 모달 재현보다 셸 일관. 대가: 원판 3장 + 원본 `?task=` 7과제 × 탭 조합 검토.
- **선택 2** — 원본처럼 전면 모달(그릇 = §15.7 대화상자 확대판). 동기: 구조 1:1. 대가: "구조 복제는 개편이 아님"(system.md §6).
- **권장: 1**, B6 다음 묶음(B7)으로 발주.

### A14 · 법전 갱신 (C8 · L4 · S15 · A2m · X4m)
단일안: `design/system.md`에 예외 3줄 추가 — ① 로그인 제출 버튼만 채운 파랑(발주 2026-08-27) ② 진행 표시는 `linear` 허용, 지속 = 실제 진행 ③ 앰버 칩은 등장 후 380ms → 잉크 테두리 칩으로 정착. 채운 파랑 칩(`기준`·`비교 대상`·클래스 칩)은 허용할지 금지할지 1줄로 결정.

### A15 · 대비 (C4 · D8 · S10)
단일안: `#CCCCCC`는 **비활성 컨트롤과 헤어라인에만**, 정보를 담은 글자는 최소 `#686868`. 청록 글자는 `#0B7F78`(4.9:1) 토큰 `--teal-text` 신설, 면·선은 `#0FA9A0` 유지.

### A16 · 허브 D번호 (H1)
단일안: 확정 목록의 `D19 · 레그 12` → `D19f`, `D20 · 레그 03` → `D20f`가 아니라 **필름 결정은 `F-` 접두로 일괄 개명**(F12 · F03 · F18…), 화면 결정만 `D-`. 미결 목록 상단에 M3(D23 후보) · 비닐하우스 수치(D10 확인 1건) 고정.

### A17 · 사용자 대시보드 원판 재작업 (U1m)
단일안: 관리자 판(`B5-Dashboard-Data`)의 토큰으로 재생성 — 12.5/13.5px → 14/16 · 썸네일 그라디언트 → 하단 잉크 띠 · `전월 대비` 삭제 · 패널 머리띠에 `시연`. 뷰어 판은 푸터 메모 삭제 + 레일 마크만.

### A18 · 글자 바닥 잔여 (D5 · P5m · A6m)
단일안: `dashboard.css:53,60,207` → 14px(레일 라벨은 dataset.css 값과 통일 — A4에서 흡수), Train 행렬 12 → 14(셀 폭 +6px), Run-Review 소지도 13 → 14.

---

## §4 다음 4주 실행 순서 (의존 관계)

**1주차 — 깨진 것과 미결을 닫는다** (클라이언트에게 다시 보여주기 전 필수)
1. A11 원판 레일 수정 + 전량 재렌더(P0 · 의존 없음) → 이후 모든 원판 검토의 전제.
2. A5 자리 화면 + 404 12종 연결(P0 · 의존: A11의 렌더).
3. A6 개발 주석 제거 · A18 글자 바닥 · A15 대비 토큰(반나절씩, 의존 없음).
4. A16 허브 번호 정리 + **D23(홈 기능 자리) · D10 수치 · A7 표식 방식 · A14 법전 예외**를 한 번에 상정 — 2주차 작업의 입력.

**2주차 — 셸** (3주차 이후 모든 구현의 전제)
5. A4 공용 셸 추출(dashboard · dataset 이관, e2e 수정) → A2 메인 내비 · A1 로그인 진입 · C3 푸터 통일이 여기에 얹힌다.
6. A8 데이터 관리 접근성 · 삭제 확인(셸의 대화상자 그릇을 공용화) · A10 우 패널.
7. 원판 보정 병행: A12(Overview) · A17(사용자 대시보드) · P5m–P9m · X3m–X5m · A7의 분석 List 준비 중 표현.

**3주차 — 구현 1차: 프로젝트** (의존: 5 · 7 · D5 OK)
8. 목록 → 만들기 → 개요/데이터 → 라벨링 → 학습 → 분석 → 배포 순. 미작성 상태(P10m) 8종은 구현 전에 원판 소판으로 먼저 — 구현자가 지어내지 않게.
9. 대시보드 역할 전환(D12)은 사용자 판 재작업(A17) 승인 뒤.

**4주차 — 구현 2차: 분석 · 지도 + 남은 공백**
10. 분석 4화면(의존: D10 수치 결정 · A14 앰버 규칙).
11. 지도 3화면 + 나란히보기 원판(X1m) → 구현. A13 통계/보고서 원판 3장은 3주차에 발주해 이 주에 검토.
12. A9 필름 지연 로드 · A3 결정분 반영. B6 원판이 승인되면 A5 자리 화면을 실제 화면으로 교체(트랙 병행).

의존 요약: `A11 → A5 → (클라이언트 재검토)` · `A4 → {A1, A2, A8, 모든 신규 화면}` · `허브 상정(D23 · D10 · A7 · A14) → {A3, 분석 구현, 법전}` · `A17 → D12`.
