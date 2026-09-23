# 전수 무결성 점검 — 2026-09-23 (integrity)

- 범위: `landxi/proto/` 아래 **.html 57개 전부**(portal-dp 7종 포함, `review/`·`spikes/` 제외) × **4계정 상태**(LX 관리자 · LX 직원 · 영업용 계정 · 비로그인) = **228회 페이지 방문**.
- 방법: Playwright(`chromium.launch({channel:'chrome'})`), 서버는 이미 떠 있는 `http://localhost:4173`(끄지 않음). 각 방문에서 콘솔 오류·실패 요청·외부(localhost 밖) 요청·개발용 표기·14px 미만 글자·법전 금지 스타일(box-shadow·border-radius>0·gradient·backdrop-filter)·로드시간·전송량을 수집하고, 전 방문에서 나온 내부 `a[href]` 108종을 한 번씩 실제로 GET 해 상태 코드를 확인했다.
- 산출물: `shots/audit-0923/integrity/crawl.mjs`(크롤러) · `analyze.mjs`(분석) · `evidence.mjs`(증거 스크린샷 4장) · `raw.json`(원시 데이터, 228방문×필드) · `analyze.log`(전체 원시 출력) · `evidence-*.png` 4장.
- 대조: `docs/superpowers/review/2026-09-20-auto-audit.md`(9/20 감사, 81건) — 9/20~9/22 대량 구현(위계 3단 분리·셸 통합·인터넷 차단 대응 등, git log `cd03cb9`~`7ddb860`) 이후 무엇이 닫혔고 무엇이 남았는지 §5에서 대조한다.
- 소스 파일은 전혀 수정하지 않았다. 이 문서와 `shots/audit-0923/integrity/`만 새로 썼다.

한계: 이 점검은 **각 페이지의 최초 로드 상태만** 본다(탭 전환·모달 열기 등 상호작용 뒤에 나타나는 콘텐츠는 스캔하지 못한다 — 그 깊이는 9/20 감사가 이미 다뤘다). mp4 영상은 크롤 시간을 줄이려 요청을 막았고(로컬 자산이라 외부요청 판정에는 영향 없음), 그로 인한 제네릭 콘솔 메시지는 걸러냈다. 타일·이미지 다운로드는 페이지 전환 시 진행 중이던 것이 취소(`net::ERR_ABORTED`)되는데 이는 크롤 속도 때문이지 사이트 결함이 아니다 — "3. 실패 요청" 중 `net::ERR_ABORTED`류는 이 아티팩트이고, 아래 §1의 진짜 문제와는 구분했다.

---

## 한 장 요약

| 등급 | 판정 |
|---|---|
| **B**(핵심 결함 2건 · 나머지는 양호) | 링크 무결성은 사실상 완벽(108개 중 끊긴 것 1개, 그것도 고아 레거시 폴더 안). 콘솔 오류 0 · 진짜 실패 요청 0(228회 전부). 게이트(로그인·역할별 접근 차단)는 정확히 동작한다. 14px 미만 글자·법전 금지 스타일은 **현재 계정 여정에 있는 화면에서는 0건** — 스파이크/레거시 파일에만 남아 있다. 그런데 **레일 메뉴 노출**과 **인터넷 의존성** 두 가지는 이전 감사에서 "해결"로 선언된 항목의 **부분 재발**이다. |

핵심 발견 4가지:

