# 1장 Leg 12 · 귀환 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 12 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 계속 솟아올라 다시 모형 지구본과 황동 링, 그 위의 작은 위성으로 돌아온다 — 도착이 아니라 **귀환**이고, 마지막 프레임이 Leg 1의 첫 프레임과 맞물려 필름이 루프가 된다.

## 0) 체인 (중요 — 이 leg가 루프를 닫는다)
- **이 leg의 시작 프레임은 Leg 11의 *인코딩된* mp4 마지막 프레임**(`anchors/a12.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- **이 leg는 끝 프레임을 반드시 지정한다.** 샷 리스트가 6·8·12는 끝 프레임을 앞뒤 leg와 맞추라고 못박았고, 12는 **Leg 1의 첫 프레임**(`docs/superpowers/proto/prompts/ch1-leg-01-globe.md`에서 승인된 스틸 = `landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.png`)으로 닫혀야 스크럽이 처음으로 되돌아갈 때 튀지 않는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/orbit-0.png` (Leg 1과 **같은** 궤도 구도 — 루프를 닫으려면 같은 렌즈·같은 각도여야 한다), `shots/film/k_2260.png` (t 22.60 · 귀환), `landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.png` (**Leg 1 승인 스틸 — 도착 구도의 기준**)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

The miniature model world seen from far out in soft cream haze, its curved edge clear along the top and both sides so it now reads as a globe rather than a landscape, filling about ninety percent of the frame height and still cropped by the lower edge. East Asia faces the camera with the Korean peninsula near the centre; continents are painted plaster with fine moss texture, oceans glossy cobalt-blue resin, small cotton clouds over the southern coast. Thin translucent tinted acrylic strips still lie on the land, now fine and quiet at this distance. No stand, no base, no table, nothing holds it. Matte cream sky, no stars, no black space. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, stand, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, stars, black space, second globe, map graticule, latitude lines, country borders, city lights, HUD, legend
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/film/legs/src/anchors/orbit-0.png`. 3장 → 1장.

**스틸 검수 체크**
- [ ] 지형이 완전히 **구체(지구본)**로 다시 읽히는가
- [ ] 대륙 형상이 Leg 1 승인 스틸과 같은가(다르면 루프가 안 닫힌다)
- [ ] 받침·스탠드·보드·검은 우주·별이 없는가
- [ ] 색 띠가 멀어져 조용해졌을 뿐 사라지지도 번쩍이지도 않는가
- [ ] 텍스트·범례·수치 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous climb, no cuts. The camera keeps rising away from the model world for the whole five seconds in a single unbroken pull-back, the curvature closing until the world is a complete globe held in soft cream haze, settling to about seventy-five percent of the frame height with the Korean peninsula facing the camera near the centre. As it recedes, a single thin brass orbit ring swings slowly down into frame from above and comes to encircle the globe, one tiny brass satellite model riding on it, arriving from the top of the frame and settling at the upper left; the ring and satellite move only with that one slow arrival and never spin. The thin tinted acrylic strips on the land stay exactly where they are, quiet and unblinking. Small cotton clouds drift over the southern coast. Cream haze constant, top-light constant, no flicker. The clip ends on the same framing the film opened with. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, stand, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing continents, spinning globe, spinning ring, extra globes, extra rings, extra satellites, map graticule, country borders, city lights, stars, black space, HUD, legend
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** — `last_frame`을 쓰므로 **필수** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 11 인코딩 mp4의 마지막 프레임** = `anchors/a12.png` |
| `contents[].last_frame` | **`landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.png`** — Leg 1의 승인 스틸(=필름 첫 프레임). 이걸 넣어야 루프가 닫힌다. 끝 프레임 **단독 지정은 불가**하므로 반드시 첫 프레임과 함께 보낸다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 도착 구도를 잠그는 장치는 오직 `last_frame`이다 — 이 leg에서 끝 프레임을 비우면 루프가 어긋난다 |
| 네거티브 | **`negative_prompt` 필드 없음** → 위 네거티브를 프롬프트 끝에 `Do not include: …` 로 병합 |
| 비용 | 0.5 U/s × 5 s = 2.5 U ≈ **$0.35**/테이크, 2테이크 $0.70 |

2회까지 생성.

**웹앱 수동 생성 (klingai.com)**

| 웹앱 항목 | 설정 |
|---|---|
| 모드 | 이미지 → 영상 (Image to Video) |
| 모델 | **Kling 2.5 Turbo** |
| 해상도 | **1080p** (끝 프레임을 쓰므로 필수) |
| 길이 | **5s** |
| 시작 프레임 업로드 | `anchors/a12.png` (Leg 11 **인코딩본**의 마지막 프레임) |
| 끝 프레임 업로드 | **`ch1-leg-01-globe.png`** (Leg 1 승인 스틸) |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-12-return.mp4` |

**영상 검수 체크**
- [ ] 상승 한 방향뿐이고 지구본이 스스로 자전하지 않는가
- [ ] 황동 링과 위성이 **위에서 한 번 내려와 자리 잡을 뿐** 회전·증식하지 않는가
- [ ] 대륙이 모핑되지 않고 한반도가 정면 중앙 부근에 남는가
- [ ] 색 띠가 그대로 남아 있고 깜빡이지 않는가
- [ ] **마지막 프레임이 Leg 1 첫 프레임과 겹쳐 보이는가**(루프 조인트 — PSNR 28 dB 이상을 목표로 측정)

## 3) 페이지 오버레이 (CTA — 영상에는 글자 없음, 페이지가 그린다)
```
로그인하고 시작하기
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-12-return.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-12-return.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본의 마지막 프레임과 Leg 1 첫 프레임의 PSNR 측정**(루프 조인트 검증, 9개 조인트 기준 28.5–39.8 dB) → 12 leg 전체 페이스 감사(0.212–0.225 vh/필름초, 편차 6% 이내) → 6프레임 검수 시트.
