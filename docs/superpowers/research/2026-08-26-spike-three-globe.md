# SPIKE — three.js 스크롤 글로브 (Path C)

- 일자: 2026-08-26 (재시작 후 마감 — 원 스파이크는 `3176df2`~`ce3b696` 구간에서 중단됨)
- 브랜치: `plan1-foundation`
- 산출물: `landxi/proto/spikes/three-globe/` (index.html · main.js · style.css ·
  `tools/{make-textures.mjs,builder.html,render-legs.mjs}` · `data/*.json`)
- 실행: `node tools/serve.mjs` (또는 `PORT=4173 node tools/serve.mjs`) →
  `http://localhost:4173/landxi/proto/spikes/three-globe/`
- 텍스처 빌드(1회, 커밋 안 됨): `node landxi/proto/spikes/three-globe/tools/make-textures.mjs`
- 필름 레그 렌더: `node landxi/proto/spikes/three-globe/tools/render-legs.mjs [legName ...]`
- 디버그 훅: `window.__spike.seek(p)` / `.setLeg(name)` / `.render(p)` / `.fps()` / `.legs()`

---

## 0. 무엇을 만들었나

정적 three.js 페이지 하나에 **두 개의 씬을 겹쳐서** 렌더한다.

- **GLOBE 씬** — 반경 1(=6371km) 구 하나에 day/night/bump/spec/cloud 텍스처와,
  한반도 두 해상도 패치(`korea_z8`, `korea2_z10`)를 위경도 바운즈로 셰이더에서
  블렌드한다. `detailTransfer()` 가 저해상 베이스의 **색**은 지키고 고해상 패치의
  **휘도 디테일**만 얹는 방식으로 V-World 타일 경계 체크무늬를 줄인다(완전히는
  못 없앤다 — §3).
- **LOCAL 씬(미터 스케일)** — 남원 금지면 실측 건물 풋프린트(`data/buildings.json`,
  Overture CN-EAB)·비닐하우스(`greenhouse.json`)·농경지(`farmland.json`)를 압출해
  세운 소규모 디오라마. 인터랙티브 스크롤 데모(`LKEYS`, 고도 420km→120m)에서만
  쓰이고, 이번에 검수한 두 필름 레그(§1)는 **여기까지 내려가지 않는다** — 최저
  132km 로, 끝까지 GLOBE 씬만 쓴다. LOCAL 씬의 실측 디오라마 자체는
  `namwon-3d.mp4`(별도 레그, 이 검수 범위 밖)가 이미 잘 보여준다
  — 압출 건물·강·도로가 또렷하다(`anchors/namwon-3d-2.png`).

두 필름 레그는 `main.js` 안 `LEGS` 테이블의 카메라 키프레임으로 결정론적이다:

| 레그 | 길이 | 고도 경로 |
|---|---|---|
| `orbit-korea` | 5.6s | 15,000 → 9,200 → 3,400 → 1,500 → **460km**(SEAM, tilt 18°) |
| `cloud-break` | 5.0s | **460km**(SEAM) → 350 → 260 → 190 → 132km (여수 남해안 수평선) |

씸 규칙(`SEAM = [460, 36.05, 127.95, 18]`)으로 `orbit-korea` 마지막 프레임과
`cloud-break` 첫 프레임이 카메라 상태와 가상 시각(구름 자전 위상 포함) 모두 동일하다.

---

## 1. 검수 결과 — 파일 유효성

재시작 전 커밋에는 **`cloud-break.mp4` 와 `legs.json` 이 손상**돼 있었다
(둘 다 헤더 없이 전부 0-바이트로 채워진 파일 — `moov atom not found`, 프로세스가
중간에 죽은 흔적). `cloud-break-v2` 앵커 중 `cloudv2-1.png`/`cloudv2-2.png` 도
동일한 증상(전체 0-바이트)이었다.

