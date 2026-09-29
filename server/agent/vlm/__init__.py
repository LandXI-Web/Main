"""영상 검수 보조(C2 ⑥ · c2-vlm-global) — 필지·결과 피처 경계로 등록 영상을 잘라(crop) Gemma 4 비전에 보낸다.

crop.py    조각 만들기(CPU · 등록 영상 PMTiles/COG/원본 · 최대 4시점 · 경계선 겹침 · PNG)
prompt.py  비전 질문 · 세 줄(보이는 것 · AI 결과와 맞는지 · 오탐 가능성) 파싱 · 숫자 걸러내기
call.py    vLLM :8000 이미지 호출(전력 협조 · 영상 추론 작업 겹침 기록 · 토큰 실측)
evalset.py 남원·여수 의심 필지 평가셋(조각 + 사람 판정 칸 CSV)
"""
