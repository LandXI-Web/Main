# F3 §7-⑤ 정문(login) — 구현 보고 (2026-09-27)

- 경로: `http://localhost:4173/landxi/v3/login/` · 소유 파일 `landxi/v3/login/` — `index.html` · `login.css` · `auth.js` · `plate.js` · `handoff.js`
- 수정한 파일은 소유 경로 안의 것뿐이다(xi · ops · server · shared 는 읽기 · import · API 호출만). 커밋은 하지 않았다.
- 산출물: `shots/f3/login/01-door-namwon.png` · `02-admin-rejected.png` · `03-door-global-tenant.png` · `login-flow.mp4`(18.1 s)

## 1. 화면
| 자리 | 내용 |
|---|---|
| 왼쪽 판(풀블리드 · 영상 무대) | 실제 영상 위의 실제 결과. 지역이 바뀌며 카메라가 이동한다(e-cam 2400) → 청록 스윕 → 결과가 뜨고 → 캡션이 들어온다. 남원시 농지 실태조사 **20,852 대장과 다른 필지**(V-World 연속지적 필지선 위에 의심 필지, A/B/C 우선순위 농도) → 여수시 해양쓰레기 **2,078 탐지 객체**(드론) → 비슈케크 도시 확장 **44.4 km²**(Sentinel-2 2017→2025). 숫자 옆에는 `~` 기호 하나만 두고, 근거는 호버 한 줄로 보여 준다. |
| 오른쪽 문 520(종이 무대) | 워드마크 · 헤드라인 "실태조사, AI로 끝낸다"(10자) · 한 문장 "LX가 운영하는 유일한 실태조사 특화 GeoAI 플랫폼" · 모토 3축(한 줄씩) · 계정 3택 · 아이디/비밀번호 · 로그인 · "계정 찾기 · 신청" 서랍 · LX 락업 |
| 관리자 반전 | `LX 관리자`를 고르면 탭 위치에서 잉크 원이 퍼져 문이 관제의 색으로 반전된다(clip-path 1000 · Vantor 반전 섹션). 1차 버튼은 흰 채움이 된다. |
| 들어가기 | 문이 clip-path로 걷히고(750) 판이 전면이 된 뒤 각 역할의 집으로 이동한다. |

## 2. 인증 · 착지(실서버 · 세션 주입 0)
- `POST /api/v1/auth/login`(게이트웨이 :8700)을 쓰고, 세션은 `api-v1.js` `session`(`lx_api_session`, 같은 :4173 출처)에 둔다. 착지는 **서버가 돌려준 role**로 정한다.
  - staff·sales → `/landxi/v3/lx-console/` · admin → `/landxi/v3/ops-core/` · tenant → `/landxi/v3/gov-fusion/`
  - v3 집이 없으면 다음 순서로 간다: 직원·기관은 `/landxi/xi/`, 관리자는 `:8702/landxi/ops/`(`#lx_handoff=` 조각으로 세션 인계, 받는 쪽 코드는 `handoff.js receiveHandoff()`).
- 기관 계정은 아이디 `<기관>-<역할>`에서 tenant_id를 읽는다(입력칸 하나를 줄임). 예: `namwon-manager` → namwon.
- 관리자 문에 관리자가 아닌 계정으로 들어오면, 발급된 토큰을 즉시 `/auth/logout`으로 폐기하고 "관리자 계정이 아닙니다"로 거절한다.
- `?next=`는 같은 출처의 `/landxi/v3/<집>/` · `/landxi/xi/` 경로이면서 그 역할이 들어갈 수 있는 집일 때만 받는다(오픈 리다이렉트 0). next가 ops-core이면 관리자 탭을, gov-fusion이면 기관 탭을 미리 골라 둔다.
- 이미 세션이 있으면 `/me`로 확인한 뒤 "○○으로 계속 →" 한 줄을 보여 준다. `?logout`이면 서버 세션까지 끝낸다.
- JS가 죽어도 비밀번호가 URL에 붙지 않도록 폼은 `method=post`로 두었다.

