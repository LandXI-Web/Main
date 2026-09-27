# ops-core 보고 — 관리자 집(현황 + 결재함) · 2차(판정 불합격 1차 해결) · 2026-09-27

명세 §2.11 그대로. 소유 `landxi/v3/ops-core/**` 만 수정. 커밋 없음. 정문(`/landxi/v3/login/` 폼 · `LX 관리자` · `lx-admin`)으로만 진입해 확인.

## 판정 1차 불합격 3건 — 처리
| # | 지적 | 처리 | 실측 |
|---|---|---|---|
| 1 | 지도 판 V=141 (슬레이트 회색) | `js/map.js` 베일 `oc-veil` #F7F8FA 불투명도 **.42 → .70** (데이터 층 아래 · 잉크 점·흰 라벨 대비 유지) | 지도 영역 평균 V(카드·토글·범례·점 제외, HSV max): **1440 = 191.7** (p10 186 · 화면 75%) · **390 = 191.4** (p10 185 · 화면 57%). 1차 동일 조건 재계측 138.2 → 191.7. 스크린샷 `ops-core-1440-overview.png` · `ops-core-390-overview.png`, 계측 원본 `_tools/measure-{1440,390}.{png,json}` + `measure.mjs`/`measure.py` |
| 2 | 역할 칩 `LX 관리자 · LX 관리자` | **로컬 폴백**(`js/app.js`): 셸 렌더 뒤 칩의 역할 문구(`b`)와 이름이 같으면 역할 문구 한 번만 남김 → `LX 관리자`(1440·390 모두). 키트 고침은 통합 단계 필수(아래 키트 요청 1) | 1440·390 마스트 `LX 관리자` 1회 |
| 3 | 단계 어휘 불일치(시트 `→ 검증` · 지도는 `시범` 농도) | **※ 검증 전용 농도 1단 추가**: `shadow` = `검증` = `--mute` 채움 + `--sub` 속 테두리. 범례 `운영 · 시범 · 검증 · 이식 요청`(§2.12 단계 4종 중 지도에 오는 3 + 이식 요청). 점 매핑 `ga 운영 · canary 시범 · shadow 검증 · 결재 전 이식 = 속 빈 고리` | 승인 뒤 비슈케크 점이 고리 → `검증` 농도로 바뀌고 범례와 일치(`ops-core-1440-after-approve.png`) |

※ **사용자가 뒤집을 수 있는 항목**: 명세 §2.11 범례 문구는 `운영` `시범` `이식 요청` 3개다. 이번에 `검증` 1개를 더했다(판정 권고 두 안 중 '검증 전용 농도'). 3개 유지가 좋으면 범례를 `운영 · 시범·검증 · 이식 요청`으로 묶고 `verify` 농도를 `pilot` 과 같게 하면 된다(`ops-core.css` 2줄 · `app.js` 범례 1줄).

## 서버 S-9 · S-3 도착 — 어댑터 → 서버 결재로 전환
2차 작업 중 게이트웨이에 `GET/POST /approvals` · `POST /approvals/{id}/decide` · `GET /regions` · `GET /events/ops` 가 생겼다(openapi 확인). 화면은 openapi 로 경로 유무를 보고 자동 전환하는데, 1차의 `fromServer` 가 실제 모양과 달라 `배포 승인 · —` 로 비는 것을 발견해 고쳤다.
- 모양 `{id, kind: deploy|deploy_ga|rule|quota, subject{id}, title, requested_by, at, payload}` → 종류 `deploy`+`payload.action=port` = `이식` · `deploy_ga`/`deploy` = `배포 승인` · `rule` = `규칙 임계` · `quota` = `쿼터 변경`.
- `바뀌는 것`: 이식 `지역 {원} → {새}` · `서비스` · `단계 초안 → 검증` / 배포 승인 `단계 시범 → 운영` · `버전` / 쿼터 `항목` · `소프트`·`하드 {현재} → {요청}` / 규칙 `임계`.
- `요청자`: 사용자 id 는 화면에 내지 않고 `LX 관리자`·`LX 직원`·`LX 영업`(쿼터 = 기관 이름), 모르면 `—`.
- 결정 = `POST /approvals/{id}/decide`(서버가 효과·`deploy.changed`/`approval.decided` 이벤트 발행). 이식 승인은 서버 효과가 '심기 확정(draft 유지)'이라 시트 약속대로 `rollout → shadow(검증)` 한 번 더(실패 시 ?dev=1 서랍 기록만). 배포 승인은 `rollout → ga` 시도.
- 결재 대기 수 = 서버 목록(시험 배포본 제외) 한 곳 → 큰 숫자·레일 배지·표가 같은 수(현재 서버 `pending` 봉투와 일치: 3 → 승인 후 2).
- SSE `/events/ops` 구독에 `approval.requested` `approval.decided` 추가.

