"""못 한 요청 → 서비스 개선 고리(구현 4차 · 확인 대장 16차 개선-1 확인 · 원칙 98 · 39 · 57 · 59 · 63 · 72).

① 모으기(서버가 저절로) — XI ChatGEO 답이 끝나는 한 곳(agent/runner.emit 의 끝 사건)에서 record_run() 이 불린다.
   못 한 요청(지도 동작 없음 · 이 화면에 없음 · 자료 없음 · 권한 밖 · 법령 못 찾음 · 필지 못 찾음 · 서버 응답 없음 · 그 밖) ·
   3분 안에 같은 뜻으로 다시 물은 것 · 확인 카드 취소. 화면이 보내는 '도움 안 됐어요' · 확인 카드 취소 · 지도 동작 못 그림은 POST /assist/feedback.
   대화 원문은 저장하지 않는다 — 요지 한 줄(지명 · 지번 · 사람 이름은 '○○')과 분류만. 누가 물었는지는 알림을 위해 90일만(purge).
   기록은 답을 보낸 뒤 따로 돈다(답이 늦어지지 않게) · 실패해도 답은 그대로 나간다.
② 묶기 — 규칙(분류 + 요지 낱말). 언어 모델을 쓰지 않는다(GPU 0).
③ 화면 — GET /improve/items(LX 관리자 = 전부 · LX 직원 = 내가 담당하는 서비스 · 기관 것만) · 채택 · 보류 · 이미 됨 · 다시 고르기.
   '이미 됨'의 안내 문구는 다음부터 같은 요청의 답(끝 사건)에 hint {text, try} 로 실린다.
④ 알림 — POST /improve/items/{id}/notify(LX 관리자) → 물었던 사람(90일 안)마다 한 줄. GET /assist/notices · POST /assist/notices/{id}/seen.
⑤ 확인 대장과 잇기 — '채택' = 서버에 '확인 대기'(ledger). 대장으로 옮기는 것은 tools/review/pull-improvements.py(서버는 docs 를 고치지 않는다).

POST /assist/feedback               {run_id?, kind: not_helpful|card_cancel|map_failed, screen, summary?} → 204 (로그인 · 기관은 자기 답만)
GET  /assist/notices                → {items:[{id, text, try}]}  그 사람에게 온 '이제 됩니다' · 안 본 것만
POST /assist/notices/{id}/seen      → 204
GET  /improve/items?state=&role=    → 자주 막히는 요청(LX 관리자 · 담당 프로젝트장)
POST /improve/items/{id}/adopt      {how?}            채택 → 확인 대기
POST /improve/items/{id}/hold       {reason, until}   보류(사유 · 다시 볼 날짜)
POST /improve/items/{id}/already    {text, try?}      이미 됨(안내 문구 한 줄 · 누르면 보낼 질문)
POST /improve/items/{id}/reopen                       다시 고르기(새로 옴으로)
POST /improve/items/{id}/notify     {text?, try?}     이제 됩니다 보내기(LX 관리자 · 채택한 줄)
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import re
import secrets
import time

from fastapi import APIRouter, Request, Response

from .deps import ApiError, Principal, audit, db, principal, redis, require
from .envelope import KST, env, now_iso

router = APIRouter()
log_prefix = "[improve]"

# ── 말(화면 · 보고서 · 확인 대장 모두 이 말만) ────────────────────────────────────────────
KINDS = {  # 분류 — 확인 대장 16차 개선-1 에서 확인된 여덟 가지
    "action": "지도 동작 없음", "screen": "이 화면에 없음", "nodata": "자료 없음", "scope": "권한 밖",
    "law": "법령 못 찾음", "parcel": "필지 못 찾음", "server": "서버 응답 없음", "other": "그 밖",
}
HOW = {  # 채택 때 제안 방법 한 줄(관리자가 적지 않으면) — 확인 대장으로 옮길 때 '제안 방법' 칸
    "action": "말로 하는 지도 동작으로 넓히기",
    "screen": "이 화면에서도 하게 하거나, 할 수 있는 화면으로 바로 가는 버튼",
    "nodata": "그 지역 자료를 갖추거나, 결과가 있는 곳으로 안내",
    "scope": "할 수 있는 사람 · 화면으로 이어 주는 안내",
    "law": "풀어 쓴 말로도 조문을 찾게 하기",
    "parcel": "화면에서 고른 필지로 알아듣게 하기",
    "server": "답 서버가 멈춘 까닭을 찾아 막기",
    "other": "질문의 뜻을 알아듣도록 보완",
}
STATE_KO = {"new": "새로 옴", "adopted": "채택", "built": "만들어짐", "held": "보류", "already": "이미 됨"}
ROLE_KO = {"staff": "LX 직원", "admin": "LX 관리자", "sales": "LX 영업", "tenant": "기관"}
SIG_BLOCK = ("blocked", "map_failed")             # '몇 번' = 막힌 횟수
SOURCE_KO = {"check-1001": "10-01 점검"}
# 화면 이름(사용자 말) — 화면이 context.home 을 주면 그대로, 아니면 context 모양으로 알아본다
HOME_KO = {
    "lx-console": "첫 화면", "xi-clean": "XI맵", "global": "XI맵(해외)", "lx-review": "결과 확인", "lx-ingest": "데이터 올리기",
    "lx-train": "학습", "lx-deploy": "서비스 관리", "lx-project": "프로젝트", "lx-analyze": "분석하기", "lx-cards": "서비스 카드",
    "lx-inbox": "요청함", "ops-core": "LX 관리자 대시보드", "ops-infra": "LX 관리자 대시보드", "ops-accounts": "계정 관리",
    "gov-select": "내 서비스", "gov-report": "할 일·보고서", "gov-fusion": "내 대장 × AI", "gov-request": "분석 의뢰",
    "gov-space": "우리 공간", "gov-accounts": "계정", "help-my": "지원", "sales": "서비스 카탈로그", "service-detail": "서비스",
}
RETAIN_DAYS = 90                                   # 누가 물었는지 · 알림 — 90일만(원칙 94 의 90일과 같은 기간)
REASK_S = 180                                      # 3분 안에 같은 뜻으로 다시 물음
MASK = "○○"


# ═══ 가리기 · 요지 ═════════════════════════════════════════════════════════════════════
JOSA = ("으로부터", "에서부터", "이랑", "으로", "에서", "에게", "한테", "까지", "부터", "하고", "처럼", "보다", "이나", "이며", "이고",
        "의", "을", "를", "은", "는", "이", "가", "에", "로", "과", "와", "도", "만", "랑")
_KEEP = {"이동", "화면", "지도", "전체", "다시", "표시", "중앙", "결과", "영상", "대장", "분석", "현장", "확인", "필요", "우리", "보기",
         "서비스", "보고서", "기관", "전역", "범위", "지역", "시군구", "읍면동", "필지", "의심", "비교", "건물", "농지", "도로",
         "관리", "처리", "정리", "거리", "자리", "소리", "요리", "수리", "원리", "논리", "관할", "전국", "해외", "국내", "중심", "주변",
         "대신", "하고", "상대", "중간", "시작", "다음", "처음", "마지막", "신규", "기존", "평화", "안전", "생활", "환경", "농업", "산업", "공원",
         "도시", "농촌", "바다", "해안", "산림", "하천", "학교", "시장", "역전", "신도시", "구도심", "본동", "남부", "북부", "동부", "서부"}
_ADMIN_TAIL = re.compile(r"(특별자치도|특별자치시|통합특별시|특별시|광역시|도|시|군|구|읍|면|동|리|가)$")
_PLACE_AFTER = re.compile(r"^([가-힣0-9]{1,6}(읍|면|동|리|로|길)|[가-힣]{1,4}\d가)$")   # 가린 지명 바로 뒤에 오는 아래 단위(읍면동 · 리 · 길 · n가)
_COMMON_TAIL = {"이동", "활동", "운동", "자동", "행동", "공동", "작동", "변동", "연동", "출동", "가동", "화면", "측면", "정면", "장면", "단면", "전면",
                "후면", "방면", "국면", "일면", "대면", "내면", "외면", "반면", "지면", "수면", "양면", "표면", "관리", "처리", "정리", "거리",
                "자리", "소리", "요리", "수리", "원리", "논리", "무리", "우리", "미리", "빨리", "멀리", "머리", "유리", "의리", "진리", "도로",
                "대로", "경로", "통로", "진로", "새로", "바로", "서로", "따로", "실로", "주로", "별로", "길"}
_HONOR = re.compile(r"(?<![가-힣])([가-힣]{2,3})\s?(씨|님|주무관|팀장|과장|계장|대리|부장|차장|사무관|주임|실장|국장|소장|선생님)(?![가-힣])")
_PNU = re.compile(r"(?<!\d)\d{19}(?!\d)")
_LOT = re.compile(r"(?<![\d.])(산\s?)?\d{1,5}-\d{1,5}(?![\d년월일])|(?<![\d.])(산\s?)?\d{1,5}\s?번지")
_PII_TAG = re.compile(r"\[마스킹:[^\]]*\]")
_NUM_AFTER_MASK = re.compile(r"(○○[가-힣]{0,3}\s?)(산\s?)?\d{1,5}(-\d{1,5})?(?![\d-])(?!\s?(년|월|일|건|필지|개|곳|명|%|㎡|㎢|m|km|ha|배|위|등|층|차|번째|분|초|시간|원|도|장|대))")
_MASK_RUN = re.compile(r"○○(?:\s*[·,]?\s*○○)+")

_NAMES: dict = {"places": set(), "people": set(), "at": 0.0, "ok": False}
_NAMES_TASK: asyncio.Task | None = None
NAMES_TTL_S = 6 * 3600


def set_names(places=(), people=()) -> None:
    """시험 · 게이트웨이 밖에서 이름 사전을 바로 넣는다."""
    _NAMES.update({"places": {str(x).lower() for x in places if len(str(x)) >= 2}, "people": {str(x) for x in people if len(str(x)) >= 2},
                   "at": time.time(), "ok": True})


def _place_words(rows_regions, extra=(), whole=()) -> set[str]:
    out: set[str] = set()
    for x in rows_regions:
        for nm in (x.get("name"), x.get("sido"), x.get("sido_short"), x.get("full"), x.get("name_en")):
            if not nm:
                continue
            for w in str(nm).replace(",", " ").split():
                w = w.strip("()·").lower()
                if len(w) >= 2:
                    out.add(w)
                    s = _ADMIN_TAIL.sub("", w)
                    if len(s) >= 2 and s != w:
                        out.add(s)
                    for suf in ("-si", "-gun", "-gu", "-do"):
                        if w.endswith(suf) and len(w) - len(suf) >= 3:
                            out.add(w[: -len(suf)])
    for w in extra:
        w = str(w or "").strip().lower()
        if len(w) >= 2:
            out.add(w)
            s = _ADMIN_TAIL.sub("", w)
            if len(s) >= 2 and s != w:
                out.add(s)
    for w in whole:                                   # 리 이름은 통째로만('하고리'의 '하고'처럼 흔한 말을 가리지 않게)
        w = str(w or "").strip().lower()
        if len(w) >= 3:
            out.add(w)
    return {w for w in out if w not in _KEEP}


async def _load_names() -> None:
    """지명(전국 시군구 · 시도 · 실태조사 읍면동 · 리 · 해외 기관 관할) · 사람 이름(계정 이름)을 한 번 모은다."""
    extra: list[str] = []
    whole: list[str] = []
    people: set[str] = set()
    try:
        from starlette.concurrency import run_in_threadpool
        from . import regions as R
        base, _, _ = await run_in_threadpool(R.regions_base)
    except Exception:  # noqa: BLE001
        base = []
    try:
        async with db(realm="lx") as conn:
            for q, into in (("SELECT DISTINCT emd AS w FROM survey_parcels WHERE emd IS NOT NULL", extra),
                            ("SELECT DISTINCT ri AS w FROM survey_parcels WHERE ri IS NOT NULL AND ri <> ''", whole),
                            ("SELECT DISTINCT unnest(coalesce(names, ARRAY[name])) AS w FROM survey_emd", extra)):
                try:
                    into += [r["w"] for r in await conn.fetch(q)]
                except Exception:  # noqa: BLE001
                    pass
            for q in ("SELECT name FROM lx_users", "SELECT name FROM tenant_users"):
                try:
                    for r in await conn.fetch(q):
                        nm = str(r["name"] or "").strip()
                        if re.fullmatch(r"[가-힣]{2,4}", nm) and nm not in ("관리자", "담당자", "직원", "운영팀"):
                            people.add(nm)
                except Exception:  # noqa: BLE001
                    pass
    except Exception:  # noqa: BLE001
        pass
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from agent import audit as A
        for ws in A.tenant_words().values():
            extra += list(ws)
    except Exception:  # noqa: BLE001
        pass
    try:                                              # 해외 · 국내 지역 이름표(region_profiles) — 키르기스스탄 비슈케크 · Bishkek 등
        import yaml
        from . import config
        prof = (yaml.safe_load((config.SERVER_ROOT / "config" / "region_profiles.yaml").read_text(encoding="utf-8")) or {}).get("profiles") or {}
        for v in prof.values():
            nm = (v or {}).get("name") or {}
            for w in re.split(r"[\s,]+", f"{nm.get('ko') or ''} {nm.get('en') or ''}"):
                if len(w) >= 2:
                    extra.append(w)
    except Exception:  # noqa: BLE001
        pass
    _NAMES.update({"places": _place_words(base, extra, whole), "people": people, "at": time.time(), "ok": True})


async def ensure_names(wait: bool = True) -> bool:
    global _NAMES_TASK
    fresh = _NAMES["ok"] and time.time() - _NAMES["at"] < NAMES_TTL_S
    if fresh:
        return True
    if _NAMES_TASK is None or _NAMES_TASK.done():
        _NAMES_TASK = asyncio.get_running_loop().create_task(_load_names())
    if wait:
        try:
            await asyncio.shield(_NAMES_TASK)
        except Exception:  # noqa: BLE001
            pass
    return _NAMES["ok"]


def _split_josa(tok: str) -> tuple[str, str]:
    for j in JOSA:
        if tok.endswith(j) and len(tok) - len(j) >= 2:
            return tok[: -len(j)], j
    return tok, ""


_ADDR_LIKE = re.compile(r"^[가-힣]{1,5}\d{1,2}(가|동)$")      # 종로1가 · 역삼1동 — 사전에 없어도 주소 꼴이면 지명


def _is_place(stem: str) -> bool:
    s = stem.lower()
    if s in _KEEP:
        return False
    if s in _NAMES["places"] or _ADDR_LIKE.match(s):
        return True
    t = _ADMIN_TAIL.sub("", s)
    return len(t) >= 2 and t != s and t in _NAMES["places"]


def mask(text: str) -> str:
    """지명 · 지번 · 사람 이름 · (기존 가리기: 주민번호 · 전화 · 메일) → '○○'. 숫자 중 건수 · 해 · 넓이는 그대로 둔다."""
    s = str(text or "")
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from agent.audit import mask_pii
        s, _ = mask_pii(s)
    except Exception:  # noqa: BLE001
        pass
    s = _PII_TAG.sub(MASK, s)
    s = _PNU.sub(MASK, s)
    s = _HONOR.sub(lambda m: MASK + " " + m.group(2), s)
    for nm in sorted(_NAMES["people"], key=len, reverse=True):
        s = re.sub(rf"(?<![가-힣]){re.escape(nm)}", MASK, s)
    out, prev_mask = [], False
    for raw in re.split(r"(\s+)", s):
        if not raw or raw.isspace():
            out.append(raw)
            continue
        lead = re.match(r"^[(\[\"'“‘]*", raw).group(0)
        trail = re.search(r"[)\]\"'”’,.?!·]*$", raw).group(0)
        core = raw[len(lead): len(raw) - len(trail)] if trail else raw[len(lead):]
        stem, josa = _split_josa(core)
        after = prev_mask and not ({core, stem} & (_KEEP | _COMMON_TAIL)) and bool(_PLACE_AFTER.match(core) or _PLACE_AFTER.match(stem))
        hit = bool(core) and (_is_place(core) or _is_place(stem) or after)
        if hit:
            j = josa if (_is_place(stem) and not _is_place(core)) or (after and not _PLACE_AFTER.match(core)) else ""
            out.append(lead + MASK + j + trail)
            prev_mask = True
        else:
            out.append(raw)
            prev_mask = core.startswith(MASK) and not trail
    s = "".join(out)
    s = _LOT.sub(MASK, s)
    s = _NUM_AFTER_MASK.sub(lambda m: m.group(1) + MASK, s)
    s = _MASK_RUN.sub(MASK, s)
    return s


# 끝맺음 → 요지(명사꼴). 위에서부터 한 번만.
_TAIL = [
    (re.compile(r"\s*(좀\s*)?보여\s*(줘|줄래|주세요|주실래요|주시겠어요|봐)\s*[?.!~]*$"), " 보기"),
    (re.compile(r"\s*(좀\s*)?켜\s*(줘|줄래|주세요|봐)\s*[?.!~]*$"), " 켜기"),
    (re.compile(r"\s*(좀\s*)?꺼\s*(줘|줄래|주세요|봐)\s*[?.!~]*$"), " 끄기"),
    (re.compile(r"\s*(좀\s*)?알려\s*(줘|줄래|주세요|봐)\s*[?.!~]*$"), ""),
    (re.compile(r"\s*(좀\s*)?(만들어|그려|찾아|열어|바꿔|옮겨|띄워|세어|올려|내려|돌려|나눠|골라|보내)\s*(줘|줄래|주세요|봐)\s*[?.!~]*$"),
     lambda m: " " + {"만들어": "만들기", "그려": "그리기", "찾아": "찾기", "열어": "열기", "바꿔": "바꾸기", "옮겨": "옮기기", "띄워": "띄우기",
                      "세어": "세기", "올려": "올리기", "내려": "내리기", "돌려": "돌리기", "나눠": "나누기", "골라": "고르기", "보내": "보내기"}[m.group(2)]),
    (re.compile(r"\s*(좀\s*)?(해|하여|해서)\s*(줘|줄래|주세요|주실래요|봐|주시겠어요)\s*[?.!~]*$"), ""),
    (re.compile(r"(해|하여)(줘|줄래|주세요|봐)\s*[?.!~]*$"), ""),
    (re.compile(r"\s*(줘|줄래|주세요)\s*[?.!~]*$"), ""),
    (re.compile(r"\s*(이야|야|이에요|예요|인가요|인가|어때|있어|있나요|없어|돼|되나|될까|가능해|할 수 있어|해 볼래|일까)\s*[?.!~]*$"), ""),
]
_FILL = re.compile(r"(?<![가-힣])(좀|한번|그냥|제발|혹시)(?![가-힣])")
_STOP = {"이", "그", "저", "좀", "더", "지금", "여기", "거기", "저기", "것", "거", "수", "때", "중", "및", "또", "그리고", "나", "제", "내", MASK,
         "줘", "주세요", "줄래", "봐", "해", "해줘"}
_VERB_END = re.compile(r"(해서|하여|하고|하는|하면|해|한|할|된|되는|돼서|으로|해줘)$")
_SYN = {"이미지": "그림", "사진": "그림", "캡처": "그림", "스크린샷": "그림", "png": "그림", "jpg": "그림"}
GIST_MAX = 40


def gist(text: str, masked: bool = False) -> str:
    """요지 한 줄 — 가린 뒤 끝맺음을 덜어 낸다(원문 아님 · 40자 안)."""
    return _normalize(text if masked else mask(text))


def _normalize(s: str) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    for rx, rep in _TAIL:
        n = rx.sub(rep, s)
        if n != s:
            s = n
            break
    s = _FILL.sub("", s)
    s = re.sub(r"\s+", " ", s).strip(" .?!~,")
    if len(s) > GIST_MAX:
        cut = s[:GIST_MAX].rsplit(" ", 1)[0]
        s = (cut if len(cut) >= 12 else s[:GIST_MAX]).rstrip(" ·,") + "…"
    return s


def tokens(g: str) -> set[str]:
    """묶음 낱말 — 조사 · 끝맺음 · 숫자(해 · 건수) · 가린 자리 · 군말을 덜어 낸 낱말."""
    out = set()
    for t in re.split(r"[\s·,/()]+", g or ""):
        t = t.strip("'\"“”‘’.?!…")
        if not t or MASK in t:
            continue
        if re.fullmatch(r"[\d.,]+(년|월|일|건|개|곳|명|%|차)?[가-힣]{0,2}", t):
            continue
        st, _ = _split_josa(t)
        st = _VERB_END.sub("", st) if len(st) > 2 else st
        st = _SYN.get(st.lower(), st.lower())
        if st and st not in _STOP:
            out.add(st)
    return out


def key_of(kind: str, toks: set[str]) -> str:
    return kind + "|" + "·".join(sorted(toks))


def iga(word: str) -> str:
    """받침에 맞는 '이' · '가'(요지 끝 글자 기준 · 한글이 아니면 '가')."""
    w = re.sub(r"[\s'\"”’.…]+$", "", str(word or ""))
    ch = w[-1:] or ""
    return "이" if "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 else "가"


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


# ═══ 분류 ═══════════════════════════════════════════════════════════════════════════
_RX = [  # 답 글자 → 분류(위에서부터). 화면 · 서버의 '할 수 없습니다'류 문구(설계 7차 실태 §3)
    ("server", re.compile(r"지금은 답할 수 없습니다|잠시 응답하지 않습니다|서버가 (늦|응답)")),
    ("law", re.compile(r"법령 데이터에 없습니다|그 말로는 못 찾았습니다|맞는 조문(이|을)? ?(없|찾지 못)")),
    ("parcel", re.compile(r"어느 필지인지 찾지 못했습니다|필지(를| 경계를)? 찾지 못했습니다")),
    ("scope", re.compile(r"이 기관의 데이터가 아닙니다|관할 밖|LX 관리자 화면에서 확인할 수 있습니다|권한 밖|계정에서 볼 수 없습니다|"
                         r"(관리자|LX\s?가?)\s?(직접 )?합니다|LX가 합니다")),
    ("nodata", re.compile(r"해당 지역 데이터가 없습니다|(아직|이 지역은?)\s?[^.\n]{0,16}(결과|영상|자료)(가|는)? 없습니다|지역을 찾지 못했습니다")),
    ("screen", re.compile(r"이 화면에는[^.\n]{0,12}없|이 화면(에서는| 지도에는)[^.\n]{0,24}(수 없|없어|못)|이 화면에서 (그릴|할) 수 없")),
    ("action", re.compile(r"그 지도 동작은 아직 할 수 없습니다|지도 동작이 확인되지 않았습니다|(그리지|켜지|끄지|옮기지|표시하지|저장하지) 못했습니다|"
                          r"아직 (할 수 없|없습니다|지원하지)|That map action isn't available")),
    ("other", re.compile(r"할 수 없습니다|하지 못했습니다|못 ?했습니다|지원하지 않습니다|불가능합니다|찾지 못했습니다|생성할 수 없|"
                         r"can't|cannot|isn't available|not available", re.I)),
]
REJECT_KIND = {"no_region_data": "nodata", "cross_tenant": "scope", "cross_tenant_region": "scope", "outside": "scope",
               "deploys_forbidden": "scope", "quota_write": "scope", "privilege": "scope", "results_edit": "scope",
               "owner_pii": "scope", "raw_imagery": "scope", "admin_only": "scope"}
SKIP_REJECT = {"prompt_injection"}                  # 지시를 바꾸려는 문장은 개선 재료가 아니다


def kind_of_text(md: str) -> str | None:
    t = re.sub(r"\{\{[^}]*\}\}", "", str(md or ""))
    for k, rx in _RX:
        if rx.search(t):
            return k
    return None


def classify(event: str, data: dict, steps=None) -> list[tuple[str, str]]:
    """끝 사건 하나 → [(신호, 분류)]. 신호 = blocked | card_cancel. 빈 목록이면 기록할 막힘이 없다."""
    data = data or {}
    out: list[tuple[str, str]] = []
    if event == "agent.failed":
        return [("blocked", "server")]
    if event == "agent.rejected":
        cat = str(data.get("category") or "")
        if cat in SKIP_REJECT:
            return []
        return [("blocked", REJECT_KIND.get(cat) or kind_of_text(data.get("message")) or "scope")]
    if event != "agent.done":
        return []
    k = None
    cn = data.get("cannot") or data.get("blocked")            # 채팅 쪽이 답에 막힘을 실어 주면 그 분류를 먼저
    if isinstance(cn, dict):
        c = str(cn.get("kind") or cn.get("category") or "")
        k = c if c in KINDS else next((kk for kk, v in KINDS.items() if v == c), None) or REJECT_KIND.get(c)
    if not k and data.get("action_flags"):
        k = "action"
    if not k:
        k = kind_of_text(data.get("answer_md"))
    cancel = any(str((s or {}).get("error") or "") == "rejected_by_user" for s in (steps or []))
    if cancel:
        out.append(("card_cancel", k or "other"))
        if k == "other" and re.search(r"취소", str(data.get("answer_md") or "")):
            return out                                       # '취소해서 실행하지 않았습니다'는 막힘이 아니라 취소
    if k:
        out.append(("blocked", k))
    return out


def screen_of(c: dict | None) -> str | None:
    c = c or {}
    home = str(c.get("home") or c.get("page") or "")
    if home in HOME_KO:
        return HOME_KO[home]
    nm = str(c.get("screen_name") or "")
    if nm:
        return "LX 관리자 대시보드" if nm.startswith("LX 관리자 대시보드") else nm[:30]
    scr = str(c.get("screen") or "")
    if scr in HOME_KO:
        return HOME_KO[scr]
    if scr == "ops":
        return "LX 관리자 대시보드"
    if "ledger" in c:
        return HOME_KO["gov-fusion"]
    if any(k in c for k in ("emd_cd", "region_name", "rule")):
        return "XI맵"
    return None


def clean_screen(s) -> str | None:
    s = str(s or "").strip()
    if not s:
        return None
    m = re.search(r"/landxi/v3/([\w-]+)", s)
    if m:
        s = m.group(1)
    if s in HOME_KO:
        return HOME_KO[s]
    s = re.sub(r"[<>/\\{}]", "", s)[:30].strip()
    return s or None


def role_of(p) -> str | None:
    if getattr(p, "realm", None) == "tenant":
        return "tenant"
    return getattr(p, "role", None)


def tenant_key(p) -> str:
    return p.tenant_id if getattr(p, "realm", None) == "tenant" and p.tenant_id else "lx"


# ═══ 이미 됨 안내(끝 사건에 hint) ═════════════════════════════════════════════════════
_ALREADY: dict = {"rows": [], "at": 0.0}
_ALREADY_TASK: asyncio.Task | None = None
ALREADY_TTL_S = 60


async def _load_already():
    try:
        async with db(realm="lx") as conn:
            rows = await conn.fetch("SELECT id, key, gist, already_text, already_try FROM improve_items WHERE state='already' AND already_text IS NOT NULL")
        _ALREADY.update({"rows": [{"id": r["id"], "toks": set((r["key"].split("|", 1) + [""])[1].split("·")) - {""},
                                   "text": r["already_text"], "try": r["already_try"]} for r in rows], "at": time.time()})
    except Exception:  # noqa: BLE001
        _ALREADY["at"] = time.time()


def _refresh_already(force: bool = False):
    global _ALREADY_TASK
    if not force and time.time() - _ALREADY["at"] < ALREADY_TTL_S:
        return
    if _ALREADY_TASK is None or _ALREADY_TASK.done():
        try:
            _ALREADY_TASK = asyncio.get_running_loop().create_task(_load_already())
        except RuntimeError:
            pass


def hint_for(text: str) -> dict | None:
    """같은 요청이 '이미 됨'이면 {text, try} — 가린 요지 낱말이 묶음 낱말과 거의 같을 때(0.6 이상)."""
    if not _NAMES["ok"] or not _ALREADY["rows"]:
        return None
    tk = tokens(gist(text))
    best, bv = None, 0.0
    for r in _ALREADY["rows"]:
        v = jaccard(tk, r["toks"])
        if v > bv:
            best, bv = r, v
    if best and bv >= 0.6:
        return {"text": best["text"], "try": best["try"], "item": best["id"]}
    return None


# ═══ 모으기 — 답이 끝나는 곳(runner.emit)에서 ════════════════════════════════════════
TERMINAL = ("agent.done", "agent.rejected", "agent.failed")
RUN_ID = re.compile(r"^run_\d{12}[0-9a-f]{6}$")    # 실제 답의 번호(runner.ulid) — 시험 run(run_test… · run_t… · run_r3route)은 모으지 않는다
_BG: set = set()


async def record_run(ctx, event: str, data: dict) -> None:
    """XI ChatGEO 답 끝 사건 하나 — ① 이미 됨이면 hint 를 싣는다(메모리 · 즉시) ② 기록은 따로(답을 늦추지 않는다)."""
    if event not in TERMINAL:
        return
    p = getattr(ctx, "principal", None)
    if p is None or getattr(p, "guest", True) or not getattr(p, "user_id", None):
        return
    if not RUN_ID.match(str(getattr(ctx, "run_id", "") or "")):
        return
    msg = str((getattr(ctx, "state", None) or {}).get("msg") or "")
    if not msg.strip():
        return
    sigs = classify(event, data, getattr(ctx, "steps", None))
    _refresh_already()
    if not _NAMES["ok"]:
        try:
            await ensure_names(wait=False)
        except Exception:  # noqa: BLE001
            pass
    if any(s == "blocked" for s, _ in sigs):
        h = hint_for(msg)
        if h:
            data["hint"] = {"text": h["text"], "try": h["try"]}
    job = asyncio.get_running_loop().create_task(_store_run(p, getattr(ctx, "run_id", None), msg, sigs, dict(getattr(ctx, "context", None) or {})))
    _BG.add(job)
    job.add_done_callback(_BG.discard)


def same_meaning_hashes(msg: str) -> tuple[list[str], list[str]]:
    """다시 물음 비교용 — (낱말 해시, 그 가운데 지명 해시). 지명은 지우지 않고 어간으로 맞춘다(구례군 = 구례) — 다른 곳을 물으면 다른 질문이다.
    원문 · 낱말 자체는 남기지 않는다(짧은 해시만 3분 Redis)."""
    hx = lambda t: hashlib.sha1(t.encode()).hexdigest()[:10]   # noqa: E731
    allh, places = set(), set()
    for t in tokens(_normalize(msg)):
        if _is_place(t):
            st = _ADMIN_TAIL.sub("", t) if len(_ADMIN_TAIL.sub("", t)) >= 2 else t
            places.add(hx(st))
            allh.add(hx(st))
        else:
            allh.add(hx(t))
    return sorted(allh), sorted(places)


def same_meaning(a: tuple, b: tuple) -> bool:
    """낱말이 거의 같고(0.6 이상) · 둘 다 지명을 말했으면 같은 곳일 때만."""
    (ha, pa), (hb, pb) = a, b
    if not ha or not hb or jaccard(set(ha), set(hb)) < 0.6:
        return False
    return not (pa and pb) or set(pa) == set(pb)


async def _store_run(p, run_id, msg: str, sigs: list[tuple[str, str]], context: dict) -> None:
    try:
        await ensure_names(wait=True)
        g = gist(msg)
        toks = tokens(g)
        scr = screen_of(context)
        card = str(context.get("card") or context.get("card_id") or "") or None
        sgg = str(context.get("region") or "")
        sgg = sgg if re.fullmatch(r"\d{5}", sgg) else None
        meta = {"role": role_of(p), "screen": scr, "tenant": tenant_key(p), "card": card, "sgg": sgg}
        item_id = None
        for sig, kind in sigs:
            iid = await save_signal(sig, kind, g, toks, meta, run_id=run_id, asker=p)
            if sig == "blocked" or not item_id:
                item_id = iid or item_id
        await _reask(p, run_id, g, same_meaning_hashes(msg), sigs, meta, item_id)
    except Exception as e:  # noqa: BLE001
        print(f"{log_prefix} 기록 실패: {type(e).__name__}: {str(e)[:160]}", flush=True)


async def _reask(p, run_id, g: str, hashes: tuple, sigs, meta: dict, item_id: str | None) -> None:
    """3분 안에 같은 뜻으로 다시 물음 — 바로 앞 질문과 낱말(해시)이 거의 같으면(0.6 이상) 앞 질문의 묶음에 '다시 물음' 1.
    Redis 에는 해시 · 가린 요지 · 묶음 id 만 3분 둔다."""
    try:
        r = await redis()
    except Exception:  # noqa: BLE001
        return
    rk = f"improve:recent:{p.realm}:{p.user_id}"
    kind = next((k for s, k in sigs if s == "blocked"), None) or (sigs[0][1] if sigs else None)
    cur = {"h": hashes[0], "hp": hashes[1], "at": time.time(), "item": item_id, "kind": kind, "gist": g, "toks": sorted(tokens(g)), "run": run_id}
    try:
        raw = await r.get(rk)
        prev = json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        prev = None
    if prev and time.time() - float(prev.get("at") or 0) <= REASK_S and prev.get("run") != run_id:
        if same_meaning((prev.get("h") or [], prev.get("hp") or []), hashes):
            k = prev.get("kind") or kind or "other"
            pt = set(prev.get("toks") or []) or tokens(g)
            iid = await save_signal("reask", k, prev.get("gist") or g, pt, meta, run_id=run_id, asker=p, item_id=prev.get("item"))
            cur["item"] = cur["item"] or iid             # 같은 질문을 세 번 물으면 두 번(바로 앞 질문과만 비교)
    try:
        await r.set(rk, json.dumps(cur, ensure_ascii=False), ex=REASK_S)
    except Exception:  # noqa: BLE001
        pass


async def save_signal(sig: str, kind: str, g: str, toks: set[str], meta: dict, run_id: str | None = None, asker=None,
                      item_id: str | None = None, source: str = "auto", at: dt.datetime | None = None, note: str | None = None,
                      item_key: str | None = None, item_gist: str | None = None) -> str | None:
    """신호 한 번 → 묶음(같은 열쇠 · 아니면 같은 분류에서 낱말이 0.75 이상 같은 줄) + 신호 + 물은 사람(90일)."""
    kind = kind if kind in KINDS else "other"
    key = item_key or key_of(kind, toks)
    async with db(realm="lx") as conn:
        if run_id and await conn.fetchval("SELECT 1 FROM improve_signals WHERE run_id=$1 AND sig=$2", run_id, sig):
            return item_id
        row = None
        if item_id:
            row = await conn.fetchrow("SELECT id FROM improve_items WHERE id=$1", item_id)
        if not row:
            row = await conn.fetchrow("SELECT id FROM improve_items WHERE key=$1", key)
            if row and item_gist and source != "auto":     # 첫 목록: 같은 열쇠로 먼저 모인 줄이 있으면 그 줄을 점검 줄로(모인 신호는 그대로)
                await conn.execute("UPDATE improve_items SET gist=$2, note=coalesce($3, note), source=$4, first_at=least(first_at, $5) WHERE id=$1",
                                   row["id"], item_gist, note, source, at or dt.datetime.now(KST))
        if not row and toks and not item_key:
            best, bv = None, 0.0
            for r in await conn.fetch("SELECT id, key FROM improve_items WHERE kind=$1", kind):
                v = jaccard(toks, set((r["key"].split("|", 1) + [""])[1].split("·")) - {""})
                if v > bv:
                    best, bv = r, v
            if best and bv >= 0.75:
                row = best
        when = at or dt.datetime.now(KST)
        if row:
            iid = row["id"]
            await conn.execute("UPDATE improve_items SET last_at=greatest(last_at, $2), updated_at=now() WHERE id=$1", iid, when)
        else:
            iid = "ic_" + secrets.token_hex(6)
            await conn.execute("INSERT INTO improve_items(id, key, kind, gist, note, source, first_at, last_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) "
                               "ON CONFLICT (key) DO NOTHING", iid, key, kind, item_gist or g or KINDS[kind], note, source, when)
            iid = await conn.fetchval("SELECT id FROM improve_items WHERE key=$1", key) or iid
        await conn.execute("INSERT INTO improve_signals(item_id, sig, kind, gist, role, screen, tenant_id, card_id, sgg_cd, run_id, source, at) "
                           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING",
                           iid, sig, kind, g, meta.get("role"), meta.get("screen"), meta.get("tenant") or "lx", meta.get("card"), meta.get("sgg"),
                           run_id, source, when)
        if asker is not None and getattr(asker, "user_id", None):
            await conn.execute("INSERT INTO improve_askers(item_id, realm, user_id, tenant_id, at) VALUES ($1,$2,$3,$4,now()) "
                               "ON CONFLICT (item_id, realm, user_id) DO UPDATE SET at=now(), tenant_id=EXCLUDED.tenant_id",
                               iid, asker.realm, asker.user_id, tenant_key(asker))
    return iid


# ═══ 화면이 보내는 신호 ═════════════════════════════════════════════════════════════
FEEDBACK_KINDS = {"not_helpful", "card_cancel", "map_failed"}


@router.post("/assist/feedback", status_code=204)
async def feedback(body: dict, request: Request):
    p = require(principal(request))
    kind = str(body.get("kind") or "")
    if kind not in FEEDBACK_KINDS:
        raise ApiError("bad_request", "kind 는 not_helpful | card_cancel | map_failed")
    try:                                              # 한 사람 1분 30번까지(누르기 장난 · 반복 전송 막기)
        r = await redis()
        k = f"improve:fb:{p.realm}:{p.user_id}:{int(time.time() // 60)}"
        n = await r.incr(k)
        await r.expire(k, 120)
        if n > 30:
            raise ApiError("bad_request", "잠시 뒤 다시 보내 주세요")
    except ApiError:
        raise
    except Exception:  # noqa: BLE001
        pass
    run_id = str(body.get("run_id") or "").strip() or None
    if run_id and run_id.startswith("run_test"):       # 시험 · 점검 답(run_test…)에 붙은 화면 신호는 모으지 않는다
        return Response(status_code=204)
    summary = re.sub(r"\s+", " ", str(body.get("summary") or "")).strip()[:200]
    scr = clean_screen(body.get("screen"))
    text, answer, ctx_kind = None, None, None
    if run_id:
        if not re.fullmatch(r"run_[\w-]{4,60}", run_id):
            raise ApiError("bad_request", "run_id 형식")
        async with db(p) as conn:                      # RLS — 기관은 자기 기관 답만 보인다
            row = await conn.fetchrow("SELECT user_id, tenant_id, prompt_text, answer_md, state, error FROM agent_runs WHERE id=$1", run_id)
        if not row or not (row["user_id"] == p.user_id or p.is_admin):
            raise ApiError("not_found", "그 답을 찾지 못했습니다")
        text, answer = row["prompt_text"], row["answer_md"]
        ctx_kind = "server" if row["state"] == "failed" else (REJECT_KIND.get(str(row["error"] or "")) if row["state"] == "rejected" else None)
    await ensure_names(wait=True)
    if kind == "map_failed":
        k = "screen" if re.search(r"이 화면|지도가 없|층이 없", summary + " " + str(answer or "")) else "action"
    else:
        k = ctx_kind or kind_of_text(answer) or "other"
    g = gist(text) if text else (gist(summary) if summary else {"not_helpful": "도움이 안 된 답", "card_cancel": "확인 카드 취소",
                                                                 "map_failed": "지도에 그리지 못함"}[kind])
    toks = tokens(g)
    item = None
    if run_id:                                          # 같은 답이 이미 막힘으로 모였으면 그 줄에 붙인다
        async with db(realm="lx") as conn:
            item = await conn.fetchval("SELECT item_id FROM improve_signals WHERE run_id=$1 ORDER BY id LIMIT 1", run_id)
    meta = {"role": role_of(p), "screen": scr, "tenant": tenant_key(p), "card": None, "sgg": None}
    await save_signal(kind, k, g, toks, meta, run_id=run_id, asker=p, item_id=item, source="screen")
    return Response(status_code=204)


# ═══ 이제 됩니다 — 채팅창 맨 위 한 줄 ════════════════════════════════════════════════
@router.get("/assist/notices")
async def notices(request: Request):
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id, text, try FROM improve_notices WHERE realm=$1 AND user_id=$2 AND tenant_id=$3 AND seen_at IS NULL "
                                f"AND created_at > now() - interval '{RETAIN_DAYS} days' ORDER BY created_at DESC LIMIT 5",
                                p.realm, p.user_id, tenant_key(p))
    return {"items": [{"id": r["id"], "text": r["text"], "try": r["try"]} for r in rows], "as_of": now_iso()}


@router.post("/assist/notices/{nid}/seen", status_code=204)
async def notice_seen(nid: str, request: Request):
    p = require(principal(request))
    async with db(p) as conn:
        n = await conn.execute("UPDATE improve_notices SET seen_at=coalesce(seen_at, now()) WHERE id=$1 AND realm=$2 AND user_id=$3 AND tenant_id=$4",
                               nid, p.realm, p.user_id, tenant_key(p))
    if not n.endswith("1"):
        raise ApiError("not_found", "알림이 없습니다")
    return Response(status_code=204)


# ═══ LX 쪽 — 자주 막히는 요청 ════════════════════════════════════════════════════════
def _lx(request: Request) -> Principal:
    p = require(principal(request), lx=True)
    if p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "LX 관리자 · LX 직원만 봅니다")
    return p


async def _my_scope(conn, p: Principal) -> tuple[list[str], list[str]] | None:
    """LX 관리자 = None(전부). LX 직원 = (내가 담당하는 서비스 카드, 그 카드를 받은 기관) — 담당 = 검토 요청과 같은 규칙(messages._owner)."""
    if p.is_admin:
        return None
    from .messages import _owner
    mine = []
    for r in await conn.fetch("SELECT id FROM cards"):
        try:
            o = await _owner(conn, r["id"])
        except Exception:  # noqa: BLE001
            o = None
        if o and o.get("id") == p.user_id:
            mine.append(r["id"])
    tenants = [r["tenant_id"] for r in await conn.fetch("SELECT DISTINCT tenant_id FROM deploys WHERE card_id = ANY($1::text[])", mine)] if mine else []
    return mine, [t for t in tenants if t and t != "lx"]


def _scope_sql(scope, n0: int) -> tuple[str, list]:
    if scope is None:
        return "true", []
    return (f"EXISTS (SELECT 1 FROM improve_signals s WHERE s.item_id=i.id AND (s.card_id = ANY(${n0}::text[]) OR s.tenant_id = ANY(${n0 + 1}::text[])))",
            [scope[0], scope[1]])


def _md(t) -> str | None:
    if not t:
        return None
    t = t.astimezone(KST)
    return f"{t.month}.{t.day}"


def _cnt(v, src: str) -> dict:
    return env(int(v or 0), "count", "recorded", src)


async def _items(conn, p: Principal, scope, where: str = "true", args: list | None = None, one: str | None = None) -> list[dict]:
    sw, sa = _scope_sql(scope, 1)
    extra_args = list(args or [])
    w = f"({sw}) AND ({where})" + (f" AND i.id=${len(sa) + len(extra_args) + 1}" if one else "")
    # 시험으로만 모인 줄은 '새로 옴'이면 감춘다 — 고른 줄(채택 · 보류 · 이미 됨 · 만들어짐)은 남긴다(횟수만 뺌)
    w += " AND (i.state <> 'new' OR EXISTS (SELECT 1 FROM improve_signals t WHERE t.item_id=i.id AND NOT t.test))"
    rows = await conn.fetch(
        "SELECT i.*, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig IN ('blocked','map_failed')) AS n_block, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='reask') AS n_reask, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='not_helpful') AS n_nh, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='card_cancel') AS n_cancel, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.source IN ('auto','screen')) AS n_live, "
        "(SELECT array_agg(DISTINCT s.role) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS roles, "
        "(SELECT array_agg(x.screen ORDER BY x.c DESC) FROM (SELECT s.screen, count(*) c FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.screen IS NOT NULL "
        "  GROUP BY s.screen) x) AS screens, "
        "(SELECT array_agg(x.gist ORDER BY x.at DESC) FROM (SELECT s.gist, max(s.at) at FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.gist IS NOT NULL "
        "  GROUP BY s.gist) x) AS gists, "
        "(SELECT count(DISTINCT s.tenant_id) FILTER (WHERE s.tenant_id <> 'lx') FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS n_orgs, "
        "(SELECT count(*) FROM improve_askers a WHERE a.item_id=i.id AND NOT a.test) AS n_askers, "
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS n_real "
        f"FROM improve_items i WHERE {w} ORDER BY i.last_at DESC LIMIT 500", *sa, *extra_args, *([one] if one else []))
    who = {}
    ids = {r["decided_by"] for r in rows if r["decided_by"]} | {r["notice_by"] for r in rows if r["notice_by"]}
    if ids:
        who = {r["id"]: (r["name"], r["role"]) for r in await conn.fetch("SELECT id, name, role FROM lx_users WHERE id = ANY($1::text[])", list(ids))}
    return [_item(r, p, who) for r in rows]


def _who(uid, who: dict) -> str | None:
    if not uid:
        return None
    nm, role = who.get(uid, (None, None))
    if role == "admin":
        return "LX 관리자"
    return f"LX 직원 {nm}" if nm else "LX 직원"


def _item(r, p: Principal, who: dict) -> dict:
    src = "개선 후보(improve_signals)"
    check = r["source"] in SOURCE_KO and not r["n_live"]
    roles = [ROLE_KO.get(x, x) for x in (r["roles"] or []) if x]
    roles = sorted(set(roles), key=lambda x: list(ROLE_KO.values()).index(x) if x in ROLE_KO.values() else 9)
    examples = [g for g in (r["gists"] or []) if g and g != r["gist"]][:2]
    st = r["state"]
    d = {
        "id": r["id"], "seq": r["no"], "gist": r["gist"], "note": r["note"], "examples": examples,
        "kind": r["kind"], "kind_label": KINDS.get(r["kind"], r["kind"]),
        "state": st, "state_label": STATE_KO.get(st, st),
        "n": _cnt(r["n_block"], src), "cancel": _cnt(r["n_cancel"], src) if r["n_cancel"] else None,
        # 점검에서 온 줄은 '다시 물음 · 도움 안 됨'을 세지 않았다(비움 — 지어내지 않는다)
        "reask": None if check else _cnt(r["n_reask"], src), "not_helpful": None if check else _cnt(r["n_nh"], src),
        "roles": roles, "orgs": _cnt(r["n_orgs"], src) if r["n_orgs"] else None, "screens": [s for s in (r["screens"] or []) if s][:3],
        "source": SOURCE_KO.get(r["source"]), "first_at": r["first_at"], "last_at": r["last_at"], "last_md": _md(r["last_at"]),
        "how": r["how"] or HOW.get(r["kind"]), "ledger": r["ledger"],
        "hold": {"reason": r["hold_reason"], "until": r["hold_until"].isoformat() if r["hold_until"] else None,
                 "until_md": _md(dt.datetime.combine(r["hold_until"], dt.time(), KST)) if r["hold_until"] else None} if st == "held" or r["hold_reason"] else None,
        "already": {"text": r["already_text"], "try": r["already_try"]} if st == "already" else None,
        "notice": {"n": _cnt(r["notice_n"], "개선 후보(improve_notices)"), "at": r["notice_at"], "md": _md(r["notice_at"]), "text": r["notice_text"],
                   "try": r["notice_try"]} if r["notice_at"] else None,
        "askers": _cnt(r["n_askers"], "개선 후보(improve_askers · 90일)"),
        "test_only": not r["n_real"],                    # 시험으로만 모인 줄(횟수에서 뺌)
        "decided": {"by": _who(r["decided_by"], who), "md": _md(r["decided_at"])} if r["decided_at"] else None,
        "can": {"decide": st in ("new", "held", "already", "adopted"), "notify": p.is_admin and st == "adopted",
                "reopen": st in ("held", "already", "adopted")},
    }
    return d


async def _wake_held(conn) -> None:
    """다시 볼 날짜가 된 보류는 새로 옴으로(사유는 남긴다 — '지난 보류' 한 줄)."""
    await conn.execute("UPDATE improve_items SET state='new', updated_at=now() WHERE state='held' AND hold_until IS NOT NULL AND hold_until <= (now() AT TIME ZONE 'Asia/Seoul')::date")


@router.get("/improve/items")
async def list_items(request: Request, state: str | None = None, role: str | None = None):
    p = _lx(request)
    await ensure_seed()
    async with db(realm="lx") as conn:
        await _wake_held(conn)
        scope = await _my_scope(conn, p)
        items = await _items(conn, p, scope)
        sw, sa = _scope_sql(scope, 1)
        tot = await conn.fetchrow(
            "SELECT count(*) FILTER (WHERE s.sig IN ('blocked','map_failed')) AS b, "
            "count(*) FILTER (WHERE s.sig IN ('blocked','map_failed') AND s.at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS bm, "
            "count(*) FILTER (WHERE s.sig IN ('blocked','map_failed') AND s.source='check-1001') AS bc "
            f"FROM improve_signals s JOIN improve_items i ON i.id=s.item_id WHERE NOT s.test AND {sw}", *sa)
    counts = {k: sum(1 for x in items if x["state"] == k) for k in STATE_KO}
    counts["all"] = len(items)
    rk = {"staff": "LX 직원", "admin": "LX 관리자", "tenant": "기관"}.get(role or "")
    view = [x for x in items if (not state or state == "all" or x["state"] == state) and (not rk or rk in x["roles"])]
    view.sort(key=lambda x: (-(x["n"]["value"] + (x["reask"] or {}).get("value", 0) + (x["not_helpful"] or {}).get("value", 0)
                               + (x["cancel"] or {}).get("value", 0)), -(x["last_at"].timestamp() if x["last_at"] else 0)))
    src = "개선 후보(improve_signals)"
    return {"scope": "all" if scope is None else "mine", "items": view, "counts": counts,
            "summary": {"blocked": _cnt(tot["b"], src), "blocked_month": _cnt(tot["bm"], src), "from_check": _cnt(tot["bc"], src),
                        "groups": _cnt(len(items), src)},
            "kinds": KINDS, "as_of": now_iso()}


async def _one(conn, p: Principal, iid: str) -> tuple[dict, object]:
    scope = await _my_scope(conn, p)
    got = await _items(conn, p, scope, one=iid)
    if not got:
        raise ApiError("not_found", "그 줄을 찾지 못했습니다")
    return got[0], scope


async def _decide(request: Request, iid: str, action: str, body: dict) -> dict:
    p = _lx(request)
    async with db(realm="lx") as conn:
        cur, _ = await _one(conn, p, iid)
        before = {"state": cur["state"]}
        if action == "adopt":
            if cur["state"] == "built":
                raise ApiError("conflict", "이미 만들어진 줄입니다", status=409)
            how = re.sub(r"\s+", " ", str(body.get("how") or "")).strip()[:120] or None
            await conn.execute("UPDATE improve_items SET state='adopted', ledger='확인 대기', how=coalesce($2, how, $4), decided_by=$3, decided_at=now(), "
                               "updated_at=now() WHERE id=$1", iid, how, p.user_id, HOW.get(cur["kind"]))
        elif action == "hold":
            reason = re.sub(r"\s+", " ", str(body.get("reason") or "")).strip()[:120]
            if not reason:
                raise ApiError("bad_request", "보류 사유를 한 줄 적어 주세요")
            try:
                until = dt.date.fromisoformat(str(body.get("until") or "")[:10])
            except ValueError:
                raise ApiError("bad_request", "다시 볼 날짜를 골라 주세요") from None
            if until <= dt.datetime.now(KST).date():
                raise ApiError("bad_request", "다시 볼 날짜는 내일부터 고를 수 있습니다")
            if cur["state"] == "built":
                raise ApiError("conflict", "이미 만들어진 줄입니다", status=409)
            await conn.execute("UPDATE improve_items SET state='held', hold_reason=$2, hold_until=$3, ledger=NULL, decided_by=$4, decided_at=now(), "
                               "updated_at=now() WHERE id=$1", iid, reason, until, p.user_id)
        elif action == "already":
            text = re.sub(r"\s+", " ", str(body.get("text") or "")).strip()[:120]
            if not text:
                raise ApiError("bad_request", "안내 문구를 한 줄 적어 주세요")
            tr = re.sub(r"\s+", " ", str(body.get("try") or "")).strip()[:100] or None
            if cur["state"] == "built":
                raise ApiError("conflict", "이미 만들어진 줄입니다", status=409)
            await conn.execute("UPDATE improve_items SET state='already', already_text=$2, already_try=$3, ledger=NULL, decided_by=$4, decided_at=now(), "
                               "updated_at=now() WHERE id=$1", iid, text, tr, p.user_id)
        elif action == "reopen":
            if cur["state"] in ("new", "built"):
                raise ApiError("conflict", "다시 고를 수 없는 줄입니다", status=409)
            await conn.execute("UPDATE improve_items SET state='new', ledger=NULL, decided_by=$2, decided_at=now(), updated_at=now() WHERE id=$1", iid, p.user_id)
        elif action == "notify":
            if not p.is_admin:
                raise ApiError("forbidden", "'이제 됩니다'는 LX 관리자가 보냅니다")
            if cur["state"] != "adopted":
                raise ApiError("conflict", "채택한 줄만 보낼 수 있습니다", status=409)
            g = cur["gist"]
            text = re.sub(r"\s+", " ", str(body.get("text") or "")).strip()[:120] or f"지난번에 물으신 '{g}'{iga(g)} 이제 됩니다."
            tr = re.sub(r"\s+", " ", str(body.get("try") or "")).strip()[:100] or (g if MASK not in g else None)
            askers = await conn.fetch(f"SELECT realm, user_id, tenant_id FROM improve_askers WHERE item_id=$1 AND NOT test AND at > now() - interval '{RETAIN_DAYS} days'", iid)
            for a in askers:
                await conn.execute("INSERT INTO improve_notices(id, item_id, realm, user_id, tenant_id, text, try) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                                   "in_" + secrets.token_hex(8), iid, a["realm"], a["user_id"], a["tenant_id"], text, tr)
            await conn.execute("UPDATE improve_items SET state='built', notice_text=$2, notice_try=$3, notice_n=$4, notice_at=now(), notice_by=$5, "
                               "updated_at=now() WHERE id=$1", iid, text, tr, len(askers), p.user_id)
        else:
            raise ApiError("bad_request", "알 수 없는 동작")
        await audit(conn, p, f"improve.{action}", iid, before, {k: v for k, v in body.items() if k in ("how", "reason", "until", "text", "try")})
        out, _ = await _one(conn, p, iid)
    if action in ("already", "reopen"):
        _refresh_already(force=True)
    return out


@router.post("/improve/items/{iid}/adopt")
async def adopt(iid: str, request: Request, body: dict | None = None):
    return {"item": await _decide(request, iid, "adopt", body or {}), "as_of": now_iso()}


@router.post("/improve/items/{iid}/hold")
async def hold(iid: str, body: dict, request: Request):
    return {"item": await _decide(request, iid, "hold", body or {}), "as_of": now_iso()}


@router.post("/improve/items/{iid}/already")
async def already(iid: str, body: dict, request: Request):
    return {"item": await _decide(request, iid, "already", body or {}), "as_of": now_iso()}


@router.post("/improve/items/{iid}/reopen")
async def reopen(iid: str, request: Request):
    return {"item": await _decide(request, iid, "reopen", {}), "as_of": now_iso()}


@router.post("/improve/items/{iid}/notify")
async def notify(iid: str, request: Request, body: dict | None = None):
    return {"item": await _decide(request, iid, "notify", body or {}), "as_of": now_iso()}


# ═══ 첫 목록 — 10-01 점검의 막힌 12줄(설계 7차 audit.md · improve-loop.md ⑥) ════════════════════
# 횟수 = 실태에서 센 값 그대로(질문 하나 = 신호 하나 · 때는 그 질문 캡처 시각) · 다시 물음 · 도움 안 됨은 세지 않았다(비움).
# (요지, 비고, 분류, [(실태 번호, 질문, 역할, 화면 home, 기관, 때)])
CHECK_1001 = [
    ("지명을 붙인 확대·이동이 지명을 버림", None, "action", [
        (2, "구례군 확대해 줘", "staff", "lx-console", "lx", "10:58:54"),
        (19, "남원시 운봉읍으로 이동해서 비닐하우스 결과만 보여 줘", "staff", "xi-clean", "lx", "11:03:08")]),
    ("현장 확인 필요 · 지적선 층 켜기", "이 화면에는 그 층이 없음", "screen", [
        (4, "현장 확인 필요 필지만 보여 줘", "staff", "lx-console", "lx", "10:59:07"),
        (5, "지적선 켜 줘", "staff", "lx-console", "lx", "10:59:13")]),
    ("\"껐습니다·켰습니다\"인데 지도가 그대로", "말과 화면 다름 — 결과 층 끄기 · 이미 켜진 영상 층", "action", [
        (3, "영상 층 켜 줘", "staff", "lx-console", "lx", "10:59:00"),
        (18, "AI 분석 결과 층 꺼 줘", "staff", "xi-clean", "lx", "11:02:58")]),
    ("우리 시 현장 확인 필요 몇 건", "'우리 시'를 관할로 풀지 못해 \"해당 지역 데이터가 없습니다\"", "nodata", [
        (25, "우리 시 현장 확인 필요 필지 몇 건이야?", "tenant", "gov-report", "namwon", "11:04:03")]),
    ("두 지역 비교를 지도에 칠하지 못함", "서버는 보냈지만 첫 화면이 받지 못함", "screen", [
        (11, "구례군과 남원시 의심 필지 수 비교해 줘", "staff", "lx-console", "lx", "11:00:06")]),
    ("두 시점 영상 나란히 비교", None, "action", [
        (9, "2024년과 2025년 영상을 나란히 비교해 줘", "staff", "lx-console", "lx", "10:59:45")]),
    ("범위를 그려서 그 안만 분석", None, "action", [
        (10, "지도에 범위를 그려서 그 안만 분석해 줘", "staff", "lx-console", "lx", "10:59:53")]),
    ("지도 화면을 그림 파일로 저장", None, "action", [
        (15, "지도 화면을 이미지로 저장해 줘", "staff", "lx-console", "lx", "11:00:31")]),
    ("풀어 쓴 법령 질문을 못 찾음", None, "law", [
        (14, "허가 없이 지은 건물에 물리는 이행강제금은 얼마야?", "staff", "lx-console", "lx", "11:00:25")]),
    ("고른 필지 없이 \"이 필지 영상 설명\"", "지번을 되물음", "parcel", [
        (30, "이 필지 영상 보고 설명해 줘", "tenant", "gov-report", "namwon", "11:04:36")]),
    ("관할 밖 지역을 물음", "거절은 맞으나 다음 할 일이 없음", "scope", [
        (26, "구례군 결과 보여 줘", "tenant", "gov-report", "namwon", "11:04:09")]),
    ("기관이 '전역 분석 실행'을 말함", "\"해당 지역 데이터가 없습니다\"로 끝남 — 분석은 LX 가 하고 기관은 의뢰", "scope", [
        (29, "전역 분석 실행해 줘", "tenant", "gov-report", "namwon", "11:04:31")]),
]
_SEEDED = {"ok": False}
_SEED_LOCK = asyncio.Lock()


async def ensure_seed() -> int:
    """첫 목록을 한 번 넣는다(멱등 — 점검 신호가 다 있으면 건너뜀)."""
    if _SEEDED["ok"]:
        return 0
    async with _SEED_LOCK:
        return await _seed()


async def _seed() -> int:
    if _SEEDED["ok"]:
        return 0
    want = sum(len(qs) for *_, qs in CHECK_1001)
    async with db(realm="lx") as conn:
        have = await conn.fetchval("SELECT count(*) FROM improve_signals WHERE source='check-1001'")
        if have == want:
            _SEEDED["ok"] = True
            return 0
        if have:                                          # 넣다가 멈춘 것 — 점검 신호만 지우고 다시(저절로 모인 신호는 그대로)
            await conn.execute("DELETE FROM improve_signals WHERE source='check-1001'")
            await conn.execute("DELETE FROM improve_items i WHERE i.source='check-1001' AND NOT EXISTS (SELECT 1 FROM improve_signals s WHERE s.item_id=i.id)")
    await ensure_names(wait=True)
    n = 0
    for summ, note, kind, qs in CHECK_1001:
        first = qs[0]
        g0 = gist(first[1])
        key = key_of(kind, tokens(g0))
        for _no, q, role, home, tenant, hhmmss in qs:
            at = dt.datetime.fromisoformat(f"2026-10-01T{hhmmss}+09:00")
            meta = {"role": role, "screen": HOME_KO.get(home), "tenant": tenant, "card": None, "sgg": None}
            await save_signal("blocked", kind, gist(q), tokens(gist(q)), meta, source="check-1001", at=at, note=mask(note) if note else None,
                              item_key=key, item_gist=mask(summ))
            n += 1
    async with db(realm="lx") as conn:                   # 점검에서 온 줄의 처음 · 마지막 때 = 그 질문들의 때
        await conn.execute("UPDATE improve_items i SET first_at=x.f, last_at=x.l FROM (SELECT item_id, min(at) f, max(at) l FROM improve_signals "
                           "WHERE source='check-1001' GROUP BY item_id) x WHERE x.item_id=i.id AND i.source='check-1001'")
    _SEEDED["ok"] = True
    return n


# ═══ 90일 지우기 — CPU 정기 작업(workers/cpu_worker.improve_retention_loop)이 하루 한 번 부른다 ══════════
def purge(dry_run: bool = False, today: dt.datetime | None = None, schema: str = "public", log=print, dsn: str | None = None) -> dict:
    """누가 물었는지(improve_askers) · 알림(improve_notices)에서 90일이 지난 줄을 지운다. dry_run = 보기만(지울 수만 센다).
    schema 를 바꾸면 같은 모양의 사본 표에서 돈다(시험). 묶음 · 신호에는 사람이 없어 그대로 둔다."""
    import psycopg
    from . import config
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,40}", schema):
        raise ValueError("schema")
    now = today or dt.datetime.now(KST)
    cut = now - dt.timedelta(days=RETAIN_DAYS)
    out = {"dry_run": bool(dry_run), "cut": cut.isoformat(timespec="seconds"), "askers": 0, "notices": 0, "schema": schema}
    with psycopg.connect(dsn or config.PG_ADMIN_DSN, autocommit=True) as c:
        a = c.execute(f"SELECT count(*) FROM {schema}.improve_askers WHERE at < %s", (cut,)).fetchone()[0]
        nn = c.execute(f"SELECT count(*) FROM {schema}.improve_notices WHERE created_at < %s", (cut,)).fetchone()[0]
        out.update({"askers": int(a), "notices": int(nn)})
        if not dry_run and (a or nn):
            with c.transaction():
                c.execute(f"DELETE FROM {schema}.improve_askers WHERE at < %s", (cut,))
                c.execute(f"DELETE FROM {schema}.improve_notices WHERE created_at < %s", (cut,))
                if schema == "public":
                    from psycopg.types.json import Jsonb
                    c.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','improve.purge',%s,%s,%s)",
                              ("improve", Jsonb({"askers": int(a), "notices": int(nn)}), Jsonb({"cut": out["cut"], "keep_days": RETAIN_DAYS})))
    log(f"개선 고리 90일 정리: 물은 사람 {out['askers']} · 알림 {out['notices']} · 보기만 {out['dry_run']}")
    return out


if __name__ == "__main__":                           # python -m landxi_api.improve purge [--dry-run]
    import sys
    a = sys.argv[1:]
    if a[:1] == ["purge"]:
        print(json.dumps(purge(dry_run="--dry-run" in a), ensure_ascii=False, default=str))