**e2e(Playwright, 정문 폼 입력 → 실제 이동)** — 6/6 통과, pageerror 0

| 경우 | 결과 |
|---|---|
| 직원 · 틀린 비밀번호 | 정문에 그대로 남고 "아이디 또는 비밀번호가 맞지 않습니다"(서버 401 문구) · 세션 없음 |
| lx-staff | `/landxi/v3/lx-console/` · realm lx / staff |
| lx-admin | `/landxi/v3/ops-core/` · realm lx / admin |
| 관리자 탭 + lx-staff | 거절 "관리자 계정이 아닙니다" · 토큰 폐기 · 세션 없음 |
| namwon-manager | `/landxi/v3/gov-fusion/` · tenant namwon |
| gwangju-jeonnam-manager | `/landxi/v3/gov-fusion/` · tenant gwangju-jeonnam |

## 3. 예산(§4 v2.1 · 1440×900 innerText, 공백 제외)
- 첫 뷰(남원 판): **170~181자**. 가장 긴 상태(비슈케크 판 + 오류 문구)는 200자로 ≤ 200을 지킨다.
- 버튼·링크: 로그인 · 계정 찾기·신청 · (세션이 있을 때) 계속 → **≤ 3**. 계정 3택은 라디오 하나다.
- 헤드라인 1개(10자) · 마침표 문장 0 · 큰 숫자(≥ 54px) 0. 캡션 숫자는 44px로, 업무 결과만 쓴다.
- 금지어 0: API 경로 · 모델 id · GPU · ms · 좌표 · 시연 · 파일 경로가 없다.
- 360~960px에서는 판이 위, 문이 아래로 쌓이고 가로 스크롤은 0이다.

## 4. 데이터 출처(가짜 숫자 0)
| 판 | 숫자 | 파일 |
|---|---|---|
| 남원 | `totals.suspect_parcels` 20,852 | `landxi/data/survey/findings-emd.json`(PostGIS 적재 검증본) · 층 `namwon-parcel-survey.pmtiles`(parcels · suspects) |
| 여수 | 결과 객체 수 2,078 | `landxi/assets/data/geo/results/yeosu-marine-2026-drone.geojson` |
| 비슈케크 | `summary.delta_km2` 44.4 | `landxi/data/global/kgz-sprawl-2017-2025.json` |

- 영상: V-World 위성 xdworld(국내), EOX s2cloudless-2025(해외). 판 오른쪽 아래에 출처를 한 줄로 표기한다.
- 파일을 못 읽은 지역은 순환에서 뺀다.

## 5. 레퍼런스 장치
- **Apple**: 한 화면에 한 문장만 둔다.
- **Vantor**: 관리자 탭의 반전 섹션, 판·문의 clip-path 전환.
- **planet.com**: 사진을 판 전체로 대접하고, 화면 전환 대신 카메라가 이동한다.
- **법전 §4**: 스윕 → 결과 현상, 이중 스트로크 글로우.

## 6. 정직 항목 · 남은 것
- F3 문서의 목적지(`console/ service/ ops`)와 실제 형제 디렉터리 이름(`lx-console/ gov-fusion/ ops-core/`)이 다르다. 두 이름을 모두 후보로 두었다.
- ops-core는 :4173에서 돈다. F3 §1의 ":8702 관제"를 따르려면 serve-ops의 ALLOW에 `/landxi/v3/`를 넣고 `receiveHandoff()`를 연결해야 한다. 이 부분은 소유 밖이라 하지 않았다.
- 틀린 비밀번호의 401은 브라우저 콘솔에 네트워크 오류 한 줄로 남는다(정상 거절 신호).
- 기관 tenant_id를 아이디에서 추론하므로, 별칭 아이디 `gj-manager`는 `gwangju-jeonnam-manager`로 들어와야 한다.
- 영상은 관리자 경로 하나(틀린 비밀번호 → 반전 → 관제 착지)만 담았다. 직원·기관 착지는 위 e2e 표로 확인했다.