## 합격선 실측 (K16 `scan()` · 정문 로그인 후 · 콘솔 error 0)
| 뷰 | 1440 글자 | 버튼 | 금지어 | 390 글자 | 버튼 | 금지어 |
|---|---|---|---|---|---|---|
| 현황 | 96 | 3 | 0 | 85 | 3 | 0 |
| 결재함 | 134 | 3 | 0 | 117 | 3 | 0 |
| 결재함 + 시트 | 202 | 6 | 0 | 185 | 6 | 0 |
지역 하드코딩 0(`namwon`/`남원` grep 0).

## 장면(영상 16.6s · 1440×900) `ops-core-scene.mp4`
정문 로그인 → 현황(국내) → `해외` 글로브 → `결재함 열기` → `이식 · 키르기스스탄 비슈케크 농지 이용 실태 분석`(바뀌는 것: 단계 초안 → 검증 · `ops-core-1440-sheet-port.png`) → `승인` → 토스트 `승인했습니다` → `현황` 에서 비슈케크 고리가 `검증` 농도로 차오르고 결재 대기 3 → 2.

## 데이터 변경(정직 항목)
- 장면용 이식 요청 1건을 서버에 실제로 만들었다: `dp-kgz-agri-farm-26` → LX · `kgz-bishkek`(`dp-lx-global-farm-26`), 영상에서 승인되어 지금 `shadow`. 1차의 `dp-lx-farm-26`(익산 · shadow)도 그대로. 필요 없으면 통합 단계에서 정리.
- 참고: 실행 중 서버의 `POST /deploys` 는 아직 `region_profile` 필수(시군구 코드만으로는 거절) — 소스(`deploys.py`)의 `region` 경로와 다르다. 서버 재기동이 필요할 수 있음(서버 팀).
- 해외 글로브에서 비슈케크 점이 가까운 으슥아타(시범) 점과 겹친다(좌표상 40km). 줌 2 에서 한 점처럼 보임 — 겹침 처리는 키트 K3 몫으로 제안.

## 키트 요청 (통합 단계 필수)
1. **`kit/shell.js` `roleText`** — 이름이 역할 문구와 같으면 한 번만(`LX 관리자`). 또는 시드 `lx-admin` 이름을 실명형으로. 화면 쪽 폴백은 키트가 고쳐지면 무해(조건 불일치 시 아무것도 안 함).
2. `kit/lint/forbidden.mjs` `frontDoor()` — 로그인 입력 선택자가 현재 정문(`input[name=username]`)과 다르고, 관리자 라디오는 라벨(`label.seg__c`) 클릭이어야 함. 이 화면 도구는 자체 선택자로 처리.
3. `maplibre-gl.css` 를 `kit.css` 뒤에 실으면 지도 높이 0 — README 에 순서 명시 또는 `.k-stage .k-stage-map` 특이성 상향.
4. `ops` 모드 바탕 밝기: 관제 외 화면도 같은 기준(V ≥ 185)이면 베일을 K3 `mode('ops')` 에 넣는 게 낫다(지금은 화면이 직접 올림).

## 파일
- 화면: `landxi/v3/ops-core/index.html` · `ops-core.css` · `js/app.js` · `js/data.js` · `js/map.js`
- 증거: `shots/final/ops-core/` — `ops-core-1440-{overview,abroad,inbox,sheet,sheet-port,after-approve}.png` · `ops-core-390-{overview,abroad,inbox,sheet}.png` · `ops-core-scene.{mp4,webm}` · 도구 `_tools/{check,record,measure}.mjs` `measure.py`
