# 지오·AI 플랫폼 관리자/현황 대시보드 벤치마킹 — 실측 조사

- 작성일: 2026-08-26 · 브랜치 `plan1-foundation` · 캡처 `shots/bench/dash/`(gitignore)
- 발주 지시(원문): **"제발 임의 구현보다는 잘 만든 거 벤치마킹해서 따왔으면 좋겠다."**
- 추가 지시(원문): **"대시보드는 축소하는데, 첫 화면이니 잘 보이게 하자."**
- 제약: 기능은 원본과 **1:1**(`docs/superpowers/specs/2026-08-26-map-dashboard-options.md` §1 의 A1–A11 / B1–B16),
  타이포·색은 흰 B안(`docs/superpowers/specs/2026-08-25-client-taste-profile.md` §4).
- 이 문서는 **조사서**다. 제품 코드는 한 줄도 건드리지 않았다.

> 상태: 작성 중 (캡처 진행 중). 최종본은 §1 대상별 해부 → §2 후보 3안 → §3 이식 권고 → §4 안티패턴 순.

## 0. 수집 방법과 접근 한계 (정직 기록)

캡처는 전부 이 저장소에서 **Playwright(Chromium, headed)** 로 직접 찍었다. 두 해상도(1440×900 / 1920×1080)를
쓰고, 쿠키 배너는 자동 제거했다. 각 캡처마다 `page.evaluate()` 로 **DOM 실측 JSON**(`shots/bench/dash/_measure-*.json`)
을 함께 남겼다 — 타입 스케일(사이즈/굵기/행간/자간/폰트패밀리 + 등장 횟수), 레일 폭, 콘텐츠 컬럼 x·폭,
그리드 `grid-template-columns`·`gap`, 행 높이 중앙값(→ 900px당 행 수), border-radius/box-shadow/border 사용 분포,
색 사용 빈도, 그리고 **첫 900px(above the fold)** 의 노드 수·최대 폰트·이미지 점유율.

| 접근 등급 | 의미 | 대상 |
|---|---|---|
| **L** (Live DOM) | 실제 제품 UI를 브라우저에서 열고 DOM까지 실측 | kepler.gl, Copernicus Browser(EO Browser 후속), ArcGIS Online 콘텐츠 브라우저, ArcGIS Dashboards(공개 인스턴스), NASA Earthdata Search, V-World 포털 |
| **D** (Docs/official screenshot) | 로그인 벽 → 공식 문서·매뉴얼의 제품 스크린샷을 원본 해상도로 재렌더해 캡처 | UP42 콘솔, Mapbox Studio/Account, Roboflow, Google Earth Engine 코드에디터, Foursquare Studio, Cesium ion, Vercel, Cloudflare |
| **M** (Marketing) | 마케팅 페이지의 DOM 목업/스크린샷 | Linear, Stripe, Planet, 토스 비즈니스, 네이버 클라우드 |

**중요한 사실 정정 하나**: 지시서의 *Sentinel Hub EO Browser* 는 **폐기(deprecated)** 됐다.
`apps.sentinel-hub.com/eo-browser/` 를 열면 "EO Browser has been deprecated. Please move your workflows to the new
and improved Planet Insights Platform." 모달만 뜬다(캡처 `eobrowser-1.jpg`). 공개 후속은 **Copernicus Browser**
(`browser.dataspace.copernicus.eu`)이고, 유료 후속은 Planet Insights Platform이다. 그래서 이 조사는
**Copernicus Browser를 EO Browser 자리에 놓고** 실측했다.

