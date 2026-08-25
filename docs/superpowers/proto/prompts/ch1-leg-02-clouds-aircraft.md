# 1장 Leg 2 · 하강 · 구름 · 항공기 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 2 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 궤도에서 대기권으로 떨어지며 지구 곡률이 평평해지고, 솜구름을 뚫는 그 순간 작은 항공기 모형이 지나가 — 위성 다음의 두 번째 센서를 한마디 설명 없이 소개한다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 1의 *인코딩된* mp4에서 뽑은 마지막 프레임이다** (`ffmpeg -sseof -0.15 -i assets/leg01.mp4 -frames:v 1 -q:v 2 anchors/a02.png`). 원본 렌더가 아니라 **반드시 인코딩 산출물**에서 뽑는다 — 인코딩이 픽셀을 바꾸므로 원본에서 뽑으면 씸에 1프레임 팝이 생긴다.
- 아래 1)의 스틸 프롬프트는 **체인이 깨졌을 때만 쓰는 복구 프레임용**이다. 체인이 살아 있으면 스틸은 생성하지 않는다(크레딧 0).

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/orbit-2.png` (우리 렌더: 한반도 정면, 구도 참조), `shots/film/k_0440.png` (t 4.40 · 하강 진입), `landxi/assets/proto/film/legs/src/anchors/cloudv2-0.png` (구름층 재질)

**프롬프트** (프리앰블은 `_SHARED.md`에서 **토씨 하나 바꾸지 않고** 복사한 것 — 매 leg 동일해야 따로 만든 클립들이 "한 번의 촬영"으로 읽힌다)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Very high altitude view straight down onto the miniature Korean peninsula, the model world filling about 75 percent of the frame height, its curvature still gently visible along the top edge where it falls away into pale cream haze. Painted plaster landmass with fine moss ridges, poured cobalt resin sea to the south and west, coastline read as a crisp cut line. A layer of real cotton-wool cloud lies across the lower third and the far right, thick enough to hide the horizon there. The brass orbit ring is already out of frame. Nothing rests on anything — the world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, stars, black space, second globe, city lights
```
**설정**: `seedream/5-pro-image-to-image`, `aspect_ratio` `16:9`(2736×1520), `quality`·`output_format` 필수 동봉, `--ref anchors/orbit-2.png`. 3장 뽑아 아래 체크 후 1장.

**스틸 검수 체크**
- [ ] 곡률이 위쪽 가장자리에만 남아 있고 "우주에 뜬 공"이 아니라 "떨어지는 중"으로 읽히는가
- [ ] 보드·테이블·스튜디오 벽·검은 우주·별이 없는가
- [ ] 바다가 LX 블루 하나뿐인가(보라·마젠타 없음)
- [ ] 구름이 스프라이트가 아니라 실제 솜 재질로 읽히는가
- [ ] 텍스트·숫자·로고 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous descent, no cuts. The camera falls steadily straight down toward the miniature peninsula for the whole five seconds while the world's curvature flattens out until the top edge is a level hazy horizon. Around the third second the camera enters a layer of real cotton-wool cloud: soft white passes over the lens from below, thinning again by the fourth second. Through a gap in that cloud a tiny model aircraft — milled aluminium, matte, no livery — travels smoothly from the lower right of the frame to the upper left, small, far below the camera, crossing once and only once. Terrain detail grows steadily; the miniature Jeolla province opens up in the lower half. Light is constant soft daylight, no flicker. In the last second thin cloud wisps and pale haze drift back across the outer thirds of the frame so the frame ends soft at its edges. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing coastline, morphing continents, extra aircraft, contrails, stars, black space
```
**설정**: `kling/v2-1-pro`, `{"duration":"5"}`, 16:9, `cfg_scale` **0.5**(항공기 경로는 지켜야 하고 지형은 모델이 부드럽게 이어야 하는 중간값), `image` = **Leg 1 인코딩 mp4의 마지막 프레임**(`anchors/a02.png`), `image_tail` = **비움**(Leg 3의 첫 프레임이 아직 없다 — 양 끝을 다 고정하면 모델이 갈등을 "카메라 후퇴"로 푼다). 2회까지 생성.

**영상 검수 체크**
- [ ] 5초 내내 한 방향 하강뿐인가(멈춤·후퇴·방향 전환 없음)
- [ ] 항공기 모형이 우하 → 좌상으로 **딱 한 번** 지나가고, 프레임 밖에서 새로 들어오는 다른 물체가 없는가
- [ ] 3초 구름 통과가 스프라이트 겹침이 아니라 렌즈 앞을 지나는 솜으로 보이는가
- [ ] 해안선이 모핑되지 않고 시종 같은 반도인가
- [ ] 마지막 초 가장자리에 헤이즈·구름이 깔려 Leg 3와 씸이 가능한가

## 3) 페이지 오버레이 (영상에는 글자 없음, 페이지가 그린다)
```
대한민국 · 13개 조사 · 5개 부처
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-02-clouds-aircraft.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-02-clouds-aircraft.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15`로 마지막 프레임 추출 → `anchors/a03.png`(Leg 3 시작 프레임) → 페이스 계산(0.212–0.225 vh/필름초) → 6프레임 검수 시트.
