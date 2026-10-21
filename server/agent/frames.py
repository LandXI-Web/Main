"""거절 · 못 답함 세 틀(CHATGEO-DEV-ORDER WP-10 · §4-3 · 원칙 96–98) — 권한 밖 · 결과 없음 · 기능 없음. 모델 앞(LLM 0).

  refuse(kind, what, have=None)     세 틀 문장 하나(‘아직’ 쓰지 않음)
  early(ctx, msg)                   보안 · 권한 밖 요청 · 사용법(화면 안내) · 범위 밖(날씨 · 농담 …) → {text, next, kind} | None
  timeseries(ctx, msg, xr)          시점 비교 숫자 질문(늘었어 · 증감 · 추이) → 기능 없음 틀 + '지금 숫자' 단추(TIMESERIES.md 결정 전까지)
화면 이름 · 주소는 화면 표(improve.HOME_KO · 지금 화면 폴더)에 있는 것만 쓴다 — 지어낸 절차 0. 지역 · 지명 고정값 0.
"""
from __future__ import annotations

import re

from . import talk

SCOPE_LINE = "ChatGEO 는 Land-XI 의 지도 · 분석 · 보고서 · 법령 질문에 답합니다"


def _j(w: str, a: str, b: str) -> str:
    c = (w or " ").rstrip()[-1:]
    if "가" <= c <= "힣":
        return a if (ord(c) - 0xAC00) % 28 else b
    return b


def refuse(kind: str, what: str = "", have: str | None = None, where: str = "") -> str:
    """세 틀 — scope(권한 밖) · nodata(결과 없음) · feature(기능 없음)."""
    if kind == "scope":
        return f"이 계정에서는 {what}{_j(what, '을', '를')} 할 수 없습니다."
    if kind == "nodata":
        return f"{where}{_j(where, '에는', '에는')} {what} 결과가 없습니다" + (f" — 있는 것은 {have}." if have else ".")
    if kind == "oos":
        return f"{SCOPE_LINE} — {what}{_j(what, '은', '는')} 답하지 않습니다."
    return f"ChatGEO 로는 {what}{_j(what, '을', '를')} 하지 않습니다" + (f" — {where}에서 합니다." if where else ".")


