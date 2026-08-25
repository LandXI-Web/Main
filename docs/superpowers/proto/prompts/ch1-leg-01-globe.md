# 1장 Leg 1 · 모형 지구본 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-chapter1-shotlist.md` Leg 1. 승인 전 생성 금지.

## 1) 스틸 (첫 프레임) — 이미지 생성용
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/orbit-0.png` (우리 렌더: 한반도 정면 궤도 뷰 — *구도 참조용*, 재질은 무시), `shots/kie/namwon-greenhouse-test-03.jpg` (재질 참조: 석고·이끼·황동·레진)

**프롬프트**
```
A handmade miniature orrery-style model globe seen from space, floating in soft cream-colored haze, no table, no stand, no base, no edges — the world continues beyond the frame.
Continents are painted plaster with fine moss texture; oceans are glossy cobalt-blue resin; polar caps are matte white plaster.
A single thin brass orbit ring encircles the globe with one tiny brass satellite model on it.
The globe fills about 55% of the frame height, slightly below center; East Asia faces the camera, the Korean peninsula near the center with a few small cotton clouds over its southern coast.
One soft studio top-light from upper-left, gentle reflections on the resin ocean, no hard shadows, shallow depth of field on the far edge.
Muted palette: cream, moss green, sand, one cobalt-blue accent. Matte cream sky, no stars, no black space.
Photographed like a product still, 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, stand, edge, studio backdrop, black space, stars, blue sky, purple, neon, text, letters, logo, watermark, people, vehicles, cartoon, CGI look, glossy plastic, lens flare
```
**설정**: 16:9, 1920×1080 이상. 3장 뽑아 아래 체크 후 1장 선택.

**스틸 검수 체크**
- [ ] 한반도가 정면 중앙 부근에 있고 식별되는가
- [ ] 보드/받침/가장자리/검은 우주/별이 없는가
- [ ] 바다가 LX 블루(코발트) 하나뿐이고 보라·네온이 없는가
- [ ] 재질이 "손으로 만든 모형"으로 읽히는가(플라스틱·CGI 느낌 아님)
- [ ] 텍스트·로고 없음

## 2) 영상 (5초, image-to-video) — 선택한 스틸을 시작 프레임으로
**모션 프롬프트**
```
Slow cinematic shot. The miniature model globe rotates gently (about 35 degrees over the clip) so the Korean peninsula arrives at the exact center, while the camera dollies in very slowly (about 8%). The brass orbit ring and tiny satellite drift upward out of the top of the frame. Soft cream haze stays constant; small cotton clouds over the southern coast drift slightly. Studio top-light constant, no flicker. No cuts, no camera shake, no zoom bursts. Ends with the globe filling about 75% of the frame height, Korea centered, clouds visible south of it.
```
**네거티브**
```
board, table, base, edge, black space, stars, blue sky, text, logo, people, vehicles, flicker, camera shake, fast zoom, morphing continents, extra globes
```
**설정**: Kling 2.1 Pro(또는 Master), 5초, 16:9, 시작 프레임 = 선택 스틸. 끝 프레임 지정이 가능하면 비워 둠(Leg 2가 이 끝 프레임을 받음). 2회까지 생성해 아래 체크 통과본 선택.

**영상 검수 체크**
- [ ] 대륙 형태가 변형(모핑)되지 않는가
- [ ] 마지막 프레임: 한반도 정면, 지구본 ≈75%, 링·위성은 프레임 밖
- [ ] 첫·끝 프레임 모두 깨끗한 크림 배경(씸 가능)
- [ ] 파란 하늘·별·검은 우주가 끼어들지 않는가
- [ ] 흔들림·플리커 없음

## 3) 납품
- 파일: `landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.mp4` (원본), 스틸 `ch1-leg-01-globe.png`
- 저는 받는 즉시: 마지막 프레임 추출(`-sseof -0.15`) → Leg 2 참조 이미지로 저장, 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`), 페이스 계산, 6프레임 검수 시트 작성.
