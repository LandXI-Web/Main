# 1장 Leg 3 · 드론 이동 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 3 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 구름 아래로 내려선 카메라 앞을 미니어처 드론 한 대가 앞서 날며 남원 방향으로 길을 내준다 — 세 번째 센서가 등장하고, 이제부터는 드론의 눈높이다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 2의 *인코딩된* mp4 마지막 프레임**(`anchors/a03.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다 — 인코딩이 픽셀을 바꾸므로 원본에서 뽑으면 씸에 1프레임 팝이 생긴다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다. 체인이 살아 있으면 생성하지 않는다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/cloudv2-2.png` (구름층 하단 이탈), `shots/film/k_0920.png` (t 9.20 · 구름 아래), `shots/film/k_1120.png` (t 11.20 · 남원 접근)

**프롬프트** (프리앰블은 `_SHARED.md`에서 **토씨 하나 바꾸지 않고** 복사한 것 — 매 leg 동일해야 따로 만든 클립들이 "한 번의 촬영"으로 읽힌다)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

High aerial view just beneath the cloud base, looking forward and down at about sixty degrees over a miniature mountainous province. Moss-covered plaster ridges run diagonally across the frame, pale sifted-sand river beds between them, small quilted fields of felt green and felt ochre in the valleys. The horizon sits high in the upper quarter and dissolves into warm haze; ragged cotton-wool cloud still hangs over the top corners. In the lower third of the frame a single small quadcopter drone model in milled brass and matte grey hovers ahead of the camera, seen from behind and slightly above, its four rotors motion-blurred. Empty lanes, nothing moving on the ground. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, cars on roads, second drone, drone HUD, crosshair, stars, black space
```
**설정**: `seedream/5-pro-image-to-image`, `aspect_ratio` `16:9`(2736×1520), `quality`·`output_format` 필수 동봉, `--ref shots/film/k_0920.png`. 3장 뽑아 아래 체크 후 1장.

**스틸 검수 체크**
- [ ] 카메라가 구름 **아래**에 있고 지평선이 상단 1/4에 걸려 있는가
- [ ] 드론이 하단 1/3에서 **뒤에서 본 모습**으로 앞서 있는가(카메라를 향해 오지 않음)
- [ ] 능선이 이끼·석고 실물로 읽히고 CG 지형이 아닌가
- [ ] 프레임 어디에도 보드 모서리·테이블·스튜디오 벽이 없는가
- [ ] 텍스트·HUD·크로스헤어 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous forward flight, no cuts. The camera glides steadily forward and slightly downward for the whole five seconds, following the small quadcopter drone model that stays ahead of it in the lower third of the frame, seen from behind, rotors softly blurred, never turning back toward the camera and never leaving the frame. Moss ridges pass beneath from the top of the frame to the bottom as parallax. The drone drifts gently from the lower centre toward the lower left across the clip while a wide mountain ridge opens on the right and reveals a broad flat basin of quilted miniature fields beyond it. Ragged cotton-wool cloud stays along the top corners and its soft shadow sweeps once across the ridges from left to right. Light constant soft daylight, no flicker. In the last second a low band of pale haze settles across the far side of the basin so the frame ends soft at its edges. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing terrain, extra drones, drone turning around, HUD, crosshair
```
**설정**: `kling/v2-1-pro`, `{"duration":"5"}`, 16:9, `cfg_scale` **0.6**(드론이 5초 내내 프레임 안에 머물고 지정 경로를 지켜야 하므로 프롬프트 준수를 높인다), `image` = **Leg 2 인코딩 mp4의 마지막 프레임**(`anchors/a03.png`), `image_tail` = **비움**(Leg 4의 첫 프레임이 아직 없다 — 양 끝을 다 고정하면 모델이 갈등을 "카메라 후퇴"로 풀어 모든 leg가 같은 와이드샷이 된다). 2회까지 생성.

**영상 검수 체크**
- [ ] 드론이 5초 내내 프레임 안에 있고 뒤돌거나 카메라 쪽으로 오지 않는가
- [ ] 전진 한 방향뿐이고 상승·하강 전환·정지가 없는가
- [ ] 우측 능선 너머로 **분지(남원 평야)**가 실제로 열리는가
- [ ] 구름 그림자가 능선을 좌→우로 한 번만 훑고 지나가는가
- [ ] 마지막 초 원경 헤이즈가 깔려 Leg 4와 씸이 가능한가

## 3) 페이지 오버레이 (영상에는 글자 없음, 페이지가 그린다)
```
위성 2 m · 항공 25 cm · 드론 1 cm
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-03-drone.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-03-drone.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15`로 마지막 프레임 추출 → `anchors/a04.png`(Leg 4 시작 프레임) → 페이스 계산(0.212–0.225 vh/필름초) → 6프레임 검수 시트.