def _home_btns(ctx) -> list[dict]:
    r = talk.here(ctx)
    nm = talk.short(r)
    return [talk.btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘")] if nm else [talk.btn("어느 지역에 어떤 결과가 있어?")]


HELP_BTN = {"label": "도움말 열기", "href": "/landxi/v3/help-my/"}

# ── 권한 밖(보안 · 다른 사람 자료 · 시스템) ────────────────────────────────────────────────
SECURITY = [
    (r"(?:데이터|자료|기록|이력|요청|결과|질문)[^.?!]{0,8}(?:삭제|지워|지우|없애)|(?:전부|모두|다)\s*(?:삭제|지워)", "기록 · 자료 삭제"),
    (r"권한[^.?!]{0,10}(?:올려|바꿔|높여|관리자)|관리자\s*(?:권한|계정)[^.?!]{0,6}(?:줘|만들)", "권한 바꾸기"),
    (r"시스템\s*(?:프롬프트|지시)|프롬프트[^.?!]{0,6}(?:보여|알려|출력)", "시스템 지시문 보기"),
    (r"소스\s*코드", "소스 코드 보기"),
    (r"(?:\bDB\b|데이터베이스)[^.?!]{0,8}(?:접속|비밀번호|계정|정보)", "데이터베이스 접속 정보 보기"),
    (r"(?:관리자|다른\s*사람|남의)[^.?!]{0,6}비밀번호|비밀번호가\s*뭐", "다른 사람 비밀번호 보기"),
    (r"다른\s*사람[^.?!]{0,6}(?:계정|아이디)", "다른 사람 계정 쓰기"),
    (r"(?:남의|다른\s*사람|이전\s*사용자|다른\s*사용자)[^.?!]{0,8}(?:질문|기록|대화)", "다른 사람의 질문 기록 보기"),
    (r"(?:직원|담당자|공무원)\s*명단", "직원 명단 보기"),
    (r"군사\s*시설|군\s*부대|군사\s*기지", "군사 시설 위치 표시"),
    (r"승인\s*없이[^.?!]{0,10}(?:배포|공유|올려)", "승인 없이 배포"),
    (r"숫자[^.?!]{0,10}(?:내가\s*말하는|마음대로)|(?:값|숫자)[^.?!]{0,6}조작", "숫자 바꾸기"),
]
OOS = [
    (r"날씨|기온|미세\s*먼지", "날씨"), (r"농담|유머|웃긴", "농담"), (r"레시피|요리법|만드는\s*법(?=.*(?:찌개|국|밥|요리))", "요리"),
    (r"주식|코인|비트코인|투자\s*추천", "투자"), (r"(?:다른|딴)\s*AI|챗\s*GPT|ChatGPT|제미나이|Gemini", "다른 AI 비교"),
    (r"카드\s*번호|계좌\s*번호", "카드 · 계좌 정보"), (r"운세|로또|노래\s*(?:불러|추천)", "그 밖의 일"),
    (r"내\s*(?:위치|현재\s*위치)", "기기 위치"),
]


def _usage(ctx, t: str) -> tuple[str, list[dict]] | None:
    """사용법 — 화면 이름 표에서만(지어낸 절차 0). → (문장, 단추)."""
    lx = talk.realm(ctx) == "lx"
    rl = talk.role(ctx)
    if re.search(r"로그\s*아웃|로그아웃", t):
        return "로그아웃은 화면 위 '나가기' 단추로 합니다(휴대폰은 '메뉴' → '나가기'). 로그인 시간이 지나면 저절로 나가집니다.", [HELP_BTN]
    if re.search(r"세션[^.?!]{0,6}(?:끝|만료)|로그인[^.?!]{0,6}(?:풀|끊|끝)", t):
        return "로그인 시간이 지나 저절로 나가진 것입니다 — 다시 로그인하면 이어서 씁니다. 남은 시간은 화면 위 '자동 로그아웃' 시각에 보입니다.", [HELP_BTN]
    if re.search(r"비밀번호[^.?!]{0,8}(?:바꾸|바꿔|변경|잊|찾)", t):
        return "ChatGEO 로는 비밀번호를 바꾸지 않습니다 — 로그인 화면의 '계정 찾기 · 신청' → '비밀번호 찾기'에서 다시 정합니다.", [HELP_BTN]
    if re.search(r"언어|영어로|english", t, re.I):
        return "화면 말은 계정에 맞춰 정해집니다(해외 기관 화면은 영어). XI ChatGEO 는 영어로 물으면 영어로 답합니다.", [HELP_BTN]
    if re.search(r"(?:직원|사용자|계정)[^.?!]{0,8}(?:추가|만들|만드|등록|생성)|계정은\s*어떻게|가입", t):
        if lx and rl == "admin":
            return "계정은 'LX 관리자 대시보드'의 계정 관리에서 만듭니다.", [{"label": "계정 관리 열기", "href": "/landxi/v3/ops-accounts/"}]
        if lx:
            return "새 직원은 로그인 화면의 '계정 찾기 · 신청'에서 가입 신청을 하고, LX 관리자가 승인합니다.", [HELP_BTN]
        return "기관 계정은 '계정' 화면에서 관리합니다. 새 직원은 기관 로그인의 '계정 찾기 · 신청'에서 가입 신청을 합니다.", [{"label": "계정 화면 열기", "href": "/landxi/v3/gov-accounts/"}]
    if re.search(r"권한[^.?!]{0,6}(?:나뉘|나눠|종류|차이)|역할[^.?!]{0,6}(?:나뉘|종류|차이)", t):
        return ("계정은 LX 관리자 · LX 직원 · 기관 사용자로 나뉩니다. LX 직원은 데이터 올리기 · 학습 · 서비스 만들기 · AI 분석 · 배포 신청, "
                "기관 사용자는 우리 지역 결과 보기 · 대장 올리기 · 분석 요청 · 촬영 요청 · 보고서를 합니다."), [HELP_BTN]
    if re.search(r"(?:영상|데이터|자료|대장)[^.?!]{0,6}(?:올리|올려|등록|업로드)", t):
        if lx:
            return "영상과 데이터는 '데이터 올리기' 화면에서 올립니다.", [{"label": "데이터 올리기 열기", "href": "/landxi/v3/lx-ingest/"}]
        return "대장은 '내 대장 × AI' 화면에서, 우리 영상은 '분석 요청' 화면에서 올립니다.", [
            {"label": "내 대장 × AI 열기", "href": "/landxi/v3/gov-fusion/"}, {"label": "분석 요청 열기", "href": "/landxi/v3/gov-request/"}]
    if re.search(r"촬영\s*요청", t):
        if lx:
            return "기관이 보낸 촬영 요청은 '요청함'에서 봅니다.", [{"label": "요청함 열기", "href": "/landxi/v3/lx-inbox/"}]
        return "촬영 요청은 '분석 요청' 화면의 '촬영 요청' 칸에서 보냅니다 — 적을 것은 그 화면 칸이 안내합니다.", [
            {"label": "촬영 요청 열기", "href": "/landxi/v3/gov-request/?tab=shoot"}]
    if not lx and re.search(r"(?:요청|분석)[^.?!]{0,8}(?:진행|상황|이력|언제\s*나|취소|다시\s*할)|분석\s*결과는\s*언제", t):
        return "보낸 분석 요청 · 촬영 요청의 진행과 이력은 '분석 요청' 화면의 '보낸 요청'에서 봅니다.", [
            {"label": "보낸 요청 열기", "href": "/landxi/v3/gov-request/"}]
    if not lx and re.search(r"다시\s*(?:할|분석|요청|맡)", t) and re.search(r"분석|요청|결과", t):
        return "다시 분석을 맡기려면 '분석 요청' 화면에서 새로 요청합니다 — 보낸 요청은 '보낸 요청'에서 봅니다.", [
            {"label": "분석 요청 열기", "href": "/landxi/v3/gov-request/"}]
    if re.search(r"(?:결과|자료)[^.?!]{0,6}(?:나누|나눠|공유하|보내)", t) and not re.search(r"기관에\s*공유", t):
        return "결과는 보고서 파일(.hwpx)로 받아 나눕니다 — '○○ 보고서 만들어 줘'라고 하면 만듭니다.", [
            {"label": "보고서 만들기", "q": "보고서 만들어 줘"}]
    if lx and re.search(r"배포\s*신청[^.?!]{0,12}(?:어느|언제|단계|어디)", t):
        return "배포 신청은 프로젝트의 마지막 단계에서 합니다 — '프로젝트' 화면에서 이어 갑니다.", [{"label": "프로젝트 열기", "href": "/landxi/v3/lx-project/"}]
    if lx and re.search(r"기관에\s*공유[^.?!]{0,8}(?:방법|어떻게|하려면)", t):
        return "승인된 분석 서비스는 LX 관리자가 기관에 공유합니다 — 직원은 프로젝트 마지막 단계에서 배포 신청을 합니다.", [
            {"label": "프로젝트 열기", "href": "/landxi/v3/lx-project/"}]
    if re.search(r"도움말|사용\s*안내서|사용법\s*(?:어디|문서)|매뉴얼", t):
        return "사용 안내는 화면 위 '도움말'에 있습니다.", [HELP_BTN]
    if re.search(r"(?:층|레이어)[^.?!]{0,6}(?:더\s*)?(?:추가|넣)", t):
        return "결과 층은 XI맵의 층 판에서 켜고 끕니다 — 말로 '○○ 층 켜 줘'라고 해도 됩니다.", [{"label": "켤 수 있는 층 보기", "q": "어떤 결과 층이 있어?"}]
    if re.search(r"인쇄|프린트", t):
        return "ChatGEO 로는 인쇄하지 않습니다 — 지도는 그림 파일로 만들어 드릴 수 있습니다.", [{"label": "지도를 그림 파일로", "q": "지도 화면을 이미지로 저장해 줘"}]
    if re.search(r"요금|비용|유료|돈이\s*드", t):
        return "요금 · 비용은 ChatGEO 가 답하지 않습니다 — 화면 위 '도움말'의 문의로 LX에 물어 주세요.", [HELP_BTN]
    if re.search(r"알림[^.?!]{0,6}(?:설정|끄|켜|받)", t):
        return "ChatGEO 로는 알림을 설정하지 않습니다 — 화면 위 '도움말'에서 사용법을 볼 수 있습니다.", [HELP_BTN]
    if re.search(r"(?:사용|이용)\s*(?:현황|한도|량)[^.?!]{0,6}(?:어디|얼마|보여|알려)?", t) and not (lx and rl == "admin"):
        return ("기관별 사용 현황은 LX 관리자 대시보드에서 LX 관리자가 봅니다." if lx else
                "ChatGEO 로는 사용 현황을 보이지 않습니다 — 화면 위 '도움말'의 문의로 LX에 물어 주세요."), [HELP_BTN]
    if re.search(r"(?:거절|반려)[^.?!]{0,8}(?:이유|사유)", t):
        return "승인 요청의 결과와 사유는 그 요청을 보낸 화면(직원: '프로젝트' · 기관: '분석 요청')에서 봅니다.", [HELP_BTN]
    return None


USAGE_ASK = re.compile(r"어떻게|어디(?:서|에|야|있)?|려면|방법|수\s*있어|수\s*있나|되나요|드나요|있나요|싶어|언제|누가|어느\s*단계|적어야|보여\s*줘|\?$|뭐야$|얼마야")
DATA_WORDS = re.compile(r"몇\s*(?:건|곳|개|동|필지|군데)|건수|면적|필지|지번|통계|순위|현황(?!은\s*어디)|보고서|엑셀|이동|확대|축소|층\s*(?:켜|꺼)|\d")


def early(ctx, msg: str) -> dict | None:
    """모델 · 도구 앞에서 끝내는 질문 — 권한 밖 · 범위 밖 · 사용법. 데이터 · 지도 질문은 건드리지 않는다."""
    if getattr(ctx, "lang", "ko") != "ko":
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 80:
        return None
    for rx, what in SECURITY:
        if re.search(rx, t, re.I):
            return {"kind": "scope", "text": refuse("scope", what), "next": _home_btns(ctx)}
    for rx, what in OOS:
        if re.search(rx, t, re.I) and not re.search(r"필지|지번|분석|결과|보고서", t):
            return {"kind": "oos", "text": refuse("oos", what), "next": [talk.btn("ChatGEO로 뭘 할 수 있어?")] + _home_btns(ctx)[:1]}
    if re.search(r"다른\s*기관[^.?!]{0,6}사용(?:량|현황)", t) and not (talk.realm(ctx) == "lx" and talk.role(ctx) == "admin"):
        return {"kind": "scope", "text": refuse("scope", "다른 기관 사용량 보기"), "next": _home_btns(ctx)}
    if USAGE_ASK.search(t) and not DATA_WORDS.search(re.sub(r"분석\s*요청|촬영\s*요청|배포\s*신청|데이터\s*올리기", "", t)):
        u = _usage(ctx, t)
        if u:
            return {"kind": "screen", "text": u[0], "next": u[1]}
    elif re.search(r"로그아웃|비밀번호[^.?!]{0,8}(?:바꾸|바꿔|변경)|세션[^.?!]{0,6}(?:끝|만료)", t):
        u = _usage(ctx, t)
        if u:
            return {"kind": "screen", "text": u[0], "next": u[1]}
    return None


# ── 시점 비교 숫자(시계열 · TIMESERIES.md 결정 전) ─────────────────────────────────────────────
TS_RX = re.compile(r"작년보다|작년\s*대비|전년\s*대비|늘었|줄었|늘어난|줄어든|증감|추이|없어진|사라진|(?<!\d)\d{4}\s*년\s*(?:에서|부터|과|와|하고)[^.?!]{0,8}\d{4}\s*년|연도\s*별|해마다")
TS_NOT = re.compile(r"영상|사진|나란히|겹쳐|두\s*시점|시점\s*두")


def timeseries(ctx, msg: str, xr: dict | None) -> dict | None:
    if getattr(ctx, "lang", "ko") != "ko":
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not TS_RX.search(t) or TS_NOT.search(t):
        return None
    if xr and xr.get("tool") in ("map_compare", "law_search", "report_draft", "ai_report"):
        return None
    now_q = re.sub(TS_RX, " ", t)
    now_q = re.sub(r"\s*(?:사이|변화|비교해서|비교|지도에|몇\s*곳이야|어디야|돼\?*|\?)\s*", " ", now_q).strip()
    now_q = re.sub(r"\s+", " ", now_q)
    nxt = [talk.btn("지금 시점 숫자 보기", q=f"{now_q} 현황 알려 줘" if now_q else "결과 요약해 줘")]
    if talk.realm(ctx) == "tenant":
        nxt.append(talk.btn("두 시점 영상 나란히", q="두 시점 영상 나란히 비교해 줘"))
    g = talk.regions_in(t)
    r0 = talk.pick(ctx, g[0])[0] if g else None
    nm = ((r0.get("name") or "").split(" ")[0] if g and len(g[0]) > 1 else (r0 or {}).get("name")) if r0 else ""
    lead = f"{nm}의 " if nm else ""
    return {"kind": "feature", "text": f"{lead}시점 비교 숫자(늘어난 · 줄어든 수)는 ChatGEO 가 내지 않습니다 — 지금 시점 숫자를 보일까요?", "next": nxt}


CANNOT_KIND = {"scope": "scope", "oos": "other", "screen": "screen", "feature": "action"}


async def answer(ctx, fr: dict, started: float, scr: dict):
    """틀 답 — 정해진 한 문장 + 단추 1~2(첫 단추 = 가장 가까운 일 · 원칙 97). LLM 0."""
    from . import runner as R
    route = {"intent": "map", "ms": 0, "backend": "runtime", "model": "안내 틀"}
    await R.emit(ctx, "agent.route", {**route, "pii": scr.get("pii") or [], "lang": ctx.lang})
    await R.persist_state(ctx, intent="frame")
    await R.emit(ctx, "agent.plan", {"steps": [], "round": 1, "route": route, "model": {"id": "런타임", "backend": "runtime"}})
    talk.set_next(ctx, fr.get("next") or [], front=True)
    if fr.get("kind") != "talk":
        ctx.state["cannot"] = {"kind": CANNOT_KIND.get(fr.get("kind"), "other")}
    ctx.state["rounds"] = 0
    await R.finish(ctx, fr["text"], None, started, route, {}, lint_on=False)


CALL_RX = re.compile(r"^\s*`*\s*([a-z][a-z0-9_]{2,40})\s*\((.*)\)\s*`*\s*\.?\s*$", re.S)


def no_toolcall(ctx, answer: str, res) -> str:
    """모델 답이 도구 부르는 글(`vlm_describe(address=…)`)이거나 빈 글이면 — 못 답했다는 한 줄 + 다음 할 일(WP-9 ④ · 원칙 97)."""
    a = answer or ""
    m = CALL_RX.match(a)
    if res is None and a.strip():
        return a
    ghost = bool(re.search(r"\{\{\s*env:", a)) and not getattr(ctx, "envs", None)   # 도구 없이 쓴 숫자 자리표(지어낸 값) — 못 답함으로
    msg = str((getattr(ctx, "state", None) or {}).get("msg") or "")
    if not getattr(ctx, "steps", None) and re.search(r"(?:[가-힣]+(?:리|동|가)|산)\s?\d+(?:-\d+)?", msg) and re.search(r"확인했습니다|조회했습니다|호출|찾았습니다", a):
        ghost = True                                   # 지번 질문에 도구 없이 '확인했습니다'(한 일 없음) — 못 답함으로(P4)
    if not (m or ghost or not a.strip()):
        return a
    talk.set_next(ctx, _home_btns(ctx) + [talk.btn("질문 예시 보기", q="ChatGEO로 뭘 할 수 있어?")])
    ctx.state["cannot"] = {"kind": "other"}
    return "이 질문에는 답을 만들지 못했습니다 — 지역 · 분류 · 지번을 함께 말씀해 주시면 다시 찾겠습니다."


THANKS_RX = re.compile(r"^\s*(?:고마워|고맙|감사(?:해|합니다|해요)?|땡큐|thanks?|thank\s+you)[요!.\s~]*$", re.I)
AGAIN_RX = re.compile(r"^\s*(?:아까|방금|앞)\s*(?:그거|그것|거|답|말한\s*거)\s*(?:다시|보여\s*줘|뭐였지|뭐였어)?[?\s.]*$|^\s*그거\s*다시[?\s.]*$")


async def route(ctx, msg: str) -> dict | None:
    """early + 짧은 말(WP-12): '고마워' → 맺음 한 줄 · '아까 그거' → 같은 창의 앞 답 다시."""
    t = re.sub(r"\s+", " ", msg or "").strip()
    if getattr(ctx, "lang", "ko") == "ko" and THANKS_RX.match(t):
        return {"kind": "talk", "text": "천만에요. 더 볼 지역이나 결과가 있으면 말씀해 주세요.", "next": _home_btns(ctx)}
    if getattr(ctx, "lang", "ko") == "ko" and AGAIN_RX.match(t):
        prev = str((getattr(ctx, "context", None) or {}).get("prev_run") or "").strip()
        md = None
        if prev:
            try:
                from landxi_api.deps import db
                async with db(ctx.principal) as conn:
                    row = await conn.fetchrow("SELECT answer_md, envelopes FROM agent_runs WHERE id=$1 AND state='done'", prev)
                if row and row["answer_md"]:
                    envs = row["envelopes"] if isinstance(row["envelopes"], dict) else {}
                    md = re.sub(r"\{\{env:(e\d+)\}\}", lambda m: _fmt((envs.get(m.group(1)) or {}).get("value"), (envs.get(m.group(1)) or {}).get("unit")), row["answer_md"])
            except Exception:  # noqa: BLE001
                md = None
        if md:
            return {"kind": "talk", "text": "앞 답입니다 — " + md.strip(), "next": []}
        return {"kind": "talk", "text": "이 창에서 앞에 드린 답이 없습니다 — 지역이나 결과를 말씀해 주세요.", "next": _home_btns(ctx)}
    return early(ctx, msg)


def _fmt(v, unit) -> str:
    if v is None:
        return "확인 중"
    try:
        x = f"{int(v):,}" if float(v).is_integer() else f"{float(v):,.1f}"
    except Exception:  # noqa: BLE001
        return str(v)
    u = {"count": "건", "필지": "필지", "곳": "곳", "m2": "㎡", "ha": "ha", "동": "동", "개": "개"}.get(str(unit or ""), "")
    return x + u
