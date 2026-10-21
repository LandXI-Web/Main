"""법령 짝 표(WP-3 · CHATGEO-DEV-ORDER) — 질문 → 기대 법령 · 조문(또는 '찾지 못함 + 국가법령정보센터 단추').

짝은 기억이 아니라 색인 원문(02. 데이터/law/chunks.jsonl · 국가법령정보센터 공개 원문)에서 제목 · 본문을 읽고 맞춘 것:
  농지법 제32조(용도구역에서의 행위 제한) ① '농업진흥구역에서는 … 토지이용행위를 할 수 없다'
  농지법 제34조(농지의 전용허가ㆍ협의) · 제35조(농지전용신고) · 제11조(처분명령과 매수 청구) · 제42조(원상회복 등) ① 1호 '농지전용허가 … 를 받지 아니하고 농지를 전용'
  산지관리법 제14조(산지전용허가) · 건축법 제11조(건축허가) · 제20조(가설건축물) · 제80조(이행강제금) · 농지법 시행규칙 제3조의2(농막 등의 범위)
  농지법 제7조(농지 소유 상한) · 제20조(대리경작자의 지정 등)
LLM 호출 0 · DB 0(파일 색인만).
"""
import asyncio
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from agent.rag import index as L  # noqa: E402
from agent.tools.ext import law  # noqa: E402

if not L._load().get("chunks"):
    pytest.skip("법령 색인 없음", allow_module_level=True)


class _Ctx:
    lang = "ko"

    def __init__(self):
        self.state = {}


def ask(q: str):
    c = _Ctx()
    o = asyncio.run(law.law_search({"query": q}, c))
    return o, c


PAIRS = [
    ("농업진흥구역 안에서 못 하는 행위는", "농지법", "제32조"),
    ("농지 전용 허가 근거 조문", "농지법", "제34조"),
    ("농지 전용 신고 대상은", "농지법", "제35조"),
    ("농지 처분 명령은 언제 내려", "농지법", "제11조"),
    ("불법 전용한 농지가 적발되면 어떤 처분을 받아", "농지법", "제42조"),
    ("농지전용허가 없이 비닐하우스를 세우면 어떻게 돼", "농지법", "제42조"),
    ("산지전용 허가가 필요한 경우", "산지관리법", "제14조"),
    ("건축 허가 받아야 하는 경우", "건축법", "제11조"),
    ("축사 건축 허가 요건", "건축법", "제11조"),
    ("가설건축물 축조신고 대상이 뭐야", "건축법", "제20조"),
    ("건축법 이행강제금 조문 알려 줘", "건축법", "제80조"),
    ("농막 설치 기준이 뭐야", "농지법 시행규칙", "제3조의2"),
    ("농지 소유 상한이 있어?", "농지법", "제7조"),
    ("농지 대리경작 제도가 뭐야", "농지법", "제20조"),
    ("농지 이용 실태조사는 언제 하나요", "농지법", "제54조"),      # 제54조 ① '… 이용 … 실태를 정기적으로 조사하게 하여야 한다'
]

# 색인에 없는 법 · 대상 말과 맞는 조문이 없는 질문 — 곁가지 조문 대신 '찾지 못함 + 국가법령정보센터 단추'
NONE = [
    "하천법에서 점용허가 근거 조항이 뭐야",
    "공익직불제 신청 자격이 뭐야",
    "지적재조사 사업이 뭔지 쉽게",
    "지적 불부합 지역은 어떻게 정리해",
    "직불금 부정수급 확인은 어떻게 하나",
    "개발제한구역 안 비닐하우스는 허가가 필요해",
    "경자유전 원칙이 뭐야",
    "무단 점용 변상금 산정 방법",
    "드론 영상도 증거로 쓸 수 있어",
    "자경 요건을 어떻게 판단해",
    "하천구역 지정은 누가 고시해",
    "농지에 태양광 설치 가능해",
]


@pytest.mark.parametrize("q,act,art", PAIRS)
def test_pair(q, act, art):
    o, _ = ask(q)
    assert o.citations, (q, o.answer[:80])
    ref = o.citations[0]["law_ref"]
    assert (ref["법령"], ref["조"]) == (act, art), (q, ref)
    assert "“" in o.answer                                    # 원문 그대로(따옴표 안)


@pytest.mark.parametrize("q", NONE)
def test_not_found_has_site_link(q):
    o, c = ask(q)
    assert not o.citations, (q, [x["label"] for x in o.citations])
    assert "국가법령정보센터" in o.answer
    hrefs = [b.get("href") or "" for b in c.state.get("next") or []]
    assert any(h.startswith(law.LAW_SITE) for h in hrefs), hrefs


@pytest.mark.parametrize("q", ["농지전용허가 없이 비닐하우스를 세우면 어떻게 돼", "농업진흥구역 안에서 못 하는 행위는",
                               "지자체 실태조사 기한이 있나요", "드론 영상도 증거로 쓸 수 있어", "영상 활용할 때 개인정보 문제는 없어"])
def test_law_words_free_questions_go_law_route(q):
    hit = law.ROUTE(q, None)
    assert hit and hit["tool"] == "law_search", q


@pytest.mark.parametrize("q", ["남원 농업진흥구역 비닐하우스 몇 건", "농막 지도에 보여 줘", "농지 처분 명령 받은 필지 목록", "남원시 휴경지 면적",
                               "홍성군 축사 다 합치면 얼마나 넓어?"])
def test_data_questions_stay_off_law_route(q):
    assert law.ROUTE(q, None) is None, q


def test_judge_route_flag():
    assert law.ROUTE("영상 활용할 때 개인정보 문제는 없어", None)["args"].get("judge") is True
    assert "judge" in law.SPECS["law_search"]["properties"]          # 도구 인자 검사(registry.validate)가 떼지 않게


def test_legal_judgement_is_not_given():
    c = _Ctx()
    o = asyncio.run(law.law_search({"query": "영상 활용할 때 개인정보 문제는 없어", "judge": True}, c))
    assert "문제 없" not in o.answer and "담당자" in o.answer
    assert not o.citations
    assert any(b.get("href", "").startswith(law.LAW_SITE) for b in c.state["next"])
