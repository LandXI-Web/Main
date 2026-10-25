from rt import bb
# 예전 카드 그림(items.json · 눈으로 확인한 자리)과 같은 가운데 · 높이 그대로(너비 = 예전 반쪽 너비 × 2 → 4:3)
S = {
 "card-farm":   {"source": {"parcels": "52190", "imagery": "ap25-namwon-2023"}, "bbox": bb(220125, 309125, 480), "region": "52190", "caption": "남원시 · 2023 항공영상 · 경작 · 휴경 필지"},
 "card-5e85a9": {"source": {"job": "job_01M4AT60R3DZ1Q0VKGC1R71CPF"}, "bbox": bb(246425, 311990, 340), "region": "52190", "caption": "남원시 · 2023 항공영상 · 비닐하우스"},
 "card-6f7050": {"source": {"job": "job_01M5NW3EH2XSQAMS5A57EQ9EPD"}, "bbox": bb(256650, 315165, 180), "opts": {"minconf": 0.8}, "region": "52190", "caption": "남원시 · 드론 영상 · 단동 · 다동"},
 "card-2c5304": {"source": {"job": "job_01M5NW3F8688S6XF0RX5ZG0DQH"}, "bbox": bb(256605, 313762, 90), "opts": {"minconf": 0.5}, "region": "52190", "caption": "남원시 · 드론 영상 · 차량"},
 "card-45424f": {"source": {"job": "job_01M4ARMQDXBZKXVQKBVBYSKV59"}, "bbox": bb(276825, 513975, 300), "region": "51130", "caption": "원주시 · 2023 항공영상 · 건축물"},
 "card-389c45": {"source": {"job": "job_01M4ARJ76ARDGB04EAF8QP591P"}, "bbox": bb(262900, 508950, 340), "region": "41670", "caption": "여주시 · 2023 항공영상 · 주차장"},
 "card-d8fc01": {"source": {"job": "job_01M5RBX85XEVANJZ0QPMNEEH1J"}, "bbox": bb(227060, 301888, 72), "opts": {"minconf": 0.9}, "region": "52190", "caption": "남원시 · 2025.06 드론 영상 · 곤포사일리지"},
 "card-4d8d6f": {"source": {"job": "job_01M5Q21ZHFPT6F3TC22KKTWRBM"}, "bbox": bb(226585, 302375, 360), "region": "52190", "caption": "남원시 · 2025.04 드론 영상 · 사료작물"},
 "card-f31e5f": {"source": {"job": "job_01M5Q2202Q8D5CCKZVYZ7GE1AH"}, "bbox": bb(226375, 302125, 400), "region": "52190", "caption": "남원시 · 2025.06 드론 영상 · 사료작물"},
 "card-ba9d6d": {"source": {"job": "job_01M5R76BKYBANCRZ61WTC6536W"}, "bbox": bb(226610, 302229.2, 220), "region": "52190", "caption": "남원시 · 2025.04 ↔ 2025.06 · 필지 비교", "labels": ["4월", "6월"]},
 "card-crowd":  {"source": {"jobs": ["job_01M5PYK3BR4697HEYZS80HRVZ9", "job_01M5PYT4PCY4RN0YGMXHKCW1AE"]}, "bbox": bb(234900, 311915, 230), "region": "52190", "caption": "남원시 · 2025.05 드론 영상 · 인파 · 차량"},
}
from rt import bb as _bb
S["card-change"] = {"source": {"job": "job_01M5HAG21ED9RXTEQMNGTGZK74"}, "bbox": [126.7898, 35.1408, 126.7928, 35.1427], "opts": {"minm2": 150}, "region": "12330", "caption": "광산구 · 2019 ↔ 2024 · 신축"}
S["card-landslide"] = {"source": {"job": "job_01M5R4NDS3537AB5QHQHHZ4YJM"}, "bbox": _bb(995125, 1707875, 520, 5179), "region": "52190", "caption": "남원시 · 2020 ↔ 2025 · 산림 → 나지"}
S["card-change"]["opts"] = {"minm2": 150, "classes": ["신축"]}
def _ll(x, y, wm):
    w = wm / (111320 * 0.8236); h = wm * 0.75 / 110950
    return [x - w/2, y - h/2, x + w/2, y + h/2]
S["card-marine"] = {"source": {"layer": "landxi/assets/data/geo/results/yeosu-marine-2025-aerial.geojson", "imagery": "img-12130-2023-aerial"}, "bbox": _ll(127.7322, 34.5765, 90), "region": "12130", "caption": "여수시 · 항공영상 · 해양쓰레기"}
