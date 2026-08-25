# 1장 Leg 6 · 지구본 이동 → 여수 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 6 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 남원 상공에서 솟아오르면 지형이 다시 모형 지구본의 곡면으로 말리고, 카메라가 그 곡면을 따라 남동쪽으로 미끄러져 여수 반도로 내려앉는다 — 장소를 바꾸는 유일한 문법이 "지구본을 따라 미끄러지기"임을 못박는 leg.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 5의 *인코딩된* mp4 마지막 프레임**(`anchors/a06.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- **이 leg는 예외적으로 끝 프레임을 지정한다.** 샷 리스트가 6·8·12는 끝 프레임을 앞뒤 leg와 맞추라고 못박았다 → Leg 7의 첫 프레임 앵커(`anchors/a07.png`)를 **먼저 만들어 두고** `last_frame`으로 넣는다. 이동 leg는 도착 구도가 어긋나면 다음 leg 전체가 흔들리기 때문이다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/orbit-1.png` (우리 렌더: 곡면 복귀 구도), `shots/film/k_1420.png` (t 14.20 · 상승), `landxi/assets/proto/film/legs/src/anchors/cloudv2-1.png` (상승 시 안개·구름 재질)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Rising high above a miniature farming basin, looking forward and down at about seventy degrees, the ground already curving away at the top of the frame so the horizon reads as the gentle arc of a model globe rather than a straight line. Quilted felt parcels and moss ridges shrink into fine texture in the lower half; to the lower right a wide plain of poured cobalt-blue resin sea begins, its surface catching one soft even highlight. Thin veils of cotton-wool haze lie between the camera and the ground across the outer thirds of the frame. No brass ring yet. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, cars on roads, stars, black space, second globe, map graticule, latitude lines, country borders
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/film/legs/src/anchors/orbit-1.png`. 3장 → 1장.

**스틸 검수 체크**
- [ ] 지평선이 **직선이 아니라 완만한 곡선**으로 돌아왔는가(지구본 복귀)
- [ ] 지형이 여전히 이끼·펠트 실물이고 위성사진처럼 평면화되지 않았는가
- [ ] 우하단에 코발트 레진 바다가 시작되는가(여수로 갈 방향)
- [ ] 경위선·국경선·지도 기호가 없는가
- [ ] 보드·검은 우주·별 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous move, no cuts. For the first two seconds the camera keeps climbing and the ground curls further away until the horizon is a clear gentle arc of a model globe. Without stopping or changing direction, that same motion carries the camera sliding along the curved surface toward the lower right, southeast, the land narrowing into a ragged peninsula while the poured cobalt-blue resin sea widens to fill more than half the frame. In the last two seconds the camera settles downward toward that peninsula and a harbour resolves: a long grey plaster breakwater arm reaching into the resin water, small moored fishing-boat models along its inner side, low ochre buildings behind it. Thin cotton-wool haze drifts between the camera and the ground throughout and thickens slightly across the outer thirds in the final second so the frame ends soft. Nothing enters or leaves the frame. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing coastline, coastline changing shape, spinning globe, second globe, map graticule, country borders, stars, black space
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** — `last_frame`을 쓰므로 **필수** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 5 인코딩 mp4의 마지막 프레임** = `anchors/a06.png` |
| `contents[].last_frame` | **`anchors/a07.png`** — Leg 7 첫 프레임 앵커를 먼저 만들어 넣는다(이동 leg는 도착 구도를 잠근다). 끝 프레임 **단독 지정은 불가**하므로 반드시 첫 프레임과 함께 보낸다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 상승→활강→하강이 한 동작으로 이어지게 하는 것은 "without stopping or changing direction" 문장과 `last_frame` 두 개뿐이다 |
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
| 시작 프레임 업로드 | `anchors/a06.png` (Leg 5 **인코딩본**의 마지막 프레임) |
| 끝 프레임 업로드 | **`anchors/a07.png`** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-06-globe-to-yeosu.mp4` |

**영상 검수 체크**
- [ ] 상승 → 곡면 활강 → 하강이 **끊김 없는 한 동작**인가(중간에 멈추거나 되돌아가지 않음)
- [ ] 지구본이 스스로 자전하지 않고 **카메라만** 표면을 따라 움직이는가
- [ ] 해안선이 모핑 없이 같은 형상을 유지하며 반도로 좁아지는가
- [ ] 마지막 프레임에 방파제와 계류 어선이 아래쪽에 보이는가(Leg 7 시작 구도)
- [ ] 상승·하강 내내 안개가 씸을 덮어 줄 만큼 프레임 가장자리에 남아 있는가

## 3) 페이지 오버레이 (영상에는 글자 없음, 페이지가 그린다)
```
룰러 · 여수 점등
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-06-globe-to-yeosu.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-06-globe-to-yeosu.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a07.png`를 실제 결과 프레임으로 **갱신**(사전 앵커와 다르면 실제 결과를 채택) → 페이스 계산 → 6프레임 검수 시트.
