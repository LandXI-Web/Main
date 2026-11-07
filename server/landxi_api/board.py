"""LX 게시판(11-07 PM "게시판 아이콘을 하나 클릭하면 화면을 전환해서 공지사항, QnA, 활용 사례, 자료집을 추가한다").

공지사항은 이미 있는 GET/POST /announcements(staff_home.py · lx_announcements)를 화면이 그대로 쓴다 — 여기는 나머지 셋(lx_board_posts · 0143).
  GET  /board/{kind}?limit=              (LX 계정) 목록 — 최근 순 · 내린 것은 빼고. 비어 있으면 빈 목록(지어내지 않는다)
  GET  /board/{kind}/{id}                (LX 계정) 글 하나(본문 · QnA 답 · 자료집 파일 이름 · 크기)
  POST /board/{kind}                     multipart {title, body?, file?}
                                         qna = LX 직원 · LX 관리자 누구나 · case · doc = LX 관리자(doc 은 파일 하나 — 프로젝트 파일 올리기와 같은 형식 · 크기 한도)
  POST /board/qna/{id}/answer            (LX 관리자) {answer} 답 달기(다시 보내면 고쳐 씀)
  GET  /board/doc/{id}/file              (LX 계정) 자료집 파일 내려받기
kind = qna | case | doc. 감사 기록 board.post · board.answer. 화면에 내는 값은 제목 · 글 · 이름 · 날짜 · 파일 이름 · 크기만.
"""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import FileResponse

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()

KINDS = {"qna": "QnA", "case": "활용 사례", "doc": "자료집"}
TITLE_MAX, BODY_MAX, ANSWER_MAX = 80, 4000, 4000


def _lx(request: Request) -> Principal:
    p = require(principal(request))
    if p.realm != "lx":
        raise ApiError("forbidden", "LX 계정에서 봅니다")
    return p


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise ApiError("not_found", "없는 게시판입니다")
    return kind


def _iso(t):
    return t.isoformat(timespec="seconds") if t else None


def _row(r, full: bool = False) -> dict:
    out = {"id": r["id"], "kind": r["kind"], "title": r["title"], "by_name": r["by_name"] or "LX 계정", "at": _iso(r["at"]),
           "answered": bool(r["answer"]), "file_name": r["file_name"]}
    if full:
        out.update({"body": r["body"] or "", "answer": r["answer"] or "", "answer_by_name": r["answer_by_name"] or ("LX 관리자" if r["answer"] else None),
                    "answered_at": _iso(r["answered_at"]),
                    "bytes": env(int(r["bytes"]), "bytes", "measured", "올린 파일 크기") if r["bytes"] is not None else None})
    return out


@router.get("/board/{kind}")
async def list_posts(kind: str, request: Request, limit: int = 50):
    _lx(request)
    k = _kind(kind)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM lx_board_posts WHERE kind=$1 AND removed_at IS NULL ORDER BY at DESC LIMIT $2", k, max(1, min(limit, 200)))
        n = await conn.fetchval("SELECT count(*) FROM lx_board_posts WHERE kind=$1 AND removed_at IS NULL", k)
    return {"items": [_row(r) for r in rows], "total": int(n or 0), "as_of": now_iso()}


@router.get("/board/{kind}/{pid}")
async def get_post(kind: str, pid: str, request: Request):
    _lx(request)
    k = _kind(kind)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM lx_board_posts WHERE id=$1 AND kind=$2 AND removed_at IS NULL", pid, k)
    if not r:
        raise ApiError("not_found", "글이 없습니다")
    return {"item": _row(r, full=True), "as_of": now_iso()}


