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
GET  /improve/items  의 새로 옴 · 보류 줄마다 suggest = 시스템 제안 {mode, line(한 줄), why(근거), quick, tag} — 코드 규칙만(원칙 197 · 202 고침 · 아래 suggest())
POST /improve/items/{id}/adopt      {use: "suggest"}  이대로 반영 — 서버가 정한 제안 그대로(관리자는 갈래를 고르지 않는다)
                                    {mode: "collect"}  모아 두기(원칙 202 고침 · 10-12) — XI ChatGEO(LLM) 쪽에서 지금 바로 못 고치는 질문을
                                                       다음 LLM 개선용 평가 질문 묶음에 쌓는다(GET /improve/eval-set). 예전 {mode: "dev"}도 모아 두기로 받는다
                                    {mode?, how?, src?, dst?, text?, try?, test?}  (시험 · 예전 호출 그대로)
                                    채택 — mode=collect(모아 두기) | alias(다른 이름 더하기) · intent(질문 뜻 연결) · phrase(답 문구)
                                    = 바로 반영(표 한 줄 → 다음 질문부터 적용 · 원칙 197)
GET  /improve/eval-set[?format=jsonl]  모아 둔 평가 질문 묶음(가린 요지 · 같은 뜻 질문 · 분류 · 꼬리표 · 횟수) — 목록 · 내려받기
     꼬리표(tag) = 화면 · 분석 기능이 있어야 풀리는 것의 구분 표시만('분석 모델에 클래스 필요' 등 · 받는 곳 없는 요청을 만들지 않는다)
POST /improve/items/{id}/revert                       바로 반영 되돌리기(표 줄 끔 → 새로 옴)
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
# 채택 갈래(원칙 197 · 202 고침) — LLM 쪽에서 되는 것(표 한 줄)은 바로 반영 · 바로 안 되는 질문은 모아 두기(다음 LLM 개선 평가 질문)
ADOPT_KO = {"alias": "다른 이름 더하기", "intent": "질문 뜻 연결", "phrase": "답 문구", "collect": "모아 두기", "dev": "모아 두기",
            "example": "예시 질문 붙이기", "tool": "새 도구"}   # dev = 예전 '개발 요청'(원칙 202 고침으로 모아 두기와 같게 본다)
