# B6 구현 공통 브리프 — 원판 → 실제 화면 (2026-09-20, 발주자 방침 "자동으로 계속")

채택안(자동 채택 · 허브 D23–D27): 서비스 지원 = 선택 2 · 카드 발행 관리 = 선택 3 · 서비스 관리 = 선택 2 · MY = 선택 1 · 인증 = 로그인 카드 가족.

## 0. 읽을 것 (이 순서)
1. `docs/superpowers/proto/2026-09-20-shell-parts-api.md` — 공용 셸 · 부품 API. **레일 · 마스트헤드 · 푸터 · 모달 · 토스트 · 표 · 폼 · 페이저를 직접 만들지 않는다.** `landxi/proto/shell.js` `shell.css` `parts.css` 를 쓰고, 모자란 부품만 자기 그룹 CSS 에 더한다(부족한 점은 보고서에 적는다 — 셸 파일은 고치지 않는다).
2. `design/system.md` — 법전.
3. 자기 그룹 원판: `design-canvas/v2/B6-<Group>-*.dc.html`(인라인 style 의 px 값이 정답) + `renders/*.png` + 기록 `design-canvas/v2/notes/B6-<group>.md`(파리티 표 · 원본과 인벤토리가 다른 곳 · 유보). **원판이 픽셀 기준 템플릿이다.**
4. 원본 동작: `https://mini531.github.io/namwon-smart-village/landxi7/<page>.html` + JS. 기능 1:1 — 추가 0 · 삭제 0. 시드는 원본 그대로 옮기되 사람 이름 · 메일 · 전화는 원판과 같은 방식으로 마스킹, `시연` 표식.
5. 구현 선례(코드 스타일 · 테스트 스타일): `landxi/proto/dataset.js` `dataset.css` `tests/e2e/proto-dataset.spec.mjs`.

## 1. 만들 것
- 원본 파일명 그대로의 **실제 페이지**: `landxi/proto/<page>.html` — 지금 있는 자리 파일(`data-stub` 달린 HTML)을 덮어쓴다. 그룹 JS/CSS/데이터는 `landxi/proto/<group>.js|css`, `<group>-data.js`(한 그룹이 여러 페이지면 페이지별 모듈로 나눠도 된다).
- 원판에 그린 **모든 상태가 실제로 동작**해야 한다: 필터 · 검색 · 초기화 · 정렬 · 페이지네이션 · 행 선택 → 열람 판 · 폼 검증(원본 문구) · 모달 · 확인 대화상자 · 토스트 · 빈 상태 · 딥링크(`?notice=` `?status=` `?open=` `?cid=` 등 원본 파라미터). 데이터 변경(등록 · 수정 · 삭제 · 승인 · 답변)은 메모리 + `sessionStorage` 에 반영해 화면이 실제로 바뀐다(새로고침하면 시드로 복귀 — 콘티이므로).
- URL 이 상태다: 선택 행 · 탭 · 필터는 쿼리에 반영되고 뒤로 가기가 동작한다.
- 접근성: 모든 조작이 키보드로 되고 포커스가 보인다. 표 행 = 버튼/링크 또는 `tabindex=0` + Enter. 모달 포커스 트랩 · Esc · 복귀. `aria-current` `aria-selected` `aria-live`. `prefers-reduced-motion`.
- 모션: system.md §4 — 호버는 물리적 반응(4px 이동 · 브래킷 성장 · 밑줄 스윕) 180ms, 진입은 text-in 600ms/60ms 스태거, 열람 판 교체는 500ms. 유휴 운동 0.
- 반응: 1280–1920 에서 깨지지 않는다(원판은 1440). 최소 14px. 라운드 · 그림자 · 그라디언트 · 유리 0. 채운 파란 버튼 0. 빨강은 조치 필요 글자(+ 검증 오류 문구)만.
- 지도가 있는 곳(카드 발행 검토의 분석 결과 · 지도 속성 미리보기)은 **MapLibre 실지도**: 베이스 = V-World 위성(`landxi/proto/js/sources.js` 의 resolveVWorld/EOX 폴백 — dataset 의 `ds-plate.js` 가 선례), 결과 = `landxi/assets/data/geo/**` 실 GeoJSON 을 청록으로. 원판의 손 배치 폴리곤을 흉내 내지 않는다.

## 2. 검증 (보고 전 필수)
- e2e: `tests/e2e/proto-<group>.spec.mjs` — 관문 리다이렉트 · 레일 활성 · 각 상태 진입 · 딥링크 · 폼 검증 문구 · 모달 포커스 트랩 · 키보드만으로 주요 과업 1개 완주 · 콘솔 오류 0 · 시스템 검사(라운드/그림자/그라디언트 0 · 최소 14px · 파란 채움 버튼 0). `PLAYWRIGHT_BROWSERS_PATH="E:/Land-XI 플랫폼/_env/ms-playwright"`, 각자 다른 `PORT`(브리프에 지정), `--workers=1`. `npm run test:unit` 녹색 유지.
- **나란히 비교**: 대표 상태 3개 이상을 1440×900 으로 찍어 원판 PNG 와 좌우로 붙인 `shots/proto/<group>-vs-master-*.png` 를 만들고 **직접 열어 본다**. 밴드 y · 글자 크기 · 헤어라인 위치 편차 ≤ 4px. 다르면 고친다.
- 3-비평가(Brief 파리티 / System 위반 0 / Craft "잘 만든 제품으로 읽히는가") 자체 통과.

## 3. 규칙
- 자기 그룹 파일만. `shell.*` `parts.css` `dashboard.*` `dataset.*` `login.*` `scrub/**` `design-canvas/**` `tools/review/**` 허브 · 다른 그룹 파일 금지. 과금 API 금지.
- WIP 커밋은 자기 파일만 `git add <경로>` 로(절대 `git add -A` 금지 — 다른 에이전트 파일이 섞인다). 메시지 끝: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `git reset` · `--amend` · push 금지. index.lock 충돌이면 몇 초 뒤 재시도.

## 4. 보고 (평문, 이것만)
페이지 목록(파일 → 동작하는 상태) · 비교 스크린샷 경로 · 테스트 수치 · 원판/원본과 다르게 한 곳과 이유 · 셸/부품에 모자랐던 것 · 유보 · 마지막 커밋 해시.
