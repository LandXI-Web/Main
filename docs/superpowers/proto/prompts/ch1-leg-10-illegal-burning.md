# 1장 Leg 10 · 불법소각 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 10 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 산자락 공터로 낮게 다가가 검게 그을린 원형 자국과 잔재 더미, 작은 굴뚝 하나를 지나간다 — 불이 나는 장면이 아니라 **불이 났던 흔적**만 보여주는 것이 이 leg의 정직성이다.

> **정직성 고지 (두 겹)**
> 1. **울주군에는 로컬 실촬·실탐지 자산이 없다.** 지형은 공개적으로 알려진 영남알프스 산자락의 성격(임도 끝의 평평한 공터, 억새와 마른 풀, 계곡 쪽으로 열린 사면)만으로 기술하고 **지번·면적 같은 수치를 만들어 넣지 않는다.**
> 2. **`incinerator` 274개소는 `real:false` 예시 수치다** — 화면에도 오버레이에도 **표기 금지**. 오버레이는 `조사 항목(시연)`으로만 나간다.
> 3. **연기를 그리지 않는다.** 샷 리스트 v2가 "연기 없음"으로 확정했다(구 스토리보드의 "흰 연기 한 줄기"는 폐기). 진행 중인 소각을 그리면 있지도 않은 현장 적발을 주장하는 그림이 된다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 9의 *인코딩된* mp4 마지막 프레임**(`anchors/a10.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: **울주·소각 현장의 로컬 참조 이미지는 없다.** 재질 일관성 참조로만 `landxi/assets/proto/film/legs/src/anchors/namwon-3d-2.png`(이끼·석고·마른 풀 재질)을 쓴다 — **구도가 아니라 재질만**. (`landxi/assets/proto/crops/jeju-illegal/`는 **불법건축물** 탐지 자산이므로 이 leg의 근거가 아니다. 참조하지 않는다.)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Low aerial view over a flat bare clearing at the foot of a miniature wooded ridge, looking forward and down at about thirty degrees, the clearing filling the centre and lower half of the frame. The ground is scuffed sifted sand and dry pale grass; near its centre lie two cold circular burn scars, matte charcoal-black with a soft grey ash ring at the edge, one larger and one smaller, clearly old and dead. Beside them sit two low heaps of dark residue and mixed debris, dull and unsorted. At the far side of the clearing stands a single short chimney of dull rusted metal on a low block base, cold, empty. A thin unpaved track enters the clearing from the right. Moss canopy and a raw grey cut face close the frame along the top; a pale hazy horizon shows in the upper quarter. Nothing is burning, no smoke, no fire, no glow, nothing moves. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, smoke, smoke plume, fire, flames, embers, orange glow, heat haze, people, workers, cars on roads, trucks, excavators, industrial plant, factory, tall smokestack, map overlay, coloured data overlay, detection boxes, warning icons
```
**설정**: `seedream/5-pro-text-to-image` (로컬 실참조가 없으므로 t2i), `16:9`, `quality`·`output_format` 동봉. 3장 → 1장.

**스틸 검수 체크**
- [ ] **연기·불꽃·잉걸·주황 발광이 한 점도 없는가**(하나라도 있으면 즉시 리테이크 — 정직성 위반)
- [ ] 그을린 자국이 **식은 흔적**으로 읽히는가(재 테두리, 무광 검정)
- [ ] 굴뚝이 공장 굴뚝이 아니라 **작고 낮은 소각용 굴뚝**인가
- [ ] 공터가 산자락 임도 끝의 평평한 터로 읽히고 산업단지가 아닌가
- [ ] 경고 아이콘·탐지 박스·수치·텍스트가 없는가

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous approach, no cuts. The camera drifts steadily forward and slightly downward toward the clearing for the whole five seconds, the tilt easing from about thirty degrees to about twenty-five, so the clearing grows to fill most of the frame and the two cold burn scars resolve until the grey ash ring at their edges and the grain of the scuffed sand are readable. The two heaps of dark residue pass slowly through the lower left. The short rusted chimney holds the centre right of the frame from the first frame to the last, growing as the camera nears it, cold and empty the whole time, never emitting anything. Everything on the ground is completely still: no smoke, no flame, no ember, no glow, no heat shimmer, nobody and nothing moves. Daylight constant, no flicker. In the last second a soft cotton-wool cloud shadow sweeps across the whole clearing from the ridge side and thin haze gathers at the frame edges so the frame ends soft. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, trucks, excavators, birds entering frame, smoke, smoke plume, fire, flames, embers, sparks, orange glow, heat haze, heat shimmer, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing terrain, debris multiplying, map overlay, detection boxes, warning icons
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 9 인코딩 mp4의 마지막 프레임** = `anchors/a10.png` |
| `contents[].last_frame` | **비움** — Leg 11의 첫 프레임이 아직 없다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 연기 억제는 오직 프롬프트 본문의 "no smoke, no flame, no ember, no glow, no heat shimmer"와 네거티브 병합에 달려 있다 — 이 leg는 **매 테이크 전 프레임을 눈으로 확인**한다 |
| 네거티브 | **`negative_prompt` 필드 없음** → 위 네거티브를 프롬프트 끝에 `Do not include: …` 로 병합 |
| 비용 | 0.5 U/s × 5 s = 2.5 U ≈ **$0.35**/테이크, 2테이크 $0.70 |

2회까지 생성.

**웹앱 수동 생성 (klingai.com)**

| 웹앱 항목 | 설정 |
|---|---|
| 모드 | 이미지 → 영상 (Image to Video) |
| 모델 | **Kling 2.5 Turbo** |
| 해상도 | **1080p** |
| 길이 | **5s** |
| 시작 프레임 업로드 | `anchors/a10.png` (Leg 9 **인코딩본**의 마지막 프레임) |
| 끝 프레임 | **비움** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란 — 연기 억제어를 반드시 포함) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-10-illegal-burning.mp4` |

**영상 검수 체크**
- [ ] **125프레임 전부에 연기·불꽃·잉걸·열 아지랑이가 없는가**(한 프레임이라도 있으면 폐기)
- [ ] 굴뚝이 5초 내내 중앙 우측에 머물고 프레임을 벗어나지 않는가
- [ ] 전진 한 방향뿐이고 틸트가 30°→25°로 단조롭게만 변하는가
- [ ] 잔재 더미 개수가 늘거나 줄지 않는가
- [ ] 마지막 초 구름 그림자가 공터 전체를 덮어 Leg 11 급상승과 씸이 되는가

## 3) 페이지 오버레이 (**수치 없음** — 실결과 미보유, `274개소`는 예시 수치라 표기 금지)
```
불법소각 — 조사 항목(시연)
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-10-illegal-burning.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-10-illegal-burning.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a11.png` → 페이스 계산 → 6프레임 검수 시트.