COLLECT = ("collect", "dev")
TAG_OF_KIND = {"action": "화면 기능 필요", "screen": "화면 기능 필요", "nodata": "분석 결과 필요", "server": "서버 점검 필요"}   # 구분 꼬리표(받는 곳 없음 · 표시만)
QUICK = ("alias", "intent", "phrase")
RULE_MODES = ("alias", "intent", "phrase", "example")      # 표 한 줄로 반영하는 갈래(예시 질문 = 정기 개선 바퀴 · 원칙 249)
REL_KO = {"draft": "만드는 중", "pending": "승인 요청", "approved": "승인", "rejected": "거절", "reverted": "되돌림"}
ROLE_KO = {"staff": "LX 직원", "admin": "LX 관리자", "sales": "LX 영업", "tenant": "기관"}
SIG_BLOCK = ("blocked", "map_failed")             # '몇 번' = 막힌 횟수
SOURCE_KO = {"check-1001": "10-01 점검"}
# 화면 이름(사용자 말) — 화면이 context.home 을 주면 그대로, 아니면 context 모양으로 알아본다
HOME_KO = {
    "lx-console": "첫 화면", "xi-clean": "XI맵", "global": "XI맵(해외)", "lx-review": "결과 확인", "lx-ingest": "데이터 올리기",
    "lx-train": "학습", "lx-deploy": "서비스 관리", "lx-project": "프로젝트", "lx-analyze": "분석하기", "lx-cards": "서비스 카드",
    "lx-inbox": "요청함", "ops-core": "LX 관리자 대시보드", "ops-infra": "LX 관리자 대시보드", "ops-accounts": "계정 관리",
    "gov-select": "내 서비스", "gov-report": "할 일·보고서", "gov-fusion": "내 대장 × AI", "gov-request": "분석 요청",
    "gov-space": "우리 공간", "gov-accounts": "계정", "help-my": "지원", "sales": "서비스 카탈로그", "service-detail": "서비스",
    "lx-map": "지도 서비스",
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


def judge(event: str, data: dict, steps=None, confirm: bool = False) -> tuple[str, str | None]:
    """평가 질문 한 개의 판정(개선 바퀴 '잰다' · 원칙 249) — 모으는 규칙(classify)과 같은 기준.
    답함 = 막힘 없음(확인 카드까지 간 것 포함) · 안내함 = 막힘이 맞고 다음 할 일(버튼 · 안내 한 줄)이 붙음 · 못 함 = 그 밖."""
    data = data or {}
    if confirm:
        return "답함", None
    blocked = [k for s, k in classify(event, data, steps) if s == "blocked"]
    if not blocked:
        return ("못 함", "server") if event == "agent.failed" else ("답함", None)
    k = blocked[0]
    if k != "server" and (data.get("hint") or data.get("next")):
        return "안내함", k
    return "못 함", k


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


# ═══ 바로 반영(원칙 197) — 채택한 다른 이름 · 질문 뜻 연결 · 답 문구를 다음 질문부터 ══════════════════
RULES_TTL_S = 5                                    # 게이트웨이 일꾼이 여럿이어도 5초 안에 같은 표(채택 즉시 → 다음 질문부터)
_RULES: dict = {"rows": [], "at": 0.0}
_LEFT = r"(?<![가-힣A-Za-z0-9])"                    # 다른 이름은 낱말 앞머리에서만(비닐하우스 안의 '하우스'는 그대로)


_REL: dict = {"test_only": set(), "off": set(), "live": set()}   # 판의 도구 — 승인(모두) · 승인 전(시험 질문에만) · 거절 · 되돌림(모두 막음)


async def rules_fresh(force: bool = False) -> list[dict]:
    """켜진 표 줄 + 그 줄이 속한 판의 상태(rel_state · 판이 없으면 'approved' = 예전처럼 바로 반영)."""
    if not force and time.time() - _RULES["at"] < RULES_TTL_S:
        return _RULES["rows"]
    try:
        async with db(realm="lx") as conn:
            try:
                rows = await conn.fetch("SELECT r.id, r.item_id, r.mode, r.src, r.dst, r.text, r.try, r.release_id, coalesce(l.state, 'approved') AS rel_state "
                                        "FROM improve_rules r LEFT JOIN improve_releases l ON l.id = r.release_id WHERE r.active ORDER BY r.at")
                rel = await conn.fetch("SELECT state, tools FROM improve_releases WHERE coalesce(array_length(tools, 1), 0) > 0")
                live = {t for r in rel if r["state"] == "approved" for t in r["tools"]}
                test_only = {t for r in rel if r["state"] in ("draft", "pending") for t in r["tools"]} - live
                off = {t for r in rel if r["state"] in ("rejected", "reverted") for t in r["tools"]} - live - test_only
                _REL.update(test_only=test_only, off=off, live=live)
            except Exception:  # noqa: BLE001 — 판 표가 아직 없으면(마이그레이션 전) 예전 표만
                rows = await conn.fetch("SELECT id, item_id, mode, src, dst, text, try FROM improve_rules WHERE active ORDER BY at")
                rows = [{**dict(r), "release_id": None, "rel_state": "approved"} for r in rows]
        _RULES.update(rows=[dict(r) for r in rows], at=time.time())
    except Exception:  # noqa: BLE001
        _RULES["at"] = time.time()
    return _RULES["rows"]


def _live(r: dict, test: bool) -> bool:
    """이 줄을 이 질문에 쓰나 — 승인된 판(또는 판 없음)은 모두 · 만드는 중 · 승인 요청 판은 시험 질문에만."""
    st = r.get("rel_state") or "approved"
    return st == "approved" or (test and st in ("draft", "pending"))


def _gated() -> set:
    try:
        from agent.tools import ext as _ext
        return _ext.GATED
    except Exception:  # noqa: BLE001
        return set()


def tool_open(name: str, test: bool = False) -> bool:
    """판으로 더한 도구의 길 — 승인된 판 = 모두 · 만드는 중 · 승인 요청 판 = 시험 질문에만 · 거절 · 되돌림 = 막음.
    개선 바퀴에서 만든 도구(GATED)는 판에 실리기 전에는 닫혀 있다('전' 점수에 섞이지 않게). 그 밖의 도구는 늘 열림."""
    if name in _REL["live"]:
        return True
    if name in _REL["off"]:
        return False
    if name in _REL["test_only"]:
        return test
    return name not in _gated()


def _norm_q(t: str) -> str:
    return re.sub(r"[\s?？!.~]+", "", str(t or ""))


def _intent_hit(msg: str, src: str) -> bool:
    a, b = _norm_q(msg), _norm_q(src)
    if b and b in a:
        return True
    ta, tb = tokens(gist(msg)), tokens(gist(src))
    return bool(ta and tb) and jaccard(ta, tb) >= 0.7


async def rewrite(msg: str, test: bool = False) -> tuple[str, list[str]]:
    """질문 → (알아들을 질문, 적용한 줄 id). 질문 뜻 연결이 먼저(질문 전체를 바꿈) · 그다음 다른 이름(낱말만 바꿈)."""
    rows = [r for r in await rules_fresh() if _live(r, test)]
    out, used = str(msg or ""), []
    for r in rows:
        if r["mode"] == "intent" and r["dst"] and _intent_hit(out, r["src"]):
            out = r["dst"]
            used.append(r["id"])
            break
    for r in rows:
        if r["mode"] == "alias" and r["src"] and r["dst"]:
            rx = re.compile(_LEFT + re.escape(r["src"]))
            if rx.search(out):
                out = rx.sub(r["dst"], out)
                used.append(r["id"])
    return out, used


def phrase_for(msg: str, test: bool = False) -> dict | None:
    """답 문구 줄 — 같은 뜻 질문이면 {text, try}(이미 됨 안내와 같은 자리)."""
    for r in _RULES["rows"]:
        if r["mode"] == "phrase" and r["text"] and _live(r, test) and _intent_hit(msg, r["src"]):
            return {"text": r["text"], "try": r["try"]}
    return None


EXAMPLE_MIN = 0.34                                  # 예시 질문과 낱말이 이만큼 겹치면 길잡이에 붙인다(셋까지)


async def examples_for(msg: str, test: bool = False, k: int = 3) -> list[dict]:
    """예시 질문 붙이기(정기 개선 바퀴 (b) · 원칙 249) — 모델 경로에서 비슷한 예시 질문 · 도구 호출 짝을 셋까지(가까운 순).
    dst = {"tool", "args"} JSON 한 줄(서버가 확인한 짝만 · 사람 손 0)."""
    rows = [r for r in await rules_fresh() if r["mode"] == "example" and r["dst"] and _live(r, test)]
    tk = tokens(gist(msg))
    got = []
    for r in rows:
        v = jaccard(tk, tokens(gist(r["src"])))
        if v >= EXAMPLE_MIN:
            try:
                d = json.loads(r["dst"])
            except ValueError:
                continue
            got.append((v, {"q": r["src"], "tool": d.get("tool"), "args": d.get("args") or {}, "id": r["id"]}))
    return [x for _, x in sorted(got, key=lambda y: -y[0])[:k]]


# ═══ 시스템 제안(원칙 197 고침 · 10-11) — 후보마다 고칠 방법을 서버가 미리 정한다 ══════════════════════
# 개선 후보 = XI ChatGEO(LLM) 개선 고리(원칙 202 고침 · 10-12). 관리자는 '이대로 반영 / 모아 두기 / 보류'만 누른다.
# 정하는 것은 코드 규칙뿐(언어 모델 0 · GPU 0) · LLM 쪽에서 바로 안 되는 것은 모아 두기(다음 LLM 개선 평가 질문).
# 화면 · 분석 기능이 있어야 풀리는 것은 구분 꼬리표만 붙인다(분석 모델에 클래스 필요 · 화면 기능 필요 등 — 요청을 만들지 않음).
#   ① 모아 두기 + 꼬리표 — 서버 응답 없음 · 결과에 없는 세부 분류(예 비닐하우스 단동 · 연동 → '분석 모델에 클래스 필요')
#   ② 다른 이름 — 질문의 낱말이 아래 표에 있고, 바꿀 말이 결과 분류 · 서비스 이름에 있을 때(예 '온실' → 비닐하우스)
#   ③ 답 문구 — 이미 있는 도구가 알아듣는 말인데 막힘(지도에 결과 층이 없음 등) · 권한 밖 · 화면 밖처럼 답은 맞고 다음 할 일이 없을 때
#   ④ 질문 뜻 연결 — 이미 있는 도구(거르기 · 읍면동별 세기 · 보고서)로 답할 수 있는데 그 말을 못 알아들을 때
#   ⑤ 그 밖 = 모아 두기(분류가 지도 동작 · 화면이면 '화면 기능 필요', 자료 없음이면 '분석 결과 필요' 꼬리표)
ALIAS_WORDS = {  # 사용자가 쓰는 말 → 플랫폼 말 후보(앞에서부터 · 결과 분류 · 서비스 이름에 있는 것만 씀)
    "온실": ["비닐하우스"], "하우스": ["비닐하우스"], "시설하우스": ["비닐하우스"], "비닐온실": ["비닐하우스"], "그린하우스": ["비닐하우스"],
    "농경지": ["경작지"], "논밭": ["경작지"], "전답": ["경작지"], "영농": ["경작·휴경"],
    "휴경지": ["비경작지"], "묵밭": ["비경작지"], "묵정밭": ["비경작지"],
    "건축물": ["건물"], "가옥": ["건물"],
    "곤포": ["곤포사일리지"], "사일리지": ["곤포사일리지"], "마시멜로": ["곤포사일리지"], "볏짚말이": ["곤포사일리지"],
    "주차면": ["주차장"], "자동차": ["차량"],
    "해양쓰레기": ["해안 쓰레기"], "바다쓰레기": ["해안 쓰레기"], "해변쓰레기": ["해안 쓰레기"],
}
SUB_MODS = [(re.compile(r"단동"), "단동", "단동"), (re.compile(r"연동|다동"), "다동", "연동")]   # 세부 분류 말(결과 분류 이름 끝 · 화면 말)
INTENT_WIDE = [  # 이미 있는 도구가 할 수 있는데 그 말로는 못 알아듣는 질문 → 알아듣는 질문
    ("map_stats", re.compile(r"(동네|읍|면|동|마을|지역)\s*(별|마다)|몇\s*개씩|나눠\s*서?\s*(세|보여|알려)"), "{cls} 읍면동별로 세어 줘"),
    ("ai_report", re.compile(r"레포트|보고\s*문서|정리해서\s*(문서|파일)|한글\s*파일|docx", re.I), "AI 분석 결과 보고서 만들어 줘"),
    ("map_filter", re.compile(r"(만\s*(남겨|골라|추려))|(빼고|제외하고)\s*(다|모두)?\s*(지워|숨겨)"), "{cls}만 보여 줘"),
]
TOOL_SAY = {"map_stats": "읍면동별로 세기", "ai_report": "AI 분석 결과 보고서", "map_filter": "조건으로 거르기"}
PHRASE_RULES = [  # (분류 · 낱말) → 답에 붙일 다음 할 일 한 줄 · 누르면 보낼 질문
    ("scope", re.compile(r"분석\s*(실행|돌려|해)|전역\s*분석"), "분석은 LX가 합니다 — 요청하기의 '분석 요청'으로 맡겨 주세요", "분석 요청 보내는 법 알려 줘"),
    # (10-14 개선 바퀴 1회차) '한도' 문구는 뺐다 — 기관 · 직원의 사용을 막는 한도는 없다(원칙 83). '늘려 달라고 보내 주세요'는 그 답과 어긋난다
    ("scope", re.compile(r"관할|다른\s*지역|결과\s*보기|보여"), "우리 기관 관할 밖 지역은 볼 수 없습니다 — 필요하면 LX에 분석 요청을 보내 주세요", None),
    ("action", re.compile(r"내려\s*받|다운로드|GeoJSON|SHP", re.I), "결과 파일은 지도 서비스에서 층마다 '내려받기'로 받을 수 있습니다(GeoJSON · SHP · 필지 엑셀)", None),
    ("other", re.compile(r"내려\s*받|다운로드|GeoJSON|SHP", re.I), "결과 파일은 지도 서비스에서 층마다 '내려받기'로 받을 수 있습니다(GeoJSON · SHP · 필지 엑셀)", None),
    ("screen", re.compile(r"층|지적선"), "이 화면에는 그 층이 없습니다 — 층이 있는 지도 서비스나 XI맵에서 물어보세요", None),
]
LAW_WORDS = re.compile(r"법|조문|조례|시행령|규정|허가|신고|과태료|이행강제금|벌금|지침|고시")
_VOCAB: dict = {"words": set(), "classes": set(), "at": 0.0}
VOCAB_TTL_S = 1800
_STATIC_CLASSES = {"건물", "주차장", "경작지", "비닐하우스", "비닐하우스_단동", "비닐하우스_다동", "비경작지", "곤포사일리지", "차량"}


def _jong(w: str) -> int:
    """끝 글자 받침(0 = 없음 · 8 = ㄹ) — 한글이 아니면 0."""
    ch = re.sub(r"[\s'\"”’.…·]+$", "", str(w or ""))[-1:]
    return (ord(ch) - 0xAC00) % 28 if ch and "가" <= ch <= "힣" else 0


def eul(w: str) -> str:
    return "을" if _jong(w) else "를"


def ro(w: str) -> str:
    j = _jong(w)
    return "으로" if j and j != 8 else "로"


async def vocab(force: bool = False) -> dict:
    """플랫폼이 쓰는 말 — 결과 분류(실제 결과에 있는 것) · 서비스 이름 · 업무 이름. 30분 캐시 · 못 읽으면 기본 분류."""
    if not force and _VOCAB["words"] and time.time() - _VOCAB["at"] < VOCAB_TTL_S:
        return _VOCAB
    classes, words = set(_STATIC_CLASSES), set()
    try:
        async with db(realm="lx") as conn:
            try:
                classes |= {r["cls"] for r in await asyncio.wait_for(conn.fetch("SELECT DISTINCT cls FROM detections WHERE cls IS NOT NULL"), 8)}
            except Exception:  # noqa: BLE001
                pass
            for r in await conn.fetch("SELECT name, domain FROM cards"):
                nm = r["name"]
                if isinstance(nm, str):
                    try:
                        nm = json.loads(nm)
                    except ValueError:
                        nm = {"ko": nm}
                for s in ((nm or {}).get("ko"), r["domain"]):
                    if s:
                        words.add(str(s))
    except Exception:  # noqa: BLE001
        pass
    words |= {c.replace("_", " ") for c in classes}
    _VOCAB.update(words=words, classes={c for c in classes if re.search(r"[가-힣]", c)}, at=time.time())
    return _VOCAB


def _in_vocab(w: str, V: dict, head: bool = False) -> str | None:
    """w 가 결과 분류 · 서비스 이름에 있으면 어디에 있는지(근거 말). head = 낱말 앞머리로만 본다(사용자 말 쪽 —
    '곤포'가 '곤포사일리지'의 앞머리면 이미 플랫폼 말 · 바꾸면 '곤포사일리지사일리지'가 된다)."""
    if w in V["classes"]:
        return "결과 분류에 있음"
    hit = (lambda x: re.search(_LEFT + re.escape(w), x)) if head else (lambda x: w in x)
    if any(hit(x) for x in V["words"]):
        return "서비스 이름에 있음"
    return None


def _routes(t: str) -> str | None:
    """이미 있는 도구가 이 말을 알아듣나(지도 · 결과 층 같은 자리가 맞으면) — 도구 이름 · 아니면 None."""
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from agent.tools.ext import mapsvc as M
    except Exception:  # noqa: BLE001
        return None
    if M.REPORT_ASK.search(t) and M.REPORT_DO.search(t):
        return "ai_report"
    if M.parse_filter(t):
        return "map_filter"
    if M.STATS_RX.search(t):
        return "map_stats"
    return None


def _cls_in(t: str, V: dict) -> str | None:
    """질문에 나온 결과 분류(긴 말 먼저) — 다른 이름 표도 본다."""
    for c in sorted(V["classes"], key=len, reverse=True):
        c2 = c.replace("_", " ")
        if "_" not in c and re.search(_LEFT + re.escape(c2), t):
            return c
    for src, dsts in ALIAS_WORDS.items():
        if re.search(_LEFT + re.escape(src), t):
            d = next((x for x in dsts if x in V["classes"]), None)
            if d:
                return d
    return None


def suggest(it: dict, V: dict, rules: list[dict] | None = None) -> dict:
    """후보 하나 → 시스템 제안 {mode, src, dst, text, try, how, line, why, quick, tag}. 코드 규칙만 · 바로 안 되면 모아 두기."""
    kind = it.get("kind") or "other"
    g = str(it.get("gist") or "")
    texts = [g] + [x for x in (it.get("examples") or []) if x]
    t_all = " ".join(texts)
    n = int(it.get("n_sum") or 0)
    cnt = f"같은 질문 {n}번" if n else ("시험 줄" if it.get("test_only") else "아직 센 횟수 없음")
    clean = lambda s: MASK not in s and len(s) <= 60   # noqa: E731 — 가린 자리가 있는 말은 '알아들을 질문'으로 쓰지 않는다
    active_alias = {r["src"] for r in (rules or []) if r.get("mode") == "alias"}

    def dev(what: str, why: str, tag: str | None = None) -> dict:   # 모아 두기(함수 이름은 예전 그대로 · 원칙 202 고침)
        return {"mode": "collect", "quick": False, "how": what[:120], "tag": tag,
                "line": "모아 두기 — 다음 XI ChatGEO 개선 때 평가 질문으로 씁니다", "why": f"{cnt} · {why}"}

    if kind == "server":
        return dev(HOW["server"], "답 서버가 응답하지 않음", TAG_OF_KIND["server"])
    if it.get("n_block") is not None and not int(it.get("n_block") or 0) and int(it.get("n_reask") or 0):
        return dev(HOW.get(kind) or HOW["other"], "다시 물음만 있음 — 답은 나갔음(막힘 신호 없음)", TAG_OF_KIND.get(kind))
    # ① 결과에 없는 세부 분류(단동 · 연동) — 모아 두기 + '분석 모델에 클래스 필요'(LLM 으로는 풀리지 않음)
    for rx, key, word in SUB_MODS:
        if rx.search(t_all):
            base = _cls_in(t_all, V) or "비닐하우스"
            base = base.split("_")[0]
            have = f"{base}_{key}" in V["classes"]
            return dev(f"'{base} {word}'{iga(word)} 모든 결과에서 나뉘도록 분류 더하기",
                       f"'{base} {word}' " + ("— 일부 결과에만 있는 분류" if have else "— 결과 분류에 없음"), "분석 모델에 클래스 필요")
    # ② 다른 이름
    for s in texts:
        for src, dsts in ALIAS_WORDS.items():
            if src in active_alias or not re.search(_LEFT + re.escape(src), s):
                continue
            if _in_vocab(src, V, head=True) or any(re.search(_LEFT + re.escape(x), s) for x in dsts):
                continue                                   # 이미 플랫폼 말이거나 같은 질문에 바꿀 말이 이미 있음
            for dst in dsts:
                where = _in_vocab(dst, V)
                if where:
                    return {"mode": "alias", "quick": True, "src": src, "dst": dst, "how": f"'{src}'도 '{dst}'{ro(dst)} 알아듣기",
                            "line": f"'{src}'{eul(src)} '{dst}'{ro(dst)} 알아듣게 합니다", "why": f"{cnt} · '{dst}'{iga(dst)} {where}"}
    # ③ 이미 있는 도구가 알아듣는 말인데 막힘 — 자리(결과 층)가 없던 것 → 답 문구
    for s in texts:
        tool = _routes(s)
        if tool and kind in ("nodata", "screen", "action", "other"):
            txt = ("지도에 결과 층을 켠 뒤 물어보세요 — 켜진 결과로 바로 답합니다" if tool != "ai_report"
                   else "보고서는 LX 계정에서 결과 층을 켠 뒤 만들 수 있습니다")
            tr = s if clean(s) else None
            return {"mode": "phrase", "quick": True, "src": g, "text": txt, "try": tr, "how": f"답에 '{txt}' 붙이기",
                    "line": f"답에 \"{txt}\" 한 줄을 붙입니다", "why": f"{cnt} · 이미 있는 '{TOOL_SAY[tool]}'{ro(TOOL_SAY[tool])} 답할 수 있는 말 — 결과 층이 없던 자리"}
    # ④ 답은 맞고 다음 할 일이 없음 — 권한 밖 · 화면 밖 · 업무 밖 → 답 문구
    for k, rx, txt, tr in PHRASE_RULES:
        if kind == k and rx.search(t_all + " " + str(it.get("note") or "")):
            return {"mode": "phrase", "quick": True, "src": g, "text": txt, "try": tr, "how": f"답에 '{txt}' 붙이기",
                    "line": f"답에 \"{txt}\" 한 줄을 붙입니다", "why": f"{cnt} · " + ("이미 있는 기능 — 어디서 하는지 안내가 없음" if k in ("action", "other") else "거절은 맞음 — 다음 할 일 안내가 없음")}
    # ⑤ 질문 뜻 연결 — 이미 있는 도구로 답할 수 있는데 못 알아들은 말
    for s in texts:
        if any(_is_place(t) for t in tokens(_normalize(s))):
            continue                                   # 지명 든 질문은 뜻 연결로 바꾸면 지역이 빠진다(TRIAGE 공통 ②)
        for tool, rx, tpl in INTENT_WIDE:
            if not rx.search(s):
                continue
            c = _cls_in(s, V)
            if "{cls}" in tpl and not c:
                continue
            dst = tpl.format(cls=(c or "").replace("_", " ")).strip()
            if _routes(dst) != tool or _norm_q(dst) == _norm_q(s):
                continue
            return {"mode": "intent", "quick": True, "src": s, "dst": dst, "how": f"'{s}' → '{dst}'{ro(dst)} 알아듣기",
                    "line": f"이 질문을 '{dst}'{ro(dst)} 알아듣게 합니다", "why": f"{cnt} · 이미 있는 '{TOOL_SAY[tool]}'{ro(TOOL_SAY[tool])} 답할 수 있음"}
    if kind == "law" and not LAW_WORDS.search(t_all):
        txt = "Land-XI 는 국토 · 실태조사 업무와 법령 질문에 답합니다"
        return {"mode": "phrase", "quick": True, "src": g, "text": txt, "try": None, "how": f"답에 '{txt}' 붙이기",
                "line": f"답에 \"{txt}\" 한 줄을 붙입니다", "why": f"{cnt} · 업무 밖 질문 — 못 찾은 것이 맞음"}
    # ⑥ 그 밖 — LLM 쪽에서 바로 안 됨 → 모아 두기(지도 동작 · 화면 · 자료가 있어야 풀리면 꼬리표)
    return dev(HOW.get(kind) or HOW["other"], f"{KINDS.get(kind, '그 밖')} — 이미 있는 말 · 도구로는 답할 수 없음", TAG_OF_KIND.get(kind))


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
    rid = str(getattr(ctx, "run_id", "") or "")
    st = getattr(ctx, "state", None) or {}
    msg = str(st.get("msg_asked") or st.get("msg") or "")      # 사용자가 실제로 쓴 말(바로 반영으로 바꾸기 전)
    if not msg.strip():
        return
    ph = phrase_for(msg, test=rid.startswith("run_test"))       # 답 문구(원칙 197 · 바로 반영) — 같은 뜻 질문의 답에 그 문구(시험 질문도 — 개선 바퀴 '잰다')
    if ph:
        data["hint"] = ph
    if not RUN_ID.match(rid):                                    # 시험 질문은 여기까지(모으지 않는다)
        return
    sigs = classify(event, data, getattr(ctx, "steps", None))
    _refresh_already()
    if not _NAMES["ok"]:
        try:
            await ensure_names(wait=False)
        except Exception:  # noqa: BLE001
            pass
    if any(s == "blocked" for s, _ in sigs) and not ph:
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
        try:                                           # 해외 화면이 붙이는 문맥 꼬리('(Current area …)')를 떼고 요지로(TRIAGE 공통 ③)
            from agent.tools.ext.global_ import question_only
            msg = question_only(msg) or msg
        except Exception:  # noqa: BLE001
            pass
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


_CHECK: dict = {"t": 0.0, "ids": set()}


async def _is_check_account(conn, asker) -> bool:
    """점검 · 재검수 계정(server/.env LX_CHECK_LOGINS · 쉼표) 의 신호는 따로 센다(improve_signals.test · TRIAGE 공통 ①) — 실제 사용자 아픔과 섞이지 않게."""
    import os
    logins = [x.strip() for x in (os.environ.get("LX_CHECK_LOGINS") or _cfg_check()).split(",") if x.strip()]
    if not logins:
        return False
    if time.time() - _CHECK["t"] > 300:
        try:
            ids = {r["id"] for r in await conn.fetch("SELECT id FROM lx_users WHERE login = ANY($1::text[])", logins)}
            ids |= {r["id"] for r in await conn.fetch("SELECT id FROM tenant_users WHERE login = ANY($1::text[])", logins)}
        except Exception:  # noqa: BLE001
            ids = set()
        _CHECK.update(t=time.time(), ids=ids)
    return str(getattr(asker, "user_id", "") or "") in _CHECK["ids"]


def _cfg_check() -> str:
    try:
        from . import config as _c
        return str(_c.get("LX_CHECK_LOGINS", "") or "")
    except Exception:  # noqa: BLE001
        return ""


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
        chk = bool(asker is not None and await _is_check_account(conn, asker))
        await conn.execute("INSERT INTO improve_signals(item_id, sig, kind, gist, role, screen, tenant_id, card_id, sgg_cd, run_id, source, at, test) "
                           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING",
                           iid, sig, kind, g, meta.get("role"), meta.get("screen"), meta.get("tenant") or "lx", meta.get("card"), meta.get("sgg"),
                           run_id, source, when, chk)
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


async def _items(conn, p: Principal, scope, where: str = "true", args: list | None = None, one: str | None = None, show_hidden: bool = False) -> list[dict]:
    V = await vocab()
    rules = await rules_fresh()
    sw, sa = _scope_sql(scope, 1)
    extra_args = list(args or [])
    w = f"({sw}) AND ({where})" + (f" AND i.id=${len(sa) + len(extra_args) + 1}" if one else "")
    # 시험으로만 모인 줄은 '새로 옴'이면 감춘다 — 고른 줄(채택 · 보류 · 이미 됨 · 만들어짐)은 남긴다(횟수만 뺌)
    if not show_hidden:                               # 결정 직후 그 줄을 돌려줄 때만 감추지 않는다(시험 줄을 되돌린 뒤에도 그 줄을 돌려준다)
        w += " AND (i.state <> 'new' OR i.source = 'test' OR EXISTS (SELECT 1 FROM improve_signals t WHERE t.item_id=i.id AND NOT t.test))"
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
        "(SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS n_real, "
        "(SELECT row_to_json(r) FROM (SELECT mode, src, dst, text, try, test FROM improve_rules r WHERE r.item_id=i.id AND r.active ORDER BY r.at DESC LIMIT 1) r) AS rule, "
        "(SELECT row_to_json(l) FROM (SELECT l.no, l.state FROM improve_releases l WHERE l.id=i.release_id) l) AS rel "
        f"FROM improve_items i WHERE {w} ORDER BY i.last_at DESC LIMIT 500", *sa, *extra_args, *([one] if one else []))
    who = {}
    ids = {r["decided_by"] for r in rows if r["decided_by"]} | {r["notice_by"] for r in rows if r["notice_by"]}
    if ids:
        who = {r["id"]: (r["name"], r["role"]) for r in await conn.fetch("SELECT id, name, role FROM lx_users WHERE id = ANY($1::text[])", list(ids))}
    works = await _works(conn)
    out = [_item(r, p, who, V, rules) for r in rows]
    for d in out:                                     # 지난 평가에서 이미 답한 새로 옴 줄 — '이대로 반영'(답 문구 붙이기) 대신 '지금 됩니다'
        if d["state"] == "new" and d["id"] in works:
            d["works"] = True
            d.pop("suggest", None)
            d["can"]["apply"] = False
    return out


