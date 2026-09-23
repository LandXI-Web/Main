# Land-XI 플랫폼 완성 마스터 플랜 (2026-09-24 · 개정판)

## 개정 이력

- **2026-09-24 개정(Fable 5.1)** — §6 완결성 비평 C-01~C-41 과 사용자 결정 6건(아래)을 반영했다. 바뀐 것: ① **Q1 = 기관 완전 별도**(전 문서 일관 — 기관은 `roles.js` 에 넣지 않고 `portal.js TENANTS` + `lx_tenant_session` + 별도 관문, 기관 세션은 LX 셸에 절대 들어가지 못하고 LX 세션도 기관 작업공간에 들어가지 못한다) ② Wave 0 에픽 표를 **실제 파일명 · 자기 스펙 소유 · 검증 가능한 완료 기준**으로 재작성하고 **E0-S XI맵 시그니처 스파이크**를 추가(C-36) ③ §7 세션 계약 · 관문 판정표 · 로그아웃 — 계정 전환 여정 신설(C-09 · C-10 · C-24) ④ §8 파일 소유 대조표(C-04 · C-05 · C-06) ⑤ 몰입 게이트를 "스크린샷 + 모션 중간 프레임 연속 캡처(또는 짧은 영상)" 로 개정(C-35 · §5 R3) ⑥ 본문 결정 질문 번호를 master 번호로 통일(C-32) · §4 에 Q7 · Q8 · Q9 추가 ⑦ §9 C-01~C-41 처분표 · §10 측정 정의(C-33). §6 은 비평 원문이라 그대로 두었다(처분은 §9).
- **사용자 결정(2026-09-24 확정)**: **Q1** 기관 계정 = 완전 별도(②) · **Q2** 운영-결과없음 = 사유 한 줄(②) · **Q3** 관리자 사이트 = 잉크 바탕 명도 반전 + `LX/OPS` 마크 + 전용 입구 + 검토 데스크 계보 띠 · 기관 카드 미리보기(①) · **Q4** 영업 = '시연 실행'(세션에 남지 않는 도착 연출) + 활용 사례(②), Wave 0 는 임시로 실행 · 편집 · 취소 · 이식 CTA 차단 · **Q5** (a) 카드 = 동 · 결과 = 필지 병기 (b) 기준일 `AS_OF` 06.08 하나 (c) 편집 저장 localStorage + '시연 · 이 브라우저에 저장' (d) two-tier §5 표 갱신 승인 · **Q6** 영상 크레딧 0 — **영상 생성 API(kie · kling 등) 호출 절대 금지**.
- 2026-09-24 초판 — 감사 10편 + 비평 10편 + 완결성 비평 §6.


- 작성: Fable 5.1 — 수석 플랫폼 기획자. 입력: `docs/superpowers/audit-0923/` 영역 감사 10편 + 비평 10편 + `tests.md` + `integrity.md` + `strategy.md`(9/23, 읽기 전용 감사 · 소스 무수정), `design/system.md`(법전), `docs/superpowers/specs/2026-09-20-*.md`(이원화 · 역할 · 카드 · 생산화), 인벤토리 `2026-08-26-landxi7-function-inventory.md`, `git log` 9/20~9/22 커밋 58건.
- 이 문서의 역할: **이후 모든 구현 에이전트가 읽는 실행 계획**. 에픽 하나 = 에이전트 한 팀 = 파일 소유 범위 하나. 같은 웨이브 안의 에픽은 파일이 겹치지 않도록 잘라 놓았다(§3).
- 전제(변경 금지): 법전 §1–§5(서체 3 · 색 90/8/2 · 라운드/그림자/그라디언트/유리 0 · 이징 하나 · 지속 4단 · 유휴 1개) · 콘티 원칙(지어낸 서사 금지 · 숫자는 `results/services/models/imagery(+cards/registry)`만 · 시연/추정/준비 중 표기) · 기능은 원본 1:1, 구조는 자유 · D22(3D 보류) · "동작하는 화면으로 판단"(사용자) · Awwwards/WebGL급 몰입감(사용자 기준) · **영상 생성 API 호출 금지(Q6 · 크레딧 0)** · git commit/reset/stash/checkout 은 통합 단계만.

---

## §0. 한 장 현황표

| 영역 | 완성도 | 인터랙티브 | 상태 | 가장 큰 문제 한 줄 |
|---|---:|---:|---|---|
| **guest** 메인 필름 · 공개 게시판 · 인증 6화면 | 62% | 5/10 | 필름 A− / 꼬리·인증 목업 | **로그인 카드가 깨졌다**(G-01 P0: 1280×720에서 제출 버튼 730 > 720 · 스크롤 불가). 필름 뒤가 흰 표·검은 푸터로 절벽, 슬라이더는 카드 2장이라 안 슬라이드, 문의는 로그인으로 튕김, 정책 문서 없음, 시연 표식 없는 서사 노출 |
| **shell-dash** 공용 셸 · 대시보드 · MY · 3계정 레일 | 64% | 3/10 | 셸 제품 / 대시보드 목업 | 대시보드가 셸 밖 옛 복제본 — 직원에게 관리 메뉴 3개 노출(D-1 P0), 제목 'LX 관리자 대시보드'인데 관리자는 못 봄(D-2 P0), 링크 11 중 8 제자리·침묵 튕김, MY 3계정 동일 프로필 |
| **dataset** 데이터 관리 4탭 | 60% | 3.5/10 | 파일 관리자 | 레일이 역할을 모름(R1 P0). 파이프라인 전이 0(업로드→완료→발행→아카이브), 진행률 99→62 되감기 루프, 새로고침에 전부 초기화, 내려받기 토스트뿐, 공유 모달이 R7(원본 LX 보관) 위반 |
| **project** 프로젝트 8단계 | 60% | 3.5/10 | 정지 화면 콘솔 | 발행 요청이 역할 관문에 튕겨 목록으로(B1 P0), 새 과제가 라벨링에서 막힘(B2 P0). 라벨링 도구 셋이 같은 고정 사각형, 결과 수정 저장이 변경을 버림, 학습·분석·업로드 진행 정지 |
| **analysis** 분석 서비스 · 발행 카드 목록 | 68% | 3/10 | 잘 정리된 업무 화면 | 완료 탭 다운로드 ReferenceError(F1 P0 — 영업 계정의 유일한 권한). 영업이 실행·편집·취소·이식 가능(caps 누수), 새 실행 결과 없음, 저장소 정사영상 타일 63MB를 한 장도 안 쓰고 V-World 위 점만 |
| **publish-produce** 카드 발행 관리 · 생산 관리 | 60% | 3.5/10 | 결재 폼 + 회의 자료 | 직원 요청이 다른 저장소에 써져 큐에 도착 못 함(PP-1 P0), 승인해도 카드가 안 생김(PP-2 P0). 생산 관리 6탭 SVG 0, 'CI 가드 0/2 미달'·'능동 비율 140%' 계산 버그 노출 |
| **map** XI맵 · 통계 · 보고서 · 표류 예측 | 68% | 4/10 | 진짜 데이터 위의 대장 | 1440×900 정보 판 열면 지도 268×369px(콘텐츠의 9%)로 붕괴(M-01 P0). 내려받기 3곳 토스트뿐, 시연 기준에 '다시 계산' 거짓, e2e 66건 역할 미설정으로 전부 실패 |
| **portal** 기관 포털 × 2 | 55% | 4/10 | LX 안의 남원 이름표 | 기관 로그인이 LX **관리자** 권한을 줌(P0-1 — lx_role 미저장 → DEFAULT_ROLE admin), 광주전남 홈 없음·링크가 LX 관리자 화면으로 새어 나감(P0-2·P0-3), 두 기관 골격이 다른 제품, 가짜 컨트롤(재생·격자 50/100/200) |
| **admin** 관리자 사이트 6메뉴 | 68% | 3/10 | 문 하나만 색 다른 사무실 | 결재 대기 숫자가 상수(2/1/6), 관리한 공지·FAQ가 사용자 화면에 닿지 않음, '완전히 다른 사이트'가 첫 화면 한 장뿐, 데이터 관리 레일에서 직원 메뉴 되살아남 |
| **support** 서비스 지원 5탭 | 62% | 3/10 | 그룹웨어 게시판 | 지도·영상·AI 결과가 한 픽셀도 없는 유일한 화면군. 관리자 공지·FAQ 별채, 기관 사용자는 LX 셸로 이탈, 영업이 문의 폼까지 열림, FAQ 1번이 '남원시가 운영하는 플랫폼'이라고 자기소개 |
| **tests** | 383/573 e2e 통과 · 113/115 unit | — | 픽스처 낡음 | 189 실패 중 186건이 한 원인 — `boot()`가 `lx_role`을 안 세워 admin으로 관문에 튕김(`cd03cb9` 이후 5 스펙 미갱신). 화면 회귀 의심 3건(로그인 카드·액센트 4곳) |
| **integrity** 57화면 × 4계정 | B등급 | — | 링크 107/108 · 콘솔 0 | 지도 화면 전부 `xdworld.vworld.kr`/`openfreemap` 외부 의존(폐쇄망 불가), `dashboard-128/` 고아 페이지 관문 없이 노출, 로그인 워드마크 → 구 스파이크 `dive.html` |

**플랫폼 종합**: 완성도 약 **63%**, 인터랙티브 **3.5/10**. 뼈대(이원화 · 카드 3겹 · 생산화 · 역할 3단 · 공용 셸 · 실데이터 · 콘솔 0 · 법전 위반 0)는 실제로 서 있다. 무너진 곳은 (1) **주체 사이의 경계** — 기관·영업·직원·관리자가 서로의 화면으로 새고, (2) **고리** — 요청→승인→카드→진열대, 새 과제→라벨링→학습, 지도→오류 신고→프로젝트가 중간에 끊기며, (3) **문법의 부재** — 결과가 '놓여 있을 뿐 도착하지 않는다'. 사용자 표현으로 "딱딱한 업무 시스템 목업"에서 벗어나지 못한 원인은 표가 많아서가 아니라 **지도·영상·AI 결과가 살아 움직이지 않기** 때문이다 — 실데이터(남원 4시점 타일 63MB · 2,098필지 · 1,674/9,664동 · 여수 100m 격자 2종 · 국산리 드론 2시점 · 크롭)는 이미 충분하다.

---

## §1. 플랫폼 시그니처 인터랙션 — 전 화면 공통 문법 확정안

`strategy.md §4`의 S1–S5를 채택하고, 감사 10편에서 반복 제안된 것을 세 부품으로 더 묶어 **8개 문법 · 부품 파일 5개**로 확정한다. 전부 이미 있는 기능·데이터·부품에 동작을 붙이는 것이며 법전 §4(이징 하나, 지속 500/750/1000/1250, 호버 180ms 물리 반응, 텍스트 인 600/60, 숫자 40ms 현상, 이미지 clip-path 1s, 유휴 1개 ≥6s, reduced-motion 정지)를 그대로 지킨다.

| # | 문법 | 한 줄 정의 | 부품(신설 파일) | 장착 화면 |
|---|---|---|---|---|
| **S1 도착** | 판독 결과는 지도 위에 "도착"한다 | 스캔 스윕(청록 수직선 1.0s, 지나간 뒤에만 결과가 남음) → 락온(브래킷 180 → 앰버 80 → 청록 정착 120 = 380ms) → 숫자 현상(글자별 40ms). 첫 결과 도착 시 `frame()` 900–1250ms 카메라 이동이 선행 | `landxi/proto/arrive.js` — `arrive(map, layerId, {sweep, lock, count, fit})` | XI맵 결과 체크 · 분석 완료/실행(진행 모달 대체) · 대시보드 판 · 포털 지도 탭 · 검토 데스크 증거판 · 메인 필름 인계 판 · 데이터 관리 발행 4/4 |
| **S2 혈관** | 모델 → 카드 → 배포본 → 기관, 한 줄로 보인다 | 제목 아래 계보 띠. 현재 칸 진하게, 호버 시 앞뒤 칸 리더선 + 실측(IoU · 모듈 수 · 배포 상태 · `updateState`), 클릭 = 그 화면으로 | `landxi/proto/lineage.js` — `lineage(el, {model, card, deploy, tenant})` | 프로젝트 조회판 · 분석 카드 상세 · 검토 데스크(승인의 결과 = Q3) · 생산 관리 매칭 · 포털 카드 덱 뒷면 · 운영 현황 결재 행 · 데이터 관리 아카이브 상세 |
| **S3 시점 스크럽** | 정사영상 4시점을 끌면 결과가 따라 바뀐다 | 시점 스트립을 연속 스크러버(0–3 소수)로. raster 두 층 크로스페이드, 변화 시점 자동 정지, 재생 1(6s 주기 = 화면 유휴 1개), URL `epoch`에 소수 | `map-gl.js setEpoch(a,b,t)` 확장 + `landxi/proto/timescrub.js` | XI맵(3모드 → 한 축) · 포털 변화 축 · 대시보드 판 학습데이터 모드 · 분석 완료 판 · 데이터 관리 판 |
| **S4 인계** | 한 대의 카메라가 게스트에서 기관까지 내려간다 | 필름 인계 판 → 활용 서비스 카드 호버 flyTo → 기관 로그인 얼굴판 같은 프레임 → 카드 덱 호버 → 지도 탭. 화면 사이 카메라 상태는 `sessionStorage.lx_cam` 규약. 2D만(D22 불침), reduced-motion = `jumpTo` | `landxi/proto/js/camera.js`(dive 스파이크 모듈 재사용) + `lx_cam` 규약 | scrub-tail · site/platform · portal-login 얼굴판 · portal 카드 덱 · LX 로그인 착지 240ms |
| **S5 출처 맥박** | 모든 숫자에 손을 대면 어디서 왔는지 말한다 | `시연` `[추정]` `준비 중` 꼬리표 + 기준일을 한 부품으로. 호버/포커스 시 프로비넌스 카드(모델 · 결과 파일 · GSD · 좌표계 · 촬영 시점 · `countCheck`). 유휴: 화면당 숫자 1개의 출처 링이 6s에 한 번 돈다 | `landxi/proto/provenance.js` — `prov(el, {src, asOf, demo, est})` · 셸 `AS_OF` 단일 소스 | 전 화면(셸 마스트 기준일 · KPI 밴드 · 카드 실측 줄 · 인프라 % · 포털 밴드) |
| **S6 스와이프** | 원본 ↔ AI 판독을 한 선으로 가른다 | XI맵 `bindSwipe()`/`GL.swipe()`를 부품으로 승격. 좌 정사영상, 우 결과(또는 시점 A/B). 핸들 하나, 화살표 키, `--swipe` 비율 | `map-gl.js swipe()` 공용화 + `.mw[data-mode=overlay]` CSS 부품 | XI맵 기본 모드 토글 · 사례 읽기(site/usecase) · 메인 꼬리 Before/After · 포털 지도 탭 · 활용 사례(영업) · 지도 속성 관리 저장 전/후 |
| **S7 전이** | 단계가 넘어가는 순간을 보여 준다 | 파이프라인 단계 전이 = 타일 clip-path 750ms 퇴장 + 다음 칸 등장 + KPI 숫자 40ms 현상. 진행 중인 것은 실제로 흐른다(시연 속도, `시연` 표기 유지). 정지된 진행률 0 | `landxi/proto/flow.js` — `tick(store, key, fn)` 공용 시연 시계 + `transit(fromEl, toEl)` | 데이터 관리 4탭 · 프로젝트 학습 epoch/분석 5단계/업로드 % · 분석 실행중 판 · 보고서 발급 접수→생성→완료 · 발행 큐 상태 |
| **S8 한 줄 안내** | 권한·결손·거부는 한 문장으로 말한다 | `?denied=`를 셸이 읽어 `say('○○ 화면은 LX 관리자 전용입니다 — 지금은 LX 직원으로 들어와 있습니다')` + `replaceState`. 결손은 점선 무채 + 이유 한 줄. 말만 하는 버튼 0 — 실동작 또는 비활성+'준비 중 · 이유' | `shell.js mountShell` 끝 + `roles.js SCREEN_MENU` 역매핑 | 전 화면 |

**우선순위와 의존**: S8 · S5는 부품 하나라 가장 싸고 Wave 1에서 끝난다. S1이 S3 · S4 · S6의 바탕(결과를 띄울 때 모두 S1 문법을 부른다). S7은 데이터 관리·프로젝트·분석 세 영역이 같은 시계를 써야 하므로 부품을 먼저 세운다. S4가 가장 비싸며(카메라 상태 규약) 스파이크 선행.

**법전 개정 필요(O7)**: 로그인 채운 파랑 버튼 → 잉크 채움으로 통일(예외 없이 법전 복귀), 진행 막대 linear 허용 1줄, 앰버 상시 칩 금지 명시(앰버는 380ms 탐지 순간만), `기준`/`비교 대상` 채운 파랑 칩 → 브래킷 칩. `design/system.md` §2·§4에 4줄 추가(Wave 1 · Fable 5.1).

---

## §2. 에픽 목록

표기: **난이도** S(반나절) · M(1–2일) · L(3–5일) · XL(1주+). **모델**: XL/설계·UX 판단 = **Fable 5.1 또는 Opus 5.5** · 일반 구현 = **Opus 5** · 기계적 수정·테스트 갱신 = **Sonnet**. 모든 에픽 공통 완료 기준: 콘솔 오류 0 · 실패 요청 0 · 14px 미만 0 · 법전 금지 스타일 0(`shots/audit-0923/integrity/crawl.mjs` 재실행으로 검증) · 소유 파일 밖 수정 0 · 스크린샷은 `shots/<에픽ID>/` · 커밋 1개 이상.

### Wave 0 — P0 · 깨짐 복구 + 시그니처 스파이크 (9팀 · 파일 겹침 0 · 상세는 `wave0/<ID>.md` 브리프)

Wave 0 는 **"전부 병렬"** 이다 — 단 세 곳에 약한 순서가 있다(§3 다이어그램): E0-8 의 관문 키(`ai-publish-create → project`)는 E0-1 이 넣는다(E0-8 은 그 전까지 자기 요청 이력으로 착지하므로 막히지 않는다) · E0-3 의 `proto-login` 3건은 E0-2 뒤 재확인 · E0-6 의 `?result=` 링크는 E0-5 가 수신을 만든다. 파일 소유는 §8 대조표가 정본이고, 각 에픽은 **자기 스펙 파일을 함께 소유**한다(E0-3 은 남는 스펙만). 역할 픽스처 코드는 §7.3 에 고정돼 있어 모두 같은 코드를 자기 스펙 안에 복사해 쓴다(Wave 0 동안 `_roles.mjs` import 금지 — 병렬 충돌 방지).

