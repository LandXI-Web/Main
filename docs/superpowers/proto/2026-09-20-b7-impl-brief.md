# B7 구현 공통 브리프 — 프로젝트 · 분석 서비스 · 지도 서비스 (2026-09-20)

발주자 방침: "부분적으로 구현하는 게 아니라 **연결되는 모든 것들을 다 완전체 형식으로** 구현하고 수정한다."

## 0. 먼저 읽을 것
1. `docs/superpowers/specs/2026-09-20-platform-roles.md` — **역할**: LX = AI 모델 개발·학습·분석·결과 수정/삭제. 고객(지자체·글로벌) = 결과를 행정에 활용.
2. `docs/superpowers/specs/2026-09-20-card-architecture.md` — **카드 구조**: 공통 모듈 7 + 서비스 전용 모듈 + 지역 배포본(이식) · 지자체/글로벌 분기 · 정사영상 공유 등급 · 성장 규칙 R1–R7.
3. `landxi/assets/data/cards.js` · `registry.js` — 위 구조의 데이터. **화면은 이 두 파일만 읽는다**(R5). 카드를 더해도 화면 코드를 고치지 않아야 한다.
4. `docs/superpowers/proto/2026-09-20-shell-parts-api.md` — 공용 셸·부품. 레일·마스트헤드·푸터·모달·토스트·표·폼·페이저를 직접 만들지 않는다.
5. `design/system.md` — 법전. 자기 화면의 B5/B7 원판(`design-canvas/v2/renders/`) + 기록(`notes/`).
6. 구현 선례: `landxi/proto/admin-users.js`(분할 열람) · `admin-map.js`(실지도 미리보기) · `publish-map.js`(결과 GeoJSON).

## 1. 공통 규칙
- 원본 기능 1:1(인벤토리) + **카드/분기/이식 개념을 얹는다**. 기능 발명은 금지하되, 카드·분기·모듈·이식은 이제 **정식 사양**이다.
- 실지도는 MapLibre + V-World(`js/sources.js`) + 실 GeoJSON(`assets/data/geo/**`). 손 배치 폴리곤 금지.
- 콘티 원칙: 수치는 `results.js` `services.js` `models.js` `imagery.js` `cards.js` 실측만. 글로벌·준비 중은 `준비 중` + 사유 한 줄, 원본 시드는 `시연`.
- 상태는 URL 에(뒤로 가기 동작). 변경은 sessionStorage(새로고침하면 시드 복귀).
- 접근성: 키보드 완주 · 포커스 트랩 · aria. 1280–1920 깨지지 않음. 최소 14px · 라운드/그림자/그라디언트 0 · 파란 채움 버튼 0 · 빨강은 조치 필요 글자만.
- e2e `tests/e2e/proto-<group>.spec.mjs` + 원판 나란히 비교 `shots/proto/<group>-vs-master-*.png` 3장 이상(직접 열어 확인). `npm run test:unit` 녹색 유지.
- 자기 파일만 `git add`(절대 `git add -A` 금지). 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. push 금지.

## 2. 화면 간 연결(완전체의 핵심) — 각자 자기 쪽 링크를 반드시 건다
- 대시보드 → 프로젝트/분석/지도 (이미 레일 연결됨)
- 프로젝트 학습 완료 → `카드 발행 요청` → `admin-publish.html`
- 프로젝트 모델 → **어느 카드로 갔는지** 역추적(`cardNamesOfService`) → `analysis-ai.html?card=`
- 분석 서비스 카드 → 실행 → 결과 → `ximap.html?result=` / 통계 · 보고서
- 지도 결과 → 보고서 발급 → 서비스 지원 문의
- 모든 화면의 `기준일`·레일·푸터는 셸 값으로 통일