async def _works(conn) -> set:
    """가장 최근 판(승인 요청 · 승인)의 평가에서 지금 그대로 답하는 개선 후보(after.works · 정기 개선 바퀴가 싣는다)."""
    r = await conn.fetchrow("SELECT after FROM improve_releases WHERE state IN ('pending', 'approved') ORDER BY no DESC LIMIT 1")
    a = r["after"] if r else None
    if isinstance(a, str):
        a = json.loads(a)
    return {str(x) for x in ((a or {}).get("works") or [])}


def _who(uid, who: dict) -> str | None:
    if not uid:
        return None
    if uid == "system":
        return "시스템"
    nm, role = who.get(uid, (None, None))
    if role == "admin":
        return "LX 관리자"
    return f"LX 직원 {nm}" if nm else "LX 직원"


def _item(r, p: Principal, who: dict, V: dict | None = None, rules: list | None = None) -> dict:
    src = "개선 후보(improve_signals)"
    check = r["source"] in SOURCE_KO and not r["n_live"]
    roles = [ROLE_KO.get(x, x) for x in (r["roles"] or []) if x]
    roles = sorted(set(roles), key=lambda x: list(ROLE_KO.values()).index(x) if x in ROLE_KO.values() else 9)
    examples = [g for g in (r["gists"] or []) if g and g != r["gist"]][:2]
    st = r["state"]
    d = {
        "id": r["id"], "seq": r["no"], "gist": r["gist"], "note": r["note"], "examples": examples,
        "asked": r["gist"] in (r["gists"] or []),        # 줄 이름이 사용자 질문(가린 요지) 그대로인가 — 화면 '질문 원문' 표시(GPT3-6)
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
        "test_item": r["source"] == "test",               # 시험으로 넣은 줄(시험 표시 · 바로 반영 줄도 시험 줄로)
        "decided": {"by": _who(r["decided_by"], who), "md": _md(r["decided_at"])} if r["decided_at"] else None,
        "can": {"decide": st in ("new", "held", "already", "adopted"),
                "notify": p.is_admin and st == "adopted" and r["adopt_mode"] not in RULE_MODES and not r["release_id"],
                "reopen": st in ("held", "already") or (st == "adopted" and r["adopt_mode"] not in RULE_MODES and not r["release_id"]),
                "revert": st == "adopted" and r["adopt_mode"] in RULE_MODES and not r["release_id"]},
    }
    # 채택 갈래 — 바로 반영(표 한 줄 · 다음 질문부터) | 모아 둠(다음 XI ChatGEO 개선 평가 질문 · 원칙 202 고침)
    if st == "adopted":
        mode = r["adopt_mode"] or "collect"
        mode = "collect" if mode == "dev" else mode       # 예전 '개발 요청' 줄 = 모아 둠(원칙 202 고침)
        rule = r["rule"]
        if isinstance(rule, str):
            rule = json.loads(rule)
        rel = r["rel"]
        if isinstance(rel, str):
            rel = json.loads(rel)
        d["adopt"] = {"mode": mode, "mode_label": ADOPT_KO.get(mode, mode), "quick": mode in RULE_MODES or mode == "tool",
                      "rule": {k: rule.get(k) for k in ("src", "dst", "text", "try", "test")} if rule else None,
                      "release": {"seq": rel["no"], "state": rel["state"], "state_label": REL_KO.get(rel["state"], rel["state"])} if rel else None,
                      "state_word": "반영됨 — 다시 물어보세요" if (mode in RULE_MODES and rule) or mode == "tool" else "모아 둠 — 다음 XI ChatGEO 개선 평가 질문"}
    # 시스템 제안(원칙 197 · 202 고침) — 아직 고르지 않은 줄(새로 옴 · 보류)마다 서버가 고칠 방법을 미리 정한다.
    # 모아 둔 줄도 같은 규칙으로 꼬리표(분석 모델에 클래스 필요 등)를 다시 붙인다(표시만)
    collected = st == "adopted" and (r["adopt_mode"] or "collect") in COLLECT
    if V is not None and (st in ("new", "held") or collected):
        n_sum = int(r["n_block"] or 0) + int(r["n_reask"] or 0) + int(r["n_nh"] or 0) + int(r["n_cancel"] or 0)
        sg = suggest({"kind": r["kind"], "gist": r["gist"], "examples": [x for x in (r["gists"] or []) if x and x != r["gist"]],
                      "note": r["note"], "n_sum": n_sum, "test_only": not r["n_real"],
                      "n_block": int(r["n_block"] or 0), "n_reask": int(r["n_reask"] or 0)}, V, rules)
        if collected:
            d["adopt"]["tag"] = sg.get("tag")
        else:
            d["suggest"] = sg
            d["can"].update({"apply": bool(sg.get("quick")), "collect": True, "hold": st == "new"})
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


