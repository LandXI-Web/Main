# 1장 Leg 8 · 지구본 이동 → 울주 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 8 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 여수 해안에서 다시 솟아 곡면을 따라 북동으로 미끄러진 뒤, 첩첩이 겹친 영남 산줄기 위로 내려앉는다 — 바다에서 산으로 넘어가는 유일한 문법도 여전히 "지구본을 따라 미끄러지기"다.

> **울주 지역 고지**: 울주군에는 **로컬 실촬·실탐지 자산이 없다.** 그래서 이 leg와 Leg 9·10의 지형은 공개적으로 알려진 영남알프스 일대의 성격(1,000 m급 봉우리가 잇달아 늘어선 능선, 깊게 파인 계곡과 억새 능선, 사면을 감아 도는 좁은 임도)만으로 기술한다. **지번·필지번호·면적 같은 조사 수치는 한 개도 만들어 넣지 않는다.**

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 7의 *인코딩된* mp4 마지막 프레임**(`anchors/a08.png`)이다. 원본 렌더가 아니라 인코딩 산출물에서 뽑는다.
- **이 leg는 예외적으로 끝 프레임을 지정한다.** 샷 리스트가 6·8·12는 끝 프레임을 앞뒤 leg와 맞추라고 못박았다 → Leg 9의 첫 프레임 앵커(`anchors/a09.png`)를 먼저 만들어 `last_frame`으로 넣는다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이다.

## 1) 스틸 (복구용 첫 프레임) — 체인 실패 시에만
**참조 이미지**: `landxi/assets/proto/film/legs/src/anchors/orbit-2.png` (우리 렌더: 곡면 복귀 구도), `shots/film/k_1720.png` (t 17.20 · 곡면 활강), `landxi/assets/proto/film/legs/src/anchors/cloud-1.png` (상승 안개 재질). **울주 지형 자체의 로컬 참조 이미지는 없다** — 아래 서술만으로 생성한다.

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

High view climbing away from a miniature harbour coast, looking forward and down at about seventy degrees, the ground already curving so the horizon reads as the gentle arc of a model globe. The poured cobalt-blue resin sea fills the lower left and narrows toward the upper right, where a dense mountain country begins: rank after rank of moss-covered plaster ridges overlapping into the haze, rounded shoulders rather than sharp spires, deep V-cut valleys of grey plaster between them, pale dry grass on the highest saddles, a single thin unpaved forest track drawn as a fine sand-coloured line contouring around one flank. Veils of cotton-wool haze lie between the ranks of ridges. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, cars on roads, stars, black space, second globe, map graticule, latitude lines, country borders, snow peaks, alpine spires, glaciers
```
**설정**: `seedream/5-pro-image-to-image`, `16:9`, `quality`·`output_format` 동봉, `--ref landxi/assets/proto/film/legs/src/anchors/orbit-2.png`. 3장 → 1장.

**스틸 검수 체크**
- [ ] 지평선이 곡선(지구본 복귀)이고 바다 → 산악으로 넘어가는 축이 보이는가
- [ ] 능선이 **뾰족한 알프스형 첨봉이 아니라** 둥근 어깨의 첩첩 산줄기인가(영남알프스 성격)
- [ ] 임도가 사면을 감아 도는 가는 선 하나로만 그려졌는가(포장도로·차량 금지)
- [ ] 만년설·빙하 같은 없는 지형이 끼어들지 않았는가
- [ ] 경위선·국경선·텍스트 없음

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous move, no cuts. For the first two seconds the camera keeps climbing away from the harbour coast and the ground curls further so the horizon is a clear gentle arc of a model globe. Without stopping or changing direction, that same motion carries the camera sliding along the curved surface toward the upper right, northeast, the cobalt resin sea falling away behind at the left while rank after rank of moss-covered ridges rises to fill the frame. In the last two seconds the camera settles downward toward those ridges until one long ridgeline runs across the lower half of the frame and its texture resolves into moss canopy, grey plaster scree and pale dry grass, with the thin sand-coloured forest track contouring around the near flank. Veils of cotton-wool haze sit between the ranks throughout and thicken slightly across the outer thirds in the final second so the frame ends soft. Nothing enters or leaves the frame. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing terrain, morphing coastline, spinning globe, second globe, map graticule, country borders, snow peaks, glaciers, stars, black space
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** — `last_frame`을 쓰므로 **필수** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 7 인코딩 mp4의 마지막 프레임** = `anchors/a08.png` |
| `contents[].last_frame` | **`anchors/a09.png`** — Leg 9 첫 프레임 앵커를 먼저 만들어 넣는다. 끝 프레임 **단독 지정은 불가** |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 상승→활강→하강을 한 동작으로 묶는 것은 "without stopping or changing direction" 문장과 `last_frame` 두 개뿐이다 |
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
| 시작 프레임 업로드 | `anchors/a08.png` (Leg 7 **인코딩본**의 마지막 프레임) |
| 끝 프레임 업로드 | **`anchors/a09.png`** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-08-globe-to-ulju.mp4` |

**영상 검수 체크**
- [ ] 상승 → 곡면 활강 → 하강이 **끊김 없는 한 동작**인가
- [ ] 지구본이 자전하지 않고 카메라만 표면을 따라 움직이는가
- [ ] 도착 지형이 둥근 어깨의 첩첩 능선이고 알프스형 첨봉·설산이 아닌가
- [ ] 마지막 프레임에 능선이 화면 하단 절반을 가로지르는가(Leg 9 시작 구도)
- [ ] 안개가 능선 사이와 가장자리에 남아 씸을 덮어 주는가

## 3) 페이지 오버레이 (영상에는 글자 없음, 페이지가 그린다)
```
룰러 · 울주 점등
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-08-globe-to-ulju.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-08-globe-to-ulju.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a09.png`를 실제 결과 프레임으로 **갱신** → 페이스 계산 → 6프레임 검수 시트.
