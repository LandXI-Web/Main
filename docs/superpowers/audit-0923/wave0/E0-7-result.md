# E0-7 결과 — 데이터 관리: 셸 이관 · 내려받기 실파일 · 파괴 동작 확인+되돌리기 · 타일 키보드 · 정직성

## ① 한 줄 결과

데이터 관리가 공용 셸(`mountShell`)로 옮겨졌다. 레일은 roles.js만 읽는다(관리자 6, 직원 7). 내려받기는 실제 파일을 떨어뜨린다. 토스트만 띄우던 6곳은 실제로 동작하거나 `disabled`와 이유 한 줄로 바뀌었다. 삭제 · 업로드 취소 · 발행 취소는 확인을 거쳐 실행되고 8초 동안 되돌릴 수 있다. 타일은 `<button>`이 되어 Tab으로 6/6 닿는다. 모달은 셸 포커스 가둠을 쓴다. `proto-dataset.spec.mjs`는 **22/22 녹색**이다(test 선언 16 + 3 = 19, 단계 루프가 4번 돌아 실행 22).

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | admin/staff 레일 = roles.js · 자체 레일 · 자체 logout 코드 0 | `dataset.js:36-47` `mountShell({ active:'media', … })`. 자체 `NAV` · `NAV_FOOT` · `ICON` · `railSvg` · `railItem` · `#rail` 핸들러 · 자체 logout · 자체 `say/openModal/closeModal` · `db-data.js`의 `NOTICE/T1` import를 모두 지웠다. `T1`(2026-06-08)과 셸 `AS_OF`가 같은 값임을 확인했다. `dataset.html`에서 `#rail` · `#mast` · `#foot` · `#scrim` · `#say` · 인라인 관문을 걷어 냈고 `shell-gate.js`만 남겼다. e2e `레일 · 마스트헤드(공용 셸)`는 staff 7항목을 `railFromRoles()`(roles.js `onRail` + 셸 `NAV`)와 대조한다. 소스에 `NAV_FOOT` · `railItem` · `removeItem('lx_logged_in')`가 0건임도 단언한다. e2e `LX 관리자 레일`은 admin 6항목을 대조하고, 레일 항목을 전부 열어도 `denied=` 0건이다. 감사 사본 `results.json roles`: admin 6 · staff 7 · `deniedFromRail: []` |
| 2 | 내려받기 → download 1건 | `dataset.js` `download(d)`. 정사영상(d1 · d2 · d4 · d5)은 `downloadNote('<이름>.txt')`로 영상 id · 촬영 · GSD · 범위 · 타일 경로와 '원본 정사영상은 LX 가 보관합니다 — 타일 열람만 제공'을 준다. 결과 GeoJSON이 있는 표 · SHP(d3 · d7)는 `downloadFile(sc.geo)`로 그 GeoJSON 원본을 준다. 나머지(d6 · d8)는 '원본 파일이 없습니다(시연)' 메모다. e2e `내려받기 = 실제 파일`: d4 → `NW_ortho_202604_section_A.txt`(내용 단언) · d7 → `namwon-greenhouse-2025.geojson`(FeatureCollection · 피처 > 0) · d8 → `camera_org_202604.txt`. 감사 사본: `download.file: "NW_ortho_202604_section_A.txt"` |
| 3 | 토스트 전용 6곳 → 실동작 또는 disabled + 이유 | `:888 내려받기` → 실파일(위 2). `:889 필지에 붙이기` → `joinTable()` 모달: 결과 GeoJSON의 pnu 19자리를 맞춰 **2,098 / 2,098 필지** 결합 표 8행을 보인다. 붙이면 `결합 해제` 토글이 되고 기본 정보에 `필지 결합` 행이 선다. PNU가 없으면 `disabled` + '준비 중 · 이 결과에는 PNU 속성이 없습니다'. `:890 풀기` → 로컬 상태 토글(`풀린 항목 · 3 · 이 화면에서만` ↔ `다시 묶기`). `:565 원본 다시 올리기` → `?tab=upload`로 이동하고 같은 파일의 업로드 건(u4)을 선택하고 포커스한다. `:566 필지 연결 안내` → 셸 `openModal` 안내문(필요 3가지). 이어서 `업로드 완료에서 붙이기 ›`를 누르면 d3가 선택된다. `:620 공간 편집` → `disabled` + `#acts-why` '준비 중 · 지도 편집은 분석 서비스 완료 탭에서'. e2e 단언: 발행중 테스트(URL · 선택 · 포커스 변화), 내려받기 테스트(라벨 · DOM 변화), 아카이브 상세 테스트(`toBeDisabled` + 이유 텍스트) |
| 4 | 삭제 · 업로드 취소 · 발행 취소 = confirmDialog + 되돌리기 8초 | `dataset.js` `destroy()`는 셸 `confirmDialog({ danger:true, cancelLabel:'그대로 두기' })` → 실행 → `offerUndo()` 순서로 돈다. 토스트는 `say(msg, 8000)`이다. 셸 `say`가 버튼을 못 받으므로 `#say` 오른쪽에 `#ds-undo`를 붙여 세웠다. 레이아웃 상자로 자리를 잡고, 포커스가 비면 거기로 옮긴다. 8초가 지나거나 토스트 문구가 바뀌면 내려간다. e2e: 업로드 취소(그대로 두기 → 남음, 확인 → 사라짐, 되돌리기 → 제자리 u1..u6, 8.3초 뒤 되돌리기 사라짐) · 발행 취소(되돌리기 → KPI 7 복원) · 아카이브 삭제(Esc = 그대로, 확인 → 4건, Enter로 되돌리기 → a1..a5 순서 복원). 감사 사본 `deleteConfirm: { modalVisible:true, tilesWhileAsking:"5 → 5", tiles:"5 → 4", undo:true }` · `upCancelConfirm:true` |
| 5 | 타일 button 6/6 Tab · 모달 트랩 | `thBtn()` → `<button type="button" class="th" data-open aria-pressed aria-label>`(4단계 공용). 안쪽 `div.rv-top`은 `span`으로 바꿨다. 다시 그린 뒤에도 포커스는 그 타일에 남는다. e2e `아카이브 삭제 = …`: `#drop`에서 Tab을 누르면 u1..u6 6/6에 닿는다. 전부 `BUTTON` · `tabIndex 0`이다. Enter로 열리고 포커스가 남으며, Space로 닫힌다. 공유 모달에서 Tab 12회 동안 `.modal` 밖으로 나가지 않는다. Esc를 누르면 부른 버튼으로 포커스가 돌아온다. 디스크 증량 모달은 Tab/Shift+Tab 14회를 가두고, 제출하거나 Esc를 누르면 `#quota-open`으로 돌아온다. 단계 테스트 4개는 `button.th[data-open]` 수 = 건수를 단언한다 |
| 6 | 정직성 | 도엽: `sheetNote()`가 d4 기본 정보 `도엽` 행과 판 캡션에 '파일 2026-04 · 실측 도엽 2025.04 대체 표시'를 적는다. d5 · a1 · a2도 같은 규칙이다(아카이브 판 캡션). 시드 담당자명: `ds-data.js`의 `by` · 발행 이력 등록자 25곳을 모두 `LX 직원`으로 바꿨다(`ds-data.js:24` 주석). e2e는 `등록자 = LX 직원`과 발행 이력 `.by` 3건 = `LX 직원`을 단언한다. 용량: 새 업로드는 실측 `fileBytes` → `fmtBytes`(2048 B → `2.0 KB`)다. e2e는 현황판에 `2.0 KB`를 단언한다. 공유 모달: 원본 정사영상(a1 · a2)의 기관 `편집` 세그먼트는 `disabled`이고 `#ms-lock` '원본 정사영상은 LX 보관 — 뷰어는 타일 열람'이 붙는다. 같은 규칙을 발행 폼(TIF · ECW 완료본)에도 적용했다(`#pf-lock`) |
| 7 | spec 16 + 3 녹색 · 26-share-modal 재촬영 | `npx playwright test tests/e2e/proto-dataset.spec.mjs --reporter=line` → **`Running 22 tests using 1 worker … 22 passed (1.5m)`**. 추가 3건: `LX 관리자 레일 = roles.js 6항목…` · `내려받기 = 실제 파일…` · `아카이브 삭제 = 확인 대화 → … 모달 포커스 가둠`. 재촬영: `shots/w0/E0-7/audit.mjs`(감사 스크립트 사본, 확인 대화를 누르는 3줄만 보탬) → `shots/w0/E0-7/26-share-modal.png` + 감사 전 컷 + `results.json` |