async def _one(conn, p: Principal, iid: str, show_hidden: bool = False) -> tuple[dict, object]:
    scope = await _my_scope(conn, p)
    got = await _items(conn, p, scope, one=iid, show_hidden=show_hidden)
    if not got:
        raise ApiError("not_found", "그 줄을 찾지 못했습니다")
    return got[0], scope


async def _decide(request: Request, iid: str, action: str, body: dict) -> dict:
    p = _lx(request)
    sysrun = body.get("by") == "system" and p.is_admin           # 정기 개선 바퀴(시스템) — 시험으로만 모인 줄도 고친다(평가 질문 묶음 전부)
    async with db(realm="lx") as conn:
        cur, _ = await _one(conn, p, iid, show_hidden=sysrun)
        before = {"state": cur["state"]}
        # 정기 개선 바퀴(원칙 249) — 시스템이 고친 줄은 by=시스템 · 판(만드는 중)에 묶는다(LX 관리자 토큰으로만 · 승인 전에는 시험 질문에만 적용)
        by = "system" if body.get("by") == "system" and p.is_admin else p.user_id
        rel = str(body.get("release") or "") or None
        if rel:
            if not p.is_admin:
                raise ApiError("forbidden", "판에 묶는 것은 LX 관리자 · 시스템만 합니다")
            if await conn.fetchval("SELECT state FROM improve_releases WHERE id=$1", rel) != "draft":
                raise ApiError("conflict", "만드는 중인 판에만 묶을 수 있습니다", status=409)
        if action == "adopt":
            if cur["state"] == "built":
                raise ApiError("conflict", "이미 만들어진 줄입니다", status=409)
            if body.get("use") == "suggest":              # 이대로 반영(원칙 197 고침) — 서버가 정한 제안을 그대로(화면이 보낸 값은 쓰지 않는다)
                sg = cur.get("suggest")
                if not sg or not sg.get("quick"):
                    raise ApiError("conflict", "이 줄은 바로 반영할 방법이 없습니다 — 모아 두기로 쌓아 주세요", status=409)
                body = {"mode": sg["mode"], "src": sg.get("src"), "dst": sg.get("dst"), "text": sg.get("text"), "try": sg.get("try"),
                        "how": sg.get("how"), "test": bool(body.get("test")) or cur.get("test_item"), "use": "suggest", "release": rel, "by": body.get("by")}
            elif str(body.get("mode") or "collect") in COLLECT:     # 모아 두기(예전 '개발 요청' 호출도 여기로 · 원칙 202 고침)
                sg = cur.get("suggest") or {}
                body = {**body, "mode": "collect", "how": body.get("how") or (sg.get("how") if sg.get("mode") == "collect" else None)}
            mode = str(body.get("mode") or "collect")
            if mode not in ADOPT_KO:
                raise ApiError("bad_request", "채택 갈래를 골라 주세요")
            if mode in RULE_MODES and cur.get("test_item"):
                body = {**body, "test": True}
            if mode == "tool" and not rel:
                raise ApiError("bad_request", "새 도구로 고친 줄은 판에 묶어 주세요")

            def one(k, n=100):
                return re.sub(r"\s+", " ", str(body.get(k) or "")).strip()[:n] or None
            how = one("how", 120)
            if mode in RULE_MODES:
                src, dst, text, tr = one("src"), one("dst", 400), one("text", 120), one("try")
                if mode == "alias" and not (src and dst and src != dst and len(src) >= 2):
                    raise ApiError("bad_request", "사용자가 쓴 말과 플랫폼이 쓰는 말을 적어 주세요(두 글자 이상 · 서로 다르게)")
                if mode == "intent" and not (src and dst):
                    raise ApiError("bad_request", "이런 질문과 알아들을 질문을 적어 주세요")
                if mode == "phrase" and not text:
                    raise ApiError("bad_request", "답에 붙일 문구를 한 줄 적어 주세요")
                if mode == "phrase" and not src:
                    src = cur["gist"]
                if mode == "example":
                    try:
                        d = json.loads(dst or "")
                        assert isinstance(d, dict) and d.get("tool")
                    except (ValueError, AssertionError):
                        raise ApiError("bad_request", "예시 질문과 그 질문을 푸는 도구를 적어 주세요") from None
                    if not src:
                        raise ApiError("bad_request", "예시 질문을 적어 주세요")
                    # 예시는 한 후보에 여럿 붙을 수 있다(같은 판 안에서는 쌓음)
                else:
                    await conn.execute("UPDATE improve_rules SET active=false, off_by=$2, off_at=now() WHERE item_id=$1 AND active AND mode <> 'example'", iid, p.user_id)
                await conn.execute("INSERT INTO improve_rules(id, item_id, mode, src, dst, text, try, test, by, release_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                                   "ir_" + secrets.token_hex(6), iid, mode, src, dst if mode != "phrase" else None, text if mode == "phrase" else None,
                                   tr if mode == "phrase" else None, bool(body.get("test")), by, rel)
                how = how or {"alias": f"'{src}'도 '{dst}'로 알아듣기", "intent": f"'{src}' → '{dst}'로 알아듣기", "phrase": f"답에 '{text}' 붙이기",
                              "example": f"예시 질문 '{src}' 붙이기"}[mode]
                await conn.execute("UPDATE improve_items SET state='adopted', adopt_mode=$4, ledger='바로 반영', how=$2, decided_by=$3, decided_at=now(), "
                                   "release_id=coalesce($5, release_id), updated_at=now() WHERE id=$1", iid, how[:120], by, mode, rel)
            elif mode == "tool":
                await conn.execute("UPDATE improve_items SET state='adopted', adopt_mode='tool', ledger='새 도구', how=coalesce($2, how), decided_by=$3, "
                                   "decided_at=now(), release_id=$4, updated_at=now() WHERE id=$1", iid, how, by, rel)
            else:
                await conn.execute("UPDATE improve_items SET state='adopted', adopt_mode='collect', ledger='모아 둠', how=coalesce($2, how, $4), decided_by=$3, "
                                   "decided_at=now(), updated_at=now() WHERE id=$1", iid, how, by, HOW.get(cur["kind"]))
        elif action == "revert":
            if ((cur.get("adopt") or {}).get("release")):
                raise ApiError("conflict", "판에 묶인 줄은 판에서 거절 · 되돌립니다", status=409)
            if cur["state"] != "adopted" or not (cur.get("adopt") or {}).get("quick"):
                raise ApiError("conflict", "바로 반영한 줄만 되돌릴 수 있습니다", status=409)
            await conn.execute("UPDATE improve_rules SET active=false, off_by=$2, off_at=now() WHERE item_id=$1 AND active", iid, p.user_id)
            await conn.execute("UPDATE improve_items SET state='new', adopt_mode=NULL, ledger=NULL, decided_by=$2, decided_at=now(), updated_at=now() WHERE id=$1",
                               iid, p.user_id)
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
            await conn.execute("UPDATE improve_rules SET active=false, off_by=$2, off_at=now() WHERE item_id=$1 AND active", iid, p.user_id)
            await conn.execute("UPDATE improve_items SET state='new', adopt_mode=NULL, ledger=NULL, decided_by=$2, decided_at=now(), updated_at=now() WHERE id=$1",
                               iid, p.user_id)
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
        await audit(conn, p, f"improve.{action}", iid, before, {k: v for k, v in body.items() if k in ("how", "reason", "until", "text", "try", "mode", "src", "dst", "test", "use", "by", "release")})
        out, _ = await _one(conn, p, iid, show_hidden=True)
    if action in ("already", "reopen"):
        _refresh_already(force=True)
    if action in ("adopt", "revert", "reopen"):
        await rules_fresh(force=True)
    return out


