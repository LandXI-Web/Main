# 1장 Leg 9 · 산림식생 · 급경사지 — 프롬프트 팩 (Kling 웹/API 공용)

샷 리스트: `docs/superpowers/proto/2026-08-26-film-shotlist-v2.md` Leg 9 (고객 승인본). 프리앰블·네거티브 원본은 `_SHARED.md`. 승인 전 생성 금지.

**의도**: 능선을 타고 옆으로 흐르며 활엽·침엽·훼손 구역이 수관 색으로 갈리는 것을 보여주고, 한쪽 사면의 절개면과 낙석 자국이 조용히 지나간다 — 아직 실측 결과가 없는 항목을 "무엇을 보게 되는가"로만 제시한다.

> **울주 지역 고지(정직성)**: 울주군에는 **로컬 실촬·실탐지 자산이 없다.** 지형은 공개적으로 알려진 영남알프스 일대의 성격(1,000 m급 봉우리가 잇달아 늘어선 둥근 능선, 억새 능선과 깊은 계곡, 사면을 감아 도는 좁은 임도)만으로 기술한다. **지번·필지수·면적·경사도 같은 수치는 한 개도 만들어 넣지 않으며**, 페이지 오버레이도 `조사 항목(시연)`으로만 나간다. 실데이터가 오면 교체한다.

## 0) 체인 (중요)
- **이 leg의 시작 프레임은 Leg 8의 *인코딩된* mp4 마지막 프레임**(`anchors/a09.png`)이다. Leg 8의 `last_frame`으로 미리 만든 앵커가 있더라도 실제 시작 프레임은 **인코딩본에서 다시 뽑은 것**으로 갱신한다.
- 아래 스틸 프롬프트는 **체인이 깨졌을 때의 복구 프레임용**이자, Leg 8의 사전 `last_frame` 앵커를 만드는 프롬프트다.

## 1) 스틸 (복구용 / Leg 8 끝 프레임 앵커용)
**참조 이미지**: **울주 지형의 로컬 참조 이미지는 없다.** 재질 일관성 참조로만 `landxi/assets/proto/film/legs/src/anchors/namwon-3d-2.png`(이끼 수관·석고 사면 재질)과 `shots/film/k_1720.png`(t 17.20 · 산악 활강)을 쓴다 — **구도가 아니라 재질만** 참조한다.

**프롬프트** (프리앰블은 `_SHARED.md` verbatim)
```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.

Low aerial view riding along a long miniature mountain ridgeline, looking forward and down at about thirty-five degrees, the ridge running across the lower half of the frame from the lower left toward the centre right, further rounded ranks receding into pale haze in the upper third. The canopy is made of real moss and dyed lichen in clearly different patches: a broad soft mid-green area of broadleaf, a darker blue-green tightly napped area of conifer, and between them a thinned patch where the moss is sparse and grey plaster shows through. On the near flank, a raw cut face of pale grey plaster drops steeply below the track line, with a fan of loose sifted grit spilling down from it and a scatter of small fallen stones at its foot. A single thin unpaved forest track contours around the flank as a fine sand-coloured line. Nothing moves. The world continues past every edge. 35mm, f/4, 16:9.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, people, hikers, cars on roads, trucks, excavators, paved road, guardrail, snow peaks, alpine spires, glaciers, autumn red foliage, map overlay, coloured data overlay, contour lines, detection boxes
```
**설정**: `seedream/5-pro-text-to-image` (로컬 실참조가 없으므로 t2i), `16:9`, `quality`·`output_format` 동봉. 3장 → 1장. (이 컷을 Leg 8의 `last_frame` 앵커 `anchors/a09.png`로도 쓴다.)

**스틸 검수 체크**
- [ ] 수관이 **세 구역(활엽·침엽·훼손)**으로 재질까지 다르게 읽히는가(색만 칠한 것 아님)
- [ ] 절개면이 사면 한쪽에만 있고 낙석 부채꼴이 그 아래로 흘러내리는가
- [ ] 임도가 포장도로가 되지 않고 가드레일·차량이 없는가
- [ ] 능선이 둥근 어깨의 영남알프스형이고 설산·첨봉이 아닌가
- [ ] 등고선·탐지 박스·수치·라벨이 화면에 없는가

