#!/usr/bin/env bash
# B5-Projects / B5-Project-Overview / B5-Project-Data 크롭 — landxi/assets/proto/crops/** → design-canvas/v2/img/pj-*.jpg
# 각 파일 ≤ 70 KB. 나머지 타일은 img/tile-*.jpg (tools/design/tiles-b5.mjs) 재사용.
# 결과 도형은 이미지에 굽지 않는다 — -clean 크롭을 쓰고, 청록 폴리곤은 gen-b5-projects.mjs 가 판 위에 다시 그린다.
set -e
OUT="design-canvas/v2/img"
SRC="landxi/assets/proto/crops"

mk() { # name src W H limit
  local n="$1" s="$SRC/$2" W="$3" H="$4" L="$5" q sz
  for q in 2 3 4 5 6 7 8 10 12; do
    ffmpeg -y -loglevel error -i "$s" -vf "scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H" -q:v "$q" "$OUT/$n"
    sz=$(stat -c %s "$OUT/$n")
    if [ "$sz" -le "$L" ]; then echo "$n q=$q ${sz}B"; return; fi
  done
  echo "$n OVER LIMIT ${sz}B" >&2; exit 1
}

# 프로젝트 카드 402×226 (@2x)
mk pj-road.jpg        "kuksan-change/1@2x.jpg"                 804 452 70000   # 도로망 세그멘테이션
mk pj-greenhouse.jpg  "namwon-greenhouse-2025/1-clean.jpg"     804 452 70000   # 비닐하우스 탐지 (결과 있음)
mk pj-car.jpg         "namwon-farmland-2025/4-clean.jpg"       804 452 70000   # 차량·교통량 탐지
mk pj-land.jpg        "jeju-illegal/1-clean.jpg"               804 452 70000   # 토지형질 SegFormer
# 만들기 드로어 탐지유형 라디오 204×115 (@2x)
mk pj-radio-det.jpg   "namwon-greenhouse-2025/3-clean.jpg"     408 230 70000   # Object Detection
mk pj-radio-seg.jpg   "namwon-farmland-2025/2-clean.jpg"       408 230 70000   # Segmentation
# 개요 히어로 420×240 (@2x)
mk pj-hero.jpg        "namwon-greenhouse-2025/3-clean.jpg"     840 480 70000
# 데이터 탭 타일 240×147 (@2x) — 기존 tile-*.jpg 로 못 채우는 2장만
mk pj-nw2510.jpg      "namwon-greenhouse-2025/3-clean.jpg"     480 294 70000   # namwon_2510
mk pj-jeju2020.jpg    "jeju-illegal/3-clean.jpg"               480 294 70000   # jeju_2020