`render-legs.mjs`(three-globe)와 `leg-cloud-break.mjs --anchors-only`(clouds, §E 참고)가
그대로 재실행 가능함을 확인하고, **깨진 산출물만** 다시 구웠다(정상이던
`orbit-korea.mp4` 등은 그대로 — 재렌더는 결정론적이라 바이트가 달라도 프레임은
동일).

| 파일 | 상태(재시작 전) | 상태(재구움 후) |
|---|---|---|
| `orbit-korea.mp4` | 정상 | 1280×720 · 25fps · **5.60s** · 140 frame · GOP 8 (keyframe 1,9,17,25,33…) |
| `cloud-break.mp4` | **손상**(moov atom 없음) | 1280×720 · 25fps · **5.00s** · 125 frame · GOP 8 |
| `orbit-korea.first/last.webp` | 정상 | 정상(재구움) |
| `cloud-break.first/last.webp` | 정상(first) / 정상(last) | 정상(재구움) |
| `legs.json` | **손상**(221바이트 전부 0x00) | 정상 — `{fps:25, w:1280, h:720, legs:[{name,seconds,frames,mb}×2]}` |
| `anchors/orbit-{0,1,2}.png` | 정상 | 정상(재구움, 1920×1080) |
| `anchors/cloud-{0,1,2}.png` | 정상 | 정상(재구움, 1920×1080) |

재구움 실행 로그: `no console/page errors`. GOP 8은 두 mp4 모두 스크럽 재생
스펙(GOP 8·CRF 20)과 일치한다. 길이는 지시된 "~5s" 대비 `orbit-korea` 가 5.6s로
살짝 길다 — 레그 자체 타임라인(`LEGS['orbit-korea'].seconds = 5.6`)이 설계값이라
문제 아님, `cloud-break` 는 정확히 5.0s.

---

## 2. 텍스처 소스 · 라이선스

`tools/make-textures.mjs` 가 키 없는 공개 소스에서 굽는다(결과물 `tex/` 는
5MB 초과라 커밋 안 함 — `.gitignore`, 스크립트로 재생성):

| 텍스처 | 출처 | 라이선스 |
|---|---|---|
| `earth_day.jpg` | EOX Sentinel-2 cloudless, z5 | CC BY-NC-SA 4.0 (EOX) |
| `earth_night.jpg` | NASA Black Marble, z4 | Public Domain (NASA) |
| `earth_bump.jpg` / `earth_spec.jpg` | AWS Terrarium 지형 타일(z5)에서 유도 | 오픈(AWS/Mapzen 지형 타일) |
| `earth_clouds.png` | NASA Visible Earth(turban/webgl-earth 경유) | Public Domain(NASA), 실패 시 절차적 폴백 |
| `korea_z8.jpg`, `korea_z10.jpg` | V-World(국토교통부) 위성, z8/z10 | 공공누리 |
| `ortho_z13/15/17.jpg` | `namwon_city_2510`(자체 정사영상) + V-World 보간 | LX 자체 + 공공누리 |
| LOCAL 건물/온실/농경지 | Overture Maps CN-EAB (남원 금지면) | ODbL(Overture) |

---

## 3. 화질 노트 — 4프레임 실사 확인

앵커 스틸(1920×1080) 6장 + 필름 첫/끝 webp로 두 레그를 다 봤다.

- **`orbit-0.png`(고도 15,000km, t=0)** — 위성 실루엣 + 지구가 또렷하다. 궤도
  오프닝 프레임으로 손색없음. night-side 도시광이 자연스럽다.
- **`orbit-1.png`(고도 ~2,000km대, p=0.5 보간)** — 동아시아 지형·구름이 잘 읽힌다.
  이 구간까지는 `earth_day.jpg`(EOX z5) 해상도로 충분하다.
- **`orbit-2.png` = `cloud-0.png`(SEAM, 460km, 씸 프레임)** — **완전히 뭉갠 회색-녹색
  얼룩.** 구름 텍스처와 지표 텍스처 둘 다 460km 근접 확대에서 소스 해상도
  바닥을 드러낸다. 씸 자체(두 레그의 프레임 일치)는 정확하다 — `orbit-2.png` 와
  `cloud-0.png` 가 픽셀 단위로 같은 장면이다.
