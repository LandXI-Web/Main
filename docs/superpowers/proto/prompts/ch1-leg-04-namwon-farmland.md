# 1장 Leg 4 · 남원 평야 · 농지이용 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 4 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 논밭 격자 위로 내려서는 동안 경작지와 비경작지가 재질로 갈라지며, 우리가 2,098필지를 어떻게 읽는지를 숫자 한 자 없이 화면이 먼저 보여준다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 3의 *인코딩된* mp4 마지막 프레임**(`anchors/a04.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/crops/namwon-farmland-2025/3.jpg`(주), `…/1.jpg`, `…/5.jpg` (2025 드론 정사영상 — **필지 형상·격자 배치의 실근거**), `landxi/assets/proto/film/legs/src/anchors/namwon-3d-0.png` (우리 3D 레그 렌더: 실측 풋프린트 구도), `shots/film/k_1300.png` (t 13.00)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Low aerial view over a wide miniature farming basin, looking forward and down at about fifty degrees. Hundreds of irregular rectangular parcels tile the floor of the basin, separated by thin raised bunds of grey card and narrow pale sand lanes; the parcels are cut from two clearly different felts — a deep field-green felt with a fine cut nap for the worked parcels, and a flat dry ochre felt with visible loose fibres for the unworked ones — interleaved in a real uneven pattern, never a checkerboard. A thread of poured resin runs as a stream through the middle. Moss ridges close the basin along the top of the frame beneath a high pale hazy horizon. On the right edge, at distance, a cluster of low arched structures with translucent skins catches the light. The lanes are empty, nothing moves on the ground. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, farmers, cars on roads, tractors, checkerboard pattern, regular grid, map overlay, coloured data overlay, contour lines
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/crops/namwon-farmland-2025/3.jpg` (image-to-image로 넣어야 모델이 **재질만 바꾸고 구도는 못 바꾼다**). 3장 → 1장.

**스틸 검수 체크**
- [ ] 필지 형상이 참조 정사영상의 **불규칙한 실제 배치**를 따르고 체스판이 되지 않았는가
- [ ] 경작(초록 펠트)과 비경작(누런 펠트)이 색이 아니라 **재질 차이**로 구분되는가
- [ ] 우측 원경에 비닐하우스 군락이 보이는가(Leg 5로 이어질 실마리)
- [ ] 농로·논둑에 사람·차량·트랙터가 없는가
- [ ] 데이터 오버레이·등고선·지도 기호가 끼어들지 않았는가

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous descent, no cuts. The camera sinks slowly and steadily toward the floor of the basin for the whole five seconds on the same forward heading, the tilt easing from about fifty degrees to about forty. The parcel pattern grows across the frame; bunds and sand lanes resolve into distinct raised edges and the felt nap of the worked parcels becomes readable against the dry loose fibres of the unworked ones. A single small quadcopter drone model in milled brass and matte grey holds the lower left third of the frame ahead of the camera, seen from behind, rotors softly blurred, drifting slowly toward the lower centre; it never turns and never leaves the frame. The cluster of translucent arched structures on the right grows larger and moves toward the centre right. A soft cotton-wool cloud shadow crosses the parcels once from the upper left to the lower right. Light constant, no flicker. In the last second that cloud shadow settles over the near parcels and pale haze thickens along the far ridges so the frame ends soft. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, tractors, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing parcels, parcels changing shape, checkerboard pattern, map overlay, coloured data overlay
```
**설정**: `kling/v2-1-pro`, `{"duration":"5"}`, 16:9, `cfg_scale` **0.6**(필지 형상은 실측 근거다 — 모핑되면 정직성이 깨지므로 프롬프트 준수 우선), `image` = `anchors/a04.png`, `image_tail` = **비움**. 2회까지.

**영상 검수 체크**
- [ ] 필지 경계가 5초 내내 **같은 형상**을 유지하는가(모핑 = 즉시 리테이크)
- [ ] 하강 한 방향뿐이고 중간에 상승·정지·방향 전환이 없는가
- [ ] 초록/누런 두 재질의 구분이 가까워질수록 더 뚜렷해지는가
- [ ] 드론이 하단 좌측에 계속 머물고 프레임을 벗어나지 않는가
- [ ] 마지막 프레임이 평야 중앙 + 우측 비닐하우스 군락 — Leg 5 시작 구도와 맞는가

## 3) 페이지 오버레이 (실데이터, 영상에는 글자 없음)
```
농지이용 현황 2,098필지 · 경작 1,291 / 비경작 807 · 2025 드론
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-04-namwon-farmland.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-04-namwon-farmland.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a05.png` → 페이스 계산 → 6프레임 검수 시트.
