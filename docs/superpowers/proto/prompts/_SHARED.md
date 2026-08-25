# 공유 프리앰블 · 네거티브 (9개 파일에 토씨 하나 안 바꾸고 들어간다)

> `assets.md` 원칙: **모든 프롬프트 = preamble + 빈 줄 + scene.** preamble은 매번 verbatim.
> 따로 생성한 스틸 여러 장을 "한 번의 촬영"처럼 보이게 만드는 **유일한** 장치다.
> 한 글자라도 바꾸면 그 leg만 다른 촬영으로 읽히고, 씸에서 재질이 튄다.

## ⚠️ 2026-08-26 룩 리젝트 — "석고 보드" 프레이밍 폐기, ORRERY식 연속 월드로 재작성

**고객 피드백(원문)**: *"석고 보드는 왜 갑자기 나온 거지? 지구본 모양으로 돌면서 비닐하우스·해양쓰레기·
불법소각장 조사 아이템들이 유튜브 벤치마크 영상처럼 나와야지."*

테스트 leg(`docs/superpowers/proto/2026-08-26-kie-test-leg.md`)가 검증한 것은 **재질 리얼리즘과
모션 coherence**였을 뿐, **프레이밍 자체가 리젝트됐다** — "흰 보드 위에 놓인 모형 사진"(에디토리얼
스틸라이프 킷 #2를 그대로 가져온 결과)은 ORRERY가 실제로 만든 것과 다르다.
`docs/superpowers/research/2026-08-26-QUI6-segment-0522.md` §3 비트 시트가 근거다: ORRERY는
**책상 위 지구본으로 여닫을 뿐**(f_005–009 히어로, f_091 귀환), 그 사이 본편(낙하 → 구름 관통 →
교토 → 파타고니아 → 에르그 셰비)은 **테두리도 보드도 없는 연속된 지형**이다 — 지형이 프레임
가장자리 너머로 계속 이어지고, 실사 촬영된 솜/연무가 카메라 아래·주위를 통과하며, 지평선과
하늘이 있다. 우리 leg 04–09(비닐하우스·변화탐지·해양쓰레기 등)가 바로 그 본편에 해당하므로
**이 leg들은 절대 "흰 배경 위의 물체"로 찍히면 안 된다.**

아래 PREAMBLE·NEGATIVE는 이 원칙으로 재작성했다. **리젝트된 테스트 스틸**은
`docs/superpowers/proto/2026-08-26-diorama-film-storyboard.md` §4 leg 07 항목에 표시해 두었다.

---

## PREAMBLE (verbatim)

```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

이전 프리앰블(`worlds.md` #2 High-key editorial: *"Editorial still-life photography on a seamless
bone-white cyclorama..."*)은 **정지된 오브젝트 촬영 킷**이라 "보드 위의 모형"으로 읽혔다.
재질어(Milled brass / painted plaster / real moss / poured resin / sifted sand / laser-cut acrylic /
fibre-optic practicals)는 ORRERY에서 그대로 가져와 유지하고, **바뀐 것은 프레이밍뿐이다**:
스튜디오 사이클로라마 → **테두리 없는 연속 지형 + 지평선 + 하늘 + 구름.**

## NEGATIVE (verbatim, kling `negative_prompt`)

```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

**`board, table, plinth, base plate, edge, studio, white background, blue sky paint`가 이번에 추가된
부분이다.** `blue sky paint`는 하늘 자체를 금지하는 게 아니라 — 하늘은 이제 **원한다** —
kling이 하늘을 부드러운 헤이즈 대신 새파랗게 "칠한 듯" 채도 있게 그리는 실패 모드만 겨냥한다.
(참고: 이 리스트에 `sky`/`clouds`/`horizon`을 통째로 넣지 않는다 — 지난 테스트에서 발견된 문제는
"하늘이 나온다"가 아니라 "보드 프레이밍이었다". 이제는 하늘·지평선·구름이 룩의 핵심이다.)

---

## 스크럽 클립 4대 철칙 (`assets.md` — 모션 프롬프트를 쓸 때마다 다시 읽을 것)

1. **한 방향의 연속 이동 하나만.** 컷·스냅·방향 전환은 휠 아래에서 충격이 된다.
2. **미리보기에서 "느리다" 싶을 만큼 느리게.** 2~3 뷰포트 높이에 걸쳐 펼쳐진다.
3. **피사체가 처음부터 끝까지 프레임 안에.** 독자가 아무 데나 주차할 수 있다.
4. **아무것도 들어오거나 나가지 않는다.** 사람이 걸어 들어오면 1프레임과 120프레임이 서로 다른 샷이 되고 포스터가 둘 다와 안 맞는다.
5. **지형은 프레임 너머로 계속 이어진다.** 어느 프레임에서도 보드 모서리·테이블 다리·스튜디오 벽이 보이면 안 된다.

## 공통 파라미터

| 항목 | 값 |
|---|---|
| 스틸 | `seedream/5-pro-image-to-image` (ref 있음) / `-text-to-image` (없음) |
| `--ar` | `16:9` → 2736×1520. **`4:5`는 거부된다** |
| 필수 파라미터 | `aspect_ratio` · `quality` · `output_format` **3개 전부** |
| 클립 | `kling/v2-1-pro`, `{"duration":"5"}` |
| 씸 | leg N+1 시작 이미지 = leg N **인코딩된** mp4 마지막 프레임 (`-sseof -0.15`) |
| 크레딧 | 스틸 14 / 5초 클립 50 (kie.ai Logs 실측) |

## CLI 템플릿

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/aNN.png --ar 16:9 --ref <REF>
node <skill>/scripts/kie.mjs shot  "<MOVE>" anchors/aNN.png out/legNN.mp4 --dur 5 --tail anchors/aNN+1.png
bash  <skill>/scripts/encode.sh out/legNN.mp4 assets/legNN.mp4
bash  <skill>/scripts/encode.sh out/legNN.mp4 assets/legNN-m.mp4 mobile
ffmpeg -sseof -0.15 -i assets/legNN.mp4 -frames:v 1 -q:v 2 anchors/aNN+1.png
ffmpeg -i assets/legNN.mp4 -frames:v 1 -q:v 3 assets/pNN.webp
```
