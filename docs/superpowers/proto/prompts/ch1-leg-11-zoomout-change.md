# 1장 Leg 11 · 줌 아웃 · 국토 변화 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 11 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 산자락 공터에서 단숨에 솟아 한반도 전체를 프레임에 담고, 지형 위로 시점별 색 띠가 남에서 북으로 퍼진다 — 한 필지에서 시작한 이야기가 국토 규모의 변화 분석으로 확장되는 유일한 순간.

> **정직성 고지**: 색 띠의 실근거는 **남원 4시점(2025-04 → 2025-10) 동일 좌표 정사영상**과 그 **비지도 변화지수 456**뿐이다. 화면에서 띠가 국토 전체로 퍼지는 것은 **규모의 은유**이며, 페이지 오버레이가 그 범위를 `남원 4시점`으로 못박아 한정한다. **다른 지역의 변화 수치를 만들어 붙이지 않는다.**
> 색 띠는 **디지털 오버레이가 아니라 물리 재질**로 만든다 — 지형 위에 얹힌 반투명 착색 아크릴 띠. 이 세계에는 HUD도 지도 기호도 없다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 10의 *인코딩된* mp4 마지막 프레임**(`anchors/a11.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/crops/namwon-epoch/1.jpg`·`2.jpg`·`3.jpg`·`4.jpg` (**4시점 동일 좌표 — 색 이동의 유일한 실물 근거**), `landxi/assets/proto/crops/kuksan-change/1.jpg`·`2.jpg` (드론 2회차 동일 지점), `shots/film/k_1960.png` (t 19.60 · 급상승), `landxi/assets/proto/film/legs/src/anchors/orbit-0.png` (한반도 전체 구도)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital thing, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Very high view of the whole miniature Korean peninsula seen at a steep angle, the land filling the centre of the frame from the lower edge to the upper third, its curvature just beginning to show along the top where it falls into pale cream haze. Moss ridges run down the spine, quilted felt farmland fills the western plains, poured cobalt-blue resin sea wraps the coasts, and small cotton-wool clouds sit over the southern water. Across the southern third of the land, thin translucent tinted acrylic strips lie flat on the terrain like laid ribbons, in soft field green, warm amber and pale slate, following the shape of the ground rather than a grid; they are physical laid pieces catching the daylight at their bevelled edges, not printed marks. The rest of the land is bare model terrain. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, cars on roads, stars, black space, second globe, map graticule, latitude lines, country borders, printed map, heat map, HUD, chart, legend, detection boxes, city lights
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/film/legs/src/anchors/orbit-0.png` (한반도 형상 유지 — 모델은 재질만 바꾸고 구도는 못 바꾼다). 3장 → 1장.

**스틸 검수 체크**
- [ ] 한반도 형상이 참조 렌더와 같고 모핑되지 않았는가
- [ ] 색 띠가 **실물 아크릴 조각**으로 읽히는가(인쇄된 지도 기호·히트맵 아님)
- [ ] 띠가 **남쪽 1/3에만** 있고 아직 북쪽으로 퍼지지 않았는가
- [ ] 색이 LX 블루·앰버·필드 그린 계열 안에 있고 네온·보라가 없는가
- [ ] 경위선·국경선·범례·수치·도시 불빛이 없는가

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous climb, no cuts. The camera rises steadily and quickly away from the land for the whole five seconds on a single unbroken pull-back, the peninsula shrinking from filling the frame to sitting whole within it with pale cream haze all around, its curvature returning gently along the top edge. While the camera climbs, the thin translucent tinted acrylic strips lying on the terrain spread from the southern third of the land steadily northward, one soft band after another laying itself down along the shape of the ground until they reach the northern ridges by the final second; they appear as physical laid pieces catching daylight at their bevelled edges, never as printed marks and never blinking. High above and far away, a tiny brass satellite model travels slowly from the upper left of the frame toward the upper right, small and steady, crossing once and only once, never approaching the camera. Small cotton-wool clouds drift over the southern water. Light constant, no flicker. In the last second pale cream haze thickens evenly around the whole peninsula so the frame ends soft at its edges. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing coastline, peninsula changing shape, spinning globe, second globe, map graticule, country borders, printed map, heat map, HUD, chart, legend, blinking, flashing, glowing bands, city lights, stars, black space
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 10 인코딩 mp4의 마지막 프레임** = `anchors/a11.png` |
| `contents[].last_frame` | **비움** — Leg 12의 첫 프레임이 아직 없다. (Leg 12를 병렬로 먼저 만들 경우에만 `anchors/a12.png`를 넣는다) |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 띠가 깜빡이거나 발광하지 않게 붙드는 것은 "never blinking", "physical laid pieces"와 네거티브의 `blinking, flashing, glowing bands`뿐이다 |
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
| 시작 프레임 업로드 | `anchors/a11.png` (Leg 10 **인코딩본**의 마지막 프레임) |
| 끝 프레임 | **비움** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-11-zoomout-change.mp4` |

**영상 검수 체크**
- [ ] 상승 한 방향뿐이고 도중에 멈추거나 되밀리지 않는가
- [ ] 한반도 해안선이 5초 내내 같은 형상인가(모핑 = 즉시 리테이크)
- [ ] 색 띠가 **남 → 북 한 방향**으로만 퍼지고 깜빡이거나 발광하지 않는가
- [ ] 위성 모형이 상단을 좌→우로 **딱 한 번** 지나가고 카메라로 다가오지 않는가
- [ ] 마지막 프레임: 한반도 전체 + 띠가 북쪽까지 도달 + 사방 크림 헤이즈(Leg 12 씸 가능)

## 3) 페이지 오버레이 (실데이터, 범위를 남원으로 한정)
```
국토 변화 분석 · 남원 4시점 2025-04→10 · 변화지수 456(비지도)
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-11-zoomout-change.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-11-zoomout-change.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a12.png` → 페이스 계산 → 6프레임 검수 시트.