| ID | 에픽 | 모델 | 소유 파일(실제 파일명) | 근거 발견 | 완료 기준(검증 가능) | 돌릴 spec | 화면 |
|---|---|---|---|---|---|---|---|
| **E0-1** | 경계 세우기 — 세션 계약 · 관문 · 기관 완전 별도 · S8 한 줄 안내 | **Opus 5.5** | `landxi/assets/data/roles.js` · `landxi/assets/data/portal.js`(TENANTS 필드만) · **`landxi/assets/data/storage-keys.js` 신설** · `landxi/proto/shell.js` · `landxi/proto/shell-gate.js` · `landxi/proto/portal-login.js` · `landxi/proto/portal-login.css`(안내 한 줄) · `landxi/proto/portal-ui.js` · `tests/e2e/proto-shell.spec.mjs` · `tests/e2e/proto-portal.spec.mjs` · **`tests/e2e/proto-session.spec.mjs` 신설** · `shots/w0/E0-1/` | portal P0-1 · strategy §2.5 · O8 · S-1 · integrity #1(레일) · C-09 · C-10 · C-24 · C-07 | (1) §7.2 판정표 20칸이 `proto-session.spec.mjs` 로 전부 녹색(세션 전환 매트릭스 4×4 + 기관→LX · LX→포털 · 타 기관 누출 0) (2) `signOut()` 뒤 `localStorage` 에 `lx_logged_in` · `lx_role` · `lx_tenant_session` 0개(e2e 단언) (3) `?denied=` 도착 시 `#say` 문구 존재 + 주소에서 쿼리 제거(LX 3역할 + 기관 1) (4) 기관 세션 `ximap.html` → `portal.html?denied=ximap.html` + 토스트 (5) LX admin 세션 `portal-dp-nw-farm-25.html` → `portal-login-namwon.html?denied=` + 문 위 안내 (6) 관리자 화면 전부 `html[data-site=admin]` (7) `node shots/audit-0923/strategy/journeys.mjs` 재실행 시 `portal.leak_*` 착지 전부 기관 홈 · `denied 3/3` 유지 (8) 스크린샷: 4주체 레일 4장 + denied 토스트 3장 + 기관 문 안내 1장 | `proto-shell` · `proto-portal` · `proto-session` | ✔ |
| **E0-2** | 로그인 문 복구 — G-01 카드 붕괴 · 액센트 · 워드마크 · 세션 계약 준수 | Opus 5 | `landxi/proto/login.html` · `landxi/proto/login.css` · `landxi/proto/login.js` · `tests/e2e/proto-login.spec.mjs` · `shots/w0/E0-2/` | guest G-01(P0) · integrity #2 · strategy L3 · O7 · C-09 · C-11(Q7) | (1) 1280×720 · 1366×768 · 1440×900 · 1920×1080 에서 `#lgSubmit` 하단 < 뷰포트 높이, `.lg-card` 와 `.lg-foot` 겹침 0(e2e `boundingBox`) (2) 정지 상태 액센트 ≤ 3곳 · 채운 파랑 버튼 0(`:224` 계열 검사 녹색 · 버튼은 잉크 채움) (3) 워드마크 href = `scrub/index.html` (4) 로그인 성공 = §7.1 signIn 규칙(`lx_tenant_session` 제거 포함) · 목적지 = 역할 HOME(`?next` 우선) (5) `?logout` = 세 키 전부 제거 (6) 계정 종류 3칸이 한 줄 세그먼트(Q7 답 전 · 관리자 칸 유지) · 라디오 바뀔 때 좌측 캡션 `ROLES[].what` 60ms 스태거 (7) 390 가로 넘침 0 (8) 스크린샷 5폭 | `proto-login` | ✔ |
| **E0-3** | 테스트 픽스처 — 역할 픽스처 정본 · 남는 스펙 갱신 · unit 정직화 | Sonnet | **`tests/e2e/_roles.mjs` 신설**(§7.3 코드 그대로) · `tests/e2e/proto-project.spec.mjs` · `tests/e2e/proto-support.spec.mjs` · `tests/e2e/smoke.spec.mjs` · `tests/unit/data.test.mjs` · `tests/e2e/README.md` | tests §2 · M-R2 · C-02 · R5 | (1) `npx playwright test tests/e2e/proto-project.spec.mjs tests/e2e/proto-support.spec.mjs tests/e2e/smoke.spec.mjs --reporter=line` 실패 0(E0 다른 에픽 착지 전 기준 — 실패가 남으면 파일:줄 + 원인이 "화면 회귀" 인지 "픽스처" 인지 분류해 `wave0/E0-3-result.md` 에 기록) (2) `npm run test:unit` fail 0 · skip 1 의 정체(파일:줄) 명시 (3) README 에 '역할 픽스처 규칙' 1절 + 세션 키 표(§7.1) 링크 | `proto-project` · `proto-support` · `smoke` · unit | ✕ |
| **E0-4** | 분석 서비스 — 다운로드 · 역할 게이트 · 결과 연결 · 기준일 | Opus 5 | `landxi/proto/analysis.js` · `landxi/proto/analysis-run.js` · `landxi/proto/analysis-cards.js` · `landxi/proto/analysis-data.js` · `landxi/proto/analysis-kind.js`(문구만) · `tests/e2e/proto-analysis.spec.mjs` · `shots/w0/E0-4/` | analysis F1(P0) · F2 · F3 · F9 · F14 · F15 · F18 · dataset F4 · Q4(임시 ①) · Q5(b) | (1) 완료 탭 `다운로드` → Playwright `download` 이벤트 1건(파일명 `*.geojson` · 크기 > 0 기록) · pageerror 0 (2) sales 세션: `분석 실행` · `결과 편집` · `취소` · `다른 지역에 이식 ›` 전부 `disabled` + '열람 계정 — 실행·수정은 LX 직원' 문구 · `영상 업로드` 버튼 없음 + '아카이브에서 불러오기' 만 (`a4-roles.mjs` 재실행 시 `salesRunStarted:false` · `salesEditing:false` · `salesCancel:false` · `salesTp:false`) (3) staff 새 실행 → 완료 시 `commit({tab:'done', run:id})` → 완료 탭에 그 실행 선택 + 지도 도형 > 0 + 표 행 > 0(같은 serviceId 실측 `resultId` 연결 · `demo:true` · `시연` 꼬리표) · 실측 없는 카드는 '산출물 없음 · 이유' (4) 마스트 기준일 = 셸 `AS_OF`(2026.06.08) · `grep -n "08-27\|08.27" landxi/proto/analysis*.js` 0 (5) 개발자 말투 4문구 0 · '김○○' 0 · 처리 단위 뜻 한 줄 (6) `proto-analysis.spec.mjs` 37건 녹색 + 4건 추가(다운로드 · sales 차단 · 새 실행 결과 · 기준일) | `proto-analysis` | ✔ |
| **E0-5** | XI맵 — 붕괴 처방 · 내려받기 3곳 · 정직화 · `?result=` 수신 | Opus 5 | `landxi/proto/map.js` · `landxi/proto/map.css` · `landxi/proto/map-data.js` · `landxi/proto/map-stats.js` · `landxi/proto/map-report.js` · `landxi/proto/map-pledge.js` · `landxi/proto/map-gl.js`(**추가만** — 기존 export 시그니처 변경 금지, E0-S 가 import 중) · `landxi/proto/download.js`(`downloadCSV` 1개 추가 · C-06) · `tests/e2e/proto-map.spec.mjs` · `shots/w0/E0-5/` | map M-01(P0) · M-03 · M-04 · M-05 · M-R2 · 비교 도구 14 · 레이어 12줄 · D-5 · C-06 · C-23 | (1) 1440×900 에서 결과 켜기 → 표 펼치기 → 행 클릭(정보 판) 상태의 `#map-a` 캔버스 면적 ≥ 콘텐츠(`#mw`) 60 % · 겹쳐보기 진입 시 A 캔버스 ≥ 45 %(e2e 신설, `crit-05` 재현 0) (2) `download` 이벤트 3곳 각 1건(내보내기 GeoJSON · 통계 CSV BOM · 보고서 CSV BOM — 파일명·크기 기록) (3) 시연 기준 2줄 `disabled` + '시연 · 집계 자료 없음' · '통계 보기' 토스트에 '다시 계산' 문구 0 · 기간 칩·실행자·기준일이 `analyzedAt` 로 실제로 거르거나 DOM 에서 제거 (4) 비교 띠·비교 표 상수(`2,098` · `0.62 km²` · `드론`) → 시점별 실값 또는 '—' (5) 비교 도구 14개 전부 `data-tool` + 핸들러(A 판 도구 공유) · 레이어 탭 실자료 없는 줄 → '시연 · 지도 미연결' 라벨 (6) `ximap.html?result=<id>` → 그 결과 자동 체크 + `fit` 900ms(E0-6 링크 수신) (7) 발급 폼 `syncIssue` 오류 해제 · 요청자 = 현재 계정 역할명 (8) `x22` · `x28` 재촬영에서 세로 글자 쌓임 0 (9) `proto-map.spec.mjs` 71건 녹색 + 5건 추가 | `proto-map` | ✔ |
| **E0-6** | 대시보드 — 셸 이관 · 직원 화면으로 · 고아 폴더 삭제 | Opus 5 | `landxi/proto/dashboard.html` · `landxi/proto/dashboard.js` · `landxi/proto/dashboard.css` · `landxi/proto/db-data.js` · `landxi/proto/db-cells.js` · `landxi/proto/db-geo.js` · `landxi/proto/dashboard-128/`(**삭제**) · `tests/e2e/proto-dashboard.spec.mjs` · `shots/w0/E0-6/` | shell-dash D-1(P0) · D-2(P0) · D-3 · D-4 · D-5 · D-6 · D-10 · D-11 · integrity #1 · #4 · C-26(행선지 표) | (1) `mountShell({active:'dashboard'})` 로 이관 — 자체 `#rail` 마크업 · `NAV/NAV_FOOT` 레일 코드 · 자체 `logout()` 삭제 · staff 레일 = `roles.js` 7항목과 정확히 일치(e2e) (2) 제목 '대시보드'(관리자 문구 0) · 승인 KPI 3 · EVIDENCE-PAIR · 관리 타일 4 화면에서 제거(데이터 `DASH.queue` · `ADMIN_TILES` 는 남김 + **원본 위젯 행선지 표**를 `wave0/E0-6-result.md` 에: KPI 5 · 백본 · 3탭 · 공지 스트립 → 어느 화면 어느 칸(C-26)) (3) 남은 링크 전부 실목적지 · 제자리/denied 0(e2e 전수) (4) 셀 클릭 → `ximap.html?result=<id>`(E0-5 수신) (5) `dash-admin-tiles-overlap` 재현 0 · 1100px 아래 H1/KPI 겹침 0 (6) MY 플라이아웃 Esc 닫힘 · Family Site 실링크(셸 것) (7) `dashboard-128/` 삭제 → 404 (8) `proto-dashboard.spec.mjs` 22건 녹색 | `proto-dashboard` | ✔ |
| **E0-7** | 데이터 관리 — 셸 이관 · 내려받기 · 파괴 동작 확인 · 접근성 | Opus 5 | `landxi/proto/dataset.html` · `landxi/proto/dataset.js` · `landxi/proto/dataset.css` · `landxi/proto/ds-data.js` · `landxi/proto/ds-plate.js` · `landxi/proto/ds-thumbs.js` · `tests/e2e/proto-dataset.spec.mjs` · `shots/w0/E0-7/` | dataset R1(P0) · C1 · F3 · F5 · F6 · S1 · S4 · integrity #1 | (1) `mountShell({active:'media'})` — 자체 레일(`dataset.js:37-76`) · 자체 `logout` 삭제 · admin/staff 레일 = `roles.js` 와 일치(e2e 2역할) (2) `내려받기` → `download` 이벤트 1건(결과 GeoJSON 은 `downloadFile` · 정사영상은 `downloadNote` 메타 + '원본은 LX 보관') (3) 토스트 전용 6곳(`:565,566,620,888,889,890`) → 실동작 또는 `disabled` + '준비 중 · 이유' (4) 삭제 · 업로드 취소 · 발행 취소 = 셸 `confirmDialog` + 되돌리기 토스트 8초(`deleteConfirm:true`) (5) 타일 `.th[data-open]` → `button` · Tab 으로 6/6 도달 · 모달 포커스 트랩(셸 `openModal`) 통과 (6) 정직성: 도엽 '파일 2026-04 · 실측 도엽 2025.04' · 시드 by 익명화 · '2.0 KB' (7) `proto-dataset.spec.mjs` 16건 녹색 + 3건 추가 | `proto-dataset` | ✔ |
| **E0-8** | 발행 고리 배관 — 직원 요청이 관리자 큐에 도착한다 | Opus 5 | `landxi/proto/project-deploy.js` · `landxi/proto/project-data.js`(`addRequest` 위임) · `landxi/proto/publish-request.js` · `landxi/proto/publish-data.js`(`lx_publish_v1` 단일 저장소) · `landxi/proto/ai-publish-create.html` · `tests/e2e/proto-publish.spec.mjs` · `shots/w0/E0-8/` | publish-produce PP-1(P0) · project B1(P0) · B9 | (1) e2e: staff `ai-project.html?pid=…` 배포 탭 → 발행 요청 → `localStorage.lx_publish_v1.added` 에 `pa-N` 존재 → 착지 = 자기 요청 이력(배포 탭 안 7열 표 · `denied` 0) → `switchTo(page,'admin')` → `admin-publish.html` 큐 맨 위에 같은 `pa-N`(§7.3 `switchTo` 사용) (2) `ai-publish-create.html` 제출도 같은 저장소 · 목록/취소 링크 = 역할별 홈 (3) '카드 발행 관리에서 보기 ›' 는 staff 에게 `disabled` + '관리자 사이트' · admin 에게 링크 (4) 모델 등록 폼 `colgroup` 폭 정상(B9 · 1440 스크린샷) (5) `proto-publish.spec.mjs` 32건 녹색 + 1건 추가(역할 전환 연쇄) | `proto-publish` | ✔ |
| **E0-S** | **XI맵 시그니처 스파이크** — S1 도착 · S3 시점 스크럽 · S6 스와이프를 실데이터로 | **Opus 5.5** | **신설만**: `landxi/proto/spikes/ximap-signature.html` · `landxi/proto/spikes/ximap-signature.js` · `landxi/proto/spikes/ximap-signature.css` · `tests/e2e/spike-ximap-signature.spec.mjs` · `shots/w0/E0-S/`. 기존 파일은 **읽기·import 만**(`map-gl.js` · `js/sources.js` · `map-data.js` · `imagery.js` · `results.js` · `change.js` · `geo/**`) | C-36(첫 3주 '우와' 없음) · strategy S1 · S3 · S6 · analysis A1 · A3 · A5 · map-critique §2.11 · C-35 · C-37 | (1) 열자마자 S1 자동 재생: 결과 bbox `frame` 1250ms → 스캔 스윕 1.0s(지나간 뒤에만 도형이 남는다) → HUD `2,098 필지` 글자별 40ms 현상 → `window.__spike.state().arrived === true` 4s 안(e2e) (2) 필지 클릭 → 락온 브래킷 180 → 앰버 80 → 청록 정착 120(= 380ms · `getAnimations()` 또는 타임스탬프로 합 380±20 검증) (3) S3: 스크러버 `0–3` 소수 → `?epoch=1.5` URL · 두 raster 층 `raster-opacity` 0.5/0.5 · 재생 1개(6s 주기) · 정수 시점마다 750ms 자동 정지 · 범위 밖 줌에서 '이 자리엔 정사영상이 없습니다' (4) S6: 좌 원본 정사영상 · 우 원본 + 결과(청록) · 핸들 드래그 → `--swipe` 변경 · ←/→ ±4 % · 지도 2개 동기 (5) 법전: 지속값 `grep` = {180, 380, 500, 750, 1000, 1250, 40, 60} 외 0 · 이징 하나 · 라운드/그림자/그라디언트/유리 0 · 14px 바닥 · 앰버는 락온 80ms 만 · reduced-motion 정지 (6) 성능: S1 스윕 · S3 재생 중 rAF 프레임 p95 ≤ 20ms(`__spike.perf()`) · WebGL 컨텍스트 ≤ 2 (7) **모션 캡처**(§5 R3 개정): S1 100ms 간격 프레임 ≥ 10장(`s1-frame-00..`) + S3 시점 4 + 중간 2 + S6 비율 3 + `recordVideo` 8–10s webm 1편 → `shots/w0/E0-S/` (8) 콘솔 오류 0(타일 네트워크 제외) (9) 제품 화면에서 링크 0 · `<title>` 에 '스파이크 · 제품 아님' | `spike-ximap-signature` | ✔ |

**Wave 0 게이트**: `proto-session` 20칸 녹색 · `journeys.mjs` 누출 0 · 전체 e2e 실패 ≤ 3(전부 파일:줄 + 사유 기록) · `integrity/crawl.mjs` 재실행 레일 누출 0 · 각 에픽 `git diff --stat` 이 소유 범위 밖 0 · E0-S 는 Craft 비평가(Fable 5.1)가 **프레임 스트립 + 영상**을 보고 '움직이는 화면' 판정 후 사용자 시연.

### Wave 1 — P1 고리 · 정직성 · 정체성 (병렬, 영역별 파일 소유)

#### E1-1 게스트 마감 — 정책 · 문의 · 시연 표식 · 가입 · 모바일
- **목표**: G-02 · G-05 · G-06 · G-07 · G-08 · G-11 · G-12 · G-09 · G-13 · G-23 · G-24(C-29) · C-13(게스트 문의 도착).
- **파일**: `scrub/index.html` · `scrub-tail.js` · `scrub.css` · `site/*`(notice · usecase · platform · **policy.html 신설**) · `site.js` · `site.css` · `signup.html` · `auth.js` · `find-*.html` · `assets/data/support-data.js`의 시연 표식 필드(읽기만 — 값 수정은 E1-8과 조율: 이 에픽은 `demo:true` 렌더만).
- **할 일**: `site/policy.html?doc=terms|privacy`(auth-terms.js 전문) + 5 인증 화면·메인·게시판 푸터 링크 연결. 게스트 문의 폼(이름·소속·전화·내용 + 확인 모달, `sessionStorage` 게스트 키, 시연 표식, 완료 토스트). 공개 게시판 시드 3곳 시연 칩. 가입: 계정 종류(직원 · 영업 신청만 — Q1 확정: 기관 계정은 LX 가입 대상이 아니다)·소속 필드, 남원 부서 목록·'도로관리과 1–2일'·namwon.go.kr 제거. 게스트 문의는 `sessionStorage` 가 아니라 **localStorage 문의 저장소**(유형 '게스트' · 시연 표기)에 써서 E1-6 관리자 문의 관리가 읽는다(C-13). 신설 `site/policy.html` 은 관문 없는 화면 — E0-1 소유자에게 관문 표 1줄 PR(C-07). 찾기: 이메일 형식 검사, `?name` 반영. 공지 구분·검색 + `once:true` 제거, `?id=999` 결손 한 줄. 고객센터 번호 1종, 홈 링크 1종. 390: 워드마크 max-width, 시연 태그·마스트 넘침 0, `<details>` 모바일 내비. 꼬리 팔레트 5색·지속·`.lx-ret` 라운드 법전 정리. 로그인 상태면 마스트 '내 작업공간 ›'.
- **완료 기준**: 390 scrollWidth = clientWidth(메인·인증 6·게시판 3) · 정책 링크 전수(로그인 3 · 가입 · 찾기 4 · 메인 · 게시판 3 · 셸 푸터 — 실측 후 건수 기록, C-34) 전부 200 · 게스트 문의 제출 → 확인 모달 → 저장 확인 · `hasDemoTag:true` 3곳. `proto-scrub.spec.mjs`·`proto-auth.spec.mjs` 확장. 스크린샷 390 6장 + policy 2장.
- **의존**: E0-2. **난이도** M. **모델** Opus 5.

