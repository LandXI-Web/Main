# Land-XI 하이퍼 플랫폼 설계안 — 비주얼 디자인 디렉션 (디자인 언어 v2)

- 작성 2026-09-24 · 설계 패널 "비주얼 디렉션" 몫 · 다른 두 패널(아키텍처·제품)과 독립적으로 썼다.
- 읽은 것: 메모리 9편(`landxi-ximap-core` `quality-bar` `relaunch-0923` `redesign-direction` `user-prefs` `local-assets` `status-0922` `portable-copy`), `recon-0924/` 9편(ASSET-LEDGER · env · vworld · stack · e-projects · e-landcover · d-drive · global-map · aihub-shortlist), 스펙 `2026-09-20-*.md` 4편, `audit-0923/MASTER-PLAN.md` · `strategy.md`, 인벤토리 `2026-08-26-landxi7-function-inventory.md`, `design/system.md`(현행 법전), 현행 토큰 `landxi/assets/css/tokens.css` · `landxi/proto/fonts-system.css`, 스크린샷 4장(`shots/w0/E0-S/01-s1-arrived-1440.png` · `shots/audit-0923/admin/10-admin-home-1440.png` · `shots/audit-0923/shell-dash/dash-1440-vp.png` · `shots/audit-0923/map/crit-01-info-side-1440.png`), 벤치 아카이브(`research/` Vantor · Palantir · kepler/planet · all4land · Roboflow · FUI).
- 표기: 자산은 `ASSET-LEDGER.md` 의 ID(**A01~A13 Tier 0 · B01~B14 Tier 1 · C01~C10 Tier 2 · D01~D11 Tier 3 · E01~E04 Ext**)로만 부른다. 공개 데이터는 URL 을 적는다. 수치는 **[실측]**(파일·API 로 확인) / **[추정]** / **[시연]** 을 붙인다. 지어낸 운영 수치는 없다.

---

## 0. 한 줄 판정과 논지

**판정**: 현행 화면이 "목업"으로 읽히는 이유는 기능 부족이 아니라 **디자인 법전(`system.md`)이 인쇄물의 규칙으로 WebGL 매체를 묶었기 때문**이다. 그림자 0 · 유리 0 · 이징 1 · 유휴 요소 1 · 3D 보류(D22) · 회전·피치 잠금 — 이 여섯 줄이 "살아 있는 지도"를 구조적으로 금지했고, 게이트는 사용자 기준이 아니라 이 법전 기준으로 합격을 냈다.

**논지**: 디자인 언어 v2 는 **"밝은 종이 · 어두운 영상 · 빛나는 판독"** 세 무대(stage)로 나뉜다.
- **Paper(종이)** — LX 직원·기관·게스트의 문서·목록·폼. 사용자가 확정한 흰 바탕 에디토리얼 톤(Vantor 문법)을 그대로 지킨다.
- **Imagery(영상)** — 지도 판 위. 바탕은 언제나 **정사영상 사진**이고(planet 공통분모 3 "사진으로 대접"), UI 는 그 위에 **떠 있는 흰 유리 패널**(사용자 2026-08-25 원 확정 "밝은 지도 + 흰 유리 패널")과 헤어라인 계기만 올린다. AI 결과는 **빛**(청록 글로우 · 스캔 · 압출 · 필라멘트)으로만 표현한다.
- **Ops(관제)** — 관리자 사이트. Vantor 의 **컬러웨이 스왑**(6토큰 반전)으로 잉크 바탕의 "다른 집"이 된다. 색을 더하지 않고 명도를 뒤집는다(사용자 Q3 결정 "잉크 반전").

이 세 무대가 **한 세트의 서체·액센트·모션 사다리·아이콘**을 공유하므로 한 제품으로 읽히면서, 무대마다 깊이·빛·재질 규칙이 달라 "지도는 살아 있고, 문서는 단정하고, 관제실은 어둡다"가 된다.

---

## 1. 현행 화면 4장 — 무엇이 목업으로 읽히는가 (스크린샷 근거)

| 화면 | 스크린샷 | 목업으로 읽히는 지점 | v2 처방 |
|---|---|---|---|
| XI맵(지도 서비스) | `shots/audit-0923/map/crit-01-info-side-1440.png` | 좌 흰 목록판이 폭 48 %, 지도는 나머지 절반. 결과는 어두운 위성 위 **청록 점 산포**로 "놓여" 있고, 시점 스트립은 정지 썸네일 4장. 계기(범례·좌표·GSD)가 전부 **불투명 흰 사각**이라 사진과 단절. 회전·피치 잠금 → 평면 GIS 뷰어 | §4 `CANVAS-FULL`: 캔버스 ≥ 90 %(E0-S 실측 96.2 %), 패널은 유리 elev-2 로 뜨고, 결과는 S1 도착 → 압출 → 시점 스크럽. 피치 허용 |
| E0-S 스파이크(도착) | `shots/w0/E0-S/01-s1-arrived-1440.png` | **방향은 맞다**(사진 바탕 · 큰 숫자 · 브래킷 · 시점 축). 그러나 pitch 0 · 폴리곤 평면 채움 · 흰 HUD 카드가 하드 엣지 불투명 · 글로우 0 → 정지 화면은 "잘 만든 도면" | 같은 데이터에 §4.1 이중 스트로크 글로우 · §4.3 conf 압출 · 유리 HUD(elev-2) · pitch 35° 도착 카메라 |
| LX 관리자 운영 현황 | `shots/audit-0923/admin/10-admin-home-1440.png` | 직원 화면과 **같은 종이 위에 숫자 표**. "다른 집" 장치는 마스트 명도 하나. 인프라 %(스토리지 13 · GPU 9 · 트래픽 3)는 `infra.js` **계산값**이지 실측이 아니다 | §5.3 Ops 컬러웨이 반전 + GPU 노드 실측(nvidia-smi) + 작업 대기열 스윔레인 + 기관 쿼터 링 |
| 직원 대시보드 | `shots/audit-0923/shell-dash/dash-1440-vp.png` | 큰 숫자 밴드는 좋다. 그러나 남한 격자 판이 **네이비 사각 안에 갇힌 삽화**로 종이와 단절되고, 승인 대기 증거 크롭은 "V-World 24 cm · 폴리곤 없음" 회색 | 대시보드는 사용자 확정(지도 없음·축소) 존중. 격자 판만 §3.2 elev-1 헤어라인 판 + 셀 점등 S1 문법. 증거 크롭은 A01/A06 실타일 크롭으로 교체 |

공통 진단: **정보는 있고 빛이 없다.** 세 사용자(공무원·시민·LX 직원) 모두에게 "우와"는 첫 5초의 **도착 연출**과 손을 대면 **반응하는 재질**에서 나온다. 규칙 준수보다 예쁨·세련됨이 우선(사용자 9차 피드백).

---

## 2. `design/system.md` 처분표 — 폐기 · 유지 · 개정 · 신설

사용자가 과거에 **직접 확정한 것은 유지**하고, 에이전트가 자체 해석으로 굳힌 인쇄물식 제약만 바꾼다. 바꾸는 것마다 근거를 적었다.

### 2.1 유지 (사용자 확정 · 그대로)

