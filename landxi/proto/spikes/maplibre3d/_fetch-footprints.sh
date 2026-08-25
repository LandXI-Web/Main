#!/usr/bin/env bash
# SPIKE 전용 — OSM Overpass 에서 건물 풋프린트를 받아 굽는다.
# node 의 fetch 는 이 환경에서 overpass 에 연결되지 않는다(connect timeout) → curl 을 쓴다.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
RAW="$DIR/data/_raw"; mkdir -p "$RAW" "$DIR/data"
EP=("https://overpass-api.de/api/interpreter" "https://overpass.private.coffee/api/interpreter" "https://overpass.osm.jp/api/interpreter")
# id  s w n e
AOI=(
  "namwon 35.375 127.355 35.445 127.435"
  "geumji 35.305 127.265 35.375 127.360"
  "jeonju 35.800 127.135 35.835 127.175"
  "yeosu  34.730 127.720 34.765 127.765"
)
for row in "${AOI[@]}"; do
  set -- $row; id=$1; bbox="$2,$3,$4,$5"
  out="$RAW/$id.json"
  [ -s "$out" ] && { echo "$id 캐시됨"; continue; }
  for e in "${EP[@]}"; do
    printf "%s ← %s ... " "$id" "${e#https://}"
    code=$(curl -s -m 300 -X POST "$e" \
      --data-urlencode "data=[out:json][timeout:280];(way[\"building\"]($bbox);relation[\"building\"]($bbox););out geom;" \
      -o "$out" -w "%{http_code}")
    sz=$(wc -c < "$out")
    echo "http=$code ${sz}B"
    [ "$code" = "200" ] && [ "$sz" -gt 400 ] && break
    sleep 10
  done
  sleep 4
done
node "$DIR/_bake-footprints.mjs"