@router.post("/board/{kind}", status_code=201)
async def post(kind: str, request: Request, title: str = Form(""), body: str = Form(""), file: UploadFile | None = File(None)):
    p = _lx(request)
    k = _kind(kind)
    if k == "qna":
        require(p, roles=("staff", "admin"))
    else:
        require(p, admin=True)
    title = " ".join(str(title or "").split())
    text = str(body or "").strip()
    if not title:
        raise ApiError("bad_request", "제목을 적어 주세요", {"field": "title"})
    if len(title) > TITLE_MAX or len(text) > BODY_MAX:
        raise ApiError("bad_request", f"제목은 {TITLE_MAX}자, 본문은 {BODY_MAX}자까지입니다")
    has_file = file is not None and bool(file.filename)
    if k == "doc" and not has_file:
        raise ApiError("bad_request", "올릴 파일을 골라 주세요", {"field": "file", "why": "missing"})
    if k != "doc" and has_file:
        raise ApiError("bad_request", "파일은 자료집에만 올립니다", {"field": "file"})
    bid = "bp_" + secrets.token_hex(6)
    name = ext = rel = None
    size = None
    if has_file:
        from .projects import FILE_MAX_MB, FILE_TYPES, _ext
        from .quota import storage_room
        name = re.sub(r"[\x00-\x1f\\/:*?\"<>|]", "", (file.filename or "").split("\\")[-1].split("/")[-1]).strip()[:120]
        ext = _ext(name)
        if not name or ext not in FILE_TYPES:
            raise ApiError("bad_request", "올릴 수 있는 파일은 문서(PDF · 한글 · 워드 · 엑셀 · 파워포인트 · 글 · CSV)와 그림(PNG · JPG · GIF · WEBP)입니다",
                           {"field": "file", "why": "type"})
        room = await storage_room("lx", FILE_MAX_MB * 1024 * 1024)
        if room:
            raise ApiError("conflict", room["line"], {"why": "disk"}, status=409)
        rel = f"board/{bid}.{ext}"
        dest = config.DATA_ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        size, cap = 0, FILE_MAX_MB * 1024 * 1024
        try:
            with open(dest, "wb") as fh:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > cap:
                        raise ApiError("bad_request", f"파일은 {FILE_MAX_MB}MB 까지 올릴 수 있습니다", {"field": "file", "why": "size", "max_mb": FILE_MAX_MB})
                    fh.write(chunk)
            if not size:
                raise ApiError("bad_request", "빈 파일입니다", {"field": "file", "why": "empty"})
        except Exception:
            dest.unlink(missing_ok=True)
            raise
    try:
        async with db(realm="lx") as conn:
            nm = await conn.fetchval("SELECT name FROM lx_users WHERE id=$1", p.user_id)
            r = await conn.fetchrow("INSERT INTO lx_board_posts(id, kind, title, body, by, by_name, file_name, file_ext, file_rel, bytes) "
                                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
                                    bid, k, title, text or None, p.user_id, nm or ("LX 관리자" if p.is_admin else "LX 직원"), name, ext, rel, size)
            await audit(conn, p, "board.post", bid, None, {"kind": k, "title": title})
    except Exception:
        if rel:
            (config.DATA_ROOT / rel).unlink(missing_ok=True)
        raise
    return {"item": _row(r, full=True), "at": now_iso()}


@router.post("/board/qna/{pid}/answer")
async def answer(pid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    text = str(body.get("answer") or "").strip()
    if not text:
        raise ApiError("bad_request", "답을 적어 주세요", {"field": "answer"})
    if len(text) > ANSWER_MAX:
        raise ApiError("bad_request", f"답은 {ANSWER_MAX}자까지입니다")
    async with db(realm="lx") as conn:
        nm = await conn.fetchval("SELECT name FROM lx_users WHERE id=$1", p.user_id)
        r = await conn.fetchrow("UPDATE lx_board_posts SET answer=$2, answer_by=$3, answer_by_name=$4, answered_at=now() "
                                "WHERE id=$1 AND kind='qna' AND removed_at IS NULL RETURNING *", pid, text, p.user_id, nm or "LX 관리자")
        if not r:
            raise ApiError("not_found", "질문이 없습니다")
        await audit(conn, p, "board.answer", pid, None, {"kind": "qna"})
    return {"item": _row(r, full=True), "at": now_iso()}


@router.get("/board/doc/{pid}/file")
async def get_file(pid: str, request: Request):
    _lx(request)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT file_name, file_ext, file_rel FROM lx_board_posts WHERE id=$1 AND kind='doc' AND removed_at IS NULL", pid)
    path = config.DATA_ROOT / r["file_rel"] if r and r["file_rel"] else None
    if not path or not path.is_file():
        raise ApiError("not_found", "파일이 없습니다")
    from urllib.parse import quote

    from .projects import FILE_TYPES
    return FileResponse(path, media_type=FILE_TYPES.get(r["file_ext"], "application/octet-stream"),
                        headers={"Content-Disposition": f"attachment; filename=\"file.{r['file_ext']}\"; filename*=UTF-8''{quote(r['file_name'])}"})