@router.post("/improve/items/{iid}/adopt")
async def adopt(iid: str, request: Request, body: dict | None = None):
    return {"item": await _decide(request, iid, "adopt", body or {}), "as_of": now_iso()}


@router.post("/improve/items/{iid}/revert")
async def revert(iid: str, request: Request):
    return {"item": await _decide(request, iid, "revert", {}), "as_of": now_iso()}


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


def _sum_n(x: dict) -> int:
    """막힘 + 다시 물음 + 도움 안 됨 + 취소(목록 정렬과 같은 합)."""
    def g(k):
        return int(((x.get(k) or {}).get("value")) or 0)
    return g("n") + g("reask") + g("not_helpful") + g("cancel")


@router.get("/improve/eval-set")
async def eval_set(request: Request, format: str | None = None, all: str | None = None):   # noqa: A002 — 쿼리 이름
    """모아 둔 평가 질문 묶음(원칙 202 고침) — 다음 XI ChatGEO(LLM) 개선 때 '이 질문들에 답하는가'를 재는 질문 목록.
    질문은 가린 요지(지명 · 지번 · 사람 이름 ○○)와 같은 뜻 질문 둘까지만 — 대화 원문은 서버에도 없다.
    LX 관리자 = 전부 · LX 직원 = 내 서비스 · 기관 범위(목록과 같은 범위). format=jsonl 이면 한 줄에 하나(내려받기).
    all=1(LX 관리자 · 정기 개선 바퀴 '잰다' · 원칙 249) = 상태와 관계없이 개선 후보 전부(시험으로만 모인 줄 포함) + 물은 역할 · 화면
    (시험 신호 포함 · 가장 많은 것) — 고친 질문이 다시 나빠지지 않는지 함께 잰다."""
    p = _lx(request)
    wide = bool(all) and p.is_admin
    async with db(realm="lx") as conn:
        scope = await _my_scope(conn, p)
        n0 = len(_scope_sql(scope, 1)[1]) + 1
        if wide:
            items = await _items(conn, p, scope, show_hidden=True)
            where = {r["item_id"]: (r["role"], r["screen"]) for r in await conn.fetch(
                "SELECT DISTINCT ON (item_id) item_id, role, screen FROM (SELECT item_id, role, screen, count(*) c FROM improve_signals "
                "GROUP BY item_id, role, screen) x ORDER BY item_id, c DESC")}
        else:
            items = await _items(conn, p, scope, f"i.state='adopted' AND coalesce(i.adopt_mode,'collect') = ANY(${n0}::text[])", [list(COLLECT)])
            where = {}
    rows = [{"id": x["id"], "question": x["gist"], "same": x["examples"], "kind": x["kind_label"], "tag": (x.get("adopt") or {}).get("tag"),
             "n": _sum_n(x), "test": bool(x["test_item"] or x["test_only"]), "collected": (x.get("decided") or {}).get("md"),
             **({"seq": x["seq"], "asked": x["asked"], "state": x["state"], "role": (where.get(x["id"]) or (None, None))[0],
                 "screen": (where.get(x["id"]) or (None, None))[1]} if wide else {})} for x in items]
    rows.sort(key=lambda r: -r["n"])
    if format == "jsonl":
        body = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
        return Response(body, media_type="application/x-ndjson; charset=utf-8",
                        headers={"content-disposition": "attachment; filename*=UTF-8''landxi-chatgeo-eval.jsonl"})
    return {"items": rows, "total": env(len(rows), "count", "recorded", "개선 후보 모아 두기(improve_items)"), "as_of": now_iso()}


