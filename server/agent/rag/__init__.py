"""법령·지침 근거(RAG) — 공개 원문을 조·항 단위로 로컬 색인(bm25). 외부 호출 없음.

    from agent.rag import index as LAW
    LAW.search("농지 전용 허가")  → {"found", "hits":[{act, article, para, effective, text, ref}]}
"""
NOT_FOUND = "법령 데이터에 없습니다"