스크린샷(`shots/w0/E0-7/`, `.gitignore`의 `shots/` 대상이라 git status에는 안 뜬다):
- `01-ds-staff-{1440,1280}.png` — 직원 레일 7 · 완료 d4 · 도엽 대체 표시 · 등록자 LX 직원
- `02-ds-admin-{1440,1280}.png` — 관리자 레일 6 · 아카이브 a1
- `03-confirm-delete-{1440,1280}.png` · `04-undo-toast-{1440,1280}.png` · `05-undo-restored-{1440,1280}.png`
- `04-undo-frame-00..09.png` — 되돌리기 진입 운동 스트립(60ms 간격). 앞 4장은 서로 다르고 뒤 6장은 정지다(셸 `say-in` 500ms 재사용)
- `06-join-table-*` · `07-join-guide-*` · `26-share-modal-{1440,1280}.png`(셸 모달 · 기관 편집 잠금)
- 감사 사본 산출: `01-overview-1440.png` … `52-manage-pubform-390x844.png` · `results.json`

## ③ git diff --stat (소유 파일만. 작업 트리의 다른 변경은 병렬 에픽 몫이다)

```
 landxi/proto/dataset.css         | 142 +++++++-------
 landxi/proto/dataset.html        |  77 +++-----
 landxi/proto/dataset.js          | 391 +++++++++++++++++++++++++++------------
 landxi/proto/ds-data.js          |  52 +++---
 tests/e2e/proto-dataset.spec.mjs | 321 +++++++++++++++++++++++++++++---
 5 files changed, 686 insertions(+), 297 deletions(-)
```
`ds-plate.js` · `ds-thumbs.js`는 건드리지 않았다. 새 파일: `shots/w0/E0-7/**` · 이 문서.