#### E1-2 기관 포털 — 생성기 · 두 번째 기관 · 가짜 컨트롤 걷기
- **목표**: P0-2 · P0-3 · P1-2 · P1-5 · P1-6 · Q2(②) · 기관 서비스 지원 · 기관 MY(C-14) — 전부 **포털 안에서**(Q1 완전 별도).
- **파일**: `tools/gen/portal-gen.mjs` · `assets/data/portal.js` · `assets/data/brand.js`(CI_KEYS platform — PP-4 여기서 수정) · `assets/data/studio.js`(grade · touchpoint · drift 블록 승격) · `portal-ui.js`(레일 제외 나머지) · `portal.css` · `portal-*.html`(전부 재생성) · `portal-login-*.html`.
- **할 일**: 생성기가 `TENANTS`를 돌며 `portal-<tenant>.html`을 찍고 입구·브레드크럼·레일 마크가 그 홈을 가리킴. 광주전남 2장을 새 골격으로 재생성(인라인 CSS·OpenFreeMap·warn 테두리 제거, 지도 526px·로컬 타일). LX 화면으로 새는 링크 3개 → 포털 탭. 자산 없는 자리의 재생/탐지 상자/격자 버튼 **걷기**(자산 있는 자리는 E2-8에서 실데이터로). 생산 문구 `data-audience=lx` 격리 + REQUESTS 파생 표식 시연. 운영-결과없음 카드 사유 한 줄(Q2 ②) — 덱과 작업공간 같은 말. 기관 서비스 지원(공지 · FAQ · 문의)과 기관 MY(비밀번호 찾기 · 아이디 저장 포함, C-14)는 **포털 안의 화면**으로 생성기가 찍는다(`portal-support-<tenant>.html` · `portal-my-<tenant>.html`) — 기관 세션은 LX `notice/faq/contact/mypage.html` 에 들어가지 않는다(Q1 완전 별도 · §7.2). 공지 · FAQ 의 데이터는 E1-8 이 세우는 `lx-admin-v1:*` 저장소를 **읽기만** 한다(기관 대상 공지 필드 `audience:'tenant'`). 두 기관 홈은 E0-1 의 임시 홈 표(§7.1 R-S3)를 `portal-<tenant>.html` 로 교체하고 `portal.js TENANTS[].home` · `shell-gate.js` 미러를 함께 갱신(E0-1 소유자와 값 PR).
- **완료 기준**: `portal-gen.json`에 두 기관 홈 + 배포본 7 전부 기록 · 광주전남 로그인 → `portal-gwangju-jeonnam.html` · 기관 세션에서 LX 화면 링크 0(`journeys.mjs`) · 가짜 컨트롤 0(`aria-pressed`만 바꾸는 버튼 grep 0) · `brandGuard` 2/2 통과. `proto-portal.spec.mjs` 확장(기관 2 × 홈 · 덱 · 탭 딥링크). 스크린샷 두 기관 홈 · 작업공간 · 390.
- **의존**: E0-1(기관 세션 · 관문 판정표 §7.2). **난이도** L. **모델** Opus 5.5(골격 한 벌 R8·R9 판단).

#### E1-3 카드 대장 통일 — 승인이 카드를 낳는다
- **목표**: PP-2(P0 잔여) · PP-3 · F6 · A4(관리자 사용자 3단은 E1-6).
- **파일**: `publish.js` · `publish-data.js`(CARDS 8장 → `cards.js` 참조) · `publish-card-edit.js` · `publish-cards.js`(`ai-card.html` 스크립트 · C-04) · `publish-label.js`(클래스 일괄 변경 · C-04) · `publish-ui.js` · `ai-card.html` · `ai-card-edit.html` · `admin-publish.html` · `assets/data/cards.js`(세션 오버레이 API 1개 `overlayCards()` 추가만) · `analysis-cards.js`(오버레이 읽기 — E0-4 이후).
- **할 일**: 승인 → `healthCheck()` ok일 때만 활성 → `cards.js CARDS/DEPLOYS`에 sessionStorage 오버레이 한 줄 → `ai-card.html`·`analysis-ai.html`·포털 덱이 읽음. `ai-card.html` = 분석 서비스 진열대와 같은 대장(platform-roles §4). 발행 폼 · 처리 패널에 스펙 필드: 대상 사업(SCOPES 칩, 글로벌 준비 중) · 공통 7 잠금 · 전용 모듈 토글 → 우측 `needsOf(card)` 장치 미리보기 · 이식 가능(`portability` 읽기 전용) · 배포 지역(PROFILES + `transplantCheck`) · 버전 규칙 라디오(major/minor/patch → `updateState` 행 단위). 카드 이름 = 행정 업무명으로 통일. 발행 큐 상태 시드 행 시연 표기. C-28: 모델 설명 화면 = 이미지 업로드 복원 · 학습 설정 하드코딩(PP-13) → 요청 값 · 권한표 13줄 전부 보이게(PP-12).
- **완료 기준**: e2e: staff 요청(E0-8) → `switchTo(admin)` 승인 → staff `analysis-ai.html` 진열대 카드 +1 · **admin 세션** `ai-card.html` +1(관리자 화면이므로 admin 으로 잰다 — C-34) · `bootTenant` 포털 덱 +1(3화면 연쇄 1건). 폼에 `scope/ext/portable/region` 필드 존재. `proto-publish.spec.mjs` 확장.
- **의존**: E0-8. **난이도** L. **모델** Opus 5.5(카드 구조 §3 판단).

#### E1-4 숫자 정직성 일괄 + S5 출처 맥박 부품
- **목표**: PP-4(brand는 E1-2가 고침 — 여기서는 produce 표기) · PP-5 · PP-6 · PP-7 · PP-11 · C7 기준일 · O1 D10 병기(Q5 (a)①) · [추정] · 시연 행 표기 · 개발자 말투. **완료 기준은 소유 범위 안으로 축소(C-16)**.
- **파일**: **`landxi/proto/provenance.js` 신설** · `assets/data/ops.js`(:117 능동 비율 상한) · `assets/data/registry.js`(profileOf 정확 일치 · `countCheck` 병기 규칙) · `assets/data/infra.js`([추정] 플래그) · `produce.js` · `shell.css:123`(`.ptabs a b` 기본 accent, `data-tone=warn`만 빨강) · `analysis-kind.js` 문구 · `design/system.md` §2·§4 개정 4줄(O7).
- **할 일**: `prov(el,{src,asOf,demo,est})` 부품 — 꼬리표 3종 + 기준일 통일 렌더 + 호버 프로비넌스 카드(브래킷, 라운드 0) + 화면당 1개 유휴 링. 셸 `AS_OF`(E0-1이 export) 하나로 06.08 통일. 인프라 추정치 전부 `[추정]` + 단가 출처, OPS·REQUESTS 시드 행 시연. 능동 비율 = 조치 낸 배포본/감시 수(≤100%). D10: 카드 = 동, 결과 = 필지, 같은 화면에 둘이면 `동 / 필지` 두 줄(**Q5 (a)①**). 해양쓰레기 클래스 8종 한글 표, 처리 단위 뜻 한 줄, '12345 km²' → 실측/[추정].
- **완료 기준**: `grep -rn "08.27\|08\.27" landxi/proto` 0 · `produce.html` 6탭 스크린샷에서 warn 글자는 조치 탭 1곳만 · '140%' 0 · `[추정]` 표기 인프라 전 행 · `prov()` 부품 데모 + 장착 **3곳**(셸 마스트 `#mast-asof` — E0-1 이 `AS_OF` 와 함께 비워 둔 자리, 1줄 PR · 인프라 · 생산). 나머지 장착(대시보드 KPI → E2-3 · 포털 밴드 → E2-8 · 분석 카드 → E2-2 · XI맵 HUD → E2-1 · 데이터 KPI → E2-4 · 검토 데스크 → E2-7)은 그 에픽 완료 기준의 `prov()` import 한 줄(C-16). unit `registry.test`에 `countCheck` 병기 케이스 2건.
- **의존**: E0-1(AS_OF). **난이도** M. **모델** 부품 = Opus 5 · 표기 스윕 = Sonnet · **법전 개정 4줄(O7)은 Fable 5.1 검토 후 반영**(C-34).

#### E1-5 프로젝트 — 흐름을 끝까지 뚫는다
- **목표**: B2(P0) · B3 · B4 · B5 · B6 · B7 · B10(부분) · S7 시계.
- **파일**: `project.js` · `project-data.js` · `project-create.js` · `project-files.js` · `project-label.js`(도구는 E2-6) · `project-train.js` · `project-analysis.js` · `project.css` · **`landxi/proto/flow.js` 신설(S7 공용 시계 — 이 에픽이 소유하고 E1-7·E2-3이 import)**.
- **할 일**: `labelingOf()`가 `store().files`의 영상을 '미작업' 행으로 반환 → 새 과제가 라벨링→데이터셋→학습→분석→배포 통과(e2e 1벌). `make()` mid 상속 제거(학습 결과 없음 · 클래스 0 · 대표 이미지 = 고른 영상), `F.invite/F.ds` 전달, 가짜 'v3' 토글 → 아카이브 단 고르개. `saveEdits`가 편집된 FeatureCollection을 store에 쓰고 `setResult`가 올림, PARCELS 제거 → 필지 표는 도형 속성. `flow.js tick()`으로 학습 epoch · 분석 5단계 · 업로드 %가 흐름(시연 속도 · 표기), 시드 진행 중 행도 같은 시계. 토스트 버튼 12개 → 동작 또는 비활성. `rm-member` 핸들러. 개요 KPI → 히어로 HUD, 우 판 3탭(판 안쪽 스크롤 0).
- **완료 기준**: e2e '새 과제 e2e' 1건(만들기→라벨 1개 저장→데이터셋→학습 시작→epoch 상승 확인→분석→배포 등록→발행 요청) · 목록 카드 `newCardText`에 '학습 완료' 없음 · 편집 저장 후 지도 도형 수 변화 · 1440/1920 개요 문서 높이 ≤ 뷰포트. `proto-project.spec.mjs` 57건 녹색 + 8건 추가.
- **의존**: E0-8. **난이도** L. **모델** Opus 5.5.

#### E1-6 관리자 사이트 — 관제실로
- **목표**: A1 · A2 · A4 · A6/A10/A15(레일은 E0 완료) · A14 · D-2 이관 수신 · **Q3 ①** · Q7 · C-03(문의 관리) · C-12(가입 → 첫 로그인) · C-13(게스트 문의 수신).
- **파일**: `admin-home.html/js/css` · `admin-users.js` · **`admin-inquiry.html/js` · `admin-faq.html/js`(C-03)** · `admin-data.js`(사용자 3단 데이터) · `admin.js`(pendingCounts 노출 · nowIso) · `admin.css` · `mypage.js` · `account-data.js` · `account-brand.js` · `account.css` · **`admin-login.html/js` 신설**(관문 없는 화면 — E0-1 소유자에게 관문 표 1줄 PR · Q7 답이 ①이면 E0-2 소유자에게 `login.html` 관리자 칸 → '관리자 사이트 ›' 링크 1줄 PR).
- **할 일**: 결재 대기 3칸 = `pendingCounts()` + 발행 저장소 대기 수(상수 제거 · `DASH_APPROVALS` 사체 제거), 카드 발행 승인 칸에 EVIDENCE-PAIR(E0-6이 뺀 것 이관 · `APPROVALS[i].crop` 실크롭 2 · `?status=대기` 딥링크), 조치 숫자만 경고색. 레일 활성 키 `ops`. 관리자 사이트 명도 반전(잉크 바탕 + 흰 글자 · 색 추가 0 · 마크 `LX/OPS`, **Q3 ①**) — `html[data-site=admin]` 전역은 E0-1이 켬, 이 에픽이 CSS를 채움. 문의 관리(C-03): 유형 패싯(일반 · 게스트 · 오탐/누락 · 기관) + 위치 첨부 미니맵 + '라벨링 큐로 보내기 ›'(`lx-feedback` 상태 전이 — 키 스키마는 E2-0 계약 전까지 `{id, type, svc, fid, pnu, lnglat, state}` 로 고정). 관리자 전용 입구 `admin-login.html`(기관 입구 패턴 · `lx_role=admin` 고정). 사용자 관리: 구분 패싯(LX 관리자·직원·영업·기관) + 열람 판 `ROLES/CAPS` 체크. MY: LX 역할별 프로필 3벌 + 계정 칩 + '계정 바꾸기 ›'(= `signOut()` 뒤 `login.html`), 영업은 디스크 카드 대신 `can('export')` 한 줄 — 기관 MY 는 E1-2 포털판(C-14). 지도 속성 수정 일시 `nowIso()`.
- **완료 기준**: 가입 승인 후 홈 숫자 감소(e2e `homeAfterApprove`) · **가입 → 관리자 승인 → 그 아이디로 로그인 → 신청 역할 HOME 연쇄 1건(C-12 · `account-data.js` 에 새 계정 기록)** · 게스트 문의(E1-1 저장소)가 문의 관리 '게스트' 패싯에 보임(C-13) · admin 12화면 전부 `mastBg` 잉크 · `admin-login.html` → `admin-home` · 관리자 로그아웃 착지 = `admin-login.html`(§7.1 R-S2 갱신) · MY 3역할 프로필 상이(스크린샷 3장). `proto-admin.spec.mjs`·`proto-mypage.spec.mjs` 확장.
- **의존**: E0-1 · E0-6. **난이도** M. **모델** Opus 5.

#### E1-7 데이터 관리 — 파이프라인이 흐른다
- **목표**: F1 · F2 · F8 · I2/I3/I6/I10.
- **파일**: `dataset.js` · `ds-data.js` · `ds-plate.js` · `dataset.css`(E0-7 이후 같은 소유자 계속).
- **할 일**: 상태 기계 + `localStorage.lx_ds_state` 한 키(ups/done/pubs/arch) — 업로드 100% → 완료 편입(clip-path 750ms · KPI 40ms 현상) → 발행 1→4 실제 상승 → 아카이브 편입. 실제 파일은 `Blob.stream()` 청크로 읽어 진행률, 시드 가짜 루프 제거. `analysis-run.js archiveById`가 같은 키를 읽어 업로드 왕복 완성(`fileSeenBack:true` — analysis 파일 한 함수는 이 에픽이 수정, E0-4와 겹치지 않음 확인). 공유 모달 자산 등급(`ASSET_TIERS`: 원본 정사영상 LX 보관 · 편집 비활성 + 이유 · 뷰어 '타일 열람'). 사용 현황 행 → 링크, 아카이브 상세 '이 영상이 도는 배포본'(S2 문자열 버전 — 띠는 E2-4).
- **완료 기준**: e2e: 파일 드롭 → 100% → 완료 탭 +1 → 발행 → 4/4 → 아카이브 +1 → 새로고침 후 유지 → `analysis-ai.html?tab=run` 픽커에 보임. `26-share-modal` 재촬영에서 정사영상 편집 세그먼트 disabled. `proto-dataset.spec.mjs` 확장.
- **의존**: E0-7 · E1-5(`flow.js`). **난이도** L. **모델** Opus 5.5.

#### E1-8 서비스 지원 — 한 저장소 · 역할 셸 · 정체성
- **목표**: S-01 · S-02(수신 측) · S-03 · S-04(관문은 E0-1) · 정직성.
- **파일**(실제 파일명 · C-05): `landxi/proto/support.js` · `support-notice.js` · `support-faq.js` · `support-contact.js` · `support-usecase.js` · `support-manual.js` · `support-data.js`(proto 쪽) · `support.css` · `usecase.html` · `manual.html` · `notice.html` · `faq.html` · `contact.html` · `landxi/assets/data/support-data.js` 시드 값(시연 표식 · FAQ 1 문구 · 내선 102 제거 — E1-1 은 이 파일을 읽기만).
- **할 일**: 공지·FAQ가 `lx-admin-v1:*`을 읽음(관리자 → 사용자 연결), 팝업 설정 수신(첫 진입 잉크 헤어라인 판 · '오늘 하루 보지 않기'). `usecase.html` 역할 분기(영업: `active:'usecase'` · H1 '활용 사례' · 탭 없음). 기관 세션은 이 화면군에 **들어오지 않는다**(Q1 완전 별도 · §7.2 — 기관 공지 · FAQ 는 E1-2 포털판이 `lx-admin-v1:*` 를 읽는다). 공지 데이터에 `audience: 'lx' | 'tenant' | 'all'` 필드 추가(E1-2 가 읽는다). 문의 유형(일반/오탐·누락 신고) + 대상 카드 선택 + 원본 삭제(답변 대기만) 복원 — 지도 위치 첨부는 E2-5. FAQ 1 '남원시가 운영하는' 문구 **삭제**(LX 화면에 기관 자기소개가 설 자리가 없다). 매뉴얼 개발자 문구 제거 · 05 사유 정정 · '이 화면으로 가기' 브래킷. 첨부 행 시연 태그.
- **완료 기준**: 관리자가 공지 등록 → `switchTo(staff)` `notice.html`에 보임 → 마스트 띠 갱신(e2e 역할 전환 1건) · sales `usecase.html` 레일 활성 + 5탭 0 · `bootTenant` 로 `notice.html` → `portal.html?denied=`(들어가지 않음을 단언). `proto-support.spec.mjs` 확장.
- **의존**: E0-1. **난이도** M. **모델** Opus 5.

#### E1-9 XI맵 — PLATE-FULL 무대
- **목표**: M-02 · I-1 · I-18 · 영업 첫 화면 I-12.
- **파일**: `map.css`(재작성) · `map.js`(레이아웃·`redraw` resize 제거·`lx_role` 분기) · `map-stats.js`/`map-report.js`(서랍을 판 위로) · `map-pledge.js` · `roles.js`의 `sales.home` 값 1줄(E0-1 소유자와 조율 — 값만 PR).
- **할 일**: `#mw` = 지도 캔버스가 콘텐츠 전부. 좌 목록(372) · 하단 표(접힘↔3행↔10행) · 우 정보 판 · 서랍을 지도 위 흰 판(헤어라인 · 그림자 0)으로. 판이 열려도 캔버스 크기 불변. 시점 스트립이 범례·표식을 덮지 않게 자리 재배치. 영업 첫 화면 `ximap.html?on=namwon-farmland-2025&epoch=namwon_2506&fold=1`, sales면 조치 상태 변경·내보내기 숨김, 정보 판 하단 '분석 서비스 카드 보기 ›', 마스트 '영업용 · 시연'. `?result=` 도착 시 자동 체크 + `fitBounds` 900ms(E0-6 링크 수신). 1280 가로 넘침 0.
- **완료 기준**: 1280·1440·1920에서 기본 · 표 펼침 · 정보 판 · 서랍 · 비교 5상태 모두 캔버스 ≥ 콘텐츠 60%(e2e) · sales 첫 진입 결과 폴리곤 > 0. 스크린샷 3폭 × 5상태. Craft 비평가 "지도가 주인인가" 통과.
- **의존**: E0-5. **난이도** L. **모델** Opus 5.5.