| 조항 | 내용 | 확정 출처 |
|---|---|---|
| §1 서체 | **Paperlogy 700/800 + Pretendard 400/500 + Inter 400/500 tabular**, 바닥 14px, +2 스케일 | 사용자 2026-08-27 "Paperlogy + Pretendard, T3로 간다" · "글자 2포인트 키우자" |
| §2 색 | 바탕 `#FFFFFF` · 잉크 `#010102` · 액센트 `#006DF7` · 틴트 `#E8F1FF/#D6E6FF` · 청록 `#0FA9A0` = AI 결과 · 앰버 `#FFB633` = 탐지 순간 · 경고 `#D1352B` = 조치 필요 글자만 · **채운 파란 버튼 없음** | T3 톤 결정 2026-08-27, 대시보드 리밸런싱 |
| §2 라운드 0 | 종이 무대에서 라운드 0 | Vantor 실측(라운드 코너 0) · 사용자 레퍼런스 |
| §3 그리드 | 레일 72 · 마스트 64 · 마진 56 · 12열/24 · 원장 372 · 브래킷 12 | 2026-08-26 대시보드 A안 확정 |
| §5 콘티 원칙 | 지어낸 서사 금지 · 숫자는 `results/services/models/imagery(+cards/registry)` · 시연/추정/준비 중 | 사용자 2026-08-26 "신규 개발 콘티" |
| §6 메인·로그인 | 메인 = 디오라마 스크럽 필름, 로그인 = 플랫폼 소개 + 디오라마 판, 대시보드 = 지도 없음 축소형 | 사용자 2026-08-26 확정 3건 |
| 영상 크레딧 | 생성 API 호출 0(Q6) | 사용자 2026-09-24 |

### 2.2 폐기 → 개정 (근거 포함)

| 현행 조항 | 왜 목업을 만들었나 | v2 개정 | 레퍼런스 장치 |
|---|---|---|---|
| §2 "그림자 0" | 지도 위 패널이 판과 같은 평면에 붙어 **계기가 사진을 가리는 스티커**로 읽힘. 종이 위에서는 맞지만 영상 위에서는 틀림 | **깊이 4단**(§3.2). 종이 무대 elev-0/1 만(헤어라인) · 영상 무대 elev-2(유리+그림자) · 모달 elev-3 | Apple 지도 앱 시트(vibrancy + 1px 경계 + 저알파 그림자), Linear 패널(`border 1px + shadow 0 8px 24px rgba(0,0,0,.08)`) |
| §2 "유리(backdrop-filter) 금지" | 사용자 원 확정(2026-08-25)은 "밝은 지도 + **흰 유리 패널**"이었다. 법전이 이를 뒤집었다 | **영상 무대에서만 허용**: `rgba(255,255,255,.78)` + `blur(16px) saturate(1.2)` + 헤어라인 | Mapbox Studio 레이어 패널, Palantir Foundry Map 위젯 |
| §2 "그라디언트 0" | UI 장식 그라디언트 금지는 맞다. 그러나 **데이터 램프·글로우·스캔**까지 막아 AI 결과가 평면 채움이 됨 | UI 그라디언트 0 유지. **데이터 표현(신뢰도 램프 · 이중 스트로크 글로우 · 스윕 · 필라멘트)은 예외** | kepler.gl 색 램프, all4land ③⑦ 글로우 스트로크·데이터 레인 |
| §4 "이징 하나" | UI 반응 · 결과 도착 · 카메라 이동은 물리가 다르다. 한 곡선으로 카메라를 움직이면 기계적 | **이징 3**: UI `(.22,1,.36,1)` 180ms · 도착 `(0.15,1,0.3,1)` · 카메라 `(.16,1,.3,1)` 1600/2400 | Apple 스프링, scroll-craft lerp 0.12, Vantor 단일 이징은 **정적 사이트**라서 가능했음 |
| §4 "지속 4단만" | 락온 380(180+80+120)·호버 180·카메라 1600/2400 이 이미 예외로 새고 있었다(E0-S 결과 ②) | **사다리 확장**: 40·60·80·120·180·380 / 500·750·1000·1250 / 1600·2400 | E0-S 실측 사용값 그대로 승격 |
| §4 "유휴 요소 1개" | 지도 판은 타일 페이드·큐 맥박·카메라 관성이 **본질적으로 동시에** 움직인다. 1개 제한이 지도를 정지 화면으로 만들었다 | 종이 무대 1개 유지. **영상 무대 최대 3개, 전부 실데이터에 묶인 것**(타일 페이드 · 진행 중 작업의 스캔 · 프로비넌스 링). 관제 무대는 실측 텔레메트리(GPU %·큐)만큼 | kepler 시간 재생, f1-dash 텔레메트리, NASA Worldview |
| D22 "3D 보류" · `dragRotate:false` | "WebGL급"의 90 %는 카메라 연속성과 깊이(Awwwards M03/M08). 평면 잠금이 GIS 뷰어 느낌의 원인 | **해제**. XI맵 `mode:'2d'|'3d'|'globe'`, pitch ≤ 60, 지형은 장면 단위만(SwiftShader 지형 ON 2.4fps 실측 절벽) | `stack.md` §4.1, 사용자 "입체적인 Geo-AI" 2026-08-25 |
| §2 색 분량 "90/8/2" 전 화면 | 사진이 바탕인 화면에 종이 비율을 강제하면 계기가 흰 덩어리가 됨 | **무대별 분량**: Paper 90/8/2 · Imagery = 사진 바탕 + 흰 유리 ≤ 15 % + 청록/파랑 ≤ 3 % · Ops = 잉크 88 / 흰 10 / 청록·파랑 2 | Vantor 컬러웨이(다크 기본 ↔ By The Numbers 라이트 반전) |
| §2 "앰버는 380ms 만" | 관제실은 **임계 근접(주의)** 상태색이 필요하다. 빨강은 장애(조치)에 이미 예약 | Ops 무대 한정 **앰버 = 주의(임계 80 % 초과) 글자·눈금**. 종이·영상 무대는 380ms 규칙 유지 | Blueprint intent `warning`/`danger` 2단, Vantor `--color-code-amber` |
| §3 "명명 레이아웃 5종" | 지도 풀블리드 · 관제 밀집 · 글로브 무대에 이름이 없어 에이전트가 각자 해석 | **+3**: `CANVAS-FULL` · `OPS-GRID` · `GLOBE-STAGE` (§3.6) | Mapbox Studio · Linear · kepler 데모 |

### 2.3 신설

| 조항 | 내용 |
|---|---|
| 무대(stage) 선언 | `<body data-stage="paper|imagery|ops">` 하나로 토큰 세트가 바뀐다(§3.1). 화면은 무대를 고르고 부품은 무대를 읽는다 |
| 빛 문법 | AI 결과 4형(도착 · 스캔 · 압출 · 시계열) + 보조 3(스와이프 · 프로비넌스 · 계보) — §4 |
| 아이콘 세트 v2 | 헤어라인 1.5px · 24 그리드 · 44종(§3.7). Blueprint 16/20 두 크기 규칙 |
| 데이터 시각화 문법 | 데이터 잉크 · 색 역할 4 · 램프 2 · 차트 7종(§3.8) |
| 글로벌판 타이포 | 영문·키릴 표시 = Inter 600/700, 본문 Inter 400, 한글 없음 시 Pretendard 폴백 제거(§3.5) |
| 판정 | 세 사용자 루브릭 + 동작 영상(§7) |

---

## 3. 토큰 v2 — 깊이 · 빛 · 재질 · 모션 · 타이포 · 색 · 아이콘 · 차트

