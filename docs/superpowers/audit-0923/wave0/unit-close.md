# unit 마감 — 고아 `tests/unit/cells.test.mjs` 정리

## ① 한 줄 결과

`tests/unit/cells.test.mjs` 는 E0-6 이 삭제한 고아 초안(`landxi/proto/dashboard-128/db-data.js`)을 import 하는
26건짜리 죽은 테스트였다(E0-6-result.md ④-1 이 E0-3 에 넘긴 요청). 그 파일이 검증하던 셀 집계 로직은
`landxi/proto/db-cells.js`(현행 판 모듈)로 이미 살아 있고, 그 로직은 `tests/unit/dashboard-cells.test.mjs` 가
전부 커버하고 있어 옮길 테스트가 없었다 — 그래서 **파일만 삭제**했다(`git rm` 안 함, 마감 단계 커밋 전까지 워킹트리 삭제만).
`npm run test:unit` 이 `skip 27` → **`skip 1`**(labeled: `results.test.mjs:184`, `shots/results/` 미생성 조건부)로 떨어졌다.

## ② 조사 — 왜 삭제가 맞았나(옮기지 않은 이유)

`cells.test.mjs` 가 부르던 API(`cellsOfBBox` · `cellsFor` · `gradeOf` · `legendFor` · `calloutFor` ·
`baseFootprints` · `jejuFootprint` · `PLANNED_SERVICES` · `PLATE_BOUNDS=[119.536,33.0,135.964,38.9]` ·
`GRID={w:124,s:33,e:131,n:39}`)는 고아 12.8 초안 전용 설계였다.

현행 `db-cells.js` 는 함수명 · 그리드 정의 모두 다르다(`buildCells` · `gradeResult` · `gradeTrain` ·
`fitProjector` · `gridLines` · `cellRect` · `PLATE_BOUNDS=[125.0,33.0,130.2,38.7]`). 두 모듈은 **같은 개념(0.25°
셀 집계)의 서로 다른 세대 구현**이지 같은 API 의 이관이 아니다 — 옮겨 붙일 대응 함수가 없다.

`db-cells.js` 의 현재 동작(`buildCells` 결과 셀 · `gradeResult`/`gradeTrain` 등급 · `fitProjector`/`gridLines`/
`cellRect` 투영)은 이미 `tests/unit/dashboard-cells.test.mjs`(6건, 전부 pass)가 실자산 데이터
(`results.js` · `change.js` · `imagery.js` · `services.js`)로 검증하고 있다. 저장소 전수 검색
(`grep -rn "dashboard-128\|cellsOfBBox\|calloutFor\|legendFor\|PLANNED_SERVICES\|jejuFootprint\|baseFootprints"`)
결과 살아있는 소스는 0 — 전부 감사 문서(`shell-dash.md` · `integrity.md` · `MASTER-PLAN.md` 등)의 역사적 언급과
`cells.test.mjs` 자신뿐이었다. → **완전히 죽은 코드**로 판정, 이관할 곳 없이 파일만 삭제.

## ③ 변경

| 파일 | 조치 |
|---|---|
| `tests/unit/cells.test.mjs` | 삭제(워킹트리 삭제만, `git rm` 아님) |

다른 파일은 손대지 않았다.

## ④ 증거

- `npm run test:unit`(삭제 전): `tests 115 · pass 88 · fail 0 · skipped 27`(26건 = cells.test.mjs 고아 skip · 1건 =
  `results.test.mjs:184` 라벨 skip).
- `npm run test:unit`(삭제 후, `shots/w0/unit/test-unit-output.txt`): `tests 89 · pass 88 · fail 0 · skipped 1`.
  남은 skip 1건은 `tests/unit/results.test.mjs:184`(`{ skip: !fs.existsSync('shots/results') && 'shots/ 미생성' }`) —
  로컬 산출물 조건부 skip, E0-3 완료 기준 2의 "skip 1 의 파일:줄 + 사유"와 일치.
- `node --test tests/unit/dashboard-cells.test.mjs`(`shots/w0/unit/dashboard-cells-output.txt`): **6/6 pass** — 현행
  셀 집계(`db-cells.js`)가 멀쩡함을 확인(이 파일을 건드리지 않았으므로 당연하지만, 관련 spec 으로 재확인).
- `npx playwright test tests/e2e/proto-dashboard.spec.mjs --reporter=line`(`shots/w0/unit/proto-dashboard-e2e-output.txt`):
  **27 passed** — 대시보드 판(`db-cells.js` 소비처)이 화면에서도 정상.
- 스크린샷 `shots/w0/unit/01-dashboard-db-cells-live.jpg` — staff 세션으로 `dashboard.html` 을 열어 판(0.25° 셀 히트맵)이
  실좌표로 그려짐을 확인(남원 2셀 · 여수 1셀 렌더).
- 저장소 전수 grep — 삭제한 API/경로에 대한 살아있는 참조 0(감사 문서의 역사적 언급 제외).

## ⑤ 완료 기준 대조

- `npm run test:unit` skip ≤ 1 — **충족**(skip 1, 라벨 있음).
- 관련 spec 재실행 녹색 — **충족**(`dashboard-cells.test.mjs` 6/6, `proto-dashboard.spec.mjs` 27/27).
- 커밋/리셋/스태시 없음 — 준수(파일 삭제만, git 조작 없음).
