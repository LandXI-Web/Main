#!/bin/bash
# 바퀴 16 재검수 — 지난 바퀴 기능 도구를 차례로(로그인 폼 · 바깥 주소). 결과 = feat/*/run*.json · run.log
cd "E:/Land-XI 플랫폼/01. 디자인"
F=docs/superpowers/final/process/impl-42/recheck/feat
: > $F/chain.log
run() { local n=$1; shift; echo "== $n $(date +%H:%M:%S)" >> $F/chain.log; "$@" > $F/$n/run.log 2>&1 < /dev/null; echo "$n $?" >> $F/chain.log; }
run ximap-steps env ONLY=steps,panes,now,objects,classes node $F/ximap-steps/shoot.mjs
run ximap-parcel node $F/ximap-parcel/shoot.mjs
run ximap-colors node $F/ximap-colors/shoot.mjs
run map-colors env ONLY=shots node $F/map-colors/shoot.mjs
run zoomout node $F/zoomout/shoot.mjs after
run abroad node $F/abroad/check.mjs --out $F/abroad/shots
run panes env OUT=$F/panes/shots node $F/panes/verify.mjs