- **`cloud-2.png`(고도 132km, 레그 최저점)** — 뭉갬 위에 **사각형 타일 이음매가
  선명하게 보인다**(우측 중앙, `korea2_z10` 패치 경계). `detailTransfer()` 의
  휘도-only 블렌드로도 V-World 타일 간 색 편차를 완전히 지우지 못했다는 뜻 —
  코드 주석이 이미 예견한 한계("V-World 타일은 타일마다 색이 튀어서 그대로
  섞으면 체크무늬가 생긴다")가 460km 미만 확대에서 실제로 나타난다.

**결론**: GLOBE 씬 하나로 250km 이하까지 내려가는 것은 무리다 — `spike-clouds.md`
가 이미 내린 결론(구름 구는 궤도 전용, 250km 아래는 데크/실측 텍스처로 갈아탄다)과
정확히 같은 벽에 이 스파이크도 부딪혔다. `cloud-break` 레그가 132km 에서 끝나면서
바로 그 벽 안에서 마무리되는 게 이 레그의 근본 한계다.

---

## 4. 성능

`shots/spikes/three-globe/fps.json`(RTX 4090, 인터랙티브 스크롤 데모 `seek(p)` 측정,
`$fps` = 최근 30프레임 이동평균, rAF 리미터 30Hz):

| p | 고도 | fps |
|---|---|---|
| 0.00 | 17,000 km | 30 |
| 0.25 | 8,661 km | 30 |
| 0.44 | 2,798 km | 30 |
| 0.50 | 2,035 km | 30 |
| 0.60 | 364 km | 30 |
| 0.68 | 51.4 km | 30 |
| **0.75** | **16.4 km** | **23** ← 유일한 하락 |
| 0.90 | 900 m | 30 |
| 1.00 | 120 m | 30 |

p=0.75 부근(고도 16km, GLOBE→LOCAL 크로스페이드 + 그림자맵 갱신 구간으로 추정)에서만
23fps로 떨어진다. 그 외엔 rAF 상한(30Hz)에 그대로 걸린다 — 4090에서는 병목이
아니라는 뜻. 저사양 GPU에서의 실측치는 없음(추가 스파이크 필요 시 `clouds` 스파이크의
`benchFrames()` 방법론 재사용 권장).

---

## 5. 판정

**Path C(순수 three.js 글로브)는 궤도~성층권 오프닝 전용으로는 유효하고, 저고도
착지에는 부적합하다.** 두 레그(`orbit-korea`, `cloud-break`)는 씸이 프레임 단위로
맞고 GOP 8 인코딩도 스크럽 스펙대로 나오지만, `cloud-break` 종반 132km 에서 이미
텍스처 해상도·V-World 타일 이음매 벽에 닿는다. LOCAL 씬(실측 건물 압출)은 별도로
완성도가 높다(`namwon-3d.mp4`) — 즉 **GLOBE 궤도 진입 + `clouds` 스파이크의 하이브리드
구름(구→데크) + LOCAL 실측 디오라마**를 이어붙이는 조합이 실제 채택안이다.
이 스파이크 단독으로 "지구에서 남원까지 한 씬"을 만들 수는 없다 — 그건 원래 목표도
아니었고(Path C는 궤도 오프닝 후보), 이번 검수로 그 경계가 정확히 132km/460km
지점으로 확인됐다는 점이 성과다.

**남은 갭**
- LOCAL 씬으로의 인계(필름 레그 3본째, "descent"/"namwon" 급)가 이 검수 범위
  밖이라 `orbit-korea`→`cloud-break`→`namwon-3d` 사이 실제 씸 정합은 미검증.
- 저사양 GPU 프레임 비용 미측정.
- `korea2` V-World 타일 이음매(§3)는 250km 미만에서 육안으로 보임 — 만약 이
  고도대를 GLOBE 씬으로 커버해야 한다면 `detailTransfer` 를 타일 경계에서 넓게
  페더링하는 추가 작업이 필요.