## ④ 소유 밖 요청

1. **`landxi/proto/shell.js` `say()`**(E0-1 · 셸 소유): `say(msg, ms, { action: { label, onClick } })`처럼 토스트 안 버튼을 받게 해 달라. 그러면 `dataset.js`의 `#ds-undo`(토스트 옆에 붙여 세운 자체 버튼, `undoBtn/offerUndo/dropUndo`)를 지우고 셸 하나로 통일할 수 있다. 다른 화면의 되돌리기도 같은 부품을 쓰게 된다.
2. **`landxi/proto/parts.css:36,44,55-71,108,112,139,237`**(셸 소유): `.lx .acts` · `.lx .st` · `.lx .tile` · `.lx .cnt` · `.lx .chips` · `.lx .empty`는 이름이 너무 일반적이다. 셸을 싣는 화면의 같은 이름 클래스를 덮는다. 데이터 관리 타일이 KPI 타일 여백 · 세로선을 받아 좁아졌던 것이 그 예다. `dataset.css`에서 `.lx` 접두로 되돌려 막았다. 부품 쪽을 `.band > .tile` 식으로 한정해 달라. 같은 이유로 `shell.css:26` `.lx button` 리셋(0,1,1)도 클래스 하나짜리 규칙을 이긴다. `dataset.css` 끝의 '셸 이관 보정' 블록은 그 때문에 있다.
3. **E1-7**(자산 등급 표): 공유 모달 · 발행 폼의 정사영상 기관 `편집` 잠금은 `isOrtho()` + `ORTHO_LOCK` 한 칸만 막은 임시 조치다. `ASSET_TIERS`가 서면 그 선언으로 바꾼다.
4. **셸 `logout()`**(E0-1): 이 화면에는 이제 자체 로그아웃이 없다. `lx_role` · `lx_tenant_session` 잔존(C-09)은 셸 `logout()` 쪽에서 닫혀야 한다. 테스트 시점의 작업 트리 `shell.js`는 E0-1이 수정하는 중이었다.

## ⑤ 남은 것 · 알려진 결손

- 파괴 동작의 결과와 되돌리기는 **이 페이지 메모리 상태**다. 새로고침하면 시드로 돌아간다(감사 F2). 저장소 키 신설은 금지(E0-1 `storage-keys.js`)이고, 상태 기계 · `lx_ds_state`는 E1-7 몫이다.
- `필지에 붙이기`의 결합 상대는 xlsx 원본이 아니라 같은 속성의 결과 GeoJSON(`namwon-farmland-2025`)이다. 모달 · 토스트 · 내려받기 문구가 '표 원본 = 목업 시드(시연)'라고 밝힌다. d3 내려받기도 xlsx가 아니라 그 GeoJSON을 준다.
- `+ 기관 추가`(발행 폼의 글자뿐인 줄, 감사 §4)는 동작이 없어서 지웠다. 기관 추가 기능은 E1-7 자산 등급과 함께 다시 세운다.
- 잠긴 `편집` 세그먼트는 `line-through`가 계산되지만 14px 회색 한글에서는 거의 안 보인다. 판독은 `disabled` + 이유 줄에 기댄다.
- SHP 좌표계 없음 타일(d6 · u5)의 액자 글자 겹침, 390 폭 붕괴(F7), 판 크기(F11), 업로드 99→62 루프(F1)는 이 에픽 범위 밖이라 그대로다.
- 작업 지시문의 경로(`shots/wave0/E0-7/`, `E0-7-report.md`)와 브리프의 `new_files_allowed`(`shots/w0/E0-7/**`, `E0-7-result.md`)가 달랐다. 허용 경로를 따랐다.
