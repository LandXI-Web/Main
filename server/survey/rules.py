"""규칙 R1–R6 — YAML 정의(server/survey/rules/*.yaml) → PostGIS SQL 재평가 · 점수.

정본 논리 = 02. 데이터/_scripts/survey/s3_survey.py(규칙 · 점수 · 우선순위). 여기 SQL 은 그 식을 한 줄씩 옮긴 것이고,
기본 임계로 돌리면 정본 20,872건과 같은 (rule, pnu) 집합이 나와야 한다(tests/test_rules_equal_canon.py).
임계는 전부 [추정 초기값] — 법령 기준이 아니며 현장조사 결과로 보정한다.
공통 임계 obj_in_frac 0.5 · conf_min 0.5 는 적재 때 *_in_m2 열에 이미 반영돼 있다(바꾸려면 재결합 = adapter_join).
"""
from __future__ import annotations

import math
from functools import lru_cache

import yaml

from .db import RULE_IDS, RULES_DIR

COMMON = {"obj_in_frac": 0.5, "conf_min": 0.5}


@lru_cache(maxsize=1)
def _load() -> dict[str, dict]:
    out = {}
    for rid in RULE_IDS:
        d = yaml.safe_load((RULES_DIR / f"{rid}.yaml").read_text(encoding="utf-8"))
        out[rid] = d
    return out


def definitions() -> dict[str, dict]:
    return {k: dict(v) for k, v in _load().items()}


def default_thresholds() -> dict[str, float]:
    th = dict(COMMON)
    for d in _load().values():
        th.update(d["thresholds"])
    return th


def merge_thresholds(override: dict | None) -> dict[str, float]:
    th = default_thresholds()
    for k, v in (override or {}).items():
        if k not in th:
            raise ValueError(f"알 수 없는 임계 {k}")
        if k in COMMON and float(v) != COMMON[k]:
            raise ValueError(f"{k} 는 적재 때 고정(재결합 필요 · adapter_join)")
        v = float(v)
        if not math.isfinite(v) or v < 0:
            raise ValueError(f"임계 {k} 값 오류")
        th[k] = v
    return th


def condition_text(rid: str, th: dict | None = None) -> str:
    th = th or default_thresholds()
    fmt = dict(th)
    fmt["R2_crop_ratio_max_pct"] = th["R2_crop_ratio_max"] * 100
    fmt["R2_bld_ratio_max_pct"] = th["R2_bld_ratio_max"] * 100
    fmt["R5_crop_ratio_pct"] = th["R5_crop_ratio"] * 100
    return _load()[rid]["condition"].format(**fmt)


def _arr(xs) -> str:
    return "ARRAY[" + ",".join("'" + x.replace("'", "") + "'" for x in xs) + "]::text[]"


def _f(v) -> str:
    return repr(float(v))


def _conf(expr: str) -> str:
    return f"15 * (CASE WHEN ({expr}) IS NULL OR ({expr}) = 0 THEN 0.5 ELSE ({expr}) END)"