1. **[P1] 레일이 역할을 무시하고 원본 9메뉴를 그대로 보여준다** — `dashboard.html`·`dataset.html`. "위계를 세운다"(9/21, `cd03cb9`)의 취지가 이 두 화면에서 비어 있다.
2. **[P1] 로그인 화면 워드마크가 여전히 구 스파이크 `dive.html`로 간다** — 9/20 감사 L3가 안 닫혔다. 그 페이지는 외부 CDN 6종 + 외부 지도 타일에 의존해 "인터넷을 끊어도 선다"(9/20, `07193e3`)와 정면으로 어긋난다.
3. **[P1] 지도가 들어간 화면 전부가 기본 상태에서 외부 인터넷에 의존한다** — XI맵·지도 속성 관리·통계·보고서·표류 예측·광주전남 포털. `VWORLD_KEY`가 없으면 `xdworld.vworld.kr`·`tiles.openfreemap.org`로 무조건 나간다. "인터넷을 끊어도 화면이 선다" 커밋은 **영상·폰트·지도 라이브러리 본체**는 내렸지만 **지도 배경 타일**은 내리지 못했다.
4. **[P2] 고아 레거시 화면 `dashboard-128/dashboard.html`이 게이트 없이 살아 있다** — 관리자 전용 운영 데이터가 영업용 계정에도 그대로 열리고, 9/20 감사가 지적했던 문제(개발용 URL 노출 `?status=대기`·`?open=…`, 14px 미만 126곳)가 그 안에 화석처럼 남아 있다. 실사용 동선에서 링크되진 않지만 URL을 알면 누구나 연다.

---

## §1 링크 무결성

108개 내부 링크 중 끊긴 것 **1개**.

| 링크 | 상태 | 나온 곳 |
|---|---|---|
| `dashboard-128/dashboard.html` → `home.html` | **404** | `dashboard-128/dashboard.html`(고아 레거시 페이지 자신의 로고 링크) — admin·staff·sales 3계정 모두에서 재현 |

나머지 107개(레일 9종 전체, 마이페이지 플라이아웃, 공지·FAQ·활용사례·포털 7배포본·가입/찾기 흐름·Family Site 3종 포함)는 전부 200. **9/20 감사 D1(대시보드 404 9종)·L1(로그인 3링크 404)은 완전히 닫혔다** — `find-id.html`·`find-password.html`·`signup.html`·`notice.html`·`admin-*.html` 5종·`mypage.html` 전부 실제 화면으로 존재.

---

## §2 외부(인터넷) 요청 — "인터넷을 끊어도 선다" 검증

9/20 `07193e3` 커밋 이후에도, **지도가 있는 화면은 예외 없이 외부에 의존**한다. 원인은 `landxi/proto/js/sources.js`의 `resolveVWorld()`다: `window.VWORLD_KEY`가 없으면(이 환경 포함, 대부분의 로컬/사내망 환경이 그렇다) 무조건 `xdworld.vworld.kr`(키 없는 공개 V-World 배경) 타일로 폴백하고, `map-drift.js`·`portal-dp-gj-marine-25.html`은 `tiles.openfreemap.org`를 하드코딩으로 부른다.

| 화면 | 외부 호스트 | 근거 |
|---|---|---|
| `ximap.html`(영업용 계정의 **첫 화면**, XI맵 = 플랫폼의 핵심 Geo-AI 지도) | `xdworld.vworld.kr` | `landxi/proto/map-gl.js:16-23` · 크롤 실측(비로그인·admin·staff·sales 전부 재현) |
| `admin-map.html`(서비스 관리 · 지도 속성 관리) | `xdworld.vworld.kr` | `landxi/proto/admin-map.js:143,147` |
| `stats-standard.html` · `report-standard.html` · `report-standard-issue.html` | `xdworld.vworld.kr` | 셋 다 `map.js` 재사용 — 같은 배경 로직 |
| `map-drift.html`(표류 예측 지도) | `tiles.openfreemap.org` | `landxi/proto/drift-map.js:111`(스타일 URL이 통째로 외부) |
| `portal-dp-gj-marine-25.html`(광주전남 포털 · 해양쓰레기 25) | `tiles.openfreemap.org` | `landxi/proto/portal-dp-gj-marine-25.html:228` |
| `workflow.html`(레거시 스파이크) | `xdworld.vworld.kr` | 참고용(scope 안이지만 어디서도 링크되지 않음) |