파일: **`landxi/assets/css/v2/tokens-v2.css`**(신설, 기존 `tokens.css` 는 건드리지 않고 `data-stage` 셀렉터로 덮어쓴다) · 법전은 **`design/system-v2.md`** 로 개정 발행. 아래 값은 실제 CSS 로 바로 옮길 수 있게 썼다.

### 3.1 무대 컬러웨이 (Vantor 6토큰 스왑 문법)

```css
:root, [data-stage="paper"]{
  --cw-bg:#FFFFFF; --cw-ink:#010102; --cw-sub:#686868; --cw-rule:#DDDDDD;
  --cw-panel:#FFFFFF; --cw-panel-a:1;           /* 종이 패널은 불투명 */
  --cw-accent:#006DF7; --cw-tint:#E8F1FF; --cw-tint-2:#D6E6FF;
  --cw-ai:#0FA9A0; --cw-lock:#FFB633; --cw-warn:#D1352B;
}
[data-stage="imagery"]{                        /* 지도 판 위 — 바탕은 사진 */
  --cw-bg:transparent; --cw-ink:#010102; --cw-sub:rgba(1,1,2,.62); --cw-rule:rgba(1,1,2,.14);
  --cw-panel:rgba(255,255,255,.78); --cw-panel-blur:16px;
  --cw-hud-ink:#FFFFFF; --cw-hud-rule:rgba(255,255,255,.28);   /* 사진 위 직접 얹는 계기 */
  --cw-ai:#0FA9A0; --cw-ai-glow:rgba(15,169,160,.35);
}
[data-stage="ops"]{                             /* 관리자 관제실 — 명도 반전, 색 추가 0 */
  --cw-bg:#010102; --cw-ink:#FFFFFF; --cw-sub:#CCCCCC; --cw-rule:#272727;
  --cw-panel:#0E1116; --cw-panel-a:1;
  --cw-accent:#4E9BFF;   /* #006DF7 의 잉크 위 대비 보정판(4.5:1) — 새 색이 아니라 명도 보정 */
  --cw-tint:rgba(78,155,255,.10); --cw-tint-2:rgba(78,155,255,.18);
  --cw-ai:#2BD9CF; --cw-warn:#FF5A4E; --cw-caution:#FFB633;   /* Ops 한정 앰버 상시 */
}
```
- Ops 액센트 `#4E9BFF` 와 경고 `#FF5A4E` 는 잉크 위 **WCAG 4.5:1 확보용 명도 보정**이다(색상 hue 동일). 색을 추가하지 않는다는 원칙과 충돌하지 않는다.
- 슬레이트 램프 `--sl-1..15`(Blueprint 원본, `tokens.css` 에 이미 있음)를 Ops 의 표·축·비활성에 쓴다.

### 3.2 깊이 4단 (elevation)

| 단 | 어디 | 처방 | 근거 |
|---|---|---|---|
| **elev-0 판** | 종이 본문, 지도 캔버스 | 그림자 0 · 경계 0 | Vantor |
| **elev-1 헤어라인 카드** | 종이 위 표·타일·대시보드 격자 판 | `border:1px solid var(--cw-rule)` · 그림자 0 | Vantor `--color-light-stroke #ddd` |
| **elev-2 떠 있는 패널** | **영상 무대 전용** — 레이어 패널·HUD·시점 스크러버·범례 | `background:var(--cw-panel); backdrop-filter:blur(var(--cw-panel-blur)) saturate(1.2); border:1px solid rgba(255,255,255,.55); box-shadow:0 1px 0 rgba(1,1,2,.06), 0 12px 32px rgba(1,1,2,.14)` | Apple Maps 시트, Linear 팝오버 |
| **elev-3 모달·명령 팔레트** | 전 무대 | `box-shadow:0 24px 64px rgba(1,1,2,.22)` + 배경 딤 `rgba(1,1,2,.35)` | 현행 `.palette` 유지 |
| Ops 예외 | 관제실은 elev-2 를 **어두운 유리** `rgba(14,17,22,.82)` + `blur(12px)` 로, 그림자 대신 `1px` 밝은 경계 `rgba(255,255,255,.08)` | Blueprint dark `#1C2127` 계열 |

### 3.3 빛 (AI 결과의 재질)

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--glow-ai` | 이중 스트로크: 위 `line 1.2px #0FA9A0 blur 1.5`, 아래 `line 4px rgba(15,169,160,.25)` | 폴리곤 결과 윤곽(A02 · A04 · A06 · B06) |
| `--glow-fill` | `fill-opacity` 0.18 → 호버 0.42, `fill-extrusion-opacity` 0.72 | 결과 면 |
| `--lock` | 브래킷 12px · 성장 180 → 앰버 80 → 청록 정착 120 (= 380) | 락온(E0-S 실측 그대로) |
| `--sweep` | 청록 수직선 1px + 뒤따르는 24px 그라디언트 꼬리 `rgba(15,169,160,.0→.28)` · 1.0s | 스캔 스윕 |
| `--filament` | 1px 수직선, 높이 = 값, 알파 0.35~0.9, 하단 흰 → 상단 청록 | 데이터 레인(밀도 표현, §4.6) |
| `--conf-0..5` | `#BFD9FF → #003B85`(현행 유지) | 신뢰도 램프(파랑 = 정보) |
| `--det-0..9` | Roboflow ColorLookup 고정색(현행 유지) | 클래스 고정색 — **검출에만** |

규칙: **채도 높은 색은 결과 위에만 터진다**(planet 공통분모 4). 크롬(패널·버튼·레일)은 잉크·흰·슬레이트·액센트만.

### 3.4 모션 사다리

```css
--e-ui:cubic-bezier(.22,1,.36,1);       /* 호버·토글 180ms, 물리 반응(4px 이동·브래킷 성장) */
--e-arrive:cubic-bezier(0.15,1,0.3,1);  /* 500 · 750 · 1000 · 1250 — 결과 도착·타일 페이드 */
--e-cam:cubic-bezier(.16,1,.3,1);       /* 1600 · 2400 — flyTo·pitch·글로브↔평면 */
--d-40:40ms; --d-60:60ms; --d-80:80ms; --d-120:120ms; --d-180:180ms; --d-380:380ms;
--d-500:500ms; --d-750:750ms; --d-1000:1000ms; --d-1250:1250ms; --d-1600:1600ms; --d-2400:2400ms;
```
- 텍스트 인 `translateY(20px)→0` 600/60 스태거, 숫자 글자별 40ms 현상, 이미지 `clip-path inset(100% 0 0)→inset(0)` 1s — 현행 유지(Vantor 실측).
- 카메라는 **점프하지 않는다**(planet 공통분모 6). 화면 전환 = 같은 지도의 카메라 이동(S4 인계). `prefers-reduced-motion` = `jumpTo` + 도착 1s 안 완료.
- 유휴: Paper 1 · Imagery ≤ 3(실데이터 묶인 것) · Ops = 텔레메트리 갱신만(2s 폴링, 값이 바뀔 때만 움직임).

### 3.5 타이포 — 국문판 유지, 글로벌판 신설

**국문판(변경 없음)**: Paperlogy 700 H1 66/82 · H2 54/59 · H3 34/42 · KPI 126 · Pretendard 400 본문 18/26(1.6) · 500 강조 · 라벨 14/16 · Inter 400 tabular 표 숫자 `letter-spacing .02–.04em`.

