# E0-3 결과 — 테스트 픽스처 정본 · 남는 스펙(project · support · smoke) 역할 갱신 · unit 정직화

## ① 한 줄 결과

`tests/e2e/_roles.mjs` 정본을 만들고, `proto-project` · `proto-support` · `smoke` 세 스펙의 `boot()` 를
역할(`lx_role`)을 심는 `bootAs()` 로 바꿔 위계 원인군(§2.4)을 닫았다. `data.test.mjs:180` 의 5종
기대값을 `2fe8969` 가 정직화한 `real:true` 3종(`farmland`·`greenhouse`·`marine`)으로 낮췄고,
같은 커밋이 놓친 marine count(38,057→3,938) 단언도 같이 고쳤다. 화면(`landxi/**`) 은 한 글자도
건드리지 않았다. 세 스펙 125건 중 123건 녹색 · 2건 `test.fixme`(둘 다 사유에 에픽 ID) · 실패 0.
unit 115건 중 114 pass · fail 0 · skip 1(라벨 있음, 다른 파일).

## ② 완료 기준별 증거

**1. 세 스펙 실패 0(또는 fixme 사유에 에픽 ID)**

```
$ npx playwright test tests/e2e/proto-project.spec.mjs tests/e2e/proto-support.spec.mjs tests/e2e/smoke.spec.mjs --reporter=line
...
  2 skipped
  123 passed (59.4s)
```

- `proto-project.spec.mjs`: 79→81건 중 79 pass · 2 fixme · 0 fail(경로 재확인 두 번, 마지막 실행 동일).
- `proto-support.spec.mjs`: 41 pass · 0 fail.
- `smoke.spec.mjs`: 3 pass · 0 fail.
- fixme 2건(둘 다 사유 문자열에 에픽 ID 포함):
  - `tests/e2e/proto-project.spec.mjs:634` — `카드 발행 요청 → 학습 결과 픽커 → admin-publish.html 로 실제로 이동 — E0-8 착지 변경 대기(자기 요청 이력)`. 근거: `docs/superpowers/audit-0923/wave0/E0-8.md` 2단계가 `project-deploy.js:152` 의 착지를 `admin-publish.html` 에서 `ai-project.html?pid=<pid>&tab=deploy&req=<id>`(자기 요청 이력)로 바꾼다 — 직원은 애초에 `admin-publish.html` 관문을 통과 못 한다(E0-1 §7.2). 브리프 지시(단계 2) 그대로 처리.
  - `tests/e2e/proto-project.spec.mjs:449` — `라벨 행 삭제 · 클래스 일괄 변경 모달이 실제로 목록을 바꾼다 — E1-5 project-label.js 페이지네이션 재계산 회귀`. 역할 픽스처와 무관한 **화면 회귀**(격리 실행으로 재현 확인 — `npx playwright test ... -g "라벨 행 삭제" --workers=1` 도 같은 실패). `project-label.js drawRows()`(project-label.js:99)가 삭제 클릭마다 `#lab-rows` 의 `clientHeight` 를 다시 재 페이지당 행수(`per`)를 바꾸는 바람에, 삭제 전 10행 → 삭제 후 11행(총량은 줄었는데 한 페이지에 더 많이 찬다)이 관측됐다. `project-label.js` 는 §8 W0 무주(수정 금지) — MASTER-PLAN §2 E1-5 완료 기준에 "`proto-project.spec.mjs` 57건 녹색 + 8건 추가"가 명시돼 있어 E1-5 를 사유로 적었다.

**2. `npm run test:unit` fail 0 · skip 1 의 파일:줄 + 사유**

```
$ npm run test:unit
...
# tests 115
# pass 114
# fail 0
# skipped 1
```

