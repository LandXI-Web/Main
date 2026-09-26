# F1-D 보고서 — Land-XI Global (3차 · 2차 판정 불합격 6건 반영)

2026-09-27 기준. 상세 대조·레퍼런스·계약 변경 요청은 `F1-D-result.md`(§7 에 이번 해결 내역 · §6 은 2차).

## 이번 변경 파일(모두 소유 경로 · 커밋 안 함)

- `landxi/global/js/globe-stage.js` — 메모리 타일 캐시 `lxm://`(GIBS·V-World) · `pull` 호스트별 병렬 · `tilesFor` `to` 상한 · `warmCams` · `warmInMap` 진행 콜백 · `arriveCross` 재작성(준비 비대기 · 덮기 = max(at, 준비) · `fastFade` · `waitPrep`) · `yearSpan` · Blue Marble z3+ ±79° · `maxTileCacheZoomLevels 24` · 핀·락온 `stage.freeze` · fly/ease moveend 순서
- `landxi/global/js/boot.js` — 가림막 제거 · 남원 대역 지도(두 번째 지도) + 본 지도 데우기(칩 n/m) · 한국 안 EOX 끄기 · `go()` 는 데우기 뒤 출발 · 메이크틸라: 경유 꼬리에서 하강 · at 0.4 · 첫 칠 `data-scene=namwon`
- `landxi/global/js/ladder-global.js` — V-World 타일 `lxm://`
- `landxi/global/js/ndvi-theater.js` — HUD 숫자 트윈 380 · 관제 딥링크 결손 칩 · 카드 `reveal`
- `landxi/global/js/disaster-swipe.js` · `sprawl.js` · `cards-global.js` — 카드 한 번에(`reveal`)
- `landxi/global/global.css` — `data-warm` 가림막 규칙 삭제 · `.g-lineage__wait` · `.g-hud-big__v`
- `landxi/global/data/i18n-{en,ko}.json` — `ys.ops.wait`
- 테스트: `tests/e2e/f1d-verdict2.spec.mjs`(신규 4) · `f1d-ysykata-ndvi`(딥링크 기대 변경)
- 도구: `shots/f1/D/_tools/{record(ready·warm·transit 기록), namwon-pf, retreat-dbg, pole-dbg}.mjs`

## 실행 방법

```
# 판정 투어(off · 리플레이) — 정적 서버 4173
http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1
node shots/f1/D/_tools/record.mjs      # 녹화 + 타일 부족 계측 → _raw/meta.json
node shots/f1/D/_tools/stills.mjs      # 정지 1280/1440/1920
node shots/f1/D/_tools/namwon-pf.mjs   # 남원 부트 칩 진행 · 호스트별 요청
node shots/f1/D/_tools/retreat-dbg.mjs # 후퇴 중 소스별 렌더 가능 타일
npx playwright test tests/e2e/f1d- --workers=1
```

## 실측 수치(빈 캐시 · 1440×900 · off)

| 항목 | 값 |
|---|---|
| e2e | **35 통과** · 2 건너뜀(on 전용) · 6.0 분 · `shots/f1/D/logs/e2e-f1d-0927.log` |
| 남원 진입 ready | **0.72 s**(가림막 0 · 지도 opacity 1 · 칩 보임) · 데우기 13.4 s = 경로 922 장 + 카메라 20(칩 n/m 표시) · 요청 오류 0 |
| 남원 후퇴 | 부족 ≥2 프레임 0(이전 294 ms · 부족 8) · 극 캡 순백(남색 띠 0) |
| 경유점 → 메이크틸라 | 경유점 대기 **3 ms**(이전 2.4–4.5 s) · 2400 비행 실재 · 크로스페이드 at 0.4 · 500 |
| 하강 타일 부족 ≥2 구간 | 100 ms × 2(으슥아타 · 경유) · 500 ms 초과 **0** |
| 녹화 | `f1d.webm/mp4` 55.0 s · rAF p95 16.8 ms(n 3902) · 캔버스 2 · 콘솔 오류 0 · 마크 globe 3.2 · descend 4.7 · ysykata 9.6 · gj1-done 26.4 · sokuluk 30.4 · meiktila 46.5 · end 52.5 s |
| 부트 원본 | `f1d-boot-from-open.mp4`(페이지 열기 → 투어 시작 +6 s · 잘라내지 않은 대기 구간) |

## 산출물(`shots/f1/D/` · 사본 `shots/f1/F1-D/`)

- 영상 `f1d.webm` · `f1d.mp4` · `f1d-boot-from-open.mp4` · 메타 `record-meta.json` · 로그 `logs/record-0927.json`
- 스트립 `strip/` — 0 부트 대역+칩(2.3 s 간격) · 1 남원 후퇴(100 ms) · 2 글로브→으슥아타 · 3 8칸 도착(200 ms) · 4 소쿨룩 스와이프 · 5a 경유→메이크틸라(200 ms) · 5b 전후 스와이프
- 정지 `still/*-{1280,1440,1920}.png` · 극 캡 계측 `_tools/pole-sheet.png`

## 폴백 여부

- 판정 영상은 off 리플레이(마스트 'Demo · replaying stored results'). on 경로는 2차 때 실 게이트웨이로 실증(변경 없음).
- 관제 계보는 링크 대신 결손 칩 — `landxi/ops` 가 `?job=` 을 받을 때까지(계약 변경 요청 9).

## 남은 것

1. 남원 진입 첫 방문은 데우기 13 s 를 칩으로 기다린다(원천 EOX 처리량 ≈ 70 장/s 한계). 재방문(HTTP 캐시)은 짧다.
2. 관제 `?job=` 행 펼침 — F1-C/F1-∑ 몫. 도착 시 `.g-lineage__wait` → 링크로 교체.
3. F1-A fx 교체 · 계약 변경 요청 5–10 · 사업국 36 vs 38 · 러시아어 UI 여부(2차와 동일).
