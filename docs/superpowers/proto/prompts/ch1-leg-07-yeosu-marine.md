# 1장 Leg 7 · 여수 해안 · 해양쓰레기 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 7 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 방파제와 어선 사이를 저공으로 훑으며 해안선에 점점이 박힌 흰 스티로폼 더미와 부표를 지나간다 — 항공 1,860건·드론 2,078건이 무엇을 세었는지 화면이 대신 말한다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 6의 *인코딩된* mp4 마지막 프레임**(`anchors/a07.png`)이다. Leg 6의 `last_frame`으로 미리 만들어 둔 앵커가 있더라도, 실제 시작 프레임은 **인코딩본에서 다시 뽑은 것**으로 갱신한다 — 인코딩이 픽셀을 바꾸므로 사전 앵커를 그대로 쓰면 1프레임 팝이 생긴다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이자, Leg 6의 사전 `last_frame` 앵커를 만드는 프롬프트다.

## 1) 스틸 (복구용 / Leg 6 끝 프레임 앵커용)
**참조 이미지**: `landxi/assets/proto/crops/yeosu-marine-2025-aerial/2.jpg`·`4.jpg` (2025 항공 탐지 크롭 — **해안선 형상·퇴적 위치의 실근거**), `landxi/assets/proto/crops/yeosu-marine-2026-drone/1.jpg`·`3.jpg` (2026 드론 8클래스 — **스티로폼·부표 개체 크기와 흩어진 정도**)

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Low aerial view along a miniature harbour coastline, looking forward and down at about forty degrees. A long grey plaster breakwater arm runs diagonally from the lower left into poured cobalt-blue resin water; small moored fishing-boat models in white and pale blue sit along its inner side, hulls still, no wake. On the shore side, a narrow strand of sifted grey sand meets a low rubble revetment; scattered along that strand and caught in the corner where it meets the breakwater are small drifts of white polystyrene fragments and a few round orange and white buoys, uneven, some in clumps and some single. Low ochre harbour buildings and moss headlands recede to a pale hazy horizon in the upper quarter. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, fishermen, cars on roads, boats under way, wake, foam trails, evenly spaced debris, tiled pattern, map overlay, coloured data overlay, detection boxes
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/crops/yeosu-marine-2025-aerial/2.jpg`. 3장 → 1장. (이 컷을 Leg 6의 `last_frame` 앵커 `anchors/a07.png`로도 쓴다.)

**스틸 검수 체크**
- [ ] 방파제·계류 어선·모래톱이 참조 크롭의 **실제 해안 형상**을 따르는가
- [ ] 스티로폼 더미가 **불규칙하게** 흩어져 있는가(등간격·타일 패턴 금지)
- [ ] 부표가 주황·흰색 실물 재질이고 네온이 아닌가
- [ ] 배가 정박 상태이고 항적·물보라가 없는가
- [ ] 탐지 박스·데이터 오버레이·텍스트 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous low pass, no cuts. The camera tracks steadily forward along the coastline for the whole five seconds, holding a constant low altitude and a constant forty-degree downward tilt, the breakwater sliding from the lower left of the frame toward the lower right as parallax. The moored fishing-boat models stay still at their berths, hulls rocking only very slightly on the resin water, no wake, no boat leaves its mooring. As the shore passes beneath, the drifts of white polystyrene fragments and the orange and white buoys come into clear resolution one group after another, staying in frame long enough to be counted by eye. One larger fishing-boat model sits at the far end of the breakwater and grows slowly at the centre right as the camera approaches it, never reaching or passing the camera. Daylight constant, no flicker. In the last second a soft cotton-wool cloud shadow crosses the strand from the water side and pale haze thickens along the far headlands so the frame ends soft. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, boats under way, wake, foam trails, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing coastline, debris multiplying, evenly spaced debris, map overlay, detection boxes
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 6 인코딩 mp4의 마지막 프레임** = `anchors/a07.png`(인코딩본에서 갱신한 것) |
| `contents[].last_frame` | **비움** — Leg 8의 첫 프레임이 아직 없다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 쓰레기 개체가 증식하지 않게 붙드는 것은 `first_frame`과 네거티브의 `debris multiplying, evenly spaced debris` 뿐이다 |
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
| 시작 프레임 업로드 | `anchors/a07.png` (Leg 6 **인코딩본**의 마지막 프레임) |
| 끝 프레임 | **비움** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-07-yeosu-marine.mp4` |

**영상 검수 체크**
- [ ] 저공 전진 한 방향뿐이고 고도·틸트가 일정한가
- [ ] 어선이 **한 척도 출항하지 않고** 항적·물보라가 없는가
- [ ] 스티로폼·부표 개수가 늘거나 줄지 않고, 한 무리씩 또렷하게 지나가는가
- [ ] 해안선이 참조 크롭 형상을 유지하고 모핑되지 않는가
- [ ] 마지막 초 구름 그림자+헤이즈가 깔려 Leg 8 상승과 씸이 되는가

## 3) 페이지 오버레이 (실데이터, 브래킷 탐지 이벤트)
```
해양쓰레기 항공 1,860건 · 드론 2,078건 8종
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-07-yeosu-marine.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-07-yeosu-marine.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a08.png` → 페이스 계산 → 6프레임 검수 시트.
