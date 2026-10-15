# 요청 표 — 전(고치기 전 화면 · 처음 열기 세 번 가운데 값)

시작 = 주소를 연 뒤 요청이 나간 때 · 바깥 시간 = 바깥 주소(app.land-xi.dev)에서 받은 시간 · 서버 시간 = 게이트웨이가 쓴 시간(X-LX-Time-ms)

## 남원 기관 XI맵(서비스로 열기) — 18:3x 따로 잰 것(measure-before.json)

| 요청 | 개수 | 시작(ms) | 바깥 시간(ms) | 서버 시간(ms) | 크기(받은 바이트) |
|---|---|---|---|---|---|
| `/api/v1/me` | 1 | 1504 | 341 | 12 | 624 |
| `/api/v1/auth/tenants` | 1 | 1504 | 355 | 12 | 823 |
| `/api/v1/brand/namwon` | 1 | 1504 | 412 | 49.3 | 1309 |
| `/api/v1/openapi.json` | 1 | 1504 | 342 | — | 3623 |
| `/api/v1/regions?geom=1` | 1 | 1510 | 480 | 84.9 | 2510 |
| `/api/v1/survey/rules` | 1 | 1510 | 499 | 90.3 | 2741 |
| `/api/v1/catalog/layers?stage=domestic&build=tenant&locale=ko` | 1 | 1510 | 517 | 126 | 4354 |
| `/api/v1/survey/stats?by=rule` | 1 | 1510 | 731 | 187.9 | 2499 |
| `/api/v1/survey/stats?by=emd` | 1 | 1510 | 860 | 206.9 | 11450 |
| `/api/v1/regions` | 1 | 1867 | 420 | 28.8 | 1007 |
| `/api/v1/reviews/notify` | 1 | 1872 | 421 | 42.2 | 536 |
| `/api/v1/auth/session` | 1 | 2233 | 355 | 8.6 | 538 |
| `/api/v1/regions?limit=400` | 1 | 3445 | 446 | 27.7 | 1007 |
| `/api/v1/regions/52190/emd` | 1 | 3943 | 925 | 17.1 | 51378 |
| `/api/v1/regions/52190/results` | 1 | 3943 | 551 | 124.4 | 1651 |
| `/api/v1/summary?region=52190` | 1 | 3963 | 476 | 9.7 | 1523 |
| `/tiles/sign?set=cog/…(영상마다)` | 1 | 3963 | 478 | 50.9 | 614 |
| `/tiles/pmtiles/results/…(결과 층 머리 · 첫 32KB)` | 6 | 4803 | 997 | 7.6 | 33288 |
| `/api/v1/requests/services` | 1 | 5603 | 425 | 14.2 | 854 |
| `/api/v1/requests/shared-imagery` | 1 | 5603 | 425 | 19.1 | 1080 |
| `/api/v1/spaces/me/guides/card-farm` | 1 | 5603 | 475 | 29.9 | 2061 |

처음 3번 · 다 그려짐 7432 · 7913 · 9337ms · /api/v1 요청 수(다 그려지기 전) 19 · 19 · 19

### 같은 시각 짝 재기(measure-pair-before-*.json)

| 요청 | 개수 | 시작(ms) | 바깥 시간(ms) | 서버 시간(ms) | 크기(받은 바이트) |
|---|---|---|---|---|---|
| `/api/v1/openapi.json` | 1 | 1268 | 302 | — | 3637 |
| `/api/v1/me` | 1 | 1272 | 323 | 11.9 | 622 |
| `/api/v1/regions?geom=1` | 1 | 1272 | 354 | 38.7 | 2519 |
| `/api/v1/survey/rules` | 1 | 1272 | 359 | 42.6 | 2811 |
| `/api/v1/survey/stats?by=rule` | 1 | 1272 | 575 | 96.1 | 2410 |
| `/api/v1/catalog/layers?stage=domestic&build=tenant&locale=ko` | 1 | 1272 | 422 | 89.5 | 4359 |
| `/api/v1/survey/stats?by=emd` | 1 | 1272 | 638 | 128.3 | 11486 |
| `/api/v1/regions` | 1 | 1572 | 346 | 24.9 | 1006 |
| `/api/v1/auth/tenants` | 1 | 1596 | 334 | 7 | 820 |
| `/api/v1/reviews/notify` | 1 | 1954 | 355 | 38 | 538 |
| `/api/v1/auth/session` | 1 | 2210 | 550 | 8.5 | 532 |
| `/api/v1/regions?limit=400` | 1 | 2452 | 332 | 26.4 | 1010 |
| `/api/v1/brand/namwon` | 1 | 2761 | 520 | 15.8 | 1306 |
| `/api/v1/regions/52190/emd` | 1 | 2785 | 622 | 16.4 | 51335 |
| `/api/v1/regions/52190/results` | 1 | 2785 | 623 | 285.5 | 1654 |
| `/tiles/sign?set=cog/…(영상마다)` | 1 | 2798 | 472 | 14.1 | 613 |
| `/api/v1/summary?region=52190` | 1 | 2801 | 497 | 7.8 | 1527 |
| `/tiles/pmtiles/results/…(결과 층 머리 · 첫 32KB)` | 6 | 3432 | 474 | 5.9 | 33285 |
| `/api/v1/requests/shared-imagery` | 1 | 4642 | 631 | 19.1 | 1075 |
| `/api/v1/requests/services` | 1 | 4642 | 630 | 12.7 | 850 |
| `/api/v1/spaces/me/guides/card-farm` | 1 | 4642 | 631 | 57.9 | 2055 |