MapLibre 라이브러리 본체는 `vendor/maplibre/`로 이미 내려받아 있다(확인) — **엔진은 로컬, 배경 그림은 여전히 인터넷**인 상태다. 증거: `shots/audit-0923/integrity/evidence-ximap-external-tiles.png`, `raw.json`의 `results.*.*.externalReq`.

별개로 **스파이크/후보 페이지 3종**(`fonts.html`·`dive.html`·`charts.html`)은 원래부터 외부 CDN(Google Fonts·jsDelivr 40여 개)에 크게 의존한다 — 이 페이지들은 서체·톤 비교용이라 원칙상 예외지만, `dive.html`은 §3에서 보듯 **로그인 화면에서 실제로 클릭되는 링크**라 문제가 된다.

---

## §3 권한상 보이면 안 되는 메뉴 노출

### 3.1 게이트(페이지 진입 차단) — 정확히 동작
`admin`·`staff`·`sales` 3계정으로 SCREEN_MENU에 등록된 모든 화면(운영 현황·대시보드·데이터 관리·프로젝트 3종·분석·지도 3종·카드 발행 4종·생산 관리·서비스 관리 5종)을 직접 주소로 열어 대조한 결과, **권한 밖 화면은 예외 없이 `?denied=`로 제 역할의 홈으로 돌아갔다**(예: `admin`이 `ximap.html`을 열면 `admin-home.html?denied=ximap.html`로, `sales`가 `ai-project.html`을 열면 `ximap.html?denied=ai-project.html`로). 증거: `evidence-admin-ximap-denied-redirect.png`, `raw.json` 전수 대조(§6 권한 게이트 섹션, 위반 0건 — `dashboard-128` 제외).

### 3.2 레일(메뉴 노출) — **`dashboard.html`·`dataset.html`에서 새는 중**
진입 차단은 맞는데, **일단 들어간 화면 안의 레일 메뉴 목록은 역할을 안 본다.** `dashboard.html`·`dataset.html`는 `landxi/assets/data/roles.js`를 아예 import하지 않고, 각자 `landxi/proto/db-data.js:91-102`(대시보드) / `landxi/proto/dataset.js:37-49`(데이터 관리)에 **원본 9메뉴를 하드코딩**해 놓았다. `landxi/proto/shell.js`(공용 셸, `onRail(ROLE, key)`로 역할별 필터링)가 있는데도 이 두 파일은 그걸 쓰지 않는다.

실측(스크린샷 `evidence-staff-dataset-rail-leak.png`): **LX 직원(staff)** 계정으로 데이터 관리 화면을 열면 레일에 `카드 발행 관리`·`생산 관리`·`서비스 관리`가 뜬다 — `roles.js`상 staff의 메뉴는 `['dashboard','media','project','analysis','map','support','my']` 7개뿐, 저 3개는 **관리자 전용**이다(같은 메뉴를 눌러 들어가면 물론 관문에 막혀 튕겨 나가지만, "이 계정이 볼 수 있는 것"이라는 신뢰가 이미 깨진 뒤다).

| 계정 | 화면 | 새는 항목 | 본래 그 역할의 레일(선언, `roles.js`) |
|---|---|---|---|
| staff | `dashboard.html` | `publish-admin`(카드 발행 관리) · `produce`(생산 관리) · `admin`(서비스 관리) | `dashboard,media,project,analysis,map,support,my` |
| staff | `dataset.html` | 〃 | 〃 |
| admin | `dataset.html` | `dashboard`(대시보드) · `project`(프로젝트) · `analysis`(분석 서비스) · `map`(지도 서비스) · `support`(서비스 지원) | `ops,media,publish,produce,admin,my` — 관리자는 "관리 기능만" 갖는다는 게 9/22 결정(`2891fdb`)의 요지인데 데이터 관리 화면에서만 직원 메뉴 5개가 되살아난다 |