(이 결과는 내가 `data.test.mjs` 를 고친 직후 저장소 전체가 아직 조용할 때 잡은 값이다. **주의**:
Wave 0 은 9개 에픽이 **같은 작업 트리**에서 동시에 도는 구조라, 그 뒤 E0-6 이 자기 브리프대로
`landxi/proto/dashboard-128/` 폴더를 지우는 동안(작업 중 시점에 이 문서를 쓰고 있다) 내
소유가 아닌 `tests/unit/cells.test.mjs`(`import ... from 'landxi/proto/dashboard-128/db-data.js'`)가
일시적으로 모듈을 못 찾아 `npm run test:unit` 전체가 `fail 1`(로드 실패 1건 · 원래 그 파일 안
~25개 하위 테스트가 통째로 안 도는 바람에 `tests` 총수도 115→90 으로 줄어든다)로 보일 수 있다.
`tests/e2e/proto-project.spec.mjs tests/e2e/proto-support.spec.mjs tests/e2e/smoke.spec.mjs` 는
E0-3 소유 파일이 아닌 `landxi/**` 변화에 영향받지 않으므로 e2e 세 스펙은 영향이 없다. `data.test.mjs`
자체만 좁혀 돌리면(`node --test tests/unit/data.test.mjs`) 항상 fail 0 이다. `cells.test.mjs` 는
E0-3 owned_files 에 없어 고치지 않았다 — E0-6 브리프(`wave0/E0-6.md` 6단계)가 스스로
"`grep -rn "dashboard-128" landxi tests docs/superpowers/specs` 로 참조 0 확인"을 완료 기준으로
갖고 있으므로, 그 확인 단계에서 자연히 잡혀 고쳐질 것으로 본다 — ④ 에 요청으로 남긴다.)

- skip 1건: `tests/unit/results.test.mjs:184` — `test('퀵룩 PNG 4장이 있다(로컬 산출물)', { skip: !fs.existsSync('shots/results') && 'shots/ 미생성' }, ...)`. 로컬 산출물(`shots/results/`)이 이 저장소에 없어서 스킵되는 것으로, 이미 라벨(`'shots/ 미생성'`)이 붙어 있었다 — 브리프 규칙("스킵에 라벨이 없으면 라벨을 붙인다")에 해당하지 않아 수정하지 않았다. `results.test.mjs` 는 E0-3 소유 파일이 아니라 수정도 금지된다.
- `data.test.mjs:180`(`15 home services: unique ids, real assets, sane coordinates`)의 수정:
  - 기대값 `['change','farmland','greenhouse','marine','pothole']` → `['farmland','greenhouse','marine']`(`services.js` 의 `real:true` 3종 — `2fe8969` 가 `pothole`·`change` 를 `real:false` 로 정직화한 뒤 테스트가 안 따라갔다).
  - story 기대값도 5종 정렬 → 3종(`generic, jeju, marine`)으로 맞춤.
  - **브리프가 명시하지 않은 추가 발견**: 같은 테스트 안 `SERVICES.find(s=>s.id==='marine').count` 단언이 여전히 `38057`(옛 값)을 기대하고 있었다 — 원래는 첫 단언(5종 vs 3종)에서 먼저 멈춰 가려져 있던 것으로, `node --test` 로 1건씩 고치며 드러났다. `services.js` 자체는 같은 `2fe8969` 커밋에서 이미 `3938`(여수 두 결과 1,860+2,078 의 합, 대장 근거)로 내려가 있었다 — 테스트만 안 따라간 동일 뿌리라 이 파일(소유 파일) 안에서 같이 고쳤다. 각 단언 위에 근거 주석(커밋 해시 인용)을 남겼다.

**3. README '역할 픽스처 규칙' 1절**

`tests/e2e/README.md` — "## 역할 픽스처 규칙" 절 추가(파일 상단, 은퇴 스펙 절보다 앞). 내용: 배경(왜 필요한가 · `tests.md` §2 · `MASTER-PLAN.md` §7 링크) · 정본 파일과 Wave 0 동안 import 금지 규칙 · 함수 3개 표(`bootAs`·`bootTenant`·`switchTo`) · 화면별 기본 역할 표 · 세션 키 표(§7.1 요약) · "세션 없이 시작하는 테스트는 새 `page` 로" 주의문.

**4. `git diff --stat` 이 `tests/` 밖 0**

이 저장소는 Wave 0 9개 에픽이 **같은 작업 트리**에서 동시에 돈다 — `git status`/`git diff --stat`
전체에는 다른 에픽(E0-1·E0-2·E0-4·E0-5·E0-6·E0-8 등)이 건드린 `landxi/**` 파일과
`tests/e2e/proto-{dashboard,login,map,publish}.spec.mjs` 도 같이 잡힌다(내가 만든 변경이 아니다).
**내가 실제로 수정/생성한 파일만** 좁혀 보면:

```
$ git diff --stat -- tests/e2e/proto-project.spec.mjs tests/e2e/proto-support.spec.mjs tests/e2e/smoke.spec.mjs tests/unit/data.test.mjs tests/e2e/README.md
 tests/e2e/README.md              |  44 ++++++++++++
 tests/e2e/proto-project.spec.mjs | 151 ++++++++++++++++++++++-----------------
 tests/e2e/proto-support.spec.mjs |  74 +++++++++++--------
 tests/e2e/smoke.spec.mjs         |   4 +-
 tests/unit/data.test.mjs         |  11 ++-
 5 files changed, 184 insertions(+), 100 deletions(-)
```

