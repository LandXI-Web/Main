// 변화 지수(비지도) 카탈로그 — tools/change/namwon_change.py 가 실제 정사영상에서 생성.
// 학습 모델의 탐지 결과가 아니다. UI 는 반드시 "변화 지수(비지도)" 로 표기할 것.
// 자동 생성 — 직접 고치지 말고 파이프라인을 다시 돌릴 것.
export const CHANGE = [
  {
    "pair": "2504-2506",
    "from": "2504",
    "to": "2506",
    "fromDate": "2025-04",
    "toDate": "2025-06",
    "label": "2025-04 → 2025-06",
    "method": "변화 지수(비지도)",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "polygons": "assets/data/geo/namwon-change.geojson",
    "grid": "assets/data/geo/namwon-change-grid.geojson",
    "tiles": null,
    "minzoom": 14,
    "maxzoom": 19,
    "stats": {
      "n": 112,
      "area_m2": 53958.6,
      "byClass": {
        "veg_gain": 70,
        "veg_loss": 22,
        "built_new": 19,
        "other": 1
      }
    }
  },
  {
    "pair": "2506-2508",
    "from": "2506",
    "to": "2508",
    "fromDate": "2025-06",
    "toDate": "2025-08",
    "label": "2025-06 → 2025-08",
    "method": "변화 지수(비지도)",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "polygons": "assets/data/geo/namwon-change.geojson",
    "grid": "assets/data/geo/namwon-change-grid.geojson",
    "tiles": null,
    "minzoom": 14,
    "maxzoom": 19,
    "stats": {
      "n": 79,
      "area_m2": 54648.5,
      "byClass": {
        "veg_gain": 73,
        "veg_loss": 0,
        "built_new": 2,
        "other": 4
      }
    }
  },
  {
    "pair": "2508-2510",
    "from": "2508",
    "to": "2510",
    "fromDate": "2025-08",
    "toDate": "2025-10",
    "label": "2025-08 → 2025-10",
    "method": "변화 지수(비지도)",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "polygons": "assets/data/geo/namwon-change.geojson",
    "grid": "assets/data/geo/namwon-change-grid.geojson",
    "tiles": null,
    "minzoom": 14,
    "maxzoom": 19,
    "stats": {
      "n": 109,
      "area_m2": 54528.8,
      "byClass": {
        "veg_gain": 16,
        "veg_loss": 54,
        "built_new": 38,
        "other": 1
      }
    }
  },
  {
    "pair": "2504-2510",
    "from": "2504",
    "to": "2510",
    "fromDate": "2025-04",
    "toDate": "2025-10",
    "label": "2025-04 → 2025-10",
    "method": "변화 지수(비지도)",
    "bounds": [
      127.3481,
      35.5276,
      127.3567,
      35.5347
    ],
    "polygons": "assets/data/geo/namwon-change.geojson",
    "grid": "assets/data/geo/namwon-change-grid.geojson",
    "tiles": "assets/tiles/namwon_change_2504_2510/{z}/{x}/{y}.webp",
    "minzoom": 14,
    "maxzoom": 19,
    "stats": {
      "n": 156,
      "area_m2": 53580.4,
      "byClass": {
        "veg_gain": 128,
        "veg_loss": 4,
        "built_new": 17,
        "other": 7
      }
    }
  }
];

export const changeByPair = (pair) => CHANGE.find(c => c.pair === pair) || null;
