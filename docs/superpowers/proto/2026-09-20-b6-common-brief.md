# B6 원판 공통 브리프 — 미착수 화면군 자동 설계 (2026-09-20, 발주자 부재 4시간 자율 작업)

발주자 지시(원문): "우린 Geo-AI 플랫폼 구축이 목표이고 현재는 UI/UX 관점에서 모든 걸 만드는 게 목표다. 안의 컨텐츠들이 부분구현·미구현 등 부족한 부분이 상당하다. 이 관점에서 모든 걸 자동으로 검토하고, 디자인 안도 자동으로 내놓는다. **허접한 건 안 된다. 기존 톤앤매너와 그 이상이어야 한다.**" 선택지는 "선택 1 · 2 · 3" 형식으로 낸다.

## 0. 읽을 것 (이 순서, 이것만 — 웹 리서치 금지. 원본 사이트 소스 확인만 허용)
1. `design/system.md` — 법전. 서체 Paperlogy 700 + Pretendard 400/500 + Inter tabular, **바닥 14px**, T3 색(잉크 #010102 · 액센트 #006DF7 · 틴트 #E8F1FF/#D6E6FF · 헤어라인 #DDDDDD · 회색 #686868/#CCCCCC · 청록 #0FA9A0 = AI 결과 전용 · 빨강 #D1352B = 조치 필요 글자색만 · 앰버 = 탐지 순간만), 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0, 채운 파란 버튼 없음(1차 버튼 = 잉크 채움, 2차 = 코너 브래킷), 레일 72 · 마스트헤드 64 · 마진 56(x 128–1384), 명명 레이아웃 5종, 콘티 원칙(§5), 3-비평가(§7).
2. **현 적용·검토 원판의 어휘를 그대로 잇는다** — 렌더를 먼저 본다: `design-canvas/v2/renders/B5-Dashboard-Data.png`(관리자 대시보드 · 적용), `B5-Dashboard-User.png`, `B5-DataMgmt.png`, `B5-Projects.png`, `B5-Project-Overview.png`, `B5-Analysis-List.png`, `B5-Map.png`, `B5-Login.png`. 셸(레일·마스트헤드·H1 34 + 파랑 4px 룰·푸터)과 부품(KPI 큰 숫자 · 머리띠 틴트 · 이미지 카드 · 브래킷 · 칩 · 표)은 `tools/design/gen-b5-dashboard-user.mjs` 의 코드를 복사해 쓴다(레일 아이콘 세트 `IC`, svg 헬퍼 포함). 레일 활성 항목은 자기 화면군에 맞춘다.
3. 원본 기능 = 파리티 대상: `docs/superpowers/specs/2026-08-26-landxi7-function-inventory.md` 의 자기 절. 라벨·열·필터·모달·빈 상태 문구는 **원본 소스에서 확인**한다: `https://mini531.github.io/namwon-smart-village/landxi7/<page>.html` (+ `assets/js/*.js`, `assets/data/*.js`). 로컬 시드: `landxi/assets/data/support-data.js` 등.
4. 품질 기준(반려 이력): `design-canvas/v2/NOTES.md` §10 머리말(원본 재스킨 반려) · §17–18(여백을 콘텐츠로 · 중복 숫자 0 · 색 리밸런싱) · `tools/design/gen-b5-dashboard-user.mjs` 머리 주석(rev.2 "조잡·실용성 없음" 대응: 이미지 카드 · 할 일 큐 · 그래픽 1씩).

## 1. 무엇을 만드나
자기 화면군의 **모든 원본 페이지·상태**에 대한 1440×900 원판 아트보드(`design-canvas/v2/B6-<이름>.dc.html`) + 렌더(`renders/B6-<이름>.png`).
- 화면군의 **대표 화면 1개는 구조가 실제로 다른 "선택 1 · 2 · 3"** 세 판을 낸다(`B6-<이름>-Opt1/2/3`). 같은 구조의 색·여백 변주는 선택지가 아니다 — 축이 달라야 한다(예: 표 중심 vs 카드·이미지 중심 vs 분할 작업공간). 각 선택지에 **한 줄 동기와 한 줄 대가**를 NOTES 에 적고, 권장안을 밝힌다. 나머지 화면은 권장안 구조로 그린다.
- 게시판형 업무 화면이라도 "표에 서체만 입힌 것"은 불합격이다. 이 플랫폼은 Geo-AI 다 — 쓸 수 있는 곳에는 **실사 크롭(정사영상 · 결과 폴리곤)** 이 1급 시민으로 들어가고(`landxi/assets/proto/crops/**`, 기존 `design-canvas/v2/img/*.jpg` 재사용 가능), 큰 숫자·상태·다음 할 일이 첫 화면에서 읽혀야 한다. 단 **기능 발명 금지**: 원본에 없는 위젯·필터·지표를 만들지 않는다. 창의성은 같은 기능을 어떻게 보여주느냐에만.
- 상태: 기본 · 선택/상세 열림 · 작성/수정 폼 · 모달 · 빈 상태 · 오류/검증 중 원본에 있는 것 전부. 한 아트보드 = 한 상태.
- 콘티 원칙: 지어낸 사람 이름·활동 기록·추세 금지. 원본 데모 시드는 `시연` 태그, 우리가 이은 값은 `추정`. 없으면 점선 결손 + 이유 한 줄.

## 2. 만드는 법
- 생성기 1개: `tools/design/gen-b6-<group>.mjs` (멱등, repo root 에서 `node` 로 실행, 아트보드 전부 출력). 이미지가 더 필요하면 ffmpeg 로 크롭해 `design-canvas/v2/img/b6-<group>-*.jpg`(각 ≤ 70 KB), 마크업은 `<img src="파일명.jpg">`.
- 렌더: `PLAYWRIGHT_BROWSERS_PATH="E:/Land-XI 플랫폼/_env/ms-playwright" node design-canvas/v2/render.mjs <이름들>`. **PNG 를 직접 열어 보고** Craft 재비평을 최소 3회 — 넘침·겹침·잘림 0, 14px 미만 0(레일 글리프 제외 없음 — 레일도 현 B5 값을 따른다), 빈 띠 80px 초과 0, 첫 화면에서 위계가 읽히는가, "잘 만든 제품 화면"으로 읽히는가.
- 자체 검수 grep: `border-radius|box-shadow|gradient|backdrop` = 0, 폰트는 Paperlogy/Pretendard/Inter 만, `#006DF7` 채움 버튼 0, `#D1352B` 는 조치 필요 글자에만.
- 기록: `design-canvas/v2/notes/B6-<group>.md` — 발주 원문 · 파리티 표(원본 기능 → 어느 아트보드 어디) · 선택 1/2/3 동기·대가·권장 · 조판 실측 · Craft 재비평 기록 · 유보.

## 3. 손대지 말 것 (컨트롤러가 통합)
`design-canvas/v2/canvas.json` · `design-canvas/v2/NOTES.md` · `tools/review/masters.mjs` · `landxi/proto/review/**` · `landxi/proto/**` 구현 파일 · 다른 그룹의 `B6-*` 파일. **git commit/push 금지**(동시 작업 중 — 컨트롤러가 일괄 커밋). kie.ai 등 과금 API 호출 금지. 아티팩트 발행 금지.

## 4. 보고 (평문, 이것만)
아트보드 목록(이름 → 원본 페이지/상태) · 선택 1/2/3 요약과 권장 · 파리티 누락 0 확인 또는 누락 사유 · 자체 검수 grep 수치 · 유보. 서술 금지.