원인 라인: `landxi/proto/db-data.js:91`(`export const NAV = […]`)·`:98`(`NAV_FOOT`), `landxi/proto/dashboard.js:11,50-52`(이걸 그대로 렌더), `landxi/proto/dataset.js:37-49`(같은 내용을 독자적으로 재선언). 셋 다 `roles.js`의 `onRail`/`sees`를 import하지 않는다 — 9/20 감사 **C1("공용 셸이 없다")이 이 두 화면에서 아직 안 닫혔다.**

### 3.3 고아 레거시 화면 — `dashboard-128/dashboard.html`
`review/`·`spikes/` 밖(`landxi/proto/dashboard-128/`)에 9/21 시점의 관리자 대시보드 사본이 통째로 남아 있다. `shell-gate.js`를 아예 안 부르므로 **로그인 없이도, 어느 역할로도** 열린다(admin·staff·sales·비로그인 4계정 전부 재현, `finalUrl`이 그대로 `dashboard-128/dashboard.html`). 화면 안에는:
- 관리자 전용 운영 지표(전체 사용자 21명·가입 승인 대기·미답변 문의 6건 등)가 **영업용 계정에도 그대로 노출**(증거: `evidence-sales-dashboard128-no-gate.png`).
- 개발용 URL 표기가 화면 글자로 그대로 보인다 — `?status=대기`(2곳)·`?open=…`(스크린샷 하단 "검토 › ?open=…" 행). 9/20 감사 D4와 동일한 결함이 **레거시 사본에 화석으로 남음**.
- 14px 미만 글자 **126곳**(`LAND XI` 9px 포함).
- 레일도 §3.2와 같은 원인(`db-data.js`)으로 역할 필터링이 없다.

실제 UI 동선(레일·검토 허브·다른 화면)에서 이 경로로 가는 링크는 없다(고아) — 그러나 URL을 직접 치면 누구나·아무 로그인 없이도 연다는 점에서 "관리자 전용 데이터 노출"로 §3.2보다 등급이 높다. 삭제하거나 게이트를 씌우는 것 중 하나가 필요하다.

---

## §4 개발용 표기 · 14px 미만 · 법전 금지 스타일

**현재 계정 여정(3역할이 실제로 도달하는 55화면)에서는 0건.** 9/20 감사가 지적했던 D4(개발 주석 노출)·D5(14px 미만 3곳)·U1m(46곳)·H2 등은 이 재검사 범위에서 재현되지 않았다 — 다만 아래 예외:

| 화면 | 문제 | 성격 |
|---|---|---|
| `dashboard-128/dashboard.html` | 개발용 URL 노출 2건 · 14px 미만 126곳 | §3.3과 동일한 고아 레거시(재발이 아니라 **미삭제**) |
| `workflow.html`(스파이크) | 14px 미만 43곳 · gradient 2 · box-shadow 1 · backdrop-filter 1 | 계정 여정 밖, 검토 허브에서만 참고용으로 걸림 |
| `dive.html`(스파이크, **로그인 워드마크가 실제로 연결**) | 14px 미만 42곳 · border-radius 50% 1곳 | §5.1 참고 — 유일하게 실제로 클릭되는 스파이크 |
| `system.html`(스파이크) | border-radius 50% 12곳(아바타 원형 — 대부분 의도된 원형 뱃지로 보이나 법전 §2 "라운드 0"과는 문자 그대로 불일치) | 계정 여정 밖 |
| `map-drift.html` | box-shadow 1 · border-radius 1(4px, 측정 배지) | 생산 화면이지만 소소 |
| `site/notice.html`·`site/platform.html`·`site/usecase.html`(비로그인 공개 게시판) | border-radius 50% 각 1곳(아이콘 원) | 경미 |

false-positive 메모: 자동 스캐너가 `fonts.html`·`portal-dp-gj-marine-25/27.html`에서 "개발용 표기"로 잡은 항목은 실제로는 `<script>` 태그 내부의 JS 소스/주석 텍스트였다(화면에 렌더되지 않음) — 육안 확인 후 제외.

---

## §5 로드시간 · 전송량 (admin 계정 기준, 상위)