def rule_selects(th: dict, rules: list[str] | None = None, src: str = "p") -> str:
    """rule · pnu · a(근거면적) · c(신뢰도) · score 를 내는 UNION ALL — FROM {src}."""
    d = _load()
    rules = rules or RULE_IDS
    J = {r: _arr(d[r]["jimok"]) for r in RULE_IDS}
    r1 = f"(jimok = ANY({J['R1']}) AND a23_bld_in_m2 >= {_f(th['R1_bld_m2'])})"
    parts = {}
    promo = "CASE WHEN nongup = '농업진흥구역' THEN 8 ELSE 0 END"
    many = "CASE WHEN coalesce(a23_bld_n,0) + coalesce(a23_park_n,0) >= 3 THEN 3 ELSE 0 END"
    built = "CASE WHEN chg_built_new_m2 > 0 THEN 10 ELSE 0 END"

    def sc(base, a, c, bonus="0"):
        return f"{base} + LEAST(25.0, 8 * log(GREATEST({a}, 1.0))) + {_conf(c)} + {bonus}"

    parts["R1"] = (f"SELECT 'R1'::text AS rule, pnu, emd_cd, a23_bld_in_m2 AS a, a23_bld_conf AS c, "
                   f"{sc(d['R1']['base_score'], 'a23_bld_in_m2', 'a23_bld_conf', f'{promo} + {built} + {many}')} AS score "
                   f"FROM {src} WHERE {r1}")
    a2 = "(area_m2 * (1 - r23_farm))"
    parts["R2"] = (f"SELECT 'R2', pnu, emd_cd, {a2}, a23_crop_conf, "
                   f"{sc(d['R2']['base_score'], a2, 'a23_crop_conf', promo + ' + CASE WHEN a25_uncrop_m2 > 0 THEN 12 WHEN a25_crop_m2 > 0 THEN -15 ELSE 0 END')} "
                   f"FROM {src} WHERE jimok = ANY({J['R2']}) AND area_m2 >= {_f(th['R2_parcel_min_m2'])} AND r23_farm < {_f(th['R2_crop_ratio_max'])} "
                   f"AND r23_bld < {_f(th['R2_bld_ratio_max'])} AND NOT {r1}")
    a3 = "(CASE WHEN a25_gh_in_m2 >= a23_gh_in_m2 THEN a25_gh_in_m2 ELSE a23_gh_in_m2 END)"
    c3 = "(CASE WHEN a25_gh_in_m2 >= a23_gh_in_m2 THEN a25_gh_conf ELSE a23_gh_conf END)"
    parts["R3"] = (f"SELECT 'R3', pnu, emd_cd, {a3}, {c3}, "
                   f"{sc(d['R3']['base_score'], a3, c3, 'CASE WHEN a23_gh_in_m2 > 0 AND a25_gh_in_m2 > 0 THEN 8 ELSE 0 END')} "
                   f"FROM {src} WHERE jimok = ANY({J['R3']}) AND GREATEST(a23_gh_in_m2, a25_gh_in_m2) >= {_f(th['R3_gh_m2'])}")
    parts["R4"] = (f"SELECT 'R4', pnu, emd_cd, a23_park_in_m2, a23_park_conf, "
                   f"{sc(d['R4']['base_score'], 'a23_park_in_m2', 'a23_park_conf', f'{promo} + {many}')} "
                   f"FROM {src} WHERE jimok = ANY({J['R4']}) AND a23_park_in_m2 >= {_f(th['R4_park_m2'])}")
    a5 = "(a23_crop_m2 + GREATEST(a23_gh_m2, a25_gh_m2))"
    parts["R5"] = (f"SELECT 'R5', pnu, emd_cd, {a5}, coalesce(a23_crop_conf, 0), "
                   f"{sc(d['R5']['base_score'], a5, 'coalesce(a23_crop_conf, 0)')} "
                   f"FROM {src} WHERE jimok = ANY({J['R5']}) AND {a5} >= {_f(th['R5_crop_m2'])} "
                   f"AND {a5} / GREATEST(area_m2, 1.0) >= {_f(th['R5_crop_ratio'])}")
    parts["R6"] = (f"SELECT 'R6', pnu, emd_cd, a23_bld_in_m2, a23_bld_conf, "
                   f"{sc(d['R6']['base_score'], 'a23_bld_in_m2', 'a23_bld_conf', f'{built} + {many}')} "
                   f"FROM {src} WHERE jimok = ANY({J['R6']}) AND a23_bld_in_m2 >= {_f(th['R6_bld_m2'])}")
    return "\nUNION ALL\n".join(parts[r] for r in RULE_IDS if r in rules)


def eval_sql(th: dict, rules: list[str] | None = None, emd_cd: bool = True) -> str:
    """읍면동 1칸(%(emd_cd)s) 또는 전역 재평가 — 행: rule, pnu, emd_cd, a, c, score(원값 · 반올림은 파이썬 round(x, 1) = s3 와 같게)."""
    where = "WHERE emd_cd = %(emd_cd)s" if emd_cd else ""
    return (f"WITH p AS MATERIALIZED (SELECT * FROM survey_parcels {where})\n"
            f"SELECT rule, pnu, emd_cd, a, c, score FROM ({rule_selects(th, rules)}) q")


def priority_of(score: float, cut: dict) -> str:
    if score >= cut["A"]:
        return "A"
    if score >= cut["B"]:
        return "B"
    return "C"