#### E1-10 생산 관리 — 표를 그림으로
- **목표**: 발주자 '이해가 안 된다'를 형태로 답한다. E/F/G/H/I/J/K 제안 중 E(흐름도) · G(산점) · H(계산기) · K(3단 탭 해체).
- **파일**: `produce.js` · `produce.css` · `assets/data/spine.js`(읽기) · `matching.js`(읽기).
- **할 일**: 만드는 순서 = LAYERS 5 노드 + CONTRACTS 엣지 인라인 SVG(호버 4px · 클릭 → LEDGER). 능동 운영 = 신뢰도×IoU 산점 + THRESHOLDS 기준선 2, `actionsFor` 판정 라벨, 365일 초과 점선 고스트. 인프라 = 카드×지역 계산기(`costOfNewRegion` + `capacityPlan` 고스트 게이지, 전부 [추정]). 3단 탭 해체(1440 이상 세로 섹션), 부제 리드 22/32. 매칭 이분 그래프 · 포털 CI 라이브 미리보기 · 명세 diff는 E2-7.
- **완료 기준**: 6탭 중 SVG/canvas ≥ 3 · 1440 빈 띠 ≤ 80px · 계산기 조합 선택 → 행 갱신(e2e). 스크린샷 6탭.
- **의존**: E1-4(수치 정직화). **난이도** M. **모델** Opus 5.

### Wave 2 — 시그니처 인터랙션 · 몰입 (부품 먼저, 장착은 영역 소유자별 병렬)

#### E2-0 부품 5종 + 계약 — arrive · lineage · timescrub · swipe · setBase 로컬 폴백 (선행 · 직렬)
- **목표**: S1 · S2 · S3 · S6 부품을 각 한 파일로 세우고(**E0-S 스파이크의 `ximap-signature.js` 를 부품으로 쪼개는 것이 출발점**), `setBase` 로컬 배경 폴백(C-17)을 `map-gl.js` 에 넣고, 데모 페이지 1장(`landxi/proto/review/parts-0923.html` — 제품 아님 · 관문 없는 화면 → E0-1 소유자에게 관문 표 PR)에서 3-비평가 게이트를 먼저 통과시킨다. 함께 고정하는 **W2 계약**: `lx-feedback` 키 스키마(C-19) · 신고 URL 파라미터 `svc · fid · pnu · sel · lnglat` 하나로(C-20) · `deck-card.js`(덱 한 장 렌더 부품 — E2-7 · E2-8 이 함께 쓴다, C-22) · `chart.js`(막대 · 산점 · 게이지 한 벌 — E1-10 · E2-3 · E2-10 · E2-8 히트맵이 같은 문법, C-31 O3) · 부품 키보드 조작 + `aria-valuenow`(C-41) · **성능 예산**(C-37): 상호작용 중 rAF 프레임 p95 ≤ 20ms · 화면당 WebGL 컨텍스트 ≤ 2(미니맵은 정적 캔버스 스냅샷) · INP ≤ 200ms · **모션 측정 스펙 1개**(C-35): `getAnimations()`/computed transition 으로 지속 4단 · 이징 · 호버 4px 를 재는 `tests/e2e/motion-law.spec.mjs` — 이후 모든 Craft 게이트의 공통 완료 기준. 데모 후보에 제주 2시점 + 피복(C-40 — 피복이 판독 결과인지 참조 자료인지 출처 확인 선행).
- **파일**: **`arrive.js` · `lineage.js` · `timescrub.js` 신설** · `map-gl.js`(`setEpoch(a,b,t)` 두 층 · `swipe()` 공용 · `addResult` opacity 전이 · `frame()`) · `analysis-map.js`/`publish-map.js`가 `map-gl.js`를 쓰도록 통일(mountPlate → createMap) · `parts.css`.
- **완료 기준**: 데모 페이지에서 5부품 각 동작 · reduced-motion 정지 · 법전 §4 지속값만 사용(`grep` 검사 스펙) · **Craft 비평가가 프레임 스트립(100ms × ≥8) + `recordVideo` 클립으로 판정**(§5 R3) · `motion-law.spec.mjs` 녹색 · 외부 호스트 차단 시 `setBase` 로컬 폴백 캡션 존재 · unit: `arrive` 타이밍 합 380ms · `timescrub` URL 소수 기록.
- **의존**: Wave 1 완료 · **E0-S 스파이크**(코드 출발점). **난이도** L. **모델** Opus 5.5 + Craft 비평가 = Fable 5.1.

#### E2-1 XI맵 세 장면 — 현상 · 스크럽 · 스와이프 (+지형 · 오류 신고 · 검색)
- **파일**: `map.js` · `map.css` · `map-gl.js`(부품 적용) · `map-stats.js` · `map-report.js` · `map-pledge.js` · `js/style.js`(DEM 이식) · `js/sources.js`(지형 소스만) · `map-drift.html` · `drift-map.js`(S1/S5 장착만 — 엔진 이전은 E3-3, C-08).
- **할 일**: 결과 체크 → `arrive()`; 표 행·도형 클릭 앰버 380ms; 정보 판 크롭 clip-path 1s. 시점 스트립 → `timescrub`(재생 1 · 자동 정지 · 범위 밖 비활성). 스와이프 기본 모드 토글(좌 원본 · 우 결과), 비교 모드 비교 판 자동 열림 → '변화 결과 보기 ›'. 배경지도 '지형 음영'(hillshade + `setTerrain 1.2` + pitch 45 · 폐쇄망 비활성). 정보 판 '오류 신고 › 오탐/누락' → `lx-feedback` 큐에 **쓰기까지**(라벨링 큐 카운트 수신은 E2-6 · C-19). **`pick` 모드**(`?card=&pick=1` → 지도 클릭 → `?sel=<fid>&pnu=&lnglat=` 로 복귀, C-20). 검색을 32 읍면동 + PNU에 연결. **탐지 결과 표 3종**(지목별 = 2,098 필지 속성 집계 · 필지별 = 현행 · 도로지점별 = '준비 중 · 도로 결과 없음') + 심각도 열 + 시도/시군구 실선택 + **지역 설정 저장**(`lx-map-props` 옆 키 — `storage-keys.js` PR) + 결과 목록 페이지네이션(C-27 · M-06). 표류 예측 결과에 S1 도착 + S5 '모의' 출처(C-08). HUD 숫자 40ms 현상. 막대↔지도↔표 삼각 호버. 보고서 발급 접수→생성→완료 + CSV(`flow.js`).
- **완료 기준**: e2e: 결과 켜기 → `arrive` 완료 이벤트 → 도형 수 2,098 · 스크러버 드래그 → `epoch` URL 소수 · 스와이프 비율 변경 · '운봉읍' 검색 → fit · 오류 신고 → `lx-feedback` 1건(라벨링 카운트는 E2-6 완료 기준) · `pick` 모드 왕복 1건 · 단독 3쪽(`stats-standard` · `report-standard` · `report-standard-issue`) + `map-drift` 1440 스크린샷 + 캔버스 비율 ≥ 60 %(C-08). Craft 게이트(프레임 스트립 + 클립). 스크린샷 시퀀스 6장(스윕 중간 프레임 포함).
- **의존**: E2-0 · E1-9. **난이도** L. **모델** Opus 5.5.

#### E2-2 분석 서비스 — 결과가 판독한 영상 위에 선다
- **파일**: `analysis-run.js` · `analysis-cards.js` · `analysis-map.js` · `analysis-kind.js` · `analysis.css` · **`assets/data/cards.js`(`kind.viz` heatmap · timeline 2줄 — W2 유일 소유자, C-21)** · **`docs/superpowers/specs/2026-09-20-two-tier.md` §5 표(같은 커밋 · Q5 (d) 승인)**.
- **할 일**: A1 '정사영상' 토글 = `imagery.js` 타일(`setEpoch` 재사용, 기본 ON, bounds 클립, 지명은 별도 토글) — 실행 탭 `#run-plate`도 그 영상. A2 실행 = 지도 위 스캔(`arrive` sweep을 진행률에 묶음, 모달 제거, 우 판 진행 → 완료 탭으로 `commit`). A3 결과 도착 `frame` 1100 + 스태거 + 숫자 현상. A7 실행중 판 6s tick(`flow.js`). A8 카드 상세 = 첫 실측 결과 미니맵 + 호버 4px + 선택 clip-path. A9 과제↔영상 지역 대조(밖은 회색 + '배포 지역 밖'). A6 장치 렌더러: 히트맵(여수 grid100) · 타임라인(change.js 4시점 · '변화 지수(비지도) · 학습 결과 아님') — `cards.js kind.viz`에 heatmap/timeline 선언 추가는 **two-tier §5 표 갱신을 같은 커밋에**(Q5 (d) 승인 · C-21). A4 지도에서 선택·이동·삭제 편집 실동작 — 저장은 **localStorage + '시연 · 이 브라우저에 저장'**(Q5 (c)) · 저장 후 수치 유지. A10 영업 **시연 실행(Q4 ②)** — S1 도착 연출만 돌고 `addRun` 을 부르지 않는다 · E0-4 의 임시 차단을 이것으로 교체. A11 이식 마법사 미니 지도. S2 띠 카드 상세 장착 · S5 `prov()` 카드 실측 줄(C-16 이관).
- **완료 기준**: 완료 탭 `assets/tiles/**` 요청 > 0(현재 0) · 실행 시 모달 0 · 스캔 후 도형 점등 · 실행중 pct 6.5s 내 변화 · 편집 저장 후 2,097 유지 · 히트맵 격자 fill 존재. `proto-analysis.spec.mjs` +10. Craft 게이트.
- **의존**: E2-0 · E0-4 · E1-3. **난이도** L. **모델** Opus 5.5.

#### E2-3 대시보드 — AI 양산 라인 계기판
- **파일**: `dashboard.js` · `dashboard.css` · `db-data.js` · `db-cells.js` · `db-geo.js`(C-04). S5 `prov()` KPI 장착(C-16 이관). 원본 위젯 행선지 표(E0-6 결과 문서 · C-26)에 따라 KPI 5 · 백본 · 3탭 중 대시보드 몫을 여기서 세운다 — '7일 방문' 추세는 콘티 위반이라 세우지 않는다.
- **할 일**: 네 띠(지금 만드는 것 JOBS · 발행 대기 상태 · 어디에 깔렸나 DEPLOYS 마커 2023/25/26/27 · 다음 것 CARDS 준비 중 + PROMOTE_WATCH) + `cardsOfScope` 두 숫자. 판 = `map-gl.js` MapLibre interactive, 셀 클릭 flyTo 900ms → `ximap.html?result=`. 학습데이터 모드 = 4시점 `timescrub`(유휴 1개 자동 이동 6s). 진행 중 학습 meter = `flow.js` 시계. S5 `prov` KPI 5 · S1 셀 점등.
- **완료 기준**: 한 화면(745px) 종료 · 휠/드래그에 캔버스 변화 · 셀 클릭 → XI맵 도착 + 자동 체크(e2e 연쇄) · 빈 띠 ≤ 80px. Craft 게이트.
- **의존**: E2-0 · E0-6 · E1-9. **난이도** L. **모델** Opus 5.5.

#### E2-4 데이터 관리 — 판이 주인공
- **파일**: `dataset.js` · `dataset.css` · `ds-plate.js`.
- **할 일**: 우 패널 PLATE-FULL(폭 전체 × 55–60%, 1920은 남는 폭 전부 판). 개요 = 4단계 흐름 띠(실건수 · 진행 점 1개 유휴). 발행 4단계를 판 위에서(1/4 파선 → 2/4 브래킷 정렬 → 3/4 타일 fade → 4/4 청록 `arrive`). 편입 순간 `frame` 1250 + raster-fade. 아카이브 상세 S2 띠. 실패 건 warn 브래킷 + 좌표계 모달 판 위.
- **완료 기준**: 판 면적 ≥ 우 패널 50%(1440·1920 측정) · 발행 단계별 스크린샷 4장 상이 · 개요 띠 진행 점 존재. Craft 게이트.
- **의존**: E2-0 · E1-7. **난이도** L. **모델** Opus 5.5.

#### E2-5 서비스 지원 — Geo-AI가 보이는 게시판
- **파일**(실제 파일명 · C-05): `support.js` · `support-notice.js` · `support-faq.js` · `support-contact.js` · `support-usecase.js` · `support-manual.js` · `usecase.html` · `notice.html` · `faq.html` · `manual.html` · `contact.html` · `support.css`.
- **할 일**: 활용 사례 = DEPLOYS 한 줄당 카드(7) + 모달 상단 2시점 `swipe` + RESULTS.stats(시드 KPI 접힘 · 시연) · 유휴 = 핸들 6s 왕복. 문의 = 오탐·누락 신고에 지도 위치 첨부(XI맵 `?card=&pick=1` → E2-0 계약의 `?sel=&pnu=&lnglat=` 회수 · 크롭 미리보기 · `lx-feedback` 큐에 쓰기 → E1-6 문의 관리가 표시 · '재학습 후보' 표식). `contact.html?svc=&fid=&pnu=` 수신(E2-8 I-8 · 같은 계약). 공지 열람 판 '이 공지가 가리키는 곳'(S2 한 줄 + `ximap?card=` · `analysis-ai?svc=`). FAQ '그 화면 열기' + 문의 이어 쓰기. 매뉴얼 실캡처(clip-path 1s) + '이 화면으로 가기'.
- **완료 기준**: 사례 7장 · 스와이프 동작 · 문의 신고 → XI맵 pick → 복귀 좌표 채움(e2e 연쇄) · 공지 S2 줄 대조되는 것만 노출. Craft 게이트.
- **의존**: E2-0 · E2-1(`pick` 모드) · E1-8. **난이도** L. **모델** Opus 5.

#### E2-6 프로젝트 — 손끝 · 심장 박동 · 생산 라인 첫 화면
- **파일**: `project-label.js` · `project-labeling.js` · `project-ui.js`(C-04) · `project.js` · `project-train.js` · `project-analysis.js` · `project-deploy.js` · `project.css` · `ai-project-label.html`. **`lx-feedback` 큐 수신 → 라벨링 큐 카운트**(C-19 · E2-1 에서 이관).
- **할 일**: B 진짜 그리기 도구(드래그 사각형 · 꼭짓점 폴리곤 · 원 반경 · 꼭짓점 편집 · 단축키 1/2/Del/Ctrl+Z · 청록 점선 고스트 · store 영속 → `labelingOf` 라벨 수 반영). A 학습 곡선 커서(`flow.js`) · 노드 점등 · 완료 시 KPI 현상. H 분석 결과 폴리곤 fill 0→0.14 750ms 떠오름(`arrive`). D 목록 카드 = 8단계 파이프라인 띠 + two-tier §6 네 숫자 밴드 + 호버 clip-path 스윕. F 배포 탭 `actionsFor` · `updateState` 행. I 개요 HUD. L 탭마다 명명 레이아웃(라벨링·분석 PLATE-FULL · 학습 SPLIT · 배포 EVIDENCE-PAIR · 데이터 LEDGER). S2 띠 조회판.
- **완료 기준**: e2e: 폴리곤 3점 그리기 → 저장 → 새로고침 → 남음 · 사각형 드래그 크기 ≠ 고정값 · 학습 시작 4초 후 epoch > 1 · 목록 카드 8장 상태 상이. Roboflow 비교 Craft 게이트(라벨링 스크린샷 단독 판정).
- **의존**: E2-0 · E1-5. **난이도** XL. **모델** Opus 5.5.