# ═══ 판(정기 개선 바퀴 '내보낸다' · 원칙 249) ═════════════════════════════════════════════
# 한 바퀴에서 고친 것(규칙 · 예시 질문 · 새 도구)을 판 하나로 묶는다. 시스템이 만든다(by=system) → 통과 기준을 넘으면 승인 요청 →
# LX 관리자 승인 = 모든 질문에 적용 + 나아진 질문을 물었던 사람에게 '이제 됩니다' · 거절 / 되돌리기 = 판의 규칙을 끄고 새 도구를 다시 막는다.
# 통과 기준: 평가 질문 전체에서 답한 수(답함 + 안내함)가 늘고, 전에 답하던 질문이 하나도 나빠지지 않음(나빠진 수 0).
def _score(x) -> dict:
    if isinstance(x, str):
        x = json.loads(x)
    x = x or {}
    return {k: int(x.get(k) or 0) for k in ("total", "답함", "안내함", "못 함")}


def _rel_out(r) -> dict:
    b, a = _score(r["before"]), _score(r["after"])
    src = "XI ChatGEO 개선 바퀴 평가 질문(improve_releases)"
    return {"id": r["id"], "seq": r["no"], "state": r["state"], "state_label": REL_KO.get(r["state"], r["state"]),
            "better": env(int(r["better"] or 0), "count", "recorded", src), "worse": env(int(r["worse"] or 0), "count", "recorded", src),
            "counts": {"before": b, "after": a}, "items": list(r["better_items"] or []), "tools": list(r["tools"] or []),
            "by": "시스템" if r["by"] == "system" else "LX 관리자", "md": _md(r["submitted_at"] or r["at"]),
            "decided": {"md": _md(r["decided_at"]), "by": "시스템" if r["decided_by"] == "system" else "LX 관리자"} if r["decided_at"] else None,
            "can": {"approve": r["state"] == "pending", "reject": r["state"] == "pending", "revert": r["state"] == "approved"}}


