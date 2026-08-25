// 사전 크롭 "Acquired" 증거 이미지 카탈로그 — tools/crops/make_crops.py 산출물.
// 자동 생성 — 손으로 고치지 말고 파이프라인을 다시 돌릴 것.
//
// 소스:
//  · yeosu-marine-2025-aerial / yeosu-marine-2026-drone: 로컬 여수 정사영상이 없어
//    V-World 위성 타일(z19, 3x3 스티칭)로 크롭. (C) 국토교통부 브이월드(VWorld) —
//    개발자 가이드 이용약관에 따라 출처 표시 조건부로 사용. 실사용 시
//    "자료제공: 브이월드(www.vworld.kr)" 표기 필요, 상업적 재배포 전 약관 재확인할 것.
//  · namwon-farmland-2025 / namwon-greenhouse-2025: top-8 이 남원 전역 커버리지의
//    고해상 core(namwon_city_2510, z17, gsd 0.6m) 안이면 로컬 타일, 밖이면 V-World 폴백.
//  · jeju-illegal: 원본 탐지 shp 좌표(126.896~126.899E)는 jeju_2022 도엽과 겹치지
//    않는다(prepare-assets.py 주석 참고) — 실제로 겹치는 jeju_2020(2020-12) 도엽에서 크롭.
//  · kuksan-change / namwon-epoch: 결과 geojson 이 없는 순수 시계열 비교용 — 등록된
//    탐지가 아니므로 conf/cls/area_m2 는 null, hairline overlay 없음(clean=null).
export const CROPS = {
  "yeosu-marine-2025-aerial": [
    {
      "lnglat": [
        127.571566,
        34.642527
      ],
      "conf": 0.7185,
      "cls": "Styrofoam",
      "area_m2": 8.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2456,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/1.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/1@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/1-clean.jpg"
    },
    {
      "lnglat": [
        127.639696,
        34.719727
      ],
      "conf": 0.6884,
      "cls": "Styrofoam",
      "area_m2": 11.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2454,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/2.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/2@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/2-clean.jpg"
    },
    {
      "lnglat": [
        127.742885,
        34.664563
      ],
      "conf": 0.6678,
      "cls": "Styrofoam",
      "area_m2": 17.8,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2456,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/3.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/3@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/3-clean.jpg"
    },
    {
      "lnglat": [
        127.723595,
        34.573255
      ],
      "conf": 0.6646,
      "cls": "Styrofoam",
      "area_m2": 13.0,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/4.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/4@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/4-clean.jpg"
    },
    {
      "lnglat": [
        127.585424,
        34.749844
      ],
      "conf": 0.6563,
      "cls": "Styrofoam",
      "area_m2": 63.6,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2453,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/5.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/5@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/5-clean.jpg"
    },
    {
      "lnglat": [
        127.711732,
        34.573033
      ],
      "conf": 0.6406,
      "cls": "Styrofoam",
      "area_m2": 11.0,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/6.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/6@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/6-clean.jpg"
    },
    {
      "lnglat": [
        127.640726,
        34.635237
      ],
      "conf": 0.6331,
      "cls": "Styrofoam",
      "area_m2": 18.4,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2457,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/7.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/7@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/7-clean.jpg"
    },
    {
      "lnglat": [
        127.646151,
        34.590829
      ],
      "conf": 0.6322,
      "cls": "Styrofoam",
      "area_m2": 6.6,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2458,
      "file": "assets/proto/crops/yeosu-marine-2025-aerial/8.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2025-aerial/8@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2025-aerial/8-clean.jpg"
    }
  ],
  "yeosu-marine-2026-drone": [
    {
      "lnglat": [
        127.681332,
        34.578158
      ],
      "conf": 0.874,
      "cls": "styrofoam",
      "area_m2": 1.1,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2458,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/1.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/1@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/1-clean.jpg"
    },
    {
      "lnglat": [
        127.686912,
        34.575592
      ],
      "conf": 0.87,
      "cls": "rope",
      "area_m2": 3.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2458,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/2.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/2@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/2-clean.jpg"
    },
    {
      "lnglat": [
        127.680929,
        34.578195
      ],
      "conf": 0.864,
      "cls": "other_debris",
      "area_m2": 6.0,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2458,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/3.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/3@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/3-clean.jpg"
    },
    {
      "lnglat": [
        127.680931,
        34.578182
      ],
      "conf": 0.861,
      "cls": "other_debris",
      "area_m2": 2.6,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2458,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/4.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/4@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/4-clean.jpg"
    },
    {
      "lnglat": [
        127.685394,
        34.571733
      ],
      "conf": 0.854,
      "cls": "styrofoam",
      "area_m2": 3.1,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/5.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/5@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/5-clean.jpg"
    },
    {
      "lnglat": [
        127.685614,
        34.573248
      ],
      "conf": 0.854,
      "cls": "styrofoam",
      "area_m2": 3.2,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/6.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/6@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/6-clean.jpg"
    },
    {
      "lnglat": [
        127.685394,
        34.571733
      ],
      "conf": 0.853,
      "cls": "styrofoam",
      "area_m2": 2.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/7.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/7@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/7-clean.jpg"
    },
    {
      "lnglat": [
        127.680774,
        34.569958
      ],
      "conf": 0.851,
      "cls": "styrofoam",
      "area_m2": 2.6,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2459,
      "file": "assets/proto/crops/yeosu-marine-2026-drone/8.jpg",
      "file2x": "assets/proto/crops/yeosu-marine-2026-drone/8@2x.jpg",
      "clean": "assets/proto/crops/yeosu-marine-2026-drone/8-clean.jpg"
    }
  ],
  "namwon-farmland-2025": [
    {
      "lnglat": [
        127.384737,
        35.476528
      ],
      "conf": 0.6996,
      "cls": "경작지",
      "area_m2": 4350.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2432,
      "file": "assets/proto/crops/namwon-farmland-2025/1.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/1@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/1-clean.jpg"
    },
    {
      "lnglat": [
        127.243022,
        35.379914
      ],
      "conf": 0.7094,
      "cls": "비경작지",
      "area_m2": 1289.1,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2434,
      "file": "assets/proto/crops/namwon-farmland-2025/2.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/2@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/2-clean.jpg"
    },
    {
      "lnglat": [
        127.34509,
        35.380524
      ],
      "conf": 0.7026,
      "cls": "경작지",
      "area_m2": 1541.4,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2434,
      "file": "assets/proto/crops/namwon-farmland-2025/3.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/3@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/3-clean.jpg"
    },
    {
      "lnglat": [
        127.447973,
        35.471024
      ],
      "conf": 0.5814,
      "cls": "경작지",
      "area_m2": 1390.9,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2432,
      "file": "assets/proto/crops/namwon-farmland-2025/4.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/4@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/4-clean.jpg"
    },
    {
      "lnglat": [
        127.3042,
        35.416489
      ],
      "conf": 0.2255,
      "cls": "비경작지",
      "area_m2": 733.5,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2433,
      "file": "assets/proto/crops/namwon-farmland-2025/5.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/5@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/5-clean.jpg"
    },
    {
      "lnglat": [
        127.598469,
        35.478614
      ],
      "conf": 0.8985,
      "cls": "경작지",
      "area_m2": 3917.3,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2431,
      "file": "assets/proto/crops/namwon-farmland-2025/6.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/6@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/6-clean.jpg"
    },
    {
      "lnglat": [
        127.350189,
        35.37039
      ],
      "conf": 0.441,
      "cls": "경작지",
      "area_m2": 1206.8,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.6,
      "file": "assets/proto/crops/namwon-farmland-2025/7.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/7@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/7-clean.jpg"
    },
    {
      "lnglat": [
        127.563508,
        35.478493
      ],
      "conf": 0.9028,
      "cls": "경작지",
      "area_m2": 3005.8,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2431,
      "file": "assets/proto/crops/namwon-farmland-2025/8.jpg",
      "file2x": "assets/proto/crops/namwon-farmland-2025/8@2x.jpg",
      "clean": "assets/proto/crops/namwon-farmland-2025/8-clean.jpg"
    }
  ],
  "namwon-greenhouse-2025": [
    {
      "lnglat": [
        127.361026,
        35.543064
      ],
      "conf": 0.8493,
      "cls": "비닐하우스_단동",
      "area_m2": 2596.8,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2429,
      "file": "assets/proto/crops/namwon-greenhouse-2025/1.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/1@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/1-clean.jpg"
    },
    {
      "lnglat": [
        127.519867,
        35.461331
      ],
      "conf": 0.8885,
      "cls": "비닐하우스_단동",
      "area_m2": 5987.7,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2432,
      "file": "assets/proto/crops/namwon-greenhouse-2025/2.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/2@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/2-clean.jpg"
    },
    {
      "lnglat": [
        127.513145,
        35.469197
      ],
      "conf": 0.9869,
      "cls": "비닐하우스_단동",
      "area_m2": 3402.6,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2432,
      "file": "assets/proto/crops/namwon-greenhouse-2025/3.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/3@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/3-clean.jpg"
    },
    {
      "lnglat": [
        127.310341,
        35.339811
      ],
      "conf": 0.8659,
      "cls": "비닐하우스_단동",
      "area_m2": 3103.5,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.6,
      "file": "assets/proto/crops/namwon-greenhouse-2025/4.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/4@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/4-clean.jpg"
    },
    {
      "lnglat": [
        127.309098,
        35.335162
      ],
      "conf": 0.8455,
      "cls": "비닐하우스_단동",
      "area_m2": 3070.1,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.6,
      "file": "assets/proto/crops/namwon-greenhouse-2025/5.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/5@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/5-clean.jpg"
    },
    {
      "lnglat": [
        127.303756,
        35.352504
      ],
      "conf": 0.9139,
      "cls": "비닐하우스_단동",
      "area_m2": 5481.8,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.6,
      "file": "assets/proto/crops/namwon-greenhouse-2025/6.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/6@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/6-clean.jpg"
    },
    {
      "lnglat": [
        127.508762,
        35.425917
      ],
      "conf": 0.8751,
      "cls": "비닐하우스_단동",
      "area_m2": 2726.2,
      "epoch": null,
      "source": "vworld",
      "gsd": 0.2433,
      "file": "assets/proto/crops/namwon-greenhouse-2025/7.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/7@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/7-clean.jpg"
    },
    {
      "lnglat": [
        127.300046,
        35.320021
      ],
      "conf": 0.9296,
      "cls": "비닐하우스_단동",
      "area_m2": 2455.5,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.6,
      "file": "assets/proto/crops/namwon-greenhouse-2025/8.jpg",
      "file2x": "assets/proto/crops/namwon-greenhouse-2025/8@2x.jpg",
      "clean": "assets/proto/crops/namwon-greenhouse-2025/8-clean.jpg"
    }
  ],
  "jeju-illegal": [
    {
      "lnglat": [
        126.896978,
        33.51536
      ],
      "conf": null,
      "cls": "불법건축물",
      "area_m2": 10373.1,
      "epoch": "2020-12",
      "source": "ortho",
      "gsd": 0.2489,
      "file": "assets/proto/crops/jeju-illegal/1.jpg",
      "file2x": "assets/proto/crops/jeju-illegal/1@2x.jpg",
      "clean": "assets/proto/crops/jeju-illegal/1-clean.jpg"
    },
    {
      "lnglat": [
        126.896978,
        33.51536
      ],
      "conf": null,
      "cls": "불법건축물",
      "area_m2": 10373.1,
      "epoch": "2020-12",
      "source": "ortho",
      "gsd": 0.2489,
      "file": "assets/proto/crops/jeju-illegal/2.jpg",
      "file2x": "assets/proto/crops/jeju-illegal/2@2x.jpg",
      "clean": "assets/proto/crops/jeju-illegal/2-clean.jpg"
    },
    {
      "lnglat": [
        126.89834,
        33.516265
      ],
      "conf": null,
      "cls": "불법건축물",
      "area_m2": 4375.5,
      "epoch": "2020-12",
      "source": "ortho",
      "gsd": 0.2489,
      "file": "assets/proto/crops/jeju-illegal/3.jpg",
      "file2x": "assets/proto/crops/jeju-illegal/3@2x.jpg",
      "clean": "assets/proto/crops/jeju-illegal/3-clean.jpg"
    },
    {
      "lnglat": [
        126.89834,
        33.516265
      ],
      "conf": null,
      "cls": "불법건축물",
      "area_m2": 4375.5,
      "epoch": "2020-12",
      "source": "ortho",
      "gsd": 0.2489,
      "file": "assets/proto/crops/jeju-illegal/4.jpg",
      "file2x": "assets/proto/crops/jeju-illegal/4@2x.jpg",
      "clean": "assets/proto/crops/jeju-illegal/4-clean.jpg"
    }
  ],
  "kuksan-change": [
    {
      "lnglat": [
        126.977989,
        35.828401
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "a68 · 2025-08",
      "source": "ortho",
      "gsd": 0.2421,
      "file": "assets/proto/crops/kuksan-change/1.jpg",
      "file2x": "assets/proto/crops/kuksan-change/1@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        126.977989,
        35.828401
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "a71 · 2025-08",
      "source": "ortho",
      "gsd": 0.2421,
      "file": "assets/proto/crops/kuksan-change/2.jpg",
      "file2x": "assets/proto/crops/kuksan-change/2@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        126.977989,
        35.833722
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "a68 · 2025-08",
      "source": "ortho",
      "gsd": 0.2421,
      "file": "assets/proto/crops/kuksan-change/3.jpg",
      "file2x": "assets/proto/crops/kuksan-change/3@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        126.977989,
        35.833722
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "a71 · 2025-08",
      "source": "ortho",
      "gsd": 0.2421,
      "file": "assets/proto/crops/kuksan-change/4.jpg",
      "file2x": "assets/proto/crops/kuksan-change/4@2x.jpg",
      "clean": null
    }
  ],
  "namwon-epoch": [
    {
      "lnglat": [
        127.351196,
        35.533138
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "2025-04",
      "source": "ortho",
      "gsd": 0.243,
      "file": "assets/proto/crops/namwon-epoch/1.jpg",
      "file2x": "assets/proto/crops/namwon-epoch/1@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        127.351196,
        35.533138
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "2025-06",
      "source": "ortho",
      "gsd": 0.243,
      "file": "assets/proto/crops/namwon-epoch/2.jpg",
      "file2x": "assets/proto/crops/namwon-epoch/2@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        127.351196,
        35.533138
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "2025-08",
      "source": "ortho",
      "gsd": 0.243,
      "file": "assets/proto/crops/namwon-epoch/3.jpg",
      "file2x": "assets/proto/crops/namwon-epoch/3@2x.jpg",
      "clean": null
    },
    {
      "lnglat": [
        127.351196,
        35.533138
      ],
      "conf": null,
      "cls": null,
      "area_m2": null,
      "epoch": "2025-10",
      "source": "ortho",
      "gsd": 0.243,
      "file": "assets/proto/crops/namwon-epoch/4.jpg",
      "file2x": "assets/proto/crops/namwon-epoch/4@2x.jpg",
      "clean": null
    }
  ]
};

export const cropsFor = id => CROPS[id] || [];