#### E2-7 발행 · 생산 — 카드가 태어나는 장면
- **파일**: `publish.js` · `publish-map.js` · `publish-ui.js` · `admin.css`(#pst) · `produce.js` · `produce.css`. 기관 카드 덱 미리보기는 **E2-0 `deck-card.js` 부품**을 쓴다(`portal-ui.js` 를 건드리지 않는다 · C-22). S5 `prov()` 검토 데스크 장착(C-16 이관).
- **할 일**: B 승인 = 증거판 `frame` 1250 → 청록 폴리곤 숨 한 번 + 앰버 380 → 발행 정보 열 clip-path 1s로 카드 한 장 현상 → 핸드오프 '진열대에서 보기 ›' '기관 홈에 놓기 ›' + S2 띠 + 기관 카드 덱 미리보기(Q3 ①). 생산 관리 F 매칭 이분 그래프(선 30 · 500ms 재그림) · I 포털 CI 라이브 미리보기(SHELL_PARTS 미니어처 · `cssVars` 500ms 흐름 · brandGuard 통과/미달) · J 명세 diff. N 증거판 오프라인 폴백(`setBase` 공유).
- **완료 기준**: 승인 시퀀스 스크린샷 5장 · 승인 후 미리보기 덱에 카드 존재 · 매칭 선 수 = `matchPoints` 길이 · CI 미리보기 색 = `THEMES[tenant]`. Craft 게이트.
- **의존**: E2-0 · E1-3 · E1-10. **난이도** L. **모델** Opus 5.5.

#### E2-8 기관 포털 — 지도·영상·결과가 살아 움직인다
- **파일**: `portal-ui.js` · `portal.css` · `tools/gen/portal-gen.mjs`(블록 추가) · `assets/data/studio.js`(BLOCKS).
- **할 일**: I-3 결과 줄 → `__fly` + `setHighlight` + CROPS 크롭 clip-path. I-4 시점 `swipe`(2504↔2510 · A68↔A71). I-5 변화 축 ▶ 재생 + 표 동기(`timescrub`). I-6 드론 플레이어 = 국산리 2시점 스크럽 + 탐지 상자 토글(자산 있는 배포본만). I-7 히트맵 = 여수 grid100 4단 파랑, 자료 있는 격자만 활성. I-8 오류 신고 → `contact.html?svc=&fid=&pnu=`. I-9 홈 덱 얼굴 = 정적 미니맵(결과 청록 · 호버 4px + 1단 줌). I-10 KPI 밴드 → 덱 필터. I-11 읍면동 무채 헤어라인 + 호버 툴팁. I-12 보고서 인쇄 서식 + CSV. I-13 탭 딥링크. I-14 로그인 얼굴판 = 실결과 미니맵 6s 패닝. S2 덱 뒷면 · S1 지도 탭 · S5 밴드.
- **완료 기준**: 가짜 컨트롤 0 유지 · 결과 줄 클릭 → flyTo + 크롭 · 히트맵 fill > 0 · 드론 스크럽 프레임 2 · 신고 → contact 필드 채움(e2e) · 홈 덱 미니맵 canvas ≥ 2. Craft 게이트 "기관이 자기 것으로 믿는 사이트인가".
- **의존**: E2-0 · E1-2 · E2-5(contact 수신). **난이도** L. **모델** Opus 5.5.

#### E2-9 게스트 — 필름이 제품으로 이어진다
- **파일**: `scrub/index.html` · `scrub.js`(manifest 인계 창 · handoffFinal) · `scrub-tail.js` · `scrub.css` · `site/usecase.html` · `site/platform.html` · `site.js` · `site.css` · `crops.js`(읽기). **C-25 추가**: 원본 §12 서비스 라인업 13칩(현 15종 · `serviceCards('lx')` 실데이터) · 노코드 4노드 플로우(E1-10 흐름도와 같은 `chart.js` 부품) · 특징 3종.
- **할 일**: 필름→꼬리 clip-path 커튼 1000ms + 첫 칸 스태거. 남원 인계 판 체류 1.0–1.5vh + 안내·범례 + S1 도착. 여수 판 복귀(해안 카메라 · 항공 1,857 · 드론 2,078 점). 슬라이더 = `serviceCards('lx')` DEPLOYS 6–7장(엠블럼 얼굴 · measures 실측 · 화살표 살아남). 사례 읽기 = EVIDENCE-PAIR(크롭 2 + stats) + Before/After `swipe`(남원 4시점 타일 또는 crops 시계열). 활용 서비스 기관 카드 = 실측 줄 + 경계 미니 지도. 전송 예산: 레그 01·02 이후 mp4는 스크롤 시작 후 preload(scrollcraft 옵션 확인 · 첫 4초 12MB → 포스터 + w01). 엔드 프레임 사각 씸은 **영상 재렌더 없이** CSS 마스크로 시도 → 안 되면 §5 R1 게이트(**Q6 확정: 크레딧 0 — 영상 생성 API 호출 절대 금지**, 재렌더가 필요하면 사용자에게 다시 묻는다).
- **완료 기준**: 1440 슬라이더 `sw > cw` · 화살표 클릭 이동 · 인계 판 체류 스크롤 비율 ≥ 1.0vh(`_scrub.json`) · 여수 판 maps 2 · 첫 4초 전송 ≤ 5MB(Playwright `request` 집계) · 사례 스와이프 동작. Craft 게이트(필름 A− 유지 + 꼬리 절벽 해소 판정).
- **의존**: E2-0 · E1-1. **난이도** L. **모델** Opus 5.5.

#### E2-10 관리자 운영 현황 — 전국 배포 지도 + '결재 = 장면'
- **파일**: `admin-home.js/css` · `admin-map.js` · `admin-notice.js` · `admin-inquiry.js` · `publish.js`(승인 · 반려 장면 — E2-7 과 같은 웨이브이므로 **E2-7 완료 뒤 직렬**).
- **할 일**: I1 네 축 가운데 MapLibre 판(DEPLOYS 7 점 · 상태색 · `actionsFor` high만 '긴급' · 결재 핀 · 유휴 = 긴급 점 6s 맥동). I3 개발 관리 축 펼침(750ms · 이유 한 줄 · `produce?tab=ops`). I4 인프라 용량 막대 + 예정 토글. I5 요구→화면 타임라인. I7 공지 폼 아래 사용자 띠 실물 미리보기. I8 지도 속성 저장 전/후 `swipe` + 'ximap에서 보기 ›'. S2 결재 행. **'결재 = 장면'(C-39)**: 승인 → 배포 지도에 점 도착(S1) · 반려 → 요청 행 퇴장(S7 clip-path 750ms) · 문의 답변 → 행 상태 전이 · 신고 이관 → 라벨링 큐로 S2 리더선.
- **완료 기준**: 운영 현황 canvas ≥ 1 · 빈 띠 ≤ 80px · 긴급 점 클릭 → produce 행 · 공지 미리보기 = 저장 후 마스트 띠와 동일 문자열. Craft 게이트.
- **의존**: E2-0 · E1-6 · E2-7(직렬). **난이도** L. **모델** Opus 5.5(C-39).

### Wave 3 — 인계 · 폐쇄망 · 반응형 · 회귀 봉인

#### E3-1 S4 인계 — 카메라 규약 (스파이크 선행)
- **파일**: `landxi/proto/js/camera.js` · `scrub-tail.js` · `site/platform.html` · `portal-login.js`(얼굴판) · `portal-ui.js`(덱 호버) · `login.js`(착지 240ms) · 스파이크 `spikes/handoff-0923/` 먼저.
- **할 일**: `sessionStorage.lx_cam` {center, zoom, bearing:0, pitch:0, t} 규약. 활용 서비스 카드 호버 → 판 flyTo → 클릭 → 기관 로그인 얼굴판이 같은 프레임에서 시작 → 카드 덱 호버 → 배포본 범위 → 지도 탭. LX 로그인은 고른 계정의 집으로 240ms 착지. reduced-motion = jumpTo. 2D만.
- **완료 기준**: 스파이크 Craft 게이트 통과 후 제품 이식 · 화면 3회 전환 동안 카메라 점프 0(연속 스크린샷 프레임 차 측정) · D22 불침(pitch 0 · setTerrain 미사용).
- **의존**: E2-8 · E2-9. **난이도** XL. **모델** Opus 5.5 + Fable 5.1 설계 검토.

#### E3-2 반응형 스윕 — 1100px 하단 탭바 · 390 전 화면
- **파일**: `shell.css`(탭바 — 선행 · 단일 소유자) → 이후 영역별 CSS를 각 소유자가 병렬(`login.css` `scrub.css` `site.css` `dashboard.css` `dataset.css` `project.css` `analysis.css` `admin.css` `map.css` `portal.css` `support.css` `produce.css`).
- **할 일**: 레일 72 → 하단 56 탭바(아이콘 + 14px 라벨 · 역할 그대로), 마스트 기준일만. 분할 화면 → 두 단계(목록 → 열람 판 500ms). 툴바·페이저·상태 타일 → CHIP-RAIL. 덱 1열. 라벨링 작업공간 지도 전면 + 시트. 화살표 44px.
- **완료 기준**: 57화면 × 390×844 · 768×1024 `scrollWidth === clientWidth`(integrity crawl 확장 스펙) · 14px 미만 0 유지. 스크린샷 57 × 2.
- **의존**: Wave 2 완료. **난이도** L(합). **모델** shell = Opus 5 · 영역 CSS = Sonnet × 12 병렬.

#### E3-3 폐쇄망 — 배경 타일 폴백 · 표류 예측 엔진 이전
- **파일**: `js/sources.js` · `drift-map.js` · `drift-core.js` · `admin-map.js` · `map.js`(`:462` `VW13` 견본 1줄) · `ds-plate.js` · `db-data.js` · `analysis-map.js` · `publish-map.js`(외부 타일 직접 호출 청소 · C-18) · `portal-dp-gj-*`(생성기 경유). `map-gl.js setBase` 로컬 폴백은 **E2-0 이 만든다**(C-17) — 여기서는 쓴다.
- **할 일**: E2-0 의 `setBase` 로컬 폴백(`VWORLD_KEY` 없으면 `xdworld` 대신 **로컬 배경** — EOX 로컬 캐시 또는 남원·여수 정사영상 타일 + `sigungu.geojson` 무채 채움, 캡션 '오프라인 · 로컬 배경' 자백)을 남은 지도 8종에 적용. openfreemap 하드코딩 제거. 표류 예측을 `createMap` 위로(한국어 라벨 · warn은 '모의' 글자만 · 난수 시드 고정 · NavigationControl 라운드/그림자 제거).
- **완료 기준**: Playwright `route`로 외부 호스트 전부 차단 시 지도 화면 8종 캔버스 렌더 + 캡션 존재(e2e) · integrity crawl `externalReq` 0(스파이크 제외).
- **의존**: E2-0(`setBase` 폴백) · **`map-gl.js` 는 W2 에 E2-0 → E2-1 소유이므로 W2 와 병렬 불가 — W3 에서 돈다**(C-17 정정). **난이도** M. **모델** Opus 5.

#### E3-4 법전 · 허브 · 회귀 봉인
- **파일**: `design/system.md`(§2·§4 예외 4줄 · §3 명명 레이아웃에 PLATE-FULL/SPLIT-5050/LEDGER/EVIDENCE-PAIR/CHIP-RAIL 정의 확인) · `docs/superpowers/specs/2026-09-20-two-tier.md §5` 표 대조(E2-2 가 이미 갱신) · `landxi/proto/review/index.html`(D번호 충돌 정리 O11) · `tests/e2e/*`(웨이브별 신설 스펙 통합 · `_roles.mjs` import 로 일원화 · 목표 건수 = 에픽별 추가 건수의 합으로 재계산, C-34) · `tests/e2e/README.md` · `mypage.js` '시연 초기화'(`storage-keys.js` 의 리셋 포함 키 전부 · C-24) · `.github`/CI 스크립트(있으면).
- **완료 기준**: 전체 e2e 녹색 · unit 녹색 · **골든 패스 e2e 1건 + `recordVideo` 1편**(게스트 필름 → 가입 → 직원 과제 → 발행 요청 → 관리자 승인 → 기관 덱에 카드 → 기관 오류 신고 → 관리자 → 직원 라벨링 큐, C-15) · **axe-core 스캔 57화면 × 3역할 serious 위반 0**(C-41) · 3-비평가 게이트 기록 `docs/superpowers/review/2026-10-xx-gate.md` · 인벤토리 §1–§12 대조표(Brief 비평가) 결손 0 또는 '준비 중 · 이유' · **Q9 D22 재상정 안건서**(C-38).
- **의존**: 전부. **난이도** M. **모델** Fable 5.1(법전·스펙) + Sonnet(테스트 통합).

---

## §3. 실행 웨이브 — 병렬 묶음과 파일 충돌 규칙

**충돌 규칙**: (1) 웨이브 안에서 파일 하나의 소유자는 하나. (2) `shell.js` · `shell-gate.js` · `roles.js` · `portal.js TENANTS` · `storage-keys.js` · `shell.css`는 웨이브마다 **셸 소유자 1명**(W0 = E0-1, W1 = E1-4의 `shell.css:123` 1줄 + `#mast-asof` `prov()` 1줄 · 관문 표 · 저장소 키 1줄 PR 은 E0-1 소유자가 W1 에도 받는다, W2 = E2-0(계약 파일만), W3 = E3-2). (2-b) 기관 세션 판정표(§7.2)를 바꾸는 일은 어느 웨이브든 E0-1 소유자만. (3) `map-gl.js`는 W0 = E0-5, W2 = E2-0(부품) 뒤 E2-1, W3 = E3-3. (4) `cards.js`는 W1 = E1-3만(오버레이 API 1개), 나머지는 읽기. (5) `analysis-run.js`는 W0 = E0-4, W1 = E1-7의 `archiveById` 한 함수(줄 범위 명시 후 PR), W2 = E2-2. (5-b) `download.js` 는 W0 = E0-5(`downloadCSV` 추가), 나머지는 import 만. (5-c) `tests/e2e/<spec>` 은 그 화면 에픽이 소유하고, `_roles.mjs` 는 E0-3 → E3-4. (6) 데이터 파일(`assets/data/*`) 값 수정은 §2 각 에픽에 적힌 것만. (7) 다른 소유자 파일을 고쳐야 하면 **값/한 줄 PR을 소유자에게 요청**하고 자기 에픽에 기록한다.

```
Wave 0  (P0 · 깨짐 복구 + 스파이크 · 약 3–4일 · 9팀 병렬 · 브리프 wave0/<ID>.md)
  E0-1 경계(세션 계약 · 관문 · 기관 완전 별도 · S8)   Opus 5.5  ← 관문 표 · 저장소 키 변경은 E0-1에 PR
  E0-2 로그인 문(G-01 · 세션 계약)                    Opus 5    → E0-3 이 proto-login 3건 재확인
  E0-3 테스트 픽스처(_roles.mjs 정본 · 남는 스펙)      Sonnet
  E0-4 분석 다운로드·게이트·결과 연결                  Opus 5
  E0-5 XI맵 붕괴·내려받기·?result= 수신                Opus 5    → E0-6 셀 링크가 이것을 쓴다
  E0-6 대시보드 셸 이관 · dashboard-128 삭제          Opus 5
  E0-7 데이터 관리 셸 이관                              Opus 5
  E0-8 발행 고리 배관(lx_publish_v1 단일)               Opus 5    (관문 키 ai-publish-create → project 는 E0-1)
  E0-S XI맵 시그니처 스파이크(S1 · S3 · S6 실데이터)    Opus 5.5  → Craft 게이트(프레임 스트립 + 영상) → 사용자 시연
  규칙: 각 에픽은 자기 스펙 파일을 소유 · 역할 픽스처는 §7.3 코드를 스펙 안에 복사(_roles.mjs import 금지)
  게이트: proto-session 20칸 녹색 · journeys.mjs 누출 0 · e2e 실패 ≤ 3 · integrity crawl 레일 누출 0 · diff --stat 소유 밖 0

Wave 1  (P1 고리·정직성·정체성 · 약 1.5–2주 · 10팀 병렬)
  E1-1 게스트 마감        Opus 5      E1-6 관리자 관제실       Opus 5
  E1-2 포털 생성기·2기관   Opus 5.5    E1-7 데이터 파이프라인    Opus 5.5  (E1-5 flow.js 뒤)
  E1-3 카드 대장 통일      Opus 5.5    E1-8 서비스 지원 저장소   Opus 5    (E1-2 훅 뒤)
  E1-4 정직성+S5 부품      Opus 5/Sonnet  E1-9 XI맵 PLATE-FULL  Opus 5.5
  E1-5 프로젝트 흐름+S7    Opus 5.5    E1-10 생산 관리 그림      Opus 5    (E1-4 뒤)
  게이트: 3-비평가(Brief·System·Craft) 영역별 · e2e 녹색 · 콘티 위반 0 · 법전 개정 4줄 반영

Wave 2  (시그니처 인터랙션 · 약 3주 · 부품 1주 + 장착 2주 병렬)
  E2-0 부품 4종(arrive·lineage·timescrub·swipe)   Opus 5.5 + Craft=Fable 5.1   ← 직렬 선행
  ─ 이후 병렬 ─
  E2-1 XI맵 세 장면     Opus 5.5    E2-6 프로젝트 도구·라인    Opus 5.5 (XL)
  E2-2 분석 영상 위 결과 Opus 5.5    E2-7 발행 탄생·생산 그림   Opus 5.5
  E2-3 대시보드 계기판   Opus 5.5    E2-8 포털 살아 움직임      Opus 5.5
  E2-4 데이터 판 주인공  Opus 5.5    E2-9 게스트 필름→제품      Opus 5.5
  E2-5 서비스 지원 GeoAI Opus 5      E2-10 운영 현황 배포 지도   Opus 5
  게이트: 화면마다 Craft 비평가(스크린샷만) "재스킨 → 제품" 판정 · 인터랙티브 목표 ≥ 7/10

Wave 3  (인계·폐쇄망·반응형·봉인 · 약 2주)
  E3-1 S4 인계(스파이크 → 제품)   Opus 5.5 + Fable 5.1
  E3-2 반응형 스윕(shell 선행 → 12 CSS 병렬)   Opus 5 → Sonnet × 12
  E3-3 폐쇄망 타일 폴백·표류 이전   Opus 5     (Wave 2와 병렬 가능)
  E3-4 법전·허브·회귀 봉인          Fable 5.1 + Sonnet
  게이트: e2e ≥ 620 녹색 · 외부 요청 0 · 57화면 × 3폭 넘침 0 · 인벤토리 대조 결손 0
```

**목표 수치**(측정 정의는 §10): Wave 0 뒤 완성도 70% + E0-S 스파이크 Craft 통과 · Wave 1 뒤 80% / 인터랙티브 5 · Wave 2 뒤 90% / 인터랙티브 7–8 · Wave 3 뒤 95%+(D22 3D 는 Q9 재상정 결과에 따름).

---

## §4. 결정 질문 — Q1–Q6 확정(2026-09-24) · Q7–Q9 신설(추천안으로 진행)

**본문 참조 번호는 이 표의 번호다(C-32 통일).** 확정된 것은 되돌리지 않는다. 신설 Q7–Q9 는 답이 오기 전 추천안으로 진행하고, 답이 다르면 해당 에픽만 되돌린다.

| # | 질문 | 결정 · 추천 | 걸린 에픽 |
|---|---|---|---|
| **Q1 계정 표** | 기관 계정을 어디에 두는가 | **확정 ② 기관 완전 별도** — `roles.js` 3단에 넣지 않는다. 표 = `portal.js TENANTS` · 세션 = `lx_tenant_session` · 관문 = §7.2 판정표. 기관 세션은 LX 셸 화면에 절대 들어가지 못하고, LX 세션(관리자 포함)도 기관 작업공간에 들어가지 못한다. 로그아웃은 그쪽 키를 전부 지운다. LX 가입 = 직원 · 영업 신청만. 기관의 분석 · 지도 · 서비스 지원 · MY 는 **포털 안의 화면**(E1-2) | E0-1 · E0-2 · E1-1 · E1-2 · E1-6 · E1-8 |
| **Q2 운영인데 결과 없음** | 실측 결과 없는 운영 배포본 | **확정 ②** 운영 유지 + 덱 · 작업공간 첫 칸에 사유 한 줄 | E1-2 · E2-8 |
| **Q3 관리자 사이트** | '완전히 다른 사이트' 의 범위 | **확정 ①** 잉크 바탕 명도 반전 + `LX/OPS` 마크 + 전용 입구 `admin-login.html` + 검토 데스크에 계보 띠 · 기관 카드 미리보기 | E0-1(`data-site=admin`) · E1-6 · E2-7 · E2-10 |
| **Q4 영업의 실행** | 영업 계정의 '분석 실행' · '이식' | **확정 ②** '시연 실행' — 세션에 남지 않는 S1 도착 연출만 + 활용 사례. **Wave 0 는 임시 ①**(실행 · 편집 · 취소 · 이식 CTA 차단 · 안내 한 줄) → E2-2 A10 이 ②로 교체 | E0-4 · E2-2 · E1-8 |
| **Q5 숫자의 실체** | (a) 동 vs 필지 (b) 기준일 (c) 편집 저장 (d) viz 선언 | **확정 (a)① 카드 = 동 · 결과 = 필지 병기 (b) `AS_OF` 06.08 하나 (c) localStorage + '시연 · 이 브라우저에 저장' (d) two-tier §5 표 갱신 승인** | E0-4(b) · E1-4(a·b) · E1-5(c) · E1-7(c) · E2-2(c·d) · E3-4 |
| **Q6 영상 비용** | 필름 재렌더에 크레딧을 쓰는가 | **확정: 크레딧 0.** 영상 생성 API(kie · kling 등) 호출 **절대 금지**. CSS 마스크 · 지연 로드로만. 재렌더가 꼭 필요하면 (건수 · 초 · 비용)을 적어 다시 묻는다 | E2-9 · 전 에픽 |
| **Q7 관리자 문**(신설 · C-11) | LX 로그인의 계정 종류 3칸에 관리자를 두는가, 전용 입구만 두는가 | 추천 **① LX 로그인 = 직원 · 영업 2칸 + 관리자 칸 자리에 '관리자 사이트 ›' 링크(`admin-login.html`)**. Wave 0(E0-2)는 3칸 유지, E1-6 이 `admin-login.html` 을 세운 뒤 E0-2 소유자에게 1줄 PR | E0-2 · E1-6 |
| **Q8 디스크 · 대시보드 수치**(신설 · C-31 O2 · C-26) | D26 디스크 수치 4값 공존(612 / 1,420 / 1,965 / 1,326 GB) 중 어느 것이 정본인가 · 원본 대시보드 위젯(KPI 5 · 백본 · 운영 지표 3탭 · '7일 방문') 의 행선지 | 추천 **인프라 `infra.js` 한 값 + `[추정]` + 단가 출처**, 나머지 3값 삭제. '7일 방문' 추세는 콘티 위반 → **제거**(원본 1:1 예외를 인벤토리 대조표에 '콘티 원칙 사유' 로 기록). 백본 · 3탭 → 대시보드(E2-3) · 승인 · 가입 · 미답변 KPI → 운영 현황(E1-6) | E0-6(행선지 표) · E1-4 · E1-6 · E2-3 |
| **Q9 D22 재상정**(신설 · C-38) | "결과가 지도 위에 입체로 겹친다"(8/25 핵심 서사)를 언제 다시 묻는가 | **Wave 2 게이트 직후 예약**. 추천: 결과 폴리곤 `fill-extrusion` 1개 모드 · 기본 OFF · pitch ≤ 45 · 스파이크 먼저(`spikes/` · 제품 아님) · S4 인계는 2D 유지 | E3-1 · E3-4 |

## §5. 리스크

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| **R1 영상 크레딧 비용** | 필름 재렌더·새 레그·포스터 재생성은 영상 생성 크레딧을 소비한다 | 예산 초과 · 되돌릴 수 없는 지출 | **Q6 확정: 크레딧 0.** 어떤 에이전트도 영상 생성 API(kie · kling 등)를 호출하지 않는다. E2-9는 CSS 마스크/지연 로드만. 재렌더가 꼭 필요하면 (건수 · 초 · 예상 비용)을 적어 사용자에게 다시 묻는다. 호출은 에픽 실패로 처리 |
| R2 파일 충돌 | 10팀 병렬에서 `shell.js` · `map-gl.js` · `cards.js` · `analysis-run.js`가 뜨겁다 | 서로의 커밋을 덮음 | §3 소유자 규칙 · 웨이브 경계에서만 뜨거운 파일 인계 · 소유자 외 변경은 한 줄 PR 요청으로 · 매 에픽 `git diff --stat`을 완료 보고에 첨부(소유 범위 밖 0 검증) |
| **R3 몰입감 판정의 주관성 · 정지 화면 판정(C-35 개정)** | '재스킨 → 제품' 판정이 구현자 자평으로 흐르거나, 시간 축의 품질(S1 스윕 · S3 스크럽 · S4 카메라 · S7 전이)을 사진 한 장으로 가른다 | 사용자가 다시 '목업' 거부 | 법전 §7 3-비평가 게이트 강제 — Craft 비평가는 **구현에 참여하지 않은 최상위 모델(Fable 5.1)**. **입력 = 정지 스크린샷 + 모션 중간 프레임 연속 캡처(100ms 간격 ≥ 8장 스트립) 또는 Playwright `recordVideo` 5–10s 클립(webm)**. 모션 스펙은 `motion-law.spec.mjs`(E2-0)로 기계 측정. 불합격은 보고 금지. E0-S 부터 이 방식으로 판정 |
| R4 콘티 원칙 침식 | 몰입을 위해 숫자·서사를 지어내는 유혹(진행률 · KPI 추세 · 담당자) | 공공 서비스 신뢰 붕괴 | 모든 시연 시계(S7)는 '시연' 표기, 숫자는 `results/services/models/imagery/cards/registry`만, `countCheck()` unit 확장, E1-4 `prov()`가 출처 없는 숫자를 렌더 거부(콘솔 warn) |
| R5 테스트가 다시 낡는다 | 9/21 위계 뒤 사흘 검사 없이 수정되어 M-01이 생겼다 | 회귀 미탐 | 각 에픽이 **자기 스펙을 소유하고 같은 웨이브에 갱신** · 역할 픽스처는 §7.3 코드를 스펙 안에 복사(Wave 0) → E3-4 가 `_roles.mjs` import 로 일원화 · 각 에픽 완료 기준에 e2e 추가 건수 명시 · 웨이브 게이트에서 전체 e2e 녹색 필수 |
| R6 폐쇄망 | 지도 화면 전부 `xdworld.vworld.kr` 의존 — 현장 시연 네트워크에서 빈 화면 | 시연 실패 | E3-3을 Wave 2와 병렬로 앞당길 수 있음(`map-gl.js` 소유 시점만 조율). 로컬 배경 타일 자산 유무 사전 확인(EOX 캐시 또는 정사영상 + 행정경계 무채) |
| R7 스펙 문서와 화면의 어긋남 | `cards.js kind.viz` 확장 · 법전 예외 · two-tier §5 표 | 구현 에이전트가 낡은 문서를 읽고 되돌림 | 데이터 정본을 바꾸는 에픽(E1-3 · E2-2)은 같은 커밋에 스펙 표 갱신 포함 · E3-4가 최종 대조 |
| R8 3D 유혹 | 지형 음영(E2-1 I-6)이 D22(3D 보류)로 번짐 | 결정 위반 · 성능 | 지형은 배경지도 서브메뉴 옵션 1개 · 기본 OFF · pitch ≤ 45 · S4는 2D만. D22 재상정은 "지도에서 학습데이터 구축·관리" 이후 |
| R9 데이터 정본 오버레이의 한계 | 승인 → `cards.js` 세션 오버레이는 새로고침·다른 브라우저에 남지 않는다 | 시연 중 사라짐 | localStorage 키로(`lx_cards_overlay`) + '시연 · 이 브라우저에 저장' 표기(Q5 c) · 시연 리셋 버튼 MY에 |
| R10 일정 | Wave 2가 10팀 XL/L 동시 | 검수 병목 | Craft 비평가 2명(Fable 5.1 · Opus 5.5) 로테이션 · 에픽당 중간 체크포인트 1회(부품 장착 직후) |
| R11 하네스가 보고서 파일 쓰기를 거부한다 | 9/23 감사에서 `analysis.md` 두 편이 서브에이전트 단계에서 쓰이지 못했다(C-01) | 근거 문서 유실 | 구현 에이전트의 결과 문서는 브리프가 정한 경로(`wave0/<ID>-result.md`)에 쓰되, 거부되면 **구조화 결과에 전문을 담아 반환**하고 통합 단계가 파일로 옮긴다. 스크린샷 · JSON 은 `shots/w0/<ID>/` 에 직접 남긴다 |
| R12 세션 두 벌의 손상 상태 | `lx_logged_in` 과 `lx_tenant_session` 이 동시에 남는 경우(옛 세션 · 수동 조작) | 관문이 어느 쪽으로 보낼지 모른다 | §7.2 마지막 열: 세 키 전부 지우고 `login.html` · `proto-session.spec.mjs` 에 이 칸 포함 |

---

## 부록 — 근거 파일
- 영역 감사·비평: `docs/superpowers/audit-0923/{guest,shell-dash,dataset,project,analysis,publish-produce,map,portal,admin,support}[-critique].md`
- 테스트: `tests.md`(189 실패 전체 목록) · 무결성: `integrity.md`(228방문 원시 `shots/audit-0923/integrity/raw.json`) · 전략: `strategy.md`(여정 20장 · 결정 대장 F1–F16 · O1–O11)
- 스크립트·스크린샷: `shots/audit-0923/<영역>/` — 각 에픽 완료 기준의 "재촬영"은 같은 스크립트를 다시 돌려 파일명을 유지한다(전후 비교).

---

## §6. 완결성 비평 (2026-09-24 · 완결성 비평가 · 추가 전용 — §0–§5 무수정)

- 방법: 이 문서 §0–§5를 폴더의 보고서 20편(영역 9 + 비평 9 + `tests.md` · `integrity.md` · `strategy.md`), 원시 증거(`shots/audit-0923/*/*.json`), 인벤토리 `2026-08-26-landxi7-function-inventory.md`, 실제 파일 목록(`landxi/proto/*.js|html`)과 대조했다. 소스는 읽기만 했다. 심각도 **P0** = 계획대로 가면 실패하거나 거짓 완료가 나온다 · **P1** = 결손이 남는다 · **P2** = 정리.
- 한 줄 판정: **구현 순서와 문법(§1)은 탄탄하다. 약한 곳은 네 가지다. (1) 근거 문서 하나가 통째로 없다. (2) 파일 소유표가 실제 파일명·함수 위치와 어긋나, 몇 에픽은 완료 기준을 소유 범위 안에서 달성할 수 없다. (3) 계정 전환·로그아웃·기관 세션의 LX 화면 같은 '사이' 여정이 비어 있다. (4) 몰입감 게이트를 정지 스크린샷으로 판정하도록 설계했다.**

### 6.1 근거 문서 결손

| # | 심각도 | 발견 | 근거 | 처방 |
|---|---|---|---|---|
| C-01 | **P0** | **`analysis.md` · `analysis-critique.md`가 없다.** 머리말은 "영역 감사 10편 + 비평 10편"이라 했지만 폴더에는 9 + 9편이다. §0 analysis 행(68% · 3/10)과 E0-4 F1–F4, E2-2 A1–A11 ID를 **읽을 수 있는 출처 문서 없이** 인용한다. 원시 증거는 있다: `shots/audit-0923/analysis/c1.json`(`ReferenceError: downloadGeoJSON is not defined` · `tileReqsTotal 0` · `vworldReqs 185`), `a4.json`(`salesRunStarted:true` · `salesEditing:true` · `salesCancel:true`), `a3.json`(`runningLive: "static (no change over 6.5s)"`), 스크린샷 97장 | 폴더 목록 · JSON 3종 | Wave 0 착수 전 원시 JSON으로 `analysis.md`/`analysis-critique.md`를 복원한다(Sonnet, S). 복원 전까지 구현 에이전트는 E2-2의 A1–A11이 무슨 뜻인지 추측해야 한다. 각 A번호에 한 줄 정의를 E2-2 본문에 붙일 것 |
| C-02 | P2 | §0 tests 행과 E0-3은 "189 중 186건이 한 원인"이라 했는데 `tests.md`는 "최소 184개 · 표 소계 185 · 184–185 근사"다. E0-3 완료 기준 "unit 115/115"는 skip 1건(라벨 없음) 때문에 도달할 수 없다 | `tests.md:10,71-86,32` | 기준을 "unit fail 0 · skip 사유 명시"로 |

### 6.2 빠진 화면 · 소유자 없는 파일

| # | 심각도 | 발견 | 처방 |
|---|---|---|---|
| C-03 | **P1** | **`admin-inquiry.html/js` · `admin-faq.html/js`는 어느 에픽도 소유하지 않는다.** 그런데 E1-1(게스트 문의 저장), E2-5(오탐·누락 신고를 '관리자 문의 관리에도 표시' · '재학습 후보' 표식), E2-8 I-8(기관 신고)이 모두 이 화면을 **도착지**로 전제한다. 관리자가 신고를 보고 프로젝트 라벨링 큐로 넘기는 결재 동작도 없다(two-tier 피드백 고리 · admin A14 "결재 동작 없음") | E1-6 또는 E2-5에 `admin-inquiry.js` 소유 추가: 문의 유형 패싯(일반 · 게스트 · 오탐/누락 · 기관) + 위치 첨부 미니맵 + '라벨링 큐로 보내기 ›'(`lx-feedback` 상태 전이) |
| C-04 | P1 | E1-3은 `ai-card.html`을 목표에 넣었지만, 그 화면의 스크립트 `publish-cards.js`는 소유 목록에 없다. 다음 파일도 소유자가 없다: `project-labeling.js`(E2-6 그리기 도구가 닿을 가능성 높음) · `project-ui.js` · `publish-label.js`(클래스 일괄 변경) · `ds-thumbs.js` · `db-geo.js`(E2-3 판) · `map-data.js` · `map-pledge.js` · `drift-core.js` · `account-brand.js`(E0-1이 부를 `applyCustomSymbol`의 정의처) · `download.js` | §2 파일 목록을 `ls landxi/proto/*.js` 전수와 맞춘 **소유 대조표 1장**을 Wave 0 첫날 만들 것(Sonnet, S) |
| C-05 | P1 | **파일명 오기.** E1-8의 `usecase.js` · `manual.html/js`, E2-5의 `usecase.js` · `notice.js` · `faq.js` · `manual.*` · `contact.*`는 존재하지 않는다. 실제 파일은 `support-usecase.js` · `support-manual.js` · `support-notice.js` · `support-faq.js` · `support-contact.js`다. `support-data.js`도 `proto/`와 `assets/data/`에 두 벌 있는데, E1-8은 어느 쪽인지 적지 않았고 E1-1은 `assets/data/` 쪽 렌더를 소유한다 | 경로를 저장소 기준 전체 경로로 고칠 것 |
| C-06 | P1 | **`download.js`는 W0 세 에픽이 함께 쓰는 부품인데 주인이 없다.** E0-4는 `downloadGeoJSON`을 import하고, E0-5는 CSV · BOM 내보내기를 새로 만들어야 하며, E0-7은 `downloadFile/downloadNote`를 쓴다. 각자 CSV 헬퍼를 `download.js`에 넣으면 W0 안에서 충돌한다 | W0 `download.js` 소유 = E0-5(CSV 헬퍼 1개 추가) · 나머지는 import만 |
| C-07 | P2 | 새로 생기는 화면 3개(`site/policy.html` · `admin-login.html` · `review/parts-0923.html`)를 `shell-gate.js MENU`/`SCREEN_MENU`에 넣는 일이 E0-1 할 일에 없다. E0-1은 W0이고 화면은 W1·W2에 생긴다. 특히 `admin-login.html`은 관문 예외(비로그인 허용) 목록에 올라야 한다 | E1-6 · E1-1 완료 기준에 "관문 표 1줄 PR(E0-1 소유자에게)" 명시 |
| C-08 | P2 | **`map-drift.html`의 사용자 경험을 맡는 에픽이 없다.** 엔진 이전(E3-3)뿐이고, 표류 예측 결과에 S1 도착·S5 출처(모의) 문법을 붙이는 곳이 없다. `stats-standard.html` · `report-standard.html` · `report-standard-issue.html` 단독 페이지도 E1-9 완료 기준(ximap 5상태)에서 빠진다 | E2-1 완료 기준에 단독 3쪽 1440 스크린샷 + 캔버스 비율 추가 · 표류는 E2-1에 S1/S5 장착 한 줄 |

### 6.3 빠진 계정 여정

| # | 심각도 | 발견 | 근거 | 처방 |
|---|---|---|---|---|
| C-09 | **P0** | **계정 전환·로그아웃 설계가 없다.** 세션은 전부 `localStorage`(탭 사이 공유)에 있고, `login.js:29` 로그아웃은 `lx_logged_in`만 지운다. 그래서 `lx_role`이 남는다. E0-1이 `lx_tenant`를 더하면 **LX 로그인 뒤에도 `lx_tenant`가 남아** 반대 방향으로 샌다(포털 로그인 → LX 직원 로그인 → 기관 CI · 기관 레일). 계획 전체에 '로그아웃'이 한 번도 나오지 않는다 | `login.js:29,46,114-119` · `portal-login.js:72` · `shell-gate.js:23` | E0-1에 넣을 것: **세션 계약 표**(키 · 쓰는 곳 · 지우는 곳), `signIn(role, tenant?)`/`signOut()` 단일 함수, 역할별 로그아웃 착지(LX → `login.html` · 관리자 → `admin-login.html` · 기관 → `portal-login-<tenant>.html`), e2e 4×4 전환 매트릭스(이전 세션 → 다음 로그인 16칸 모두 누출 0) |
| C-10 | **P1** | **기관 사용자가 LX 화면(분석 서비스 · XI맵)에 들어가면 무엇을 보는지 정해지지 않았다.** E0-1은 데이터 `TENANTS.menus`를 그대로 따라 tenant `menus`에 `analysis · map`을 넣는다. 그런데 CI 교체는 E1-8(서비스 지원)만 한다. 그러면 남원 담당자가 LX 셸, LX 전체 카드 진열대, 광주전남 배포본 결과까지 본다. 기관 간 데이터가 새고, "나만의 AI 시스템"이 무너진다. strategy Q1 원안은 menus에서 analysis를 뺐다 | `strategy.md` Q1 · §2.5 · `portal.js:30` | Q1에 하위 질문을 더한다: "기관의 분석·지도는 포털 작업공간 탭으로만(추천) vs LX 화면을 기관 범위로 걸러 CI를 입힘". 추천안이면 E0-1은 tenant menus를 `portal · support · my`로 좁힌다. 후자면 E1-9 · E2-2에 `cardsOfScope(tenant)` 필터 + `cssVars(tenant)` 장착을 더한다 |
| C-11 | P1 | **관리자로 들어가는 문이 둘이 된다.** E0-2는 LX 로그인에 계정 종류 3칸(관리자 포함) 세그먼트를 세우고, E1-6은 `admin-login.html` 전용 입구를 만든다. "관리자는 별도 사이트"(사용자 원문 · F9)라면 LX 로그인의 관리자 칸은 빠지거나 전용 입구로 넘겨야 한다. 어느 에픽도 이를 정하지 않았다 | E0-2 · E1-6 · `61e321f` | §4에 Q7로 추가(추천: LX 로그인은 직원 · 영업 2칸, 관리자 칸 자리에는 '관리자 사이트 ›' 링크). E0-2 세그먼트 칸 수가 이 답에 달렸다 |
| C-12 | P1 | **가입 → 승인 → 첫 로그인** 고리가 끝까지 이어진 곳이 없다. E1-1(가입 폼)과 E1-6(승인 뒤 홈 숫자 감소)까지는 있다. 그러나 승인된 계정으로 실제 로그인해 부여된 역할로 착지하는 e2e가 없다. `account-data.js`에 새 계정이 들어가는지도 정하지 않았다 | 인벤토리 §9·§11 | E1-6 완료 기준에 "가입 → 관리자 승인 → 그 아이디로 로그인 → 신청 역할 HOME" 연쇄 1건 |
| C-13 | P1 | **게스트 문의가 도착지에 닿지 않는다.** E1-1은 게스트 문의를 `sessionStorage`(탭을 닫으면 사라짐)에 쓰고, 관리자 문의 관리는 그것을 읽지 않는다(C-03). strategy §2.1이 이미 "어디에 쌓이는가"를 물었는데 답이 없다 | `strategy.md:147` | 게스트 문의 = `localStorage` 문의 저장소 한 벌(유형 '게스트') · 관리자 문의 관리 패싯에 표시 · 시연 표기 |
| C-14 | P2 | **기관 사용자의 MY · 비밀번호 찾기 · 아이디 저장**(portal P2-8)은 어디에도 없다. E1-6 MY는 '역할별 프로필 3벌'이라 4번째(기관)가 빠진다 | `portal.md` P2-8 | E1-6 프로필 4벌 · E1-2 기관 로그인에 찾기/저장 링크(LX 인증 화면 재사용 + CI) |
| C-15 | P2 | **5 주체를 한 번에 밟는 '골든 패스'가 없다.** 게스트 필름 → 가입 → 직원 과제 → 발행 요청 → 관리자 승인 → 기관 덱에 카드 → 기관 오류 신고 → 관리자 → 직원 라벨링 큐. 에픽별 연쇄 e2e는 조각뿐이다(E1-3 3화면 · E2-5 pick) | — | E3-4 봉인 조건에 골든 패스 e2e 1건 + 녹화(`recordVideo`) 1편 추가 |

### 6.4 에픽 간 파일 충돌 · 의존 역전

| # | 심각도 | 충돌 | 처방 |
|---|---|---|---|
| C-16 | **P0** | **E1-4 완료 기준은 소유 범위 안에서 달성할 수 없다.** 기준은 "`prov()` 장착 화면 ≥ 8(셸 마스트 · 대시보드 KPI · 포털 밴드 · 분석 카드 · 인프라 · 생산 · XI맵 HUD · 데이터 KPI)"이다. 그런데 같은 W1에 `portal-ui.js`는 E1-2, `analysis-cards.js`는 E1-3, `map.js`는 E1-9, `dataset.js`는 E1-7이 소유한다. 셸 마스트(`shell.js`)는 §3 규칙 (2)에 따라 W1 소유자가 없다(E1-4는 `shell.css:123` 1줄만) | E1-4 완료 기준을 "부품 + 셸 마스트 + 인프라 · 생산 2화면"으로 줄인다. 나머지 6화면 장착은 각 영역 에픽 완료 기준에 한 줄씩(`prov()` import) 옮긴다. 셸 마스트 자리는 W0 E0-1이 `AS_OF`와 함께 비워 둔다 |
| C-17 | **P0** | **`map-gl.js` · `setBase` 의존이 거꾸로다.** W2의 E2-7 N "증거판 오프라인 폴백(`setBase` 공유)"은 W3 E3-3이 만드는 로컬 배경 폴백 `setBase`에 기댄다. 또 §2는 E3-3이 "Wave 2와 병렬 가능"하다고 했지만, W2의 `map-gl.js` 소유자는 E2-0 → E2-1이다. 병렬로 돌리면 같은 파일에 주인이 둘이다 | E3-3의 `setBase` 로컬 폴백을 **E2-0 부품 목록에 흡수**(부품 5종). E3-3은 드리프트 · 관리자 지도 · 남은 하드코딩 청소만 |
| C-18 | P1 | **E3-3 "외부 요청 0"은 소유 목록 밖의 파일 때문에 실패한다.** 외부 타일을 직접 부르는 파일은 `map.js:462`(`VW13` 배경지도 견본, `xdworld` 하드코딩) · `ds-plate.js` · `db-data.js` · `analysis-map.js` · `publish-map.js` · `admin-map.js` · `drift-map.js` · `portal-ui.js`(`map-gl` 경유)다. E3-3이 소유한 것은 `sources.js · map-gl.js · drift-map.js · admin-map.js`뿐이다 | E3-3 파일 목록에 `map.js`(견본 1줄) · `ds-plate.js` · `db-data.js`를 추가하거나, 각 영역 소유자에게 1줄 PR을 명시 |
| C-19 | P1 | **E2-1과 E2-6이 같은 웨이브에서 충돌한다.** E2-1 완료 기준 "오류 신고 → `lx-feedback` 1건 → **라벨링 화면 카운트 1**"을 채우려면 E2-6 소유인 `project-label.js`를 고쳐야 한다 | 라벨링 카운트 수신은 E2-6 할 일로 옮기고, E2-1은 `lx-feedback` 쓰기까지. 키 스키마는 E2-0에서 고정 |
| C-20 | P1 | **E2-5가 기대는 XI맵 `pick` 모드를 E2-1이 만들지 않는다.** E2-5는 "XI맵 `?card=&pick=1` → `?sel=` 회수"를 하고 의존에 "E2-1(`pick` 모드)"을 적었지만, E2-1 할 일 목록에 pick이 없다. 또 E2-8 I-8은 `contact.html?svc=&fid=&pnu=`를 쓰는데, E2-5가 받는 파라미터는 `?sel=`뿐이다 | E2-1에 `pick` 모드 1줄 추가. 신고 URL 스키마(`svc · fid · pnu · sel · lnglat`)를 하나로 통일해 E2-0 계약에 적는다 |
| C-21 | P1 | **W2에 `cards.js`와 two-tier §5 표의 주인이 없다.** E2-2 A6은 `cards.js kind.viz`에 heatmap/timeline 선언을 더하면서 "two-tier §5 표 갱신 동반"이라 했다. 그러나 §3 규칙 (4)는 `cards.js`를 W1 E1-3에만 주고, 스펙 표는 W3 E3-4 소유다. R7("같은 커밋에 스펙 표")과 모순된다 | W2 `cards.js` 소유 = E2-2(`kind.viz` 2줄), two-tier §5 표 동시 수정 허가를 명시 |
| C-22 | P1 | **E2-7 '기관 홈에 놓기 ›' + 기관 카드 덱 미리보기**를 하려면 포털 덱 렌더러(`portal-ui.js`, E2-8 소유)를 관리자 화면에서 다시 써야 한다. 같은 웨이브 안에서 부품 경계가 정해지지 않았다 | 덱 한 장 렌더를 E2-0에서 `deck-card.js` 부품으로 떼거나, E2-8 → E2-7을 직렬로 |
| C-23 | P2 | E0-6 본문은 "`?result=` 수신은 **E0-5 소유**"라 했지만, E0-5 할 일에 수신이 없고 실제 수신은 W1 E1-9가 한다. 그래서 W0 게이트 뒤 한 웨이브 동안 대시보드 셀을 누르면 빈 XI맵에 떨어진다. W0을 "전부 병렬"이라 쓴 것도 E0-8 → E0-1 · E0-3 → E0-2 의존과 어긋난다 | 문구 정정. W0 게이트 스크린샷에서 `?result=` 미수신을 '알려진 결손'으로 기록 |
| C-24 | P2 | **저장소 키가 에픽마다 새로 생긴다**: `lx_publish_v1` · `lx_ds_state` · `lx_cards_overlay` · `lx-feedback` · `lx-admin-v1:*` · `lx_cam` · `lx_tenant` · 게스트 문의 키. R9는 "시연 리셋 버튼 MY에"라 했지만 그 버튼을 만드는 에픽이 없다. MY(E1-6)는 W1인데 키는 W1–W3에 걸쳐 생긴다 | E0-1이 `landxi/assets/data/storage-keys.js` 한 파일(키 · 주인 · 수명 · 리셋 포함 여부)을 세운다. 새 키는 여기에 1줄 PR로 올리고, E3-4가 MY '시연 초기화'에 연결 |

### 6.5 원본 기능 인벤토리 대비 누락 (기능은 원본 1:1 — 전제 위반 후보)

| # | 심각도 | 원본 기능(인벤토리 §) | 계획의 상태 |
|---|---|---|---|
| C-25 | **P1** | §12 홈: **서비스 라인업 13칩(현 15종) · 노코드 4노드 플로우 · 특징 3종**(guest G-20) | E1-1 · E2-9 어디에도 없다. Before/After만 E2-9 스와이프로 흡수된다. 라인업은 `serviceCards('lx')` · `cards.js`에 실데이터가 있고, 4노드는 생산 관리 E1-10 흐름도 SVG와 같은 부품으로 만들 수 있다 → E2-9에 두 항목 추가 |
| C-26 | **P1** | §2 대시보드 원본 위젯: KPI 5(전체 사용자 · 발행 카드 · 승인 대기 · 가입 대기 · 미답변 문의) · 백본 모델 카드 · 운영 지표 3탭(프로젝트 용량 Top5 · 7일 방문 · 스토리지) · 공지 스트립 `?notice=` | E0-6이 승인 KPI · 관리 타일을 빼고 E2-3이 '네 띠'로 재구성한다. 그런데 **원본 위젯이 어느 화면 어느 칸으로 가는지 대응표가 없다.** 가입 대기 · 미답변은 E1-6 운영 현황으로 가는 것이 확인되지만, 전체 사용자 · 백본 · 3탭 차트 · 공지 스트립은 행방을 모른다. '7일 방문' 추세는 콘티 원칙(지어낸 KPI 추세 금지)과 부딪힌다 → 결정 필요 |
| C-27 | P1 | §6 XI맵: **탐지 결과 표 3종(지목별 · 필지별 · 도로지점별)** 중 필지별만 있음 · 심각도 열 · 시도/시군구 실선택 · **지역 설정 저장** · 결과 목록 페이지네이션(map M-06) | E0-5 · E1-9 · E2-1 모두 다루지 않는다. 도로지점별은 실데이터가 없으니 '준비 중 · 이유'로, 지목별은 2,098필지 속성에서 집계할 수 있다 → E2-1에 추가 |
| C-28 | P2 | §8 카드 편집: '모델 설명 화면 = 이미지 업로드'가 텍스트 경로 입력으로 바뀜 · 학습 설정 하드코딩(PP-13) · 권한표 13줄 중 6줄만 보임(PP-12) | E1-3에 3줄 추가 |
| C-29 | P2 | §11 인증 세부: 가입 2단계 오류 문구 없음(G-24) · placeholder 대비 1.61:1(G-23) · 찾기 결과가 입력을 무시함(G-25) | E1-1에는 G-25만 있다 → G-23 · G-24 추가 |
| C-30 | P2 | 에픽 본문에 ID가 없는 잔여 결함: 프로젝트 B12(학습데이터 불러오기 가짜 — 부분) · B13(데이터셋을 고르면 만들기 버튼 소멸) · B14 · B15(이모지 🔒 — 법전 아이콘 세트 위반) · B16 · B17(모달 안쪽 스크롤) · 데이터 F10 · F14 · F15 · 지도 M-14 · M-16 · 포털 P2-3(**카드 호버 `translateY(-10px)` · 320/420ms — 법전 §4 위반**) · 관리자 A13(admin caps 잔존) | P2-3은 법전 위반인데, 공통 완료 기준 "법전 금지 스타일 0 = crawl 재실행"은 **모션·호버 상태를 재지 않는다.** 그래서 위반이 남아도 통과로 보고될 수 있다(C-35) |
| C-31 | P2 | §4 결정 질문에서 열린 결정 셋이 빠졌다: **O2(D26 디스크 수치 4값 공존: 612 / 1,420 / 1,965 / 1,326 GB)** · **O3(D3 표·차트 스타일)** · **O5(D17 dashboard2/3 파리티)**. O2가 빠지면 콘티 위반(숫자는 출처 하나)이 화면에 남는다. O3이 없으면 W1–W2에 새로 그리는 SVG·차트(E1-10 · E2-3 · E2-10 · E2-8 히트맵)가 제각각의 문법을 갖는다 | §4에 Q8(O2 · 한 값 · 출처) 추가. O3은 E2-0에 `chart` 부품(막대 · 산점 · 게이지 한 벌)으로 흡수할 것을 권고 |

### 6.6 검증 안 된 주장 · 문서 내부 불일치

| # | 심각도 | 내용 |
|---|---|---|
| C-32 | P1 | **결정 질문 번호가 strategy와 master에서 다르다.** master는 Q4 = 영업 실행, Q5 = 숫자, Q6 = 영상 비용인데, 본문은 strategy 번호로 부른다: E0-4 "영업은 **Q5** 답 전까지"(→ master Q4) · E2-2 "A10 영업 시연 실행(**Q5** ②)"(→ Q4) · E1-4 "D10 … (**Q6** ①)"(→ Q5 a) · E1-6 "명도 반전 … (**Q4** ①)"(→ Q3). 구현 에이전트가 영상 비용 질문을 D10의 답으로 읽을 수 있다 → 본문 참조를 master 번호로 통일 |
| C-33 | P1 | **완성도 % · 인터랙티브 x/10 · 목표 수치(W0 뒤 70% … W3 뒤 95%)를 재는 방법이 없다.** 영역 보고서의 자평 점수를 평균한 값이라 웨이브 게이트에서 재현할 수 없고, analysis 행은 출처 문서도 없다(C-01). 이대로면 게이트를 반증할 수 없다 → 완성도는 인벤토리 행 단위 '있음/부분/없음' 개수로, 인터랙티브는 S1–S8 장착 화면 수와 모션 녹화 판정으로 정의할 것 |
| C-34 | P2 | 기타: E1-1 "정책 링크 **13곳**"은 출처가 없다. "e2e 목표 ≥ 620"은 에픽별 추가 건수의 합이 아니라 근거 없는 수다. §1은 "법전 개정 Wave 1 · **Fable 5.1**"인데 E1-4 모델은 "Opus 5 / Sonnet"이다. E1-3 완료 기준 "staff … `ai-card.html` +1"에서 `ai-card.html`은 staff 레일에 없는 관리자 화면이라(`a4.json` sales → denied, staff 메뉴에 publish 없음) 어느 계정으로 재는지 알 수 없다. 머리말의 "파일이 겹치지 않도록 잘라 놓았다"는 C-16~C-22가 반증한다 |

### 6.7 사용자 품질 기준(인터랙티브 · 몰입감) 대비 약한 부분

| # | 심각도 | 발견 | 처방 |
|---|---|---|---|
| C-35 | **P0** | **몰입감 게이트를 정지 화면으로 판정한다.** R3 · W2 게이트 · E2-0 모두 "Craft 비평가가 **스크린샷만** 보고 판정"한다. 그런데 S1 도착(1.0s 스윕 + 380ms 락온) · S3 스크럽 · S4 카메라 · S7 전이는 전부 **시간 축의 품질**이라 사진 한 장으로는 합불을 가릴 수 없다. 사용자는 "동작하는 화면으로 판단"한다. 공통 기준의 crawl도 호버·모션 값을 재지 않는다(C-30의 P2-3이 그 예) | Craft 게이트 입력을 **Playwright `recordVideo` 5–10초 클립 + 프레임 시퀀스**로 바꾼다. 모션 스펙(지속 4단 · 이징 · 호버 4px)을 `getAnimations()`/computed transition으로 재는 스펙 1개(E2-0 소유)를 공통 완료 기준에 넣을 것 |
| C-36 | P1 | **첫 3주 동안 사용자에게 보여 줄 '우와'가 없다.** W0(3–4일)과 W1(1.5–2주)은 경계 · 배관 · 정직성 작업이고, 인터랙티브 목표도 W1 뒤 5/10이다. 사용자는 이미 네 차례 '목업'을 거부했다(메모리 · 품질 기준). 배관만 끝난 중간 보고는 같은 반응을 부를 위험이 크다 | W0과 병렬로 **수직 조각 1개**를 세운다: XI맵 한 화면에 S1 도착 + S3 스크럽 + S6 스와이프를 `review/` 스파이크로 먼저 만들어(E2-0 선행 스파이크, Opus 5.5) W1 중간에 사용자에게 보여 준다. 제품 이식은 계획대로 W2 |
| C-37 | P1 | **WebGL 성능 예산이 없다.** 계획에서 성능 언급은 필름 첫 4초 전송량 1곳뿐이다. 대시보드 판 · XI맵 · 포털 미니맵 ≥2(E2-8 "canvas ≥ 2") · 관리자 배포 지도 · 스와이프 두 층 크로스페이드가 한 화면에 여러 WebGL 컨텍스트를 띄운다. 60fps가 끊기면 Awwwards 기준에서는 바로 탈락이다 | E2-0에 예산 1줄: 상호작용 중 프레임 시간 p95 ≤ 20ms(Playwright `requestAnimationFrame` 측정) · 화면당 WebGL 컨텍스트 ≤ 2(미니맵은 정적 캔버스 스냅샷) · INP ≤ 200ms |
| C-38 | P1 | **사용자가 처음 확정한 핵심 서사 "결과가 지도 위에 입체로 겹친다"(8/25)가 D22로 무기한 보류돼 있다.** D22 재상정 조건은 "지도에서 학습데이터 구축·관리 이후"이고, E2-6(라벨링 그리기 도구)이 끝나면 충족된다. 그러나 어느 웨이브에도 재상정 일정이 없다 | W2 게이트 직후 D22 재상정을 §4 결정 질문으로 예약(추천: 결과 폴리곤 fill-extrusion 1개 모드 · 기본 OFF · pitch ≤ 45 · 스파이크 먼저) |
| C-39 | P1 | **지원·관리 화면의 몰입 설계가 얕다.** E2-5 · E2-10은 Opus 5에 배정됐고, 할 일도 '카드 · 미리보기 · 띠'를 늘어놓은 것이다. support 보고서 S-10("가장 업무 게시판다운 화면군")과 admin A14("정적 숫자 격자 · 결재 동작 없음")에 대한 답이 **움직이는 지도 1장**에 그친다. 관리자 결재(승인 · 반려 · 문의 답변 · 신고 이관)에 S1/S7 문법을 입히는 장면이 없다 | E2-10에 '결재 = 장면'을 추가한다(승인 → 배포 지도에 점 도착 S1, 반려 → 요청 행 퇴장 S7, 신고 이관 → 라벨링 큐로 S2 리더선). 모델은 Opus 5.5로 |
| C-40 | P2 | **쓰지 않는 실자산이 있다.** `assets/tiles/jeju_2020` · `jeju_2022` · `jeju_landcover`(`imagery.js`에 등록)와 `namwon_city_2504/2510`(36MB 고해상)은 §0 "실데이터 충분" 목록에도, S3/S6 장착처에도 없다. 두 시점 + 피복 결과는 스와이프·스크럽을 가장 싸게 세울 수 있는 두 번째 무대다 | E2-0 데모 페이지와 E2-9 사례 스와이프 후보에 추가. 단 제주 피복이 **판독 결과인지 참조 자료인지** 출처를 먼저 확인한다(콘티) |
| C-41 | P2 | **웹 접근성 에픽이 없다**('접근성' 0회). 공공기관 서비스는 KWCAG 준수가 사실상 필수다. 그런데 정직 표기가 `title` 속성에만 있는 곳(shell-dash 비평 13), placeholder 대비(G-23), 캔버스 결과의 대체 텍스트, 스크러버·스와이프 키보드 조작이 모두 계획 밖이다. "혁신 공공서비스" 판정에 직접 걸린다 | E3-4에 axe-core 스캔 스펙(57화면 × 3역할 · serious 위반 0) 추가, 부품(E2-0)에 키보드 조작 · `aria-valuenow` 기준 추가 |

### 6.8 계획에 더할 것 — 요약 (기존 에픽을 고치지 않고 덧붙이는 순서)

1. **Wave 0 이전(반나절)**: C-01 analysis 보고서 복원 · C-04/C-05 소유 대조표 · C-32 Q 번호 통일 · C-24 저장소 키 표.
2. **Wave 0 보강**: E0-1에 C-09 세션 계약 + 전환 매트릭스 e2e, C-10 기관 LX 화면 결정(Q1 하위), C-06 `download.js` 소유 확정. §4에 Q7(관리자 문, C-11) · Q8(디스크 수치, C-31) 추가.
3. **W0 병렬 수직 조각**(C-36): XI맵 S1+S3+S6 스파이크 → W1 중간 사용자 시연.
4. **Wave 1 보강**: E1-4 완료 기준 축소 · 장착 이관(C-16). E1-6에 `admin-inquiry` 소유 · 가입→첫 로그인 연쇄 · 게스트 문의 도착 · 기관 MY(C-03 · C-12 · C-13 · C-14). 대시보드 원본 위젯 행선지 표(C-26).
5. **Wave 2 보강**: E2-0에 `setBase` 로컬 폴백 · 모션 측정 스펙 · 성능 예산 · 신고 URL 계약 · (선택) 덱 카드 · 차트 부품(C-17 · C-35 · C-37 · C-20 · C-22 · C-31). E2-1에 pick 모드 · 탐지 표 3종 · 지역 설정 저장(C-20 · C-27). E2-9에 라인업 · 4노드(C-25). E2-10에 '결재 = 장면'(C-39). W2 게이트 입력 = 녹화 클립.
6. **Wave 3 보강**: E3-3 파일 목록 확장(C-18) · E3-4에 골든 패스 녹화(C-15) · 접근성 스캔(C-41) · D22 재상정(C-38).

— 근거: `docs/superpowers/audit-0923/` 20편, `shots/audit-0923/{analysis,strategy,integrity}/*.json`, `landxi/proto/*.js` 목록, `login.js`/`portal-login.js`/`shell-gate.js` 세션 코드, 인벤토리 §2/§6/§8/§11/§12 대조. 소스 파일 수정 0.

---

## §7. 세션 계약 · 관문 판정표 · 로그아웃 — 계정 전환 여정 (2026-09-24 신설 · C-09 · C-10 · C-24)

Q1 확정: **기관(지자체) 계정은 완전 별도**다. `roles.js`(관리자 · 직원 · 영업 3단)에 넣지 않는다. 기관 계정 표는 `portal.js TENANTS`(기존)이고 세션 키는 `lx_tenant_session` 이다. 기관 세션은 LX 셸 화면에 절대 들어가지 못하고, LX 세션(관리자 포함)은 기관 포털 작업공간에 들어가지 못한다.

### 7.1 저장소 키 — 정본 `landxi/assets/data/storage-keys.js`(E0-1 신설 · 새 키는 여기 1줄 PR)

| 키 | 값 | 쓰는 곳 | 지우는 곳 | 읽는 곳 | 수명 · 리셋 |
|---|---|---|---|---|---|
| `lx_logged_in` | `'1'` | `login.js` LX signIn | `login.js ?logout` · `shell.js signOut()` · `portal-login.js`(기관 signIn 시) | `shell-gate.js` · `shell.js` · `login.js` | LX 세션 · 시연 초기화 포함 |
| `lx_role` | `'admin' \| 'staff' \| 'sales'` | `login.js` | 위와 같음 | `shell-gate.js` · `shell.js ROLE` · `login.js`(현재 계정 안내) | LX 세션 |
| `lx_tenant_session` | JSON `{"tenant":"namwon","at":"<ISO>"}` | `portal-login.js` 기관 signIn | `shell.js signOut()` · `login.js`(LX signIn · `?logout`) | `shell-gate.js`(포털 화면) · `shell.js gate()` · `portal-ui.js` | 기관 세션 |
| `lx_saved_email` | 이메일 | `login.js`(로그인 상태 유지) | `login.js`(해제) | `login.js` | 편의 · 로그아웃에도 남김 |
| `lx_publish_v1` · `lx_project_v1` · `lx_analysis_*` · `lx-map-props` · `lx_custom_symbol` · `lx_ds_state`(W1) · `lx_cards_overlay`(W1) · `lx-feedback`(W2) · `lx-admin-v1:*`(W1) · `lx_cam`(W3) | 각 에픽 | 각 소유자 | MY '시연 초기화'(E3-4) | 각 화면 | 데이터 · 리셋 포함 |

규칙 **R-S1** 두 세션은 동시에 존재하지 않는다 — LX signIn 은 `lx_tenant_session` 을 지우고, 기관 signIn 은 `lx_logged_in` · `lx_role` 을 지운다. **R-S2** `signOut()` 은 세 키를 전부 지운다. 착지: LX(3역할) → `login.html`(W1 E1-6 뒤 admin → `admin-login.html`) · 기관 → `portal-login-<tenant>.html`. 대시보드 · 데이터 관리의 자체 로그아웃 코드는 삭제(셸 것만 남는다). **R-S3** 기관 홈 표: `namwon → portal.html` · `gwangju-jeonnam → portal-dp-gj-marine-25.html`(임시 — E1-2 가 `portal-gwangju-jeonnam.html` 로 교체). 표는 `portal.js TENANTS[].home` 이 정본이고 `shell-gate.js` 가 클래식 스크립트라 미러를 둔다(늘어나면 같이 고친다 — 지금 `MENUS` 와 같은 규칙). **R-S4** FAMILY 푸터의 기관 항목은 **그 기관 로그인 문**(`portal-login-<tenant>.html`)만 가리킨다. 작업공간 직접 링크 금지. **R-S5** `?denied=` 도착 시 한 줄 안내(S8) 뒤 `history.replaceState` 로 쿼리 제거.

### 7.2 관문 판정표 (`shell-gate.js` · `shell.js gate()` · 포털 `shell-gate.js[data-login]` 이 같은 표를 본다 — `proto-session.spec.mjs` 20칸)

| 화면 \ 세션 | LX 세션 | 기관 세션(같은 기관) | 기관 세션(다른 기관) | 세션 없음 | 두 세션 동시(손상) |
|---|---|---|---|---|---|
| LX 화면 · `SCREEN_MENU` 있음(`ximap` `dashboard` `admin-*` …) | 역할 menus 검사 → 통과 또는 `HOME[role]?denied=<file>` | `<기관 홈>?denied=<file>` | 같음 | `login.html?next=<file+query>` | 세 키 전부 지우고 `login.html` |
| LX 화면 · `SCREEN_MENU` 없음(`mypage` `usecase` `shell-demo`) | 통과 | `<기관 홈>?denied=<file>` | 같음 | `login.html?next=` | 〃 |
| 포털 화면(`shell-gate.js[data-login]` — `portal.html` · `portal-dp-*`) | `portal-login-<tenant>.html?denied=<file>` — **관리자 포함** | 통과 | `<자기 기관 홈>?denied=<file>` | `portal-login-<tenant>.html?next=<file>` | 〃 |
| 관문 없는 화면(`login` `signup` `find-*` `scrub/*` `site/*` `portal-login-*` `review/*` `spikes/*`) | 통과 | 통과 | 통과 | 통과 | — |

`SCREEN_MENU` 보강(E0-1): `report-standard-issue.html` · `map-drift.html` → `map` · `notice.html` · `faq.html` · `contact.html` · `manual.html` → `support`(영업은 `support` 가 없어 막힌다 — `usecase.html` 은 표에 없어 열린다) · `ai-publish-create.html` → `project`(직원의 요청 폼) · `dashboard-128/` 는 E0-6 이 삭제. W1 신설 화면(`site/policy.html` · `admin-login.html` · `review/parts-0923.html`)은 만드는 에픽이 E0-1 소유자에게 관문 표 1줄 PR(C-07).

안내 문구 규약(S8): LX 셸 `say()` — `${화면명} 화면은 ${허용 역할명 나열} 전용입니다 — 지금은 ${현재 역할명}으로 들어와 있습니다`(화면명 = `NAV[].name`, `SCREEN_MENU` 역매핑). 포털 `say()` — `${file}은 LX 플랫폼 화면입니다 — 기관 계정은 내 서비스 작업공간에서 씁니다`. 기관 로그인 문 안내 줄 — `기관 작업공간은 기관 계정으로만 들어갑니다 — LX 계정은 로그아웃 뒤 기관 아이디로 로그인하세요`.

### 7.3 역할 픽스처 코드 — 정본 `tests/e2e/_roles.mjs`(E0-3 생성). **Wave 0 동안 각 스펙은 이 함수들을 자기 파일 안에 그대로 복사해 쓴다(import 금지 · 병렬 충돌 방지). 통합 단계가 import 로 바꾼다.**

```js
export const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
export const TENANT_HOME = { namwon: 'portal.html', 'gwangju-jeonnam': 'portal-dp-gj-marine-25.html' };
export const TENANT_DOOR = { namwon: 'portal-login-namwon.html', 'gwangju-jeonnam': 'portal-login-gwangju-jeonnam.html' };
/** LX 세션으로 화면을 연다. 세션은 **첫 로드에서만** 심는다(sessionStorage 가드) — 그 뒤 화면 전환·역할 전환은 화면 코드와 switchTo 가 한다. */
export async function bootAs(page, url, role = 'staff', extra = {}) {
  await page.addInitScript(([r, ex]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
    for (const [k, v] of Object.entries(ex)) (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
  }, [role, extra]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 기관 세션으로 화면을 연다. */
export async function bootTenant(page, url, tenant = 'namwon') {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role');
    localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: t, at: '2026-06-08T09:00:00+09:00' }));
  }, tenant);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 같은 탭에서 LX 계정을 바꾼다(역할 전환 e2e). 화면 코드의 signIn 과 같은 규칙. 다음 goto 부터 적용된다. */
export const switchTo = (page, role) => page.evaluate((r) => {
  localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session');
}, role);
```

화면별 기본 역할: `map` · `analysis` · `project` · `dashboard` · `dataset` · `support` = `staff` · `usecase` = `sales` · `admin-*` · `admin-publish` · `ai-card*` · `produce` = `admin` · `portal*` = `bootTenant('namwon')`.

### 7.4 계정 전환 · 로그아웃 여정 (Wave 0 뒤 반드시 서 있어야 하는 것)

```
① LX 직원 → 레일 로그아웃 → login.html (세 키 0) → 영업 라디오 → 로그인 → ximap.html (lx_role=sales · lx_tenant_session 없음)
② LX 관리자 → login.html 직접 진입(로그아웃 없이) → '지금 LX 관리자로 들어와 있습니다' 안내 → 직원 라디오 → 로그인 → ai-project.html
③ 기관(남원) → portal-login-namwon.html → portal.html → 주소창 ximap.html → portal.html?denied=ximap.html + 토스트 → 레일 로그아웃 → portal-login-namwon.html (세 키 0)
④ 기관(남원) 세션에서 login.html 로 LX 직원 로그인 → lx_tenant_session 제거됨 → ai-project.html 레일 7 · 기관 CI 0
⑤ LX 관리자 → 푸터 Family Site '남원시' → portal-login-namwon.html (작업공간 아님) → 기관 아이디로 로그인 → lx_logged_in · lx_role 제거됨 → portal.html
⑥ 기관(남원) → 주소창 portal-dp-gj-marine-25.html(광주전남) → portal.html?denied=portal-dp-gj-marine-25.html
```

---

## §8. Wave 0 파일 소유 대조표 (실제 파일명 · `ls landxi/proto landxi/assets/data tests/e2e` 2026-09-24 대조 · C-04 · C-05 · C-06)

| 파일 | W0 소유 | 비고 |
|---|---|---|
| `assets/data/roles.js` · `portal.js`(TENANTS 필드) · **`storage-keys.js`(신설)** · `proto/shell.js` · `shell-gate.js` · `portal-login.js` · `portal-login.css` · `portal-ui.js` | **E0-1** | 셸 소유자 = E0-1. `portal-ui.js` 는 레일·로그아웃·denied 안내만 |
| `proto/login.html` · `login.css` · `login.js` | **E0-2** | signIn 규칙은 §7.1 그대로 |
| `tests/e2e/_roles.mjs`(신설) · `proto-project.spec.mjs` · `proto-support.spec.mjs` · `smoke.spec.mjs` · `tests/unit/data.test.mjs` · `tests/e2e/README.md` | **E0-3** | 나머지 스펙은 각 에픽 소유 |
| `proto/analysis.js` · `analysis-run.js` · `analysis-cards.js` · `analysis-data.js` · `analysis-kind.js` | **E0-4** | `analysis-map.js` · `analysis.css` 는 W0 무주(수정 금지) |
| `proto/map.js` · `map.css` · `map-data.js` · `map-stats.js` · `map-report.js` · `map-pledge.js` · `map-gl.js`(추가만) · `download.js`(`downloadCSV` 추가만) | **E0-5** | `download.js` 는 E0-4 · E0-7 이 import 만 |
| `proto/dashboard.html` · `dashboard.js` · `dashboard.css` · `db-data.js` · `db-cells.js` · `db-geo.js` · `dashboard-128/`(삭제) | **E0-6** | |
| `proto/dataset.html` · `dataset.js` · `dataset.css` · `ds-data.js` · `ds-plate.js` · `ds-thumbs.js` | **E0-7** | |
| `proto/project-deploy.js` · `project-data.js` · `publish-request.js` · `publish-data.js` · `ai-publish-create.html` | **E0-8** | `publish.js` · `publish-ui.js` · `publish-cards.js` · `publish-card-edit.js` · `publish-label.js` · `publish-map.js` 는 W0 무주(E1-3) |
| `proto/spikes/ximap-signature.{html,js,css}`(신설) · `tests/e2e/spike-ximap-signature.spec.mjs`(신설) | **E0-S** | 기존 파일 수정 0 |
| **W0 무주(수정 금지)**: `admin-*.{html,js,css}` · `account-*.js` · `mypage.*` · `produce.*` · `project.js` · `project-create.js` · `project-files.js` · `project-label.js` · `project-labeling.js` · `project-train.js` · `project-analysis.js` · `project-ui.js` · `project.css` · `support-*.js` · `support.css` · `notice/faq/contact/manual/usecase.html` · `scrub/*` · `site/*` · `signup.html` · `auth.*` · `find-*.html` · `js/*` · `drift-*` · `map-drift.html` · `stats-standard.html` · `report-standard*.html` · `portal*.html`(생성기 산출) · `tools/**` · `design/system.md` · `assets/data/{cards,results,imagery,change,crops,models,services,registry,brand,studio,infra,ops,spine,matching,emblems,surveys,views,sim,assets,dashboard,ai-project-data,support-data}.js` | — | 고쳐야 하면 하지 말고 브리프 결과 문서에 '요청' 으로 적는다 |
| W1 이후 소유자 없는 파일에 주인을 정한다: `admin-inquiry.{html,js}` · `admin-faq.{html,js}` → E1-6 · `publish-cards.js` · `publish-label.js` → E1-3 · `project-labeling.js` · `project-ui.js` → E1-5(W1) → E2-6(W2) · `db-geo.js` → E2-3 · `account-brand.js` → E1-6 · `drift-core.js` → E3-3 · `map-pledge.js` → E0-5 → E1-9 | | C-04 처분 |

---

## §9. 완결성 비평 C-01~C-41 처분표 (2026-09-24)

| C | 처분 | 어디에 |
|---|---|---|
| C-01 | **완료** — `analysis.md` · `analysis-critique.md` 저널에서 복원 | 본 폴더 |
| C-02 | E0-3 기준 "unit fail 0 · skip 사유 명시" 로 | §2 E0-3 |
| C-03 | `admin-inquiry.{html,js}` · `admin-faq.{html,js}` → E1-6 소유 + 문의 유형 패싯 · 위치 미니맵 · '라벨링 큐로 보내기 ›' | §2 E1-6 · §8 |
| C-04 · C-05 · C-06 | §8 소유 대조표 · 파일명 교정(`support-usecase.js` 등) · `download.js` = E0-5 | §8 · §2 |
| C-07 | 신설 화면 관문 표 1줄 PR 을 만드는 에픽 완료 기준에 | §7.2 · E1-1 · E1-6 · E2-0 |
| C-08 | E2-1 완료 기준에 단독 3쪽 + 표류 S1/S5 | §2 E2-1 |
| C-09 | §7 세션 계약 · `signIn/signOut` · 전환 매트릭스 e2e | §7 · E0-1 · E0-2 |
| C-10 | **Q1 확정 — 기관 완전 별도.** 기관의 분석 · 지도 · 서비스 지원은 포털 작업공간 탭만. `TENANTS.menus` 에서 `analysis · map · support` 제거 | §7 · E0-1 · E1-2 · E1-8 |
| C-11 | Q7 신설(추천: LX 로그인 = 직원 · 영업 2칸 + '관리자 사이트 ›'). W0 은 3칸 유지 | §4 Q7 · E0-2 · E1-6 |
| C-12 · C-13 · C-14 | E1-6 완료 기준에 가입 → 승인 → 첫 로그인 연쇄 · 게스트 문의 localStorage 도착 · 기관 MY 는 E1-2 포털판 | §2 E1-6 · E1-1 · E1-2 |
| C-15 | E3-4 골든 패스 e2e + 녹화 | §2 E3-4 |
| C-16 | E1-4 완료 기준 축소(부품 + 셸 마스트 + 인프라 · 생산) · 장착 6화면은 영역 에픽으로 | §2 E1-4 |
| C-17 | `setBase` 로컬 폴백 → E2-0 부품 5종 · E3-3 은 청소만 | §2 E2-0 · E3-3 |
| C-18 | E3-3 파일 목록에 `map.js` 견본 1줄 · `ds-plate.js` · `db-data.js` · `analysis-map.js` · `publish-map.js` | §2 E3-3 |
| C-19 · C-20 · C-21 · C-22 | `lx-feedback` 스키마 · 신고 URL 계약 · `pick` 모드 · W2 `cards.js` = E2-2 · `deck-card.js` 부품 → E2-0 계약 | §2 E2-0 · E2-1 · E2-2 · E2-6 · E2-7 |
| C-23 | E0-5 가 `?result=` 수신을 W0 에 만든다 · W0 "전부 병렬" 문구 정정 | §2 E0-5 · Wave 0 머리말 |
| C-24 | `storage-keys.js` 신설(E0-1) · 시연 초기화 버튼 = E3-4 MY | §7.1 |
| C-25 · C-27 · C-28 · C-29 · C-30 | E2-9 라인업 13칩 · 4노드 / E2-1 탐지 표 3종 · 지역 설정 저장 / E1-3 3줄 / E1-1 G-23 · G-24 / 잔여 ID 를 각 에픽 목표에 | §2 |
| C-26 | E0-6 결과 문서에 원본 위젯 행선지 표 · '7일 방문' 추세는 콘티 위반이라 **제거**(Q8 로 확인) | §2 E0-6 · §4 Q8 |
| C-31 | Q8(디스크 수치 한 값) · `chart` 부품 → E2-0 | §4 · E2-0 |
| C-32 | 본문 Q 번호를 master 번호로 통일(E0-4 Q4 · E2-2 Q4 · E1-4 Q5(a) · E1-6 Q3) | §2 |
| C-33 | §10 측정 정의(완성도 = 인벤토리 행 있음/부분/없음 · 인터랙티브 = S1–S8 장착 화면 수 + 모션 판정) | §10 |
| C-34 | '13곳' → 실측 후 기록 · '≥ 620' → 에픽별 추가 건수 합으로 재계산(E3-4) · E1-4 법전 개정 4줄은 Fable 5.1 검토 · `ai-card.html +1` 은 admin 세션으로 잰다 | §2 |
| C-35 | **몰입 게이트 개정** — Craft 입력 = 정지 스크린샷 + 모션 중간 프레임 연속 캡처(100ms 간격 ≥ 8장 스트립) 또는 `recordVideo` 5–10s 클립. 모션 스펙 측정 스펙 1개(E2-0) | §5 R3 · E0-S · E2-0 |
| C-36 | **E0-S 스파이크 신설** — W0 병렬, W1 중간 사용자 시연 | §2 E0-S |
| C-37 | 성능 예산(rAF p95 ≤ 20ms · WebGL ≤ 2 · INP ≤ 200ms) → E0-S 부터 적용, E2-0 공통 | §2 E0-S · E2-0 |
| C-38 | Q9 D22 재상정을 W2 게이트 직후로 예약 | §4 Q9 |
| C-39 | E2-10 '결재 = 장면' 추가 · Opus 5.5 | §2 E2-10 |
| C-40 | 제주 2시점 + 피복은 E2-0 데모 후보 · 출처 확인 선행(피복이 판독 결과인지) | §2 E2-0 |
| C-41 | E3-4 axe-core 스캔 · E2-0 부품 키보드 · `aria-valuenow` · E0-S 스크러버/스와이프 키보드 | §2 E3-4 · E2-0 · E0-S |

---

## §10. 측정 정의 (C-33)

- **완성도 %** = 인벤토리 `2026-08-26-landxi7-function-inventory.md` 행 단위로 `있음 1 · 부분 0.5 · 없음 0` 의 합 ÷ 행 수. 웨이브 게이트마다 Brief 비평가가 같은 표로 다시 센다(자평 금지).
- **인터랙티브 x/10** = (S1–S8 장착 화면 수 ÷ 대상 화면 수) × 6 + 모션 판정(Craft 비평가가 프레임 스트립 · 영상으로 매기는 0–4). 정지 스크린샷만으로는 매기지 않는다.
- **Wave 0 뒤 목표**: 완성도 70 %(경계 · 배관 복구) · 인터랙티브는 E0-S 스파이크 단독 판정(제품 화면은 W2 부터).