def _admin(request: Request) -> Principal:
    p = _lx(request)
    if not p.is_admin:
        raise ApiError("forbidden", "판은 LX 관리자가 승인합니다")
    return p


@router.get("/improve/releases")
async def releases(request: Request):
    """판 목록(최근 10 · 만드는 중 제외) — 화면은 승인 요청 · 최근 승인 한 줄만 쓴다."""
    _lx(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM improve_releases WHERE state <> 'draft' ORDER BY no DESC LIMIT 10")
    return {"items": [_rel_out(r) for r in rows], "as_of": now_iso()}


@router.post("/improve/releases")
async def release_new(request: Request, body: dict | None = None):
    """새 판(만드는 중) — 시스템(정기 개선 바퀴)이 연다. 이 판에 묶은 규칙 · 도구는 승인 전까지 시험 질문에만 적용된다."""
    p = _admin(request)
    body = body or {}
    tools = [str(t)[:60] for t in (body.get("tools") or []) if t][:20]
    by = "system" if body.get("by") == "system" else p.user_id
    async with db(realm="lx") as conn:
        rid = "rel_" + secrets.token_hex(6)
        await conn.execute("INSERT INTO improve_releases(id, tools, note, by) VALUES ($1,$2,$3,$4)", rid, tools, str(body.get("note") or "")[:200] or None, by)
        await audit(conn, p, "improve.release.new", rid, None, {"tools": tools, "by": by})
        r = await conn.fetchrow("SELECT * FROM improve_releases WHERE id=$1", rid)
    await rules_fresh(force=True)
    return {"release": _rel_out(r), "as_of": now_iso()}


@router.post("/improve/releases/{rid}/submit")
async def release_submit(rid: str, request: Request, body: dict):
    """전/후 점수를 싣고 승인 요청 — 통과 기준을 넘지 못하면 내보내지 않는다(만드는 중으로 남음 · 409)."""
    p = _admin(request)
    b, a = _score(body.get("before")), _score(body.get("after"))
    worse, better = int(body.get("worse") or 0), int(body.get("better") or 0)
    items = [str(x) for x in (body.get("better_items") or []) if x][:200]
    works = [str(x) for x in (body.get("works") or []) if x][:500]     # 고치기 전에도 이미 답하던 후보(화면 '지금 됩니다')
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM improve_releases WHERE id=$1", rid)
        if not r:
            raise ApiError("not_found", "그 판을 찾지 못했습니다")
        if r["state"] != "draft":
            raise ApiError("conflict", "만드는 중인 판만 승인 요청할 수 있습니다", status=409)
        await conn.execute("UPDATE improve_releases SET before=$2::jsonb, after=$3::jsonb, better=$4, worse=$5, better_items=$6 WHERE id=$1",
                           rid, json.dumps(b, ensure_ascii=False), json.dumps({**a, "works": works}, ensure_ascii=False), better, worse, items)
        ok = worse == 0 and (a["답함"] + a["안내함"]) > (b["답함"] + b["안내함"]) and a["total"] >= b["total"]
        if not ok:
            await audit(conn, p, "improve.release.blocked", rid, None, {"before": b, "after": a, "worse": worse})
            raise ApiError("conflict", "나빠진 질문이 있거나 답한 수가 늘지 않아 내보내지 않습니다", {"worse": worse}, status=409)
        await conn.execute("UPDATE improve_releases SET state='pending', submitted_at=now() WHERE id=$1", rid)
        await audit(conn, p, "improve.release.submit", rid, {"state": "draft"}, {"state": "pending", "before": b, "after": a, "better": better})
        r = await conn.fetchrow("SELECT * FROM improve_releases WHERE id=$1", rid)
    await rules_fresh(force=True)
    return {"release": _rel_out(r), "as_of": now_iso()}


async def _send_now_works(conn, iid: str, by: str) -> int:
    """'이제 됩니다' — 그 줄을 물었던 사람(90일 · 시험 제외)마다 한 줄 · 줄은 만들어짐으로."""
    it = await conn.fetchrow("SELECT gist FROM improve_items WHERE id=$1", iid)
    if not it:
        return 0
    g = it["gist"]
    text = f"지난번에 물으신 '{g}'{iga(g)} 이제 됩니다."
    tr = g if MASK not in g else None
    askers = await conn.fetch(f"SELECT realm, user_id, tenant_id FROM improve_askers WHERE item_id=$1 AND NOT test AND at > now() - interval '{RETAIN_DAYS} days'", iid)
    for a in askers:
        await conn.execute("INSERT INTO improve_notices(id, item_id, realm, user_id, tenant_id, text, try) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                           "in_" + secrets.token_hex(8), iid, a["realm"], a["user_id"], a["tenant_id"], text, tr)
    await conn.execute("UPDATE improve_items SET state='built', notice_text=$2, notice_try=$3, notice_n=$4, notice_at=now(), notice_by=$5, updated_at=now() "
                       "WHERE id=$1", iid, text, tr, len(askers), by)
    return len(askers)


async def _rel_decide(request: Request, rid: str, action: str, by_system: bool = False) -> dict:
    """승인 · 거절 · 되돌리기(LX 관리자). 시스템이 승인 요청을 스스로 거두는 것(by 시스템 · 거절만)은 기록에 '시스템'으로 남긴다."""
    p = _admin(request)
    sent = 0
    who = "system" if by_system and action == "reject" else p.user_id
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM improve_releases WHERE id=$1", rid)
        if not r:
            raise ApiError("not_found", "그 판을 찾지 못했습니다")
        want = {"approve": "pending", "reject": "pending", "revert": "approved"}[action]
        if who == "system" and action == "reject" and r["state"] == "draft":
            want = "draft"                            # 정기 개선 바퀴가 통과 기준을 못 넘은 판(만드는 중)을 스스로 거둔다 — 묶인 후보는 새로 옴으로(10-15 ChatGEO-매주)
        if r["state"] != want:
            raise ApiError("conflict", f"{REL_KO.get(r['state'], r['state'])} 상태의 판입니다", status=409)
        new = {"approve": "approved", "reject": "rejected", "revert": "reverted"}[action]
        await conn.execute("UPDATE improve_releases SET state=$2, decided_by=$3, decided_at=now() WHERE id=$1", rid, new, who)
        if action == "approve":
            ids = set(r["better_items"] or []) | {x["id"] for x in await conn.fetch("SELECT id FROM improve_items WHERE release_id=$1 AND state='adopted'", rid)}
            for iid in sorted(ids):
                if await conn.fetchval("SELECT state FROM improve_items WHERE id=$1", iid) in ("adopted", "new", "held"):
                    sent += await _send_now_works(conn, iid, p.user_id)
        else:
            await conn.execute("UPDATE improve_rules SET active=false, off_by=$2, off_at=now() WHERE release_id=$1 AND active", rid, who)
            await conn.execute("UPDATE improve_items SET state='new', adopt_mode=NULL, ledger=NULL, release_id=NULL, notice_text=NULL, notice_try=NULL, "
                               "notice_n=NULL, notice_at=NULL, notice_by=NULL, updated_at=now() WHERE release_id=$1", rid)
        await audit(conn, p, f"improve.release.{action}", rid, {"state": r["state"]}, {"state": new, "sent": sent, "by": who})
        r = await conn.fetchrow("SELECT * FROM improve_releases WHERE id=$1", rid)
    await rules_fresh(force=True)
    return {"release": _rel_out(r), "sent": env(sent, "count", "recorded", "개선 후보(improve_notices)"), "as_of": now_iso()}


@router.post("/improve/releases/{rid}/approve")
async def release_approve(rid: str, request: Request):
    return await _rel_decide(request, rid, "approve")


@router.post("/improve/releases/{rid}/reject")
async def release_reject(rid: str, request: Request, body: dict | None = None):
    return await _rel_decide(request, rid, "reject", by_system=(body or {}).get("by") == "system")


@router.post("/improve/releases/{rid}/revert")
async def release_revert(rid: str, request: Request):
    return await _rel_decide(request, rid, "revert")


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
