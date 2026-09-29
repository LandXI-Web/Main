"""법령 원문 올리기 · 색인(C2 ⑤ · 관리자 전용) — LX 관리자 화면 버튼(ops-infra/js/law.js mountLaw)이 부른다. 명령줄 단계 0.

GET    /law/status                 → 법령 수 · 조문 수 · 조각 수 · 마지막 색인 시각 · 올린 파일(색인 전 표시)   [LX 관리자]
POST   /law/files   (multipart)    → 원문 파일(국가법령정보센터 XML · HTML · 텍스트) 저장 + 조문 파싱 검사        [LX 관리자]
DELETE /law/files/{name}           → 올린 파일 지우기(다음 색인부터 빠짐)                                        [LX 관리자]
POST   /law/index                  → 올린 원문 전부로 색인 다시 만들기(bm25 · CPU)                                 [LX 관리자]
GET    /law/search?q=&acts=        → 조문 찾기(원문 · 조·항·시행일) — 로그인 계정(에이전트 law_search 와 같은 함수)
원문은 LX_DATA_ROOT/law/raw 에 그대로 둔다(법령은 기관 경계가 없어 RLS 불필요). 외부 호출 없음.
"""
from __future__ import annotations

from fastapi import APIRouter, File, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, principal, require
from .envelope import env, now_iso

router = APIRouter()
MAX_BYTES = 8 * 1024 * 1024
EXTS = {"xml", "html", "htm", "txt"}


SRC = "법령 원문(국가법령정보센터 공개 원문 · 로컬 색인)"


def _pub(st: dict) -> dict:
    """상태 숫자 → 봉투(F1-CONTRACT §2)."""
    at = st.get("built_at") or now_iso()
    n = lambda v: env(v, "count", "recorded", SRC, as_of=at)      # noqa: E731
    return {**st, "n_acts": n(st.get("n_acts")), "n_articles": n(st.get("n_articles")), "n_chunks": n(st.get("n_chunks")),
            "pending": n(st.get("pending")),
            "acts": [{**a, "articles": n(a.get("articles")), "chunks": n(a.get("chunks"))} for a in st.get("acts") or []]}


def _file_pub(x: dict) -> dict:
    return {**x, **({"articles": env(x["articles"], "count", "recorded", SRC), "chunks": env(x["chunks"], "count", "recorded", SRC)} if x.get("ok") else {})}


def _law():
    from agent.rag import index as LAW
    return LAW


async def _audit(p, action: str, subject: str, after: dict):
    try:
        from agent import audit
        await audit.log(p, action, subject, after)
    except Exception:  # noqa: BLE001
        pass


@router.get("/law/status")
async def law_status(request: Request):
    require(principal(request), admin=True)
    st = await run_in_threadpool(_law().status)
    return {**_pub(st), "as_of": now_iso()}


@router.post("/law/files", status_code=201)
async def law_upload(request: Request, files: list[UploadFile] = File(...)):
    p = require(principal(request), admin=True)
    LAW = _law()
    out = []
    for f in files[:20]:
        name = f.filename or "law.txt"
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in EXTS:
            out.append({"ok": False, "file": name, "reason": "XML · HTML · 텍스트 파일만 올릴 수 있습니다"})
            continue
        raw = await f.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            out.append({"ok": False, "file": name, "reason": "8MB까지 올릴 수 있습니다"})
            continue
        out.append(await run_in_threadpool(LAW.add_file, name, raw))
    await _audit(p, "law.upload", "law", {"files": [{k: x.get(k) for k in ("file", "ok", "act", "chunks")} for x in out]})
    if not any(x.get("ok") for x in out):
        raise ApiError("bad_request", out[0]["reason"] if out else "파일이 없습니다", {"files": [_file_pub(x) for x in out]})
    st = await run_in_threadpool(LAW.status)
    return {"files": [_file_pub(x) for x in out], "status": _pub(st), "as_of": now_iso()}


@router.delete("/law/files/{name}")
async def law_remove(name: str, request: Request):
    p = require(principal(request), admin=True)
    ok = await run_in_threadpool(_law().remove_file, name)
    if not ok:
        raise ApiError("not_found", "파일이 없습니다")
    await _audit(p, "law.remove", name, {})
    return {"ok": True, "status": _pub(await run_in_threadpool(_law().status))}


@router.post("/law/index")
async def law_index(request: Request):
    p = require(principal(request), admin=True)
    st = await run_in_threadpool(_law().rebuild)
    await _audit(p, "law.index", "law", {"acts": st.get("n_acts"), "chunks": st.get("n_chunks")})
    return {**_pub(st), "as_of": now_iso()}


@router.get("/law/search")
async def law_search(request: Request, q: str, acts: str | None = None, k: int = 3):
    require(principal(request))
    if not q.strip():
        raise ApiError("bad_request", "q 가 비었습니다")
    lst = [a.strip() for a in (acts or "").split(",") if a.strip()] or None
    r = await run_in_threadpool(_law().search, q, lst, max(1, min(int(k), 5)))
    items = [{"law_ref": {"법령": h["ref"]["law"], "조": h["ref"]["article"], "항": h["ref"]["para"], "시행일": h["ref"]["effective"]},
              "label": h["ref"]["label"], "text": h["text"]} for h in r["hits"]]
    return {"found": r["found"], "items": items, "message": None if r["found"] else "법령 데이터에 없습니다", "as_of": now_iso()}
