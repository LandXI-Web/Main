// 정사영상 타일 카탈로그 — tools/prepare-assets.py(AOI·드론·제주)와
// tools/citywide/namwon_city.py(coverage:"city" 항목)가 실제 원본에서 생성.
// tiles 경로는 landxi/ 기준 상대 경로다.
// 자동 생성 — 직접 고치지 말고 파이프라인을 다시 돌릴 것.
export const IMAGERY = [
  {
    "id": "namwon_2504",
    "label": "남원 농경지 · 2025.04",
    "kind": "ortho",
    "gsd": 0.0108,
    "captured": "2025-04",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "minzoom": 12,
    "maxzoom": 19,
    "tiles": "assets/tiles/namwon_2504/{z}/{x}/{y}.webp"
  },
  {
    "id": "namwon_2506",
    "label": "남원 농경지 · 2025.06",
    "kind": "ortho",
    "gsd": 0.0169,
    "captured": "2025-06",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "minzoom": 12,
    "maxzoom": 19,
    "tiles": "assets/tiles/namwon_2506/{z}/{x}/{y}.webp"
  },
  {
    "id": "namwon_2508",
    "label": "남원 농경지 · 2025.08",
    "kind": "ortho",
    "gsd": 0.0154,
    "captured": "2025-08",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "minzoom": 12,
    "maxzoom": 19,
    "tiles": "assets/tiles/namwon_2508/{z}/{x}/{y}.webp"
  },
  {
    "id": "namwon_2510",
    "label": "남원 농경지 · 2025.10",
    "kind": "ortho",
    "gsd": 0.0168,
    "captured": "2025-10",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "minzoom": 12,
    "maxzoom": 19,
    "tiles": "assets/tiles/namwon_2510/{z}/{x}/{y}.webp"
  },
  {
    "id": "kuksan_a68",
    "label": "국산리 드론 A68 · 2025.08",
    "kind": "ortho",
    "gsd": 0.05,
    "captured": "2025-08",
    "bounds": [
      126.973996,
      35.825613,
      126.992145,
      35.838284
    ],
    "minzoom": 13,
    "maxzoom": 19,
    "tiles": "assets/tiles/kuksan_a68/{z}/{x}/{y}.webp"
  },
  {
    "id": "kuksan_a71",
    "label": "국산리 드론 A71 · 2025.08",
    "kind": "ortho",
    "gsd": 0.05,
    "captured": "2025-08",
    "bounds": [
      126.973996,
      35.825613,
      126.992145,
      35.838284
    ],
    "minzoom": 13,
    "maxzoom": 19,
    "tiles": "assets/tiles/kuksan_a71/{z}/{x}/{y}.webp"
  },
  {
    "id": "jeju_2022",
    "label": "제주 항공 정사영상 · 2022.12",
    "kind": "ortho",
    "gsd": 0.12,
    "captured": "2022-12",
    "bounds": [
      126.81996,
      33.504972,
      126.82504,
      33.510028
    ],
    "minzoom": 13,
    "maxzoom": 19,
    "tiles": "assets/tiles/jeju_2022/{z}/{x}/{y}.webp"
  },
  {
    "id": "jeju_landcover",
    "label": "제주 토지형질 세그멘테이션",
    "kind": "landcover",
    "gsd": 0.12,
    "captured": "2022-12",
    "bounds": [
      126.81996,
      33.504972,
      126.82504,
      33.510028
    ],
    "minzoom": 13,
    "maxzoom": 19,
    "tiles": "assets/tiles/jeju_landcover/{z}/{x}/{y}.webp"
  },
  {
    "id": "jeju_2020",
    "label": "제주 항공 정사영상 · 2020.12(불법건축물 도엽)",
    "kind": "ortho",
    "gsd": 0.1,
    "captured": "2020-12",
    "bounds": [
      126.894965,
      33.514975,
      126.900035,
      33.520024
    ],
    "minzoom": 13,
    "maxzoom": 19,
    "tiles": "assets/tiles/jeju_2020/{z}/{x}/{y}.webp"
  },
  {
    "id": "namwon_city_2510",
    "label": "남원 전역 · 2025.10",
    "kind": "ortho",
    "gsd": 2.0,
    "captured": "2025-10",
    "bounds": [
      127.182606,
      35.302858,
      127.637309,
      35.561786
    ],
    "minzoom": 11,
    "maxzoom": 17,
    "tiles": "assets/tiles/namwon_city_2510/{z}/{x}/{y}.webp",
    "coverage": "city",
    "sourceGsd": 0.0168,
    "core": {
      "bounds": [
        127.292609,
        35.318037,
        127.35883,
        35.372294
      ],
      "gsd": 0.6,
      "minzoom": 16,
      "maxzoom": 17
    }
  },
  {
    "id": "namwon_city_2504",
    "label": "남원 전역 · 2025.04",
    "kind": "ortho",
    "gsd": 2.0,
    "captured": "2025-04",
    "bounds": [
      127.185155,
      35.309298,
      127.637372,
      35.555208
    ],
    "minzoom": 11,
    "maxzoom": 17,
    "tiles": "assets/tiles/namwon_city_2504/{z}/{x}/{y}.webp",
    "coverage": "city",
    "sourceGsd": 0.0108,
    "core": {
      "bounds": [
        127.292609,
        35.318037,
        127.35883,
        35.372294
      ],
      "gsd": 0.6,
      "minzoom": 16,
      "maxzoom": 17
    }
  }
];
