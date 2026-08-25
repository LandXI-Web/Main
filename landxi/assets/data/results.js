// 실제 AI 분석 결과 카탈로그 — 원본은 `02. 데이터/*.gpkg` (EPSG:5186) 4종.
// tools/results/ 의 변환 파이프라인이 EPSG:4326 · 좌표 6자리로 재작성한 산출물을 가리킨다.
// 자동 생성 — 손으로 고치지 말고 파이프라인을 다시 돌릴 것. 통계는 단순화 이전 원본 기준이다.
// geojson/grid 경로는 landxi/ 기준 상대 경로.
export const RESULTS = [
  {
    "id": "namwon-farmland-2025",
    "title": "남원시 농지이용 현황",
    "year": 2025,
    "sensor": "drone",
    "region": "전북 남원시",
    "service": "farmland",
    "unit": "필지",
    "what": "농경지/비경작지 필지 단위 이용 분류 (드론 정사영상 + AI 세그멘테이션, PNU 필지 경계와 결합)",
    "src": "25년 남원시 농지이용 현황(드론).gpkg",
    "layer": "union",
    "geojson": "assets/data/geo/results/namwon-farmland-2025.geojson",
    "stats": {
      "count": 2098,
      "areaM2": 3158683.9,
      "areaHa": 315.868,
      "areaMeanM2": 1505.6,
      "areaMedianM2": 1293.1,
      "classes": {
        "경작지": 1291,
        "비경작지": 807
      },
      "classAreaM2": {
        "경작지": 2049934.6,
        "비경작지": 1108749.3
      },
      "classMeanConf": {
        "경작지": 0.4551,
        "비경작지": 0.4327
      },
      "confN": 2098,
      "confNull": 0,
      "confMin": 0.1002,
      "confMax": 0.9687,
      "confMean": 0.4465,
      "confMedian": 0.412,
      "confHist": [
        0,
        468,
        314,
        230,
        236,
        209,
        203,
        179,
        200,
        59
      ],
      "confBins": [
        0.0,
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
        0.6,
        0.7,
        0.8,
        0.9,
        1.0
      ],
      "bbox": [
        127.185031,
        35.307309,
        127.657689,
        35.556752
      ],
      "analyzedAt": "2026-06-08",
      "crsSrc": "EPSG:5186",
      "fileBytes": 1293982,
      "gridBytes": null,
      "countWeb": 2098,
      "dropped": 0,
      "emd": {
        "운봉읍": 237,
        "송동면": 149,
        "대강면": 142,
        "보절면": 138,
        "대산면": 136,
        "덕과면": 133,
        "사매면": 128,
        "주생면": 126,
        "아영면": 126,
        "금지면": 122,
        "주천면": 107,
        "수지면": 105,
        "이백면": 94,
        "인월면": 78,
        "산동면": 72,
        "산내면": 56,
        "화정동": 22,
        "신정동": 18,
        "내척동": 16,
        "식정동": 14,
        "향교동": 11,
        "갈치동": 11,
        "어현동": 9,
        "금동": 8,
        "고죽동": 8,
        "조산동": 8,
        "월락동": 7,
        "용정동": 5,
        "광치동": 5,
        "산곡동": 3,
        "신촌동": 3,
        "노암동": 1
      },
      "objTotal": 5556
    },
    "fields": {
      "id": "원본 객체 ID(SHA1 40자)",
      "cls": "AI 분류명",
      "cid": "분류 ID",
      "conf": "AI 신뢰도(0~1)",
      "sam": "SAM 마스크 점수",
      "area": "면적(㎡)",
      "pnu": "필지고유번호(PNU 19자리)",
      "emd": "읍면동",
      "nobj": "필지 내 탐지 객체 수"
    },
    "camera": {
      "center": [
        127.42136,
        35.43203
      ],
      "zoom": 9.12,
      "pitch": 35,
      "bearing": 0
    }
  },
  {
    "id": "namwon-greenhouse-2025",
    "title": "남원시 비닐하우스 조사",
    "year": 2025,
    "sensor": "drone",
    "region": "전북 남원시",
    "service": "greenhouse",
    "unit": "필지",
    "what": "비닐하우스 단동/다동 필지 단위 집계 (드론 정사영상 + AI 탐지, 필지별 union)",
    "src": "25년 남원시 비닐하우스 조사(드론).gpkg",
    "layer": "union",
    "geojson": "assets/data/geo/results/namwon-greenhouse-2025.geojson",
    "stats": {
      "count": 1674,
      "areaM2": 2726004.4,
      "areaHa": 272.6,
      "areaMeanM2": 1628.4,
      "areaMedianM2": 1424.5,
      "classes": {
        "비닐하우스_단동": 1469,
        "비닐하우스_다동": 205
      },
      "classAreaM2": {
        "비닐하우스_다동": 412946.6,
        "비닐하우스_단동": 2313057.8
      },
      "classMeanConf": {
        "비닐하우스_다동": 0.6321,
        "비닐하우스_단동": 0.8085
      },
      "confN": 1674,
      "confNull": 0,
      "confMin": 0.3003,
      "confMax": 0.9899,
      "confMean": 0.7869,
      "confMedian": 0.8439,
      "confHist": [
        0,
        0,
        0,
        103,
        85,
        100,
        150,
        267,
        371,
        598
      ],
      "confBins": [
        0.0,
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
        0.6,
        0.7,
        0.8,
        0.9,
        1.0
      ],
      "bbox": [
        127.189421,
        35.306334,
        127.6617,
        35.553003
      ],
      "analyzedAt": "2026-06-06",
      "crsSrc": "EPSG:5186",
      "fileBytes": 1157052,
      "gridBytes": null,
      "countWeb": 1674,
      "dropped": 0,
      "emd": {
        "금지면": 397,
        "운봉읍": 275,
        "인월면": 157,
        "아영면": 147,
        "송동면": 119,
        "주생면": 103,
        "수지면": 82,
        "대강면": 65,
        "산동면": 41,
        "산내면": 41,
        "주천면": 37,
        "사매면": 34,
        "대산면": 33,
        "이백면": 30,
        "보절면": 28,
        "신정동": 23,
        "덕과면": 18,
        "금동": 13,
        "화정동": 8,
        "어현동": 5,
        "광치동": 4,
        "식정동": 3,
        "고죽동": 3,
        "갈치동": 2,
        "용정동": 2,
        "내척동": 1,
        "월락동": 1,
        "왕정동": 1,
        "향교동": 1
      },
      "objTotal": 9664
    },
    "fields": {
      "id": "원본 객체 ID(SHA1 40자)",
      "cls": "AI 분류명",
      "cid": "분류 ID",
      "conf": "AI 신뢰도(0~1)",
      "sam": "SAM 마스크 점수",
      "area": "면적(㎡)",
      "pnu": "필지고유번호(PNU 19자리)",
      "emd": "읍면동",
      "nobj": "필지 내 탐지 객체 수"
    },
    "camera": {
      "center": [
        127.42556,
        35.429668
      ],
      "zoom": 9.12,
      "pitch": 35,
      "bearing": 0
    }
  },
  {
    "id": "yeosu-marine-2025-aerial",
    "title": "여수시 해양쓰레기 조사(항공)",
    "year": 2025,
    "sensor": "aerial",
    "region": "전남 여수시",
    "service": "marine",
    "unit": "건",
    "what": "항공영상 기반 스티로폼 부유·적치 탐지 객체 (단일 클래스)",
    "src": "25년 여수시 해양쓰레기 조사(항공).gpkg",
    "layer": "detections_clipped_ref",
    "geojson": "assets/data/geo/results/yeosu-marine-2025-aerial.geojson",
    "grid": "assets/data/geo/results/yeosu-marine-2025-aerial-grid100.geojson",
    "stats": {
      "count": 1860,
      "areaM2": 44573.0,
      "areaHa": 4.457,
      "areaMeanM2": 24.0,
      "areaMedianM2": 7.2,
      "classes": {
        "Styrofoam": 1860
      },
      "classAreaM2": {
        "Styrofoam": 44573.0
      },
      "classMeanConf": {
        "Styrofoam": 0.1657
      },
      "confN": 1689,
      "confNull": 171,
      "confMin": 0.05,
      "confMax": 0.7185,
      "confMean": 0.1657,
      "confMedian": 0.1148,
      "confHist": [
        735,
        482,
        227,
        132,
        60,
        39,
        13,
        1,
        0,
        0
      ],
      "confBins": [
        0.0,
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
        0.6,
        0.7,
        0.8,
        0.9,
        1.0
      ],
      "bbox": [
        127.509333,
        34.554701,
        127.749547,
        34.750267
      ],
      "analyzedAt": "2026-04-27",
      "crsSrc": "EPSG:5186",
      "fileBytes": 767809,
      "gridBytes": 228087,
      "countWeb": 1857,
      "dropped": 3
    },
    "fields": {
      "id": "원본 객체 ID(SHA1 40자)",
      "cls": "AI 분류명",
      "cid": "분류 ID",
      "conf": "AI 신뢰도(0~1)",
      "area": "면적(㎡)"
    },
    "camera": {
      "center": [
        127.62944,
        34.652484
      ],
      "zoom": 10.1,
      "pitch": 35,
      "bearing": 0
    }
  },
  {
    "id": "yeosu-marine-2026-drone",
    "title": "여수시 해양쓰레기 조사(드론)",
    "year": 2026,
    "sensor": "drone",
    "region": "전남 여수시",
    "service": "marine",
    "unit": "건",
    "what": "드론 기반 해양쓰레기 8종 탐지 객체",
    "src": "26년 여수시 해양쓰레기 조사(드론).gpkg",
    "layer": "yeosu_2m_platform",
    "geojson": "assets/data/geo/results/yeosu-marine-2026-drone.geojson",
    "grid": "assets/data/geo/results/yeosu-marine-2026-drone-grid100.geojson",
    "stats": {
      "count": 2078,
      "areaM2": 5184.4,
      "areaHa": 0.518,
      "areaMeanM2": 2.5,
      "areaMedianM2": 1.1,
      "classes": {
        "styrofoam": 1790,
        "buoy_bottle": 75,
        "plastic_box": 56,
        "other_debris": 47,
        "rope": 44,
        "buoy_blue": 41,
        "net": 14,
        "buoy_red": 11
      },
      "classAreaM2": {
        "buoy_blue": 72.3,
        "buoy_bottle": 126.4,
        "buoy_red": 15.6,
        "net": 359.7,
        "other_debris": 689.0,
        "plastic_box": 83.0,
        "rope": 544.6,
        "styrofoam": 3293.7
      },
      "classMeanConf": {
        "buoy_blue": 0.6971,
        "buoy_bottle": 0.6612,
        "buoy_red": 0.7017,
        "net": null,
        "other_debris": 0.7322,
        "plastic_box": 0.4575,
        "rope": 0.3329,
        "styrofoam": 0.6814
      },
      "confN": 1770,
      "confNull": 308,
      "confMin": 0.108,
      "confMax": 0.874,
      "confMean": 0.6702,
      "confMedian": 0.71,
      "confHist": [
        0,
        26,
        12,
        4,
        189,
        248,
        365,
        635,
        291,
        0
      ],
      "confBins": [
        0.0,
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
        0.6,
        0.7,
        0.8,
        0.9,
        1.0
      ],
      "bbox": [
        127.642935,
        34.568377,
        127.712634,
        34.636318
      ],
      "analyzedAt": "2026-05-13",
      "crsSrc": "EPSG:5186",
      "fileBytes": 835801,
      "gridBytes": 24439,
      "countWeb": 2078,
      "dropped": 0,
      "classColors": {
        "buoy_blue": "#0066CC",
        "buoy_bottle": "#8B4513",
        "buoy_red": "#CC0000",
        "net": "#228B22",
        "other_debris": "#696969",
        "plastic_box": "#FF8C00",
        "rope": "#8B008B",
        "styrofoam": "#FFFFFF"
      }
    },
    "fields": {
      "id": "원본 객체 ID(SHA1 40자)",
      "cls": "AI 분류명",
      "cid": "분류 ID",
      "cat": "카테고리 ID",
      "conf": "AI 신뢰도(0~1)",
      "area": "면적(㎡)",
      "mask": "세그먼트 마스크 보유",
      "color": "원본 표출 색상"
    },
    "camera": {
      "center": [
        127.677785,
        34.602348
      ],
      "zoom": 11.64,
      "pitch": 45,
      "bearing": 0
    }
  }
];

export const resultById = id => RESULTS.find(r => r.id === id) || null;
export const resultsByService = service => RESULTS.filter(r => r.service === service);