**신설 1 — 숫자 디스플레이 승격**: 영상 무대 HUD 큰 숫자 **124px/1.15**(Vantor 본문 대비 7.75배 실측)를 `--fs-hud:124px` 로 추가. 지금 E0-S 는 66px 대. 도착 순간 숫자가 문장을 대신한다.

**신설 2 — 글로벌판(영문·키릴)**
| 역할 | 국문판 | 글로벌판 | 이유 |
|---|---|---|---|
| 표시(H1~H3·KPI) | Paperlogy 700/800 | **Inter 600/700** −0.01em, line-height 1.10~1.25 | Paperlogy 라틴은 한글 짝으로 설계된 보조 글리프라 영문 장문 헤드라인에서 자간·굵기 리듬이 무너진다. Inter 는 이미 `landxi/assets/fonts/Inter-400/500.woff2` 로 벤더링되어 있어 **600/700 두 파일만 추가**(`@fontsource/inter`, OFL) — 제3 서체 추가가 아니다 |
| 본문 | Pretendard 400 | Inter 400 16/23(1.45) | Vantor 본문 실측치 그대로 |
| 라벨 | Pretendard 500 14 | Inter 500 12→**14** +0.01em `uppercase` 금지(`capitalize`) | 바닥 14 유지 |
| 숫자 | Inter tabular | 동일 | – |
| 키릴(키르기스어·러시아어) | – | Inter 는 키릴 지원 → 비슈케크·으슥아타·소쿨룩 지명을 현지 표기 병기 가능(예: `Ысык-Ата`) | 시나리오 A·B(global-map §3) |
| 미얀마어 | – | **미정** — Inter 미지원. 재해 카드는 영문 라벨만, 필요 시 Noto Sans Myanmar 는 별도 결정 | 콘티 원칙: 없는 것은 없다고 적는다 |

`<html lang="en">` 이면 `--font-display` 가 Inter 로 바뀌는 **한 줄 스왑**(`landxi/assets/css/v2/fonts-v2.css`). 한글이 섞인 화면(LX 직원이 글로벌 카드를 볼 때)은 국문판 그대로.

### 3.6 명명 레이아웃 8종 (5 유지 + 3 신설)

| 이름 | 무대 | 구성 | 화면 |
|---|---|---|---|
| `PLATE-FULL` `SPLIT-5050` `LEDGER` `EVIDENCE-PAIR` `CHIP-RAIL` | Paper | 현행 그대로 | 대시보드·목록·검토 데스크 |
| **`CANVAS-FULL`** | Imagery | 캔버스 100 %(레일 72 제외) · 좌 상단 떠 있는 레이어 패널 360px(접힘 48) · 우 상단 HUD 카드 ≤ 420px · 하단 시점 스크러버 폭 60 % · 우 하단 계기(좌표·GSD·축척) 헤어라인 흰 글자 | XI맵 · 분석 완료 판 · 포털 지도 탭 |
| **`OPS-GRID`** | Ops | 12열 밀집 그리드(거터 16) · 행 높이 8 배수 · 모든 타일 elev-1 밝은 경계 · 좌 레일 72 `LX/OPS` 마크 | 관제 홈 · 노드 · 대기열 · 쿼터 · 배포 |
| **`GLOBE-STAGE`** | Imagery | 글로브(`vertical-perspective`) 순백 배경 위 · 국가 면 채색 · 상단 날짜 스크러버(GIBS) · 우측 사업국 목록 | XI맵 글로벌 모드 · 영업 첫 화면 |

### 3.7 아이콘 세트 v2 — `landxi/assets/icons-v2.svg`

- 문법: 24 그리드 · **스트로크 1.5px** · 라운드 캡 · 채움 0(활성 시 틴트 채움 1단) · 16/20/24 세 크기(Blueprint 규칙: 16 은 단순화 별도 패스). 현행 `icons.svg`(스트로크 2px 혼재)는 폐기.
- 44종: 레일 9(대시보드·데이터·프로젝트·분석·지도·지원·발행·관리·MY) · 지도 도구 12(레이어·검색·측정·그리기·스와이프·시점·3D·글로브·내보내기·필지·범례·홈) · 결과 8(폴리곤·점·밀도·구간·시계열·신뢰도·클래스·크롭) · Ops 10(GPU·노드·큐·모델·스토리지·쿼터·경보·배포·롤백·계보) · 상태 5(실측·시연·추정·준비·잠금).
- 위성·항공·드론 3종은 **실루엣 픽토그램**(A12 glb 의 정면 투영에서 그린다)으로, 영상 출처 칩에 쓴다.

### 3.8 데이터 시각화 문법 (데이터 잉크)

| 규칙 | 값 |
|---|---|
| 색 역할 4 | 파랑 = 정보/선택 · 청록 = AI 결과 · 빨강 = 조치 · 잉크 = 본문. **차트 기본 계열은 잉크 1색**, 강조 1색만 액센트 |
| 램프 2 | 신뢰도 `--conf-0..5`(연속) · 클래스 `--det-*`(범주, 검출 전용) |
| 차트 7 | 큰 숫자 + 스파크라인(24px) · 헤어라인 막대(축 0, 값 라벨 우측 Inter) · 단계구분도(시군구 252, 5단 파랑) · 헥사/컬럼(deck `HexagonLayer`/`ColumnLayer`) · 시계열 선(변화 지수) · 혼동행렬 히트(모델 카드) · 학습 곡선(`results.csv` 실측) |
| 금지 | 파이·도넛(현행 스토리지 도넛은 세그먼트 막대로 이미 교체) · 3D 차트 · 범례 없는 색 |
| 출처 | 모든 차트 우 하단 `S5 프로비넌스 칩`(파일명 · 기준일 · 실측/추정) |

---

## 4. 지도 위 AI 결과 표현 문법 — XI맵의 심장

XI맵 = **전국·해외 위성/항공/드론 정사영상을 실시간 분석하는 프레임 + 결과 열람**(사용자 정의). 결과가 "놓여 있는 것"과 "도착하는 것"의 차이가 GIS 뷰어와 GeoAI 의 차이다. 아래 7문법은 **한 부품씩**이고, 지도 판을 가진 모든 화면(XI맵·분석·포털·대시보드 격자·검토 데스크·메인 인계 판)이 같은 함수를 부른다.

부품 파일(신설): `landxi/assets/js/v2/arrive.js` · `scan-frame.js` · `extrude.js` · `epoch-scrub.js` · `swipe.js` · `provenance.js` · `lineage.js` · 공통 엔진 `landxi/proto/map-gl.js` 는 **`createMap(el,{mode:'2d'|'3d'|'globe', stage:'imagery'})`** 로 격상(`stack.md` §4.1 그대로, 기존 export 유지).

### 4.1 도착 (Arrival) — E0-S 검증 완료, 재질만 올린다
- **무엇**: frame 1250 → 스윕 1.0s(지나간 뒤에만 결과 현상 500ms) → 락온 3곳 380 → 큰 숫자 40ms/글자. E0-S 실측 p95 16.8ms, 도착 4.0s.
- **v2 추가**: ① 결과 윤곽 `--glow-ai` 이중 스트로크 ② 도착 카메라 `pitch 0→35°` 1600ms 동시 진행 ③ HUD 카드 elev-2 유리 ④ 숫자 124px.
- **데이터**: A02(농지 2,098 · 비닐하우스 1,674, `conf pnu emd`) · A04(변화 456) · A06(여수 1,857/2,078) · B06(석면 751) · B05 차량 OBB 실추론.
- **레퍼런스**: all4land ①②③⑨(브래킷·DETECTED 칩·스윕·카운트업), FUI 락온 3비트.