| 화면 | 벽시계 로드 | 전송량 |
|---|---|---|
| `fonts.html`(스파이크) | 1785ms | **15.4 MB** |
| `film/anchors.html` | 949ms | 6.7 MB |
| `admin-map.html` | 1033ms | 5.3 MB |
| `workflow.html`(스파이크) | 1010ms | 5.1 MB |
| `report-standard-issue.html` | 1052ms | 4.4 MB |
| `scrub/index.html`(메인 필름, mp4 차단 상태에서도) | 1028ms | 3.8 MB(mp4 제외) — **별도 측정**: 첫 4초 관찰만으로 **11.5 MB**(영상 포함, mp4 차단 없이) |
| `ai-card-edit.html` | 1008ms | 3.3 MB |
| `dive.html`(스파이크) | 1180ms | 3.3 MB |
| `portal-dp-gj-marine-25.html` | 1031ms | 3.1 MB |

9/20 감사 M5("첫 화면만 보고 떠나는 방문자도 9 MB")는 **그대로다**(오히려 11.5 MB로 소폭 증가) — 영상 지연 로드(A9 제안)는 미착수로 보인다. 지도 화면들의 3–5 MB는 대부분 §2의 외부 타일 다운로드다.

---

## §6 9/20 감사 대조 — 닫힌 것 / 재발 / 신규

| 9/20 항목 | 2026-09-23 상태 |
|---|---|
| D1(대시보드 404 9종) · L1(로그인 404 3종) | **닫힘** — 108링크 중 1개(고아 페이지 안)만 끊김 |
| C1(공용 셸 없음 · 화면마다 레일 3변종) | **부분 재발** — 대부분 화면은 `shell.js`로 통합됐지만 `dashboard.html`·`dataset.html` 2곳이 독자 레일을 유지 중(§3.2) |
| D4·C5·C6(개발용 URL·내부 용어 노출) | **닫힘**(현역 화면) / 고아 레거시 안에는 남음(§3.3) |
| D5·U1m·H2(14px 미만 다수) | **닫힘**(현역 화면 0건) / 스파이크·고아에는 남음(§4) |
| C9(외부 CDN 의존 · 인터넷 차단 시 죽음) | **부분 해결** — 서체·MapLibre 라이브러리·영상은 로컬화됐으나 **지도 배경 타일은 여전히 외부**(§2), 사실상 "지도가 있는 화면은 인터넷이 없으면 배경이 안 뜬다" |
| L3(로그인 워드마크가 구 스파이크로) | **미해결, 재확인** — 여전히 `dive.html`(§2·§4) |
| M2(메인 내비가 내부 작업물 `system.html`/`workflow.html`로) | 메인 필름 자체는 이번 크롤에서 해당 링크를 재현하지 못함(9/20 이후 메인 내비 개편 추정) — 로그인 워드마크(L3)만 잔존 확인 |
| L4(채운 파란 로그인 버튼이 법전과 충돌) | 이번 점검 범위(무결성) 밖 — 별도 영역 감사 대상 |

---

## 부록 — 파일

- `shots/audit-0923/integrity/crawl.mjs` — 크롤러(4계정 × 57화면)
- `shots/audit-0923/integrity/analyze.mjs` — raw.json 분석/집계
- `shots/audit-0923/integrity/evidence.mjs` — 증거 스크린샷 4장 생성
- `shots/audit-0923/integrity/raw.json` — 원시 데이터(228방문 전체 필드 + 링크 108종 상태)
- `shots/audit-0923/integrity/analyze.log` — 분석 전체 출력
- `shots/audit-0923/integrity/evidence-staff-dataset-rail-leak.png` — §3.2 증거
- `shots/audit-0923/integrity/evidence-admin-ximap-denied-redirect.png` — §3.1 증거(게이트 정상 동작)
- `shots/audit-0923/integrity/evidence-sales-dashboard128-no-gate.png` — §3.3 증거
- `shots/audit-0923/integrity/evidence-ximap-external-tiles.png` — §2 증거