새 파일(둘 다 `new_files_allowed` 안): `tests/e2e/_roles.mjs`(신설 · 정본) ·
`docs/superpowers/audit-0923/wave0/E0-3-result.md`(이 문서). `git status --porcelain` 에서
`tests/e2e/_roles.mjs` 만 내 몫의 `??`(untracked)이고, `?? docs/superpowers/audit-0923/` ·
`?? landxi/assets/data/storage-keys.js` · `?? landxi/proto/spikes/**` · `?? tests/e2e/proto-session.spec.mjs`
는 각각 다른 에픽(E0-1 · E0-S)이 만든 새 파일이다 — `landxi/**` 어떤 파일도 내가 쓰지 않았다.

## ③ 변경 파일 목록(내 몫만, ② §4 의 `git diff --stat`·`git status` 로 확인)

- `tests/e2e/README.md`(수정)
- `tests/e2e/proto-project.spec.mjs`(수정)
- `tests/e2e/proto-support.spec.mjs`(수정)
- `tests/e2e/smoke.spec.mjs`(수정)
- `tests/unit/data.test.mjs`(수정)
- `tests/e2e/_roles.mjs`(신설)
- `docs/superpowers/audit-0923/wave0/E0-3-result.md`(신설, 이 문서)

## ④ 소유 밖 요청

`landxi/**` 는 전혀 건드리지 않았다. `tests/` 안에서 소유 밖 파일 수정이 필요한 지점은 전부
위 ②-1 의 두 `test.fixme` 사유(E0-8 착지 변경 · E1-5 `project-label.js` 페이지네이션 회귀)로
각 소유 에픽에게 넘겼다 — 두 사유 모두 브리프 형식(파일:줄 · 이유 · 받는 에픽)을 결과 문서
본문에 그대로 담았으므로 별도 표는 만들지 않았다.

추가로 하나: `tests/unit/cells.test.mjs:8`(`import ... 'landxi/proto/dashboard-128/db-data.js'`)는
E0-6 이 `dashboard-128/` 폴더를 지우면 `ERR_MODULE_NOT_FOUND` 로 깨진다(위 ②-2 참고) — 이
파일은 E0-3 owned_files 에도, 지금까지 본 다른 브리프의 owned_files 표에도 명시적으로 안
보인다(E0-6 은 `db-data.js` 등 개별 파일만 소유). **받는 곳**: E0-6(자기 브리프 완료 기준 6번
"`dashboard-128/` 삭제 · 참조 0"을 `tests/` 까지 포함해 확인하는 단계) — `cells.test.mjs` 의
import 를 살아있는 경로로 옮기거나(예: `db-data.js` 가 이관된 곳), 이 파일 자체가 `dashboard-128`
전용이라 더는 유효하지 않다면 삭제.

## ⑤ 남은 것 · 알려진 결손

- `tests/e2e/proto-project.spec.mjs:449`(라벨 행 삭제 테스트)는 E1-5 가 `project-label.js`
  페이지네이션 재계산을 고치기 전까지 `fixme` 로 남는다 — E1-5 완료 기준에 이미
  "`proto-project.spec.mjs` 57건 녹색 + 8건 추가"가 있어 그때 자연히 갱신된다.
- `tests/e2e/proto-project.spec.mjs:634`(발행 요청 → admin-publish 이동 테스트)는 E0-8 이
  착지를 '자기 요청 이력'으로 바꾸면 URL 기대값 자체를 다시 써야 한다(단순 `fixme` 해제가 아니다) —
  통합 단계 또는 E0-8 담당이 `ai-project.html?pid=...&tab=deploy&req=pa-` 패턴으로 갱신.
- `_roles.mjs` 는 Wave 0 동안 아무도 import 하지 않는다(00-COMMON 규칙) — 통합 단계가 모든
  스펙의 로컬 사본을 이 파일의 import 로 바꿀 때, 세 함수의 시그니처가 지금과 정확히 같은지
  다시 한번 대조할 것(이번에 손댄 세 스펙의 사본은 `_roles.mjs` 와 바이트 단위로 같다).
- `results.test.mjs:184` 의 skip 1건은 로컬 산출물(`shots/results/`) 부재가 원인이며 이미
  라벨이 있다 — E0-3 소유 파일이 아니라 그대로 둔다.