### 4.2 스캔 프레임 (Scan Frame) — "실시간 분석"을 실제로
- **무엇**: 사용자가 판 위에 AOI 를 그리고 카드(모델)를 고르면, **작업이 큐에 들어가고 GPU 워커가 타일 단위로 추론하며, 끝난 타일이 순서대로 지도 위에서 스캔 문법으로 현상**된다. 진행 오버레이(`setInterval` 카운터)를 폐기하고 **실제 워커 이벤트**로 그린다. 진행률 = 완료 타일 / 전체 타일 [실측].
- **화면**: AOI 헤어라인 사각 → 타일 격자(z17 기준) 점선 → 각 타일 완료 시 `--sweep` 이 그 타일을 훑고 결과 폴리곤이 현상 → HUD 에 `진행 218 / 640 타일 · GPU 노드 a6000-0 · 경과 00:41` [실측] → 전체 완료 시 4.1 도착.
- **API(설계)**: `POST /api/jobs {cardId, aoi(GeoJSON), imagery(setId|epoch), tenantId}` → `{jobId}` · `GET /api/jobs/:id/events`(SSE: `tile.done {z,x,y,features}` · `job.progress` · `job.done {resultUrl}`) · 워커 `workers/infer.py`(시스템 Py3.11 ultralytics 8.3.234 · torch cu118 [실측 env.md]) 가 Redis Streams 큐에서 작업을 받아 A6000 2장에 분배. 다중 노드 = 노드마다 같은 워커 + `nodeId`. 향후 A100×4×2 는 워커 8개 등록으로 끝난다.
- **데이터**: 모델 B01 남원 5종(mask mAP50 0.945~0.985 [실측]) · B05 차량 OBB(0.992) · C09 항공 25cm 4클래스 · D11 SAM2/YOLO-E · 입력 A01(1~2cm 4시점) · A09(5cm) · B03(본사 3.42cm) · C01 남원 도엽 25cm.
- **주의**: 영업용 계정은 `시연 실행`(Q4) — 같은 연출을 **캐시된 결과 파일**로 재생하고 세션에 남기지 않는다. HUD 에 `시연 · 저장 안 함` 칩.
- **레퍼런스**: Roboflow 추론 진행(타일별), kepler 시간 재생, Palantir AIP Logic 디버거(단계가 보인다).

### 4.3 압출 (Extrusion) — 신뢰도가 높이가 된다
- **무엇**: 결과 폴리곤을 `fill-extrusion-height = conf × 상수`로 세운다. pitch 35~50°. 호버 시 그 필지만 +20 % 솟고 `pnu · emd · conf · area` 유리 카드.
- **데이터**: A02 비닐하우스 1,674(**가장 좋은 3D 자산**, `spike-maplibre3d.md`) · A08 건물 5,109(`height_m` **[추정]** 표기 필수) · A06 여수 grid100 → `ColumnLayer`(count) · A07 서남해 격자 9,032 → `HexagonLayer`.
- **지형**: A08 `terrain-namwon` z9–13(오프라인) · E02 AWS Terrarium z≤15(CORS `*`) · C02 용지 DSM 1.44cm · B03 본사 DSM → terrarium 변환. **장면 단위만 ON**(성능 절벽).
- **레퍼런스**: kepler 3D 틸트(e), Mapbox Studio fill-extrusion, Vantor WorldView 3D.

### 4.4 시계열 (Time Scrub) — 끌면 시간이 간다
- **무엇**: 하단 시점 스크러버(폭 60 %, elev-2). 소수 시점 = 두 시점 타일 크로스페이드(`raster-opacity` 보간, E0-S 검증). 변화가 있는 시점에서 750ms 자동 정지(Palantir P4). 변화 윤곽(A04)이 4.1 문법으로 도착·소멸. 재생 6s 주기.
- **v2 추가**: 스크러버 위에 **변화 지수 히스토그램**(kepler 시간 필터의 brush 문법) — 막대 = 시점 쌍별 변화 건수 [실측 A04 `pair`].
- **데이터**: A01 4시점(2025-04/06/08/10, 1.08~1.69cm) · A03 전역 2시점 · A04 변화 타일 z14–19 · A10 제주 2020/2022 · C02 용지 3.67→1.44cm · 글로벌: Planetary Computer 월별 모자이크(`POST …/api/data/v1/mosaic/register` → `…/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=visual&asset_bidx=visual|1,2,3&nodata=0` [실측 200]).
- **레퍼런스**: kepler 시간 재생(d), scroll-craft lerp 0.12 deadband(메인 필름과 같은 손짓 → 게스트가 배운 문법이 제품에 이어진다).

### 4.5 스와이프 (Swipe) — 원본과 판독을 한 선으로
- E0-S 검증(지도 2개 동기, `clip-path inset(0 0 0 var(--swipe))`, ±4 % 키보드). v2: 핸들을 헤어라인 흰 선 + 중앙 브래킷 그립으로, 양쪽 상단에 출처 칩(`원본 · 2025.06 드론 1.69cm` / `AI 판독 · 비닐하우스 v2.1`).
- 데이터: A01 ↔ A02 · B09 토지피복 GT ↔ C09 추론 · A10 제주 정사 ↔ `jeju_landcover` 세그 래스터 · 글로벌: Maxar 전(2025-02-15) ↔ 후(2025-04-03) 만달레이(`https://maxar-opendata.s3.amazonaws.com/events/Earthquake-Myanmar-March-2025/collection.json`, CC BY-NC — 시연 한정 표기).

### 4.6 데이터 레인 (Filament) — 밀도를 빛의 기둥으로
- **무엇**: 격자 집계값을 1px 수직 필라멘트 높이·알파로. 도심·해안 밀도가 스스로 코로플레스가 된다(all4land ⑦ "이 영상 최고의 장치"). 글로브·전국 줌(z5~9)에서만. 구현 = deck `ColumnLayer` radius 최소 + `LineLayer` 또는 three 커스텀 레이어(`CustomLayerInterface renderingMode:'3d'`, 실측 동작).
- **데이터**: B02 하천 점유 건물 651,478 → 시군구 252 집계 · A07 서남해 격자 9,032 · B07 드론맵 커버리지 136,025셀 · C08 토지피복 칩 중심점.

### 4.7 프로비넌스 (S5) · 계보 (S2) — 모든 숫자에 출처, 모든 카드에 혈관
- **프로비넌스 칩**: `실측 · namwon-farmland-2025.geojson · 2026.06.08 · GSD 1.69cm · EPSG:4326` — 호버하면 브래킷 카드로 모델·결과 파일·좌표계·`countCheck` 통과가 뜬다. 유휴 6s 마다 링이 한 번 돈다(화면당 1개).
- **계보 띠**: `비닐하우스 v2.1 ─ 영농관리 v2.1 ─ 남원 2025 배포본 ─ 남원시 GeoVision`. 데이터 `cards.js CARDS/DEPLOYS` · `modelsOfCard` · `registry.updateState`. 관리자 검토 데스크에서 "승인의 결과"를 보는 자리(Q3 ①).
- 레퍼런스: Palantir P3(관계 순회) · P13(이력 상시), yt-RDytbVDzMF4 프로비넌스.