처음 3번 · 다 그려짐 5318 · 5261 · 6664ms · /api/v1 요청 수(다 그려지기 전) 19 · 19 · 19

## LX 직원 XI맵 — 18:3x 따로 잰 것(measure-before.json)

| 요청 | 개수 | 시작(ms) | 바깥 시간(ms) | 서버 시간(ms) | 크기(받은 바이트) |
|---|---|---|---|---|---|
| `/api/v1/openapi.json` | 1 | 1608 | 437 | — | 3579 |
| `/api/v1/me` | 1 | 1608 | 453 | 7 | 605 |
| `/api/v1/ximap/board` | 1 | 1615 | 490 | 25.8 | 5500 |
| `/api/v1/survey/rules` | 1 | 1615 | 518 | 61.6 | 2732 |
| `/api/v1/catalog/layers?stage=domestic&build=lx&locale=ko` | 1 | 1615 | 582 | 109.9 | 9745 |
| `/api/v1/survey/stats?by=rule` | 1 | 1615 | 638 | 201.6 | 2417 |
| `/api/v1/national/progress` | 1 | 1615 | 796 | 349.5 | 1864 |
| `/api/v1/survey/stats?by=emd` | 1 | 1615 | 1206 | 440.5 | 60272 |
| `/api/v1/approvals?state=pending` | 1 | 2090 | 482 | 11.1 | 650 |
| `/api/v1/reviews/notify` | 1 | 2090 | 484 | 23.2 | 528 |
| `/api/v1/regions?limit=400` | 1 | 2634 | 706 | 27.2 | 12464 |
| `/tiles/sign?set=cog/…(영상마다)` | 69 | 2767 | 629 | 62.9 | 610 |
| `/api/v1/ximap/density?g=0` | 1 | 2771 | 672 | 18.2 | 9454 |
| `/api/v1/auth/session` | 1 | 2902 | 779 | 9.3 | 526 |

처음 3번 · 다 그려짐 5271 · 5449 · 4613ms · /api/v1 요청 수(다 그려지기 전) 13 · 13 · 13

### 같은 시각 짝 재기(measure-pair-before-*.json)

| 요청 | 개수 | 시작(ms) | 바깥 시간(ms) | 서버 시간(ms) | 크기(받은 바이트) |
|---|---|---|---|---|---|
| `/api/v1/openapi.json` | 1 | 1371 | 411 | — | 3630 |
| `/api/v1/survey/rules` | 1 | 1378 | 660 | 38.5 | 2736 |
| `/api/v1/ximap/board` | 1 | 1378 | 723 | 20.4 | 5511 |
| `/api/v1/me` | 1 | 1378 | 575 | 20.5 | 604 |
| `/api/v1/national/progress` | 1 | 1378 | 970 | 429.7 | 1873 |
| `/api/v1/survey/stats?by=rule` | 1 | 1378 | 832 | 300.2 | 2518 |
| `/api/v1/catalog/layers?stage=domestic&build=lx&locale=ko` | 1 | 1378 | 831 | 109 | 9765 |
| `/api/v1/survey/stats?by=emd` | 1 | 1378 | 1731 | 539.8 | 60517 |
| `/api/v1/approvals?state=pending` | 1 | 1995 | 460 | 30.9 | 651 |
| `/api/v1/reviews/notify` | 1 | 1995 | 561 | 41.7 | 523 |
| `/api/v1/regions?limit=400` | 1 | 1995 | 667 | 27.4 | 12432 |
| `/api/v1/auth/session` | 1 | 2373 | 451 | 9 | 527 |
| `/tiles/sign?set=cog/…(영상마다)` | 69 | 2411 | 480 | 55.8 | 611 |
| `/api/v1/ximap/density?g=0` | 1 | 2479 | 642 | 60 | 9455 |

처음 3번 · 다 그려짐 11677 · 3797 · 4073ms · /api/v1 요청 수(다 그려지기 전) 13 · 13 · 13
