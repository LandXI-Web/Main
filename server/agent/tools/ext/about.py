"""Land-XI 가 무엇인지 · 누가 만들고 운영하는지 · 여기서 무엇을 할 수 있는지 — XI ChatGEO 정기 개선 바퀴 1회차 새 도구(원칙 249 · impl-32 chatgeo-loop ·
개선 후보 'Land-XI 플랫폼 창시자는 누구'가 법령 찾기로 가서 '맞는 조문 없음'으로 끝나던 것).

  platform_about(request)
      'Land-XI 는 누가 만들었어' · '창시자는 누구' · '이 플랫폼 뭐야' · '어디서 운영해' → 고정 소개 한 단락(지어낸 숫자 0 · 사람 이름 0)
      + 이 계정이 지금 쓸 수 있는 일(역할마다 · 화면 말 그대로). 숫자는 쓰지 않는다.
ROUTE 는 모델 앞 직행(LLM 0).
"""
from __future__ import annotations

import re

from .. import Out

SPECS = {
    "platform_about": {
        "description": "Land-XI 소개 — 누가 만들고 운영하는지, 이 계정이 여기서 할 수 있는 일(고정 문장 · 숫자 없음).",
        "properties": {"request": {"type": "string"}},
        "route_only": True},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
GATED = {"platform_about"}
WHY = {"platform_about": "Land-XI 소개"}
SAY = {"platform_about": "Land-XI 소개"}

NAME = r"(?:land\s*-?\s*xi|랜드\s*엑스아이|랜드엑스|이\s*플랫폼|이\s*서비스|여기|너희|XI\s*ChatGEO|챗\s*지오)"
ASK = re.compile(NAME + r".{0,12}(?:창시자|창업자|만든\s*(?:사람|곳|이|회사|기관)|누가\s*만들|어디서\s*만들|개발자|개발한|운영(?:자|하는|해|기관|처)|"
                 r"뭐(?:야|예요|에요|하는|지)|무엇|소개|어떤\s*(?:플랫폼|서비스|곳))|(?:창시자|만든\s*사람|개발자|운영\s*기관).{0,8}" + NAME, re.I)
NOT = re.compile(r"법|조문|분석\s*(?:실행|해|돌려)|결과|몇|건수|보고서|지도|이동|확대")
ROLE_CAN = {
    "staff": "데이터 올리기 · 학습 · 서비스 만들기 · AI 분석 · 배포 신청",
    "admin": "LX 관리자 대시보드에서 승인 요청 처리 · 기관 사용량 · 배포 운영",
    "sales": "서비스 카탈로그와 사례 보기",
    "tenant": "우리 지역 결과 보기 · 대장 올리기 · 분석 요청 · 촬영 요청 · 보고서",
}


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


def ROUTE(msg: str, ctx):
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 60 or getattr(ctx, "lang", "ko") == "en" or NOT.search(t) or not ASK.search(t):
        return None
    return {"tool": "platform_about", "args": {"request": t}, "intent": "smalltalk"}


async def platform_about(args: dict, ctx) -> Out:
    p = ctx.principal
    role = "tenant" if getattr(p, "realm", None) == "tenant" else (getattr(p, "role", None) or "staff")
    out = Out(source="Land-XI 소개(고정 문장)")
    out.data = {"status": "ok"}
    out.answer = ("Land-XI 는 LX 한국국토정보공사가 만들고 운영하는 GeoAI 실태조사 플랫폼입니다. "
                  "정부 부처 · 지자체와 해외 기관이 영상 AI 분석 결과를 지도에서 보고, 말로 지도를 움직이고, 실태조사 보고서까지 만듭니다. "
                  f"이 계정에서는 {ROLE_CAN.get(role, ROLE_CAN['staff'])}을 할 수 있습니다.")
    return out


HANDLERS = {"platform_about": platform_about}