### 4.8 줌 단계별 배경 자동 전환 (한 지도에 국내·해외)

| 줌 | 국내 배경 | 해외 배경 | 오버레이 |
|---|---|---|---|
| 0–5 글로브 | NASA GIBS VIIRS TrueColor **어제 날짜**(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, CORS `*`) | 동일 | Natural Earth 국경(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json`) + **LX 사업국 38+1 채색** + USGS 지진 `all_day.geojson` + 남원·여수·본사·비슈케크·만달레이 핀 |
| 5–11 | A13 xdworld Satellite z5–19(CORS `*`, 2026-03 갱신) | EOX s2cloudless-2025(비상업, `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg`) — 수출용 배포본은 2017판(CC BY) | A11 시도·시군구 · geoBoundaries KGZ ADM1/2(`https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/KGZ/ADM2/geoBoundaries-KGZ-ADM2_simplified.geojson`) · A05 하천 벡터타일 · B07 드론맵 커버리지 |
| 11–15 | C01 2023 25cm 남원·전주·익산·김제 도엽(`tiles/namwon_ap25_2023/`) → A03 남원 전역 2m | PC Sentinel-2 기간 모자이크 / GIBS HLS 30m | ESA WorldCover(PC 타일러 `…/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=esa-worldcover&item=ESA_WorldCover_10m_2021_v200_N42E072&assets=map&colormap_name=esa-worldcover`) · NDVI(`expression=(B08-B04)/(B08+B04)&asset_as_band=true&rescale=-0.2,0.8&colormap_name=rdylgn`) |
| 15–19+ | A01 남원 AOI 1~2cm · A09 국산리 5cm · B03 본사 3.42cm · C02 용지 1.44cm | PC S2 장면(10m) → Maxar 0.5m(재해 지역 한정) | 결과 압출 · Overture buildings PMTiles(`https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles`, 높이 포함) · EMS 피해 점(사전 수집) |

전환은 `raster-opacity` 줌 보간 + `raster-fade-duration 500`(E0-S ③ 검증). 좌 하단 **출처 칩이 줌마다 바뀌며** 어떤 영상을 보고 있는지 항상 말한다(`V-World 위성 z14` → `LX 2023 항공 25cm` → `LX 드론 2025.06 1.69cm`).

---

## 5. 화면별 설계

### 5.1 XI맵 v2 (`landxi/proto/ximap.html` 재구성 · `CANVAS-FULL`)

```
┌72┬──────────────────────────────────────────────────────────────────┐
│레│ [레이어 패널 360 · 유리]            [HUD 카드 ≤420 · 유리]       │
│일│  ▸ 국내 ◉  글로벌 ○   검색 ⌕        2,098 필지  (124px)          │
│  │  AI 분석 결과 5 · 레이어 12          경작지 1,291 · 비경작지 807  │
│  │  ☑ 남원시 농지이용 2025  ─────────   실측 · 2026.06.08 · 1.69cm  │
│  │  ☐ 비닐하우스 1,674                [분석 실행 ▸] [내보내기]      │
│  │  ☐ 변화 지수 04→10 (456)                                          │
│  │  ─ 정사영상 ────────────                                          │
│  │  ● LX 드론 2025 4시점  ○ 2023 항공 25cm  ○ V-World               │
│  │                                                                   │
│  │            (정사영상 사진 풀블리드 · pitch 35° · 결과 압출)         │
│  │                                                                   │
│  │  [시점 스크러버 60% · 유리]  2025.04 ─●── 06 ── 08 ── 10  ▶     │
│  │   ▁▃▂▅ 변화 히스토그램                     출처 칩 · 좌표 · 축척  │
└──┴──────────────────────────────────────────────────────────────────┘
```
- 좌 레일 72(원본 메뉴 순서) 유지. 마스트헤드 64 는 **영상 무대에서 투명**(제목·기준일은 유리 칩으로 좌 상단).
- 원본 기능 1:1: 비교 3모드(기본/겹쳐/나란히) → **한 축**(스크러버 + 스와이프 토글) · 지역 검색(A11 → 키 갱신 후 V-World `req/search` 프록시) · 탐지 결과 표 3종 · 통계/보고서 서랍(F13 유지) · 레이어 토글·전체 지우기.
- 국내 ◉ / 글로벌 ○ 는 **같은 지도의 카메라 이동**(글로브로 후퇴 2400ms → 비슈케크 하강). 페이지 전환 없음.
- 데이터: 4.8 표 전부.

### 5.2 글로벌 모드 (`GLOBE-STAGE`) — 키르기스스탄 · 미얀마
- **첫 화면**: 순백 배경 글로브(사용자 확정 "지구본 배경 순백 #FFFFFF"), GIBS 어제 영상, LX 사업국 38+1 면 채색 잉크 12 % 틴트, 상단 날짜 스크러버(GIBS 일자), 우측 사업국 목록(Inter). 유휴 = 글로브 자전 아님 — **USGS 지진 점이 1분 폴링으로 도착**(실데이터 유휴 1개).
- **시나리오 A 으슥아타 농지**(`card-global-farm`): geoBoundaries ADM2 `Ysyk-Ata` bbox [74.687, 42.419, 75.183, 43.004], 북쪽 평원 AOI [74.70, 42.75, 75.20, 43.00]. 레이어: PC 월별 모자이크(시계열) · WorldCover cropland 마스크 · NDVI · Esri LULC 2017↔2025(`exportImage&time=`) · Terrarium 힐셰이드. 카드 차트: WorldCover 클래스 비율 **[실측 PC statistics: 초지 40.3 · 농경지 33.0 · 나지 12.6 · 수목 4.8 · 시가화 3.1 %, 비율만 유효]** · 농지 마스크 내 월별 NDVI 곡선(PC statistics, 빌드 시 캐시 `landxi/assets/data/geo/global/ysykata-ndvi-2025.json`). 작물 6종 구분은 **AI 과업(준비 중)** 으로 `gap` 명시.
- **시나리오 B 비슈케크·소쿨룩 시가지 변화**: Overture buildings PMTiles 압출(높이 포함) · Esri LULC built area 2017 vs 2025 · 연속지적도 시범지 3곳 강조.
- **시나리오 C 미얀마 지진 EMSR798**(`card-global-disaster`): AOI11 메이크틸라 [95.824, 20.856, 95.903, 20.918] 피해 점 38 · AOI04 라마잉 283 [실측 EMS]. 스와이프 = Maxar 전후, EMS 점 → Overture 건물 최근접 조인(반경 15m) → 등급 채색. 사전 수집(CORS 없음): `…/backend/EMSR798/AOI11/GRA_PRODUCT/EMSR798_AOI11_GRA_PRODUCT_v1.zip` → `landxi/assets/data/geo/global/mm-meiktila-damage.geojson`.
- 표기: 모든 레이어 `attribution` 필수(EOX · NASA GIBS · Planetary Computer · ESA WorldCover · Overture/OSM · Copernicus EMS · Maxar CC BY-NC).

### 5.3 관리자 관제실 (`OPS-GRID` · `data-stage="ops"`) — 인프라 · 기관 · 배포

관리자 사이트는 **`LX/OPS` 마크 + 전용 입구 + 잉크 반전**(Q3 결정). 화면 6(운영 현황 · 데이터 관리 · 카드 발행 · 생산 · 서비스 관리 · MY, F9 유지)에 **관제 3면**을 생산 관리 탭으로 넣는다(원본 메뉴 추가 없음 — `produce.html?tab=infra|tenants|deploy` 는 이미 있는 탭 자리).

**5.3.1 인프라 관제 (`produce.html?tab=infra`)**
| 타일 | 표현 | 실측 소스 |
|---|---|---|
| GPU 노드 카드(노드 × GPU) | 카드 1장 = 노드. 안에 GPU 행: 이름 · 사용률 스파크라인 60초 · 메모리 링(used/total) · 온도 · 전력. 80 % 초과 앰버 글자, 장애 빨강 | `tools/infra-agent.mjs` 가 2s 마다 `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits`(경로 `C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_f2b06cc19dadc00f\nvidia-smi.exe` [실측 env.md]) → `GET /api/infra/nodes`. 현재 노드 1(A6000 48GB×2), 향후 A100×4×2 는 노드 등록 2건 |
| 작업 대기열 스윔레인 | 행 = 노드/GPU, 가로 = 시간(최근 30분), 블록 = 작업(카드명 · 기관 · 타일 진행). 대기 열은 상단 회색 블록 | `GET /api/queue`(Redis Streams `jobs`, `jobs:running`, `jobs:done`) |
| 모델 배치 매트릭스 | 행 = 모델(B01 5 · B05 · C09 · D11), 열 = 노드. 셀 = 적재됨/미적재/워밍. 클릭 → 적재·해제 | 워커 heartbeat `models.loaded[]` |
| 스토리지 링 | 드라이브별 링(E: 2,085 GB 여유 / D: 363 / C: 124 [실측 env.md]) + 자산 등급별 분량(원본 TB · 타일 GB · 결과 MB) | Node `fs.statfs` + `du` 캐시 |
| 장애 경보 스트립 | 상단 1줄. 조건 = GPU 온도 · 워커 heartbeat 끊김 · 디스크 < 10 % · 큐 대기 > N분. 없으면 `경보 없음 · 마지막 점검 hh:mm` | 에이전트 규칙 |
| 증설 계산 | `infra.js costOfNewRegion()` — **[계산·추정]** 표기 유지, 실측 옆에 따로 둔다 | 현행 |

**5.3.2 기관 저장소·할당 (`produce.html?tab=tenants`)**
- 행 = 기관(`portal.js TENANTS`: 남원 · 광주전남 · 키르기스 준비). 열 = 저장 공간(사용/할당 막대) · GPU 시간(월) · 분석 면적(km²) · 동시 작업 · 초과 정책(대기/차단/과금 표기). 데이터 격리 = 기관 폴더 `E:\Land-XI 플랫폼\02. 데이터\tenants\<id>\` 실측 `du` + 원본은 LX `raw/` 에만(ASSET_TIERS R7). 신설 `landxi/assets/data/quota.js`(할당) → 후속 DB.
- 기관 포털 MY 에 같은 부품(자기 사용량만)을 종이 무대로 재사용.

**5.3.3 모듈형 AI 서비스 배포 제어 (`produce.html?tab=deploy`)**
- **배포 매트릭스**: 행 = 배포본(`DEPLOYS` 7), 열 = 공통 모듈 7 + 전용 모듈 + 모델 버전. 셀 = on/off·버전 고정 핀·갱신 필요 배지(`registry.updateState`).
- **단계 배포**: 새 버전을 배포본 일부에만(체크) → `카나리 1/7` 띠 → 확대 → 전체. **롤백** = 버전 핀 되돌리기 1클릭(계보 띠에 이력 남음).
- **승인 흐름**: 카드 발행 검토 데스크(`admin-publish.html`)에 S2 계보 띠 + **기관 카드 미리보기**(승인 즉시 그 기관 덱에 서는 모습, Q3 ①) + 증거 판(4.1 도착으로 요청 지역 실결과 표시, `publish-map.js`).
- **이식**: `transplantCheck()` 결과를 두 칸(가져갈 것 = 라벨·모델 / 현지 준비 = 영상)으로.
- 관제 무대 레퍼런스: Vantor 컬러웨이 반전(같은 토큰 6개 스왑) · Palantir Blueprint dark(`#1C2127` 슬레이트 램프 · intent 2단) · Linear(밀도 · 키보드 · 명령 팔레트 `⌘K` 는 현행 `.palette` 재사용) · f1-dash/NASA Worldview 텔레메트리(값이 바뀔 때만 움직임).

### 5.4 분석 서비스 (`analysis-ai.html`)
- 진열대(카드)는 종이 무대 `LEDGER` 유지 + 카드마다 **실결과 크롭 1급**(A12 크롭 144장, Roboflow "이미지 1급"). 지자체/글로벌 분기 탭.
- 실행 탭 = **스캔 프레임**(4.2)이 판 위에서 돈다. 진행 오버레이 폐기.
- 완료 탭 = `CANVAS-FULL` 축소판(캔버스 ≥ 60 %) + 4.1 도착.

### 5.5 프로젝트 · 데이터 관리 (LX 양산 라인)
- 라벨링 캔버스: B04 AXIS 정사 2장(익산 1.36cm · 경북 2.95cm) + 라벨 2,662 오버레이, 백엔드 후보 D10 AXIS-Label(FastAPI+SAM2, 실동작). 클래스 고정색 `--det-*`.
- 모델 카드: B01 `results.csv` **실측 학습 곡선**(라이브 차트), PR/F1, 혼동행렬 히트, `val_batch_pred.jpg`.
- 데이터 관리 4탭 = 파이프라인 단계, 커버리지 지도 = B07 드론맵 136,025셀 + C01 도엽 인덱스 + 토지피복 칩 중심점 히트맵.

### 5.6 기관 포털 · 대시보드 · 게스트 · 로그인
- **기관 포털**: 종이 무대 + 기관 CI 한 벌(`brand.js CI_KEYS 9`, `LOCKED` 유지). 지도 탭만 `CANVAS-FULL`. 카드 덱 호버 → 판이 그 배포본 범위로 flyTo(S4 인계).
- **직원 대시보드**: 지도 없음 확정 존중. 큰 숫자 밴드 + 격자 판(elev-1, 셀 점등 S1) + 증거 쌍(A01/A06 실크롭).
- **게스트 메인**: 디오라마 필름(기존, 크레딧 0) → 필름 뒤 '활용 서비스' 카드 호버 시 인계 판 flyTo → 포털 문. 카메라를 끊지 않는다.
- **로그인**: 현행 + 계정 3종 세그먼트 → 고른 계정의 집으로 카메라 착지 240ms. 관리자 입구는 별도(`LX/OPS`).

---

## 6. 컴포넌트 · 파일 · API 목록

### 6.1 신설 파일
| 경로 | 내용 |
|---|---|
| `design/system-v2.md` | 법전 v2(§2 처분표 반영) |
| `landxi/assets/css/v2/tokens-v2.css` | 무대 컬러웨이 · 깊이 · 빛 · 모션 사다리 |
| `landxi/assets/css/v2/fonts-v2.css` | 글로벌판 Inter 600/700 `@font-face` + `html[lang=en]` 스왑 |
| `landxi/assets/fonts/Inter-600.woff2` `Inter-700.woff2` | @fontsource/inter(OFL) 2파일 |
| `landxi/assets/icons-v2.svg` | 44종 헤어라인 스프라이트 |
| `landxi/assets/css/v2/canvas-full.css` `ops-grid.css` `globe-stage.css` | 명명 레이아웃 3 |
| `landxi/assets/js/v2/{arrive,scan-frame,extrude,epoch-scrub,swipe,filament,provenance,lineage}.js` | 빛 문법 8 부품 |
| `landxi/assets/js/v2/glass-panel.js` | elev-2 패널(접힘 48 · 드래그 · 키보드) |
| `landxi/assets/js/v2/ops/{nodes,queue,models,storage,alerts,quota,deploy-matrix}.js` | 관제 7 부품 |
| `landxi/assets/data/quota.js` | 기관 할당(콘티: 할당값은 `[시연]` 표기, 사용량은 `du` 실측) |
| `landxi/assets/data/global.js` | LX 사업국 ISO3 39 · 키르기스 bbox · EMSR798 AOI · 공개 URL 빌더 한 곳 |
| `landxi/assets/data/geo/global/{kgz-adm1,kgz-adm2,ysykata-landcover,ysykata-ndvi-2025,mm-meiktila-damage,lx-countries}.json` | 빌드 시 사전 수집 |
| `tools/infra-agent.mjs` | nvidia-smi · statfs 폴링 → `/api/infra/*` |
| `tools/serve.mjs` → `server/index.mjs` | `/api/jobs` `/api/jobs/:id/events`(SSE) `/api/queue` `/api/infra/nodes` `/api/tenants/:id/usage` `/api/vworld/*`(프록시·캐시) · PMTiles Range 206 |
| `workers/infer.py` | 큐 소비 · 타일 추론 · `tile.done` 이벤트 · GeoJSON → `ogr2ogr -f PMTiles` |
| `tools/build-global.mjs` | geoBoundaries · EMS ZIP · PC statistics 사전 수집 |

### 6.2 전처리(ASSET-LEDGER §5.3 P1~P12 그대로 + 글로벌 3건)
P3 남원 25cm 도엽 타일 · P4 C09 남원 전역 4클래스 추론 · P5 B09 토지피복 GT 모자이크 · P6 B01 모델 카드 자산 · P8 C04 필지 PMTiles(V-World 키 없이 필지 카드) · P9 V-World 키 갱신 + 프록시 · P11 Terrarium z14–15 미러 · P12 벤더링(deck 9.3.10 · three 0.185.1 · pmtiles 4.x · gsap 3.15 · lenis 1.3.26) · **G1** geoBoundaries KGZ · **G2** EMSR798 AOI11/AOI04 ZIP → GeoJSON · **G3** PC statistics 캐시. B03 본사 3D(OBJ→GLB `obj2gltf`)는 2단계.

---

## 7. 판정 — 세 사용자 관점 + 동작 영상

법전 체크리스트 통과 ≠ 합격(사용자 8차). 판정은 **동작 영상**(Playwright `recordVideo` webm, 크레딧 0)을 `SendUserFile` 로 보내고 아래 루브릭으로 본다.

| 관점 | 첫 5초 | 손을 대면 | 끝나는가 |
|---|---|---|---|
| **지자체 공무원** | 내 지역 정사영상이 **사진처럼** 선명하게 뜨고 결과가 도착한다 | 필지를 누르면 `pnu · 읍면동 · 면적 · 신뢰도`와 출처가 유리 카드로 | 결과 → 표 → 보고서 발급이 **3클릭** 안 |
| **일반 시민(게스트)** | 필름 → 판 → 같은 카메라로 우리 동네까지 내려온다(컷 없음) | 시점을 끌면 계절이 바뀌고 변화가 스스로 멈춘다 | "AI 가 무엇을 봤는지"가 숫자 아닌 **빛**으로 읽힌다 |
| **LX 직원** | 분석 실행을 누르면 **진행이 실측**(타일·GPU 노드·경과)으로 판 위에서 돈다 | 모델 카드의 학습 곡선이 `results.csv` 실측, 계보 띠로 어느 기관에 깔렸는지 | 관제실에서 GPU·큐·쿼터·배포를 한 화면에서 제어 |
| 공통 | 정지 화면 어느 프레임을 잘라도 "잘 만든 제품 스크린샷"인가(Craft) | 콘솔 오류 0 · p95 ≤ 20ms · 14px 미만 0 | 지어낸 수치 0 · 모든 숫자에 프로비넌스 |

**실행 순서(한 화면을 운영 수준으로 끝까지 → 영상 → 확산)**
1. **주 1**: `tokens-v2` · `system-v2.md` · `CANVAS-FULL` · XI맵 남원 모드(A01·A02·A03·A04·A08·A13) — 4.1 도착 + 4.3 압출 + 4.4 스크럽 + 4.5 스와이프 + 4.7 프로비넌스. 영상 1편(60s) 판정.
2. **주 2**: 4.2 스캔 프레임(서버·큐·워커 1노드, B01 모델 실추론 on A01) + 분석 서비스 실행 탭. 영상.
3. **주 3**: Ops 컬러웨이 + 관제 3면(nvidia-smi 실측) + 검토 데스크 계보·미리보기. 영상.
4. **주 4**: 글로벌 모드(글로브 · 키르기스 A/B · 미얀마 C, 사전 수집 G1~G3) + 글로벌판 타이포. 영상.
5. **주 5~**: 포털·대시보드·프로젝트·데이터 관리에 부품 확산. 아이콘 v2 교체.

---

## 8. 리스크 · 미확정 (지어내지 않는다)

- **V-World 키 만료(E01)** — 연속지적·검색·현행 경계는 키 갱신 전까지 C04 필지 PMTiles 와 A11 로컬 경계로 대체. 프록시 `serve.mjs /api/vworld/*` 선행.
- **EOX 2018~2025 비상업(CC BY-NC-SA)** — 수출용 배포본은 2017판 또는 GIBS/PC 로 자동 스왑(`global.js` 한 곳).
- **Maxar Open Data CC BY-NC** — 시연 한정, 유상 서비스 제외 표기.
- **ESA WorldCover Terrascope 는 이 PC 네트워크에서 차단** — PC 타일러 경로만 사용.
- **지형 성능 절벽**(SwiftShader 2.4fps) — 장면 단위 ON, iGPU 티어 강등 규칙(`stack.md` §6) 필요. 사무용 노트북 실측 미완.
- **`serve.mjs` Range 206 · deck UMD h3-js 포함 여부 · tippecanoe/pmtiles CLI 미설치** — P1·P12 에서 확인.
- **A08 건물 높이는 추정** — 화면에 `[추정]` 상시. V-World `LT_C_SPBD` 층수는 Data API 유형 추가 신청 후.
- **인파관리(`nw-crowd-27`) · 도로안전 좌표 결과 없음** — 갤러리·모델 카드만, 지도 결과는 `준비 중`.
- **미얀마어 서체 미정** · **키르기스 작물 6종 분류는 공개 데이터로 불가**(AI 과업 `gap`).
- **Paperlogy 라틴 품질 판단은 내 심미 판단**이지 실측이 아니다 — 글로벌판 Inter 전환은 `landxi/proto/fonts.html` 방식으로 나란히 렌더해 사용자 승인 뒤 확정.
- 관제 화면의 **할당(쿼터) 값**은 정책이 없어 `[시연]` — 사용량만 실측. 정책 확정은 발주자 몫.
