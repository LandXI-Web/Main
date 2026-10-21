"""chatgeo-400.jsonl 만들기 — 탐침 질문 400개(impl-46/chatgeo-probe/questions.jsonl) + 묶음(clusters.json) + 화면 기본 context(contexts.json).

    python agent/tests/eval/build_400.py            (cwd = server/)

한 줄 = 한 질문: {n, persona, cluster, sev, rank, q, context, follow, expect}
  context = 그 계정이 XI맵(xi-clean · 남원 예시 지역)을 처음 열었을 때 화면이 보내는 context 그대로(10-21 로그인 폼으로 잡음 · test 표시)
  follow  = 이어 묻기 사슬의 앞 질문 n(탐침이 사슬로 보낸 것) — 돌릴 때 앞 답 번호를 prev_run 으로 붙인다
  expect  = 묶음 단위 기대(check.py 가 읽는다 · 질문마다 덧씀) — 아래 EXPECT 표. LLM 0.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PROBE = ROOT / "docs/superpowers/final/process/impl-46/chatgeo-probe"

SEV_TIER = {"최고": "top", "높음": "high", "보통": "mid", "낮음": "normal"}

# 묶음 기대(CHATGEO-DEV-ORDER §3-1 · 합격 기준을 검사 가능한 성질로) — 키:
#   refuse True/False · no_text [정규식] · need_any [정규식 — 하나는 있어야] · region_only(답의 시군구 이름 ⊆ 물은 시군구)
#   need_region(물은 시군구 이름이 답에) · relabel(켜진 비닐하우스 값이 다른 분류 이름으로 나가면 실패) · no_counts(건수 숫자 0)
#   law(인용 조문 ⊆ 허용 · 또는 '찾지 못' + 링크) · buttons_min · values{숫자: 뜻}(답 숫자가 이 값이어야) · forbid_values[숫자]
REFUSE_FRAME = r"없습니다|할 수 없습니다|하지 않습니다|않습니다|못했습니다|볼 수 없습니다"
NO_DATA_WRONG = r"해당 지역(의)? 데이터가 없습니다|(?:은|는) (?:아직 )?AI 분석 결과가 없습니다|데이터가 아닙니다"
EXPECT: dict[str, dict] = {
    # 최고
    "C10": {"suspect_one": True, "no_text": [r"\d[\d,]*\s*(?:필지|건|곳)?\s*중\s*[^.]{0,20}의심"]},
    "C25": {"law": True},
    "C06": {"region_only": True, "need_region": True},
    "C07": {"relabel": True},
    "C14": {"relabel": True, "forbid_review_as": True, "region_only": True},
    "C04": {"region_only": True, "need_region": True},
    "C05": {"region_only": True, "need_region": True, "no_text": [r"전국"]},
    # 높음
    "C02": {"no_text": [NO_DATA_WRONG], "region_only": True, "need_region": True},
    "C09": {"region_only": True, "need_any": [r"걸지 못한 조건|못 건 조건|" + REFUSE_FRAME]},
    "C20": {"no_text": [r"분석을 요청합니다", r"승인해 주"], "timeseries": True},
    "C03": {"no_text": [NO_DATA_WRONG, r"^(?:완산구|덕진구|덕양구|일산\S*구|광주시)는"], "need_region": True},
    "C38": {"no_text": [r"실태조사 대상 후보", NO_DATA_WRONG]},
    "C19": {"no_text": [NO_DATA_WRONG, r"지금은 답할 수 없습니다"], "nonempty": True},
    "C21": {"no_text": [r"확인되지 않음", r"[a-z]+_[a-z_]+\s*\("]},
    "C11": {"emd_only": True, "relabel": True},
    "C27": {"law_path": True},
    "C41": {"no_text": [r"전국"], "region_only": True},
    "C15": {"layer_claim": True},
    "C32": {"nonempty": True},
    "C28": {"no_text": [r"문제\s*없이", r"문제\s*없습니다"]},
    # 보통
    "C12": {"no_text": [NO_DATA_WRONG], "relabel": True},
    "C36": {"refuse": True, "no_text": [r"아직 없는 기능", r"법령 데이터에 없습니다", NO_DATA_WRONG], "buttons_min": 1},
    "C29": {"no_text": [r"아직 없는 기능", r"법령 데이터에 없습니다"]},
    "C26": {"need_any": [r"law\.go\.kr|국가법령정보센터"]},
    "C17": {"no_text": [r"아직 없는 기능", NO_DATA_WRONG]},
    "C37": {},
    "C31": {"no_counts": True, "no_text": [r"요약 정보가 없습니다"]},
    "C43": {"nonempty": True},
    "C08": {"relabel": True, "no_text": [r"조건:\s*없음"]},
    "C22": {"no_text": [NO_DATA_WRONG, r"확인되지 않음"]},
    "C30": {"no_text": [r"법령 데이터에 없습니다"]},
    "C18": {"two_regions": True, "no_text": [NO_DATA_WRONG]},
    "C23": {"no_text": [r"가장 많은 결과는"]},
    "C33": {"no_text": [r"제공되지 않습니다", r"not a supported"]},
    "C44": {"nonempty": True},
    # 정상 · 권한 밖(퇴행 0)
    "C01": {"refuse": True, "no_counts": True},
    "C16": {"nonempty": True},
    "C42": {"nonempty": True},
    "C39": {"region_only": True, "need_region": True},
    "C24": {"need_any": [r"제\s*\d+\s*조|Ⅲ"]},
    "C35": {"refuse": True, "no_counts": True},
    "C13": {"need_any": [REFUSE_FRAME]},
    "C34": {"nonempty": True},
    "C40": {},
    "C45": {"need_any": [r"의심 필지"]},
}
# 질문마다 덧쓰기(DEV-ORDER 합격 기준 · 숫자 맞춰 보기 표)
PER_N: dict[int, dict] = {
    # 법령 짝 표(WP-3) — 허용 조문(법 이름 일부 · 조) · 없으면 '찾지 못'
    255: {"law_ok": [("농지법", "32")]}, 79: {"law_ok": [("산지관리법", "14")]}, 25: {"law_ok": [("건축법", "11")]},
    90: {"law_ok": [("농지법", "10"), ("농지법", "11"), ("농지법", "42")]}, 145: {"law_ok": []}, 185: {"law_ok": []},
    320: {"law_ok": [("농지법", "34"), ("농지법", "35"), ("농지법 시행령", "")]}, 15: {"law_ok": [("농지법", "2"), ("농지법 시행령", "3")]},
    215: {"law_ok": [("농지법", "54"), ("농지법 시행령", "")]}, 265: {"law_ok": [("농지법", "6")]}, 275: {"law_ok": []},
    # 숫자 맞춰 보기(XI맵 통계 판 · 같은 값이어야)
    363: {"values_any": [1464]}, 344: {"values_any": [46832]}, 162: {"values_any": [34874]}, 170: {"values_any": [33285]},
    240: {"values_any": [90247]}, 250: {"values_any": [434]}, 350: {"values_any": [14792]},
    39: {"values_any": [2104, 1784, 1464]},
    # 범위 밖(날씨 · 농담 · 다른 AI · 사용량 · 레시피 · 카드번호) — 지도 숫자 0 · 범위 밖 틀
    217: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"]}, 313: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"]},
    247: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"]}, 340: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"]},
    227: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"], "no_text": [r"아직"]},
    331: {"no_counts": True, "need_any": [REFUSE_FRAME + r"|답합니다"], "no_text": [r"아직"]},
    # 짧은 말(WP-12)
    18: {"no_text": [r"반갑습니다"]}, 238: {"no_text": [NO_DATA_WRONG]},
    # 한 시만 보고서가 된 두 지역 비교 — 부분 답 한 줄
    179: {"need_any": [r"부분|만 실었|결과가 없어"]}, 375: {"need_any": [r"부분|만 실었|결과가 없어"]},
    # 사용법(사실과 맞게)
    339: {"need_any": [r"오른쪽 위|로그아웃"]},
    # 직원 화면 읍면동 순위 · 이어 묻기
    71: {"need_any": [r"[가-힣]+[읍면동]\b|[가-힣]+[읍면동](?=[ \d·,(])|결과가 없습니다"]},
    93: {"need_any": [r"[가-힣]+[읍면동](?=[ \d·,(]|$)|결과가 없습니다"]},
    # 태양광으로 바뀐 곳 = 의심 필지 규칙 결과임을 밝힘
    328: {"need_any": [r"태양광 분류 결과가 아니라|의심 필지"]},
}


def main():
    cl = json.loads((PROBE / "clusters.json").read_text(encoding="utf-8"))
    ctxs = json.loads((HERE / "contexts.json").read_text(encoding="utf-8"))
    of = {}
    rank = {}
    for i, b in enumerate(cl["묶음"], 1):
        for n in b["질문_번호"]:
            of[n] = b
            rank[b["id"]] = i
    rows = []
    prev_chain = None
    for line in (PROBE / "questions.jsonl").read_text(encoding="utf-8").splitlines():
        q = json.loads(line)
        tag = q.get("intent_tag") or ""
        follow = None
        if "/chainbase|" in tag:
            prev_chain = q["n"]
        elif "/followup|" in tag and prev_chain:
            follow = prev_chain
            prev_chain = q["n"]
        else:
            prev_chain = None if "chain" not in tag else prev_chain
        b = of[q["n"]]
        ex = dict(EXPECT.get(b["id"], {}))
        for k, v in PER_N.get(q["n"], {}).items():
            ex[k] = v
        rows.append({"n": q["n"], "persona": q["persona"], "cluster": b["id"], "sev": SEV_TIER.get(b["심각도"], "mid"), "rank": rank[b["id"]],
                     "q": q["question"], "context": ctxs[q["persona"]], "follow": follow, "expect": ex,
                     "probe": {"answer": q.get("answer_text"), "outcome": q.get("outcome"), "ms": q.get("ms_total")}})
    out = HERE / "chatgeo-400.jsonl"
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    print(out, len(rows))


if __name__ == "__main__":
    main()