## 2) 영상 (5초, image-to-video)
**모션 프롬프트**
```
One continuous lateral flight, no cuts. The camera tracks steadily along the ridgeline from left to right for the whole five seconds at a constant low altitude and a constant thirty-five-degree downward tilt, the ridge staying across the lower half of the frame the entire time. The three canopy zones pass through the frame one after another so their different textures are readable in turn: the soft mid-green broadleaf moss, the darker tightly napped conifer, then the thinned patch where grey plaster shows through. As the camera passes the near flank, the raw cut face and the fan of loose grit below it come fully into view at the centre and slide on toward the left. A single small quadcopter drone model in milled brass and matte grey holds the lower right of the frame ahead of the camera, seen from behind, rotors softly blurred, drifting slowly toward the lower centre; it never turns and never leaves the frame. Ahead on the right, a bare clearing at the foot of the ridge begins to open. Daylight constant, no flicker. In the last second thin cotton-wool haze drifts across the far ranks and a soft cloud shadow settles over the near flank so the frame ends soft. Slow, controlled, cinematic. No cuts, no camera shake, no zoom snap, no direction change.
```
**네거티브**
```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, cars on roads, trucks, excavators, birds entering frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare, morphing terrain, canopy changing colour, landslide animation, falling rocks, smoke, fire, map overlay, coloured data overlay, detection boxes
```
**설정 (API — `POST /image-to-video/kling-2.5-turbo`, 근거: `docs/superpowers/proto/2026-08-26-kling-api-check.md`)**

| 항목 | 값 |
|---|---|
| 모델 | **`kling-v2-5-turbo`** (구 `kling-v2-1`·`-v2-1-master`는 **2026-09-15 폐지**) |
| `settings.resolution` | **`1080p`** |
| `settings.duration` | **`5`** |
| 화면비 | **16:9** — 첫 프레임 이미지의 종횡비가 곧 결과 종횡비 |
| `contents[].first_frame` | **Leg 8 인코딩 mp4의 마지막 프레임** = `anchors/a09.png`(인코딩본에서 갱신한 것) |
| `contents[].last_frame` | **비움** — Leg 10의 첫 프레임이 아직 없다 |
| cfg | **신형 스키마에 `cfg_scale`이 없다**. 좌→우 한 방향 트래킹과 수관 색 고정은 "constant low altitude", "canopy changing colour" 네거티브로만 걸린다 |
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
| 시작 프레임 업로드 | `anchors/a09.png` (Leg 8 **인코딩본**의 마지막 프레임) |
| 끝 프레임 | **비움** |
| 프롬프트 | 위 모션 프롬프트 그대로 |
| Negative prompt | 위 네거티브 그대로 (웹앱 전용 입력란) |
| 결과 | 다운로드 → `landxi/assets/proto/film/legs/gen/ch1-leg-09-forest-slope.mp4` |

**영상 검수 체크**
- [ ] 좌→우 한 방향 트래킹뿐이고 고도·틸트가 일정한가
- [ ] 세 수관 구역이 **차례로** 프레임을 지나며 각각 알아볼 수 있게 머무는가
- [ ] 절개면·낙석 부채꼴이 중앙을 지나 좌측으로 흘러가는가(붕괴 애니메이션 금지)
- [ ] 수관 색이 재생 중 스스로 변하지 않는가(계절 변화 연출 금지 — 근거 없음)
- [ ] 마지막 프레임 우측에 산자락 공터가 열리는가(Leg 10 시작 구도)

## 3) 페이지 오버레이 (**수치 없음** — 실결과 미보유)
```
산림식생 · 급경사지 — 조사 항목(시연)
```

## 4) 납품
- `landxi/assets/proto/film/legs/gen/ch1-leg-09-forest-slope.mp4`(원본), 복구 스틸을 썼다면 `ch1-leg-09-forest-slope.png`
- 받는 즉시: 스크럽 인코딩(`-g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`) → **인코딩본에서** `-sseof -0.15` → `anchors/a10.png` → 페이스 계산 → 6프레임 검수 시트.
