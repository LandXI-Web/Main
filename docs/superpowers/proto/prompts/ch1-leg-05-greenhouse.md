# 1장 Leg 5 · 비닐하우스 실태 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 5 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 비닐하우스 군락 위로 낮게 내려앉아 황동 아치와 반투명 비닐의 결까지 보여준다 — 9,664동이라는 숫자가 세어질 만한 크기의 물건임을 눈으로 납득시키는 leg.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 4의 *인코딩된* mp4 마지막 프레임**(`anchors/a05.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/crops/namwon-greenhouse-2025/2.jpg`(주), `…/4.jpg`, `…/6.jpg` (2025 실탐지 크롭 — **동 배치·단동/다동 비율의 실근거**), `landxi/assets/proto/film/legs/src/anchors/namwon-3d-1.png`·`namwon-3d-2.png` (우리 3D 레그 렌더: AI 온실이 4 m로 서는 구간)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Low oblique aerial view over a dense cluster of miniature greenhouses filling about sixty percent of the frame, looking down at about forty-five degrees. Each house is a run of fine milled brass hoops skinned in slightly wrinkled translucent film that scatters the daylight; the rows sit at two or three different angles to each other, some single-span and narrow, some wide multi-span blocks, packed along the same bunds and sand lanes as the surrounding parcels. Beyond the cluster, green and ochre felt parcels continue to the pale hazy horizon in the upper quarter. A soft cotton-wool cloud shadow lies across the far end of the cluster. Nothing moves, the lanes are empty. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, farmers, cars on roads, tractors, identical repeated rows, tiled pattern, map overlay, coloured data overlay
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/crops/namwon-greenhouse-2025/2.jpg`. 3장 → 1장.

**스틸 검수 체크**
- [ ] 군락이 화면 60%를 차지하고 단동/다동이 섞여 있는가(복붙한 듯 똑같은 동의 반복 금지)
- [ ] 비닐이 **반투명 필름**으로 읽히는가(불투명 흰 지붕·유리 아님)
- [ ] 골조가 황동 아치로 보이는가
- [ ] 군락 배치가 참조 크롭의 실제 각도·간격을 따르는가
- [ ] 텍스트·데이터 오버레이·사람·차량 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous move, no cuts. The camera descends gently toward the greenhouse cluster for the whole five seconds while orbiting very slightly to the left, no more than about twelve degrees in total, so the brass hoops separate in parallax and the wrinkles in the translucent film become readable. The cluster stays centred and stays in frame from the first frame to the last, growing to about sixty percent of the frame. A single small quadcopter drone model in milled brass and matte grey holds the lower right of the frame ahead of the camera, seen from behind, rotors softly blurred, sliding slowly toward the lower centre; it never turns and never leaves the frame. Daylight is constant, the film skins catching a soft even sheen with no hotspot. Across the last second a soft cotton-wool cloud shadow travels over the whole cluster from the far side toward the camera, dimming the frame slightly and evenly. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, tractors, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing structures, greenhouses multiplying, rows sliding apart, specular hotspot, map overlay
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 4 인코딩 mp4의 마지막 프레임** = `anchors/a05.png` |
| `contents[].last_frame` | **비움** — Leg 6의 첫 프레임이 아직 없다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 궤도 12도 상한은 프롬프트의 "no more than about twelve degrees in total" 한 문장으로만 걸린다 — 초과하면 리테이크 |
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
| 시작 프레임 업로드 | `anchors/a05.png` (Leg 4 **인코딩본**의 마지막 프레임) |
| 끝 프레임 | **비움** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-05-greenhouse.mp4` |

**영상 검수 체크**
- [ ] 궤도가 12도를 넘지 않고 군락이 5초 내내 중앙에 머무는가
- [ ] 하우스 동 수가 늘거나 줄지 않는가(증식 = 리테이크)
- [ ] 반투명 비닐에 하이라이트가 타지 않고 균일한 셰이딩인가
- [ ] 드론이 하단 우측에서 프레임 밖으로 나가지 않는가
- [ ] **마지막 1초에 구름 그림자가 군락 전체를 덮어** Leg 6 상승과 씸이 되는가

## 3) 페이지 오버레이 (실데이터, 카운트업)
```
비닐하우스 9,664동 · 1,674필지
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-05-greenhouse.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-05-greenhouse.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a06.png` → 페이스 계산 → 6프레임 검수 시트.
