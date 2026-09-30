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


@lru_cache(maxsize=1)
def operand_map() -> dict:
    """rules/_operands.yaml — 모델 클래스 → 피연산자 키 · 피연산자 열 → {ai, legacy}(contract-parcel-ai.md §4)."""
    return yaml.safe_load((RULES_DIR / "_operands.yaml").read_text(encoding="utf-8"))


def class_key(cls: str | None, cls_en: str | None = None) -> str:
    """detections.cls / cls_en → 피연산자 키(bld|crop|park|gh) · 대응표에 없으면 cls_en(없으면 cls) 그대로."""
    for k, names in (operand_map().get("classes") or {}).items():
        if cls in names or cls_en in names:
            return k
    return (cls_en or cls or "").strip() or "unknown"


def legacy_src(where: str = "") -> str:
    """정본 적재(옛 열) → 피연산자 열. 규칙 SQL 은 이 이름만 읽는다."""
    cols = ", ".join(f"coalesce({v['legacy']}, 0)::float8 AS {k}" if not k.endswith("_conf") else f"{v['legacy']} AS {k}"
                     for k, v in operand_map()["operands"].items())
    return f"SELECT pnu, emd_cd, jimok, area_m2, nongup, {cols} FROM survey_parcels {where}"


def ai_src(where: str = "") -> str:
    """전국 경로 — survey_parcel_ai(%(job)s · %(sgg)s)를 필지별로 펼친 피연산자 열. where 는 survey_parcels 조건(sp.)."""
    ops = operand_map()["operands"]
    agg, outer = [], []
    fields = {"in_m2": "sum(in_m2)", "hit_m2": "sum(hit_m2)", "n": "sum(n)", "conf": "max(conf)"}
    for k, v in ops.items():
        a = v.get("ai")
        if not a or a.startswith("ratio."):
            continue
        key, f = a.split(".")
        agg.append(f"{fields[f]} FILTER (WHERE cls = '{key}') AS {k}")
        outer.append(f"a.{k}" if f == "conf" else f"coalesce(a.{k}, 0)::float8 AS {k}")
    for k, v in ops.items():
        a = v.get("ai")
        if a == "ratio.bld":
            outer.append(f"round(least(coalesce(a.bld_hit, 0) / greatest(sp.area_m2, 1.0), 1)::numeric, 3)::float8 AS {k}")
        elif a == "ratio.farm":
            outer.append(f"round(least((coalesce(a.crop_hit, 0) + coalesce(a.gh_hit, 0)) / greatest(sp.area_m2, 1.0), 1)::numeric, 3)::float8 AS {k}")
        elif not a:
            outer.append(f"NULL::float8 AS {k}" if k.endswith("_conf") else f"0::float8 AS {k}")
    return (f"SELECT sp.pnu, sp.emd_cd, sp.jimok, sp.area_m2, sp.nongup, {', '.join(outer)} FROM survey_parcels sp "
            f"LEFT JOIN (SELECT pnu, {', '.join(agg)} FROM survey_parcel_ai WHERE job_id = %(job)s AND sgg_cd = %(sgg)s GROUP BY pnu) a "
            f"USING (pnu) {where}")


def rule_selects(th: dict, rules: list[str] | None = None, src: str = "p") -> str:
    """rule · pnu · a(근거면적) · c(신뢰도) · score 를 내는 UNION ALL — FROM {src}(피연산자 열 · operand_map)."""
    d = _load()
    rules = rules or RULE_IDS
    J = {r: _arr(d[r]["jimok"]) for r in RULE_IDS}
    r1 = f"(jimok = ANY({J['R1']}) AND bld_in >= {_f(th['R1_bld_m2'])})"
    parts = {}
    promo = "CASE WHEN nongup = '농업진흥구역' THEN 8 ELSE 0 END"
    many = "CASE WHEN coalesce(bld_n,0) + coalesce(park_n,0) >= 3 THEN 3 ELSE 0 END"
    built = "CASE WHEN chg_new > 0 THEN 10 ELSE 0 END"

    def sc(base, a, c, bonus="0"):
        return f"{base} + LEAST(25.0, 8 * log(GREATEST({a}, 1.0))) + {_conf(c)} + {bonus}"

    parts["R1"] = (f"SELECT 'R1'::text AS rule, pnu, emd_cd, bld_in AS a, bld_conf AS c, "
                   f"{sc(d['R1']['base_score'], 'bld_in', 'bld_conf', f'{promo} + {built} + {many}')} AS score "
                   f"FROM {src} WHERE {r1}")
    a2 = "(area_m2 * (1 - r_farm))"
    parts["R2"] = (f"SELECT 'R2', pnu, emd_cd, {a2}, crop_conf, "
                   f"{sc(d['R2']['base_score'], a2, 'crop_conf', promo + ' + CASE WHEN e2_uncrop_hit > 0 THEN 12 WHEN e2_crop_hit > 0 THEN -15 ELSE 0 END')} "
                   f"FROM {src} WHERE jimok = ANY({J['R2']}) AND area_m2 >= {_f(th['R2_parcel_min_m2'])} AND r_farm < {_f(th['R2_crop_ratio_max'])} "
                   f"AND r_bld < {_f(th['R2_bld_ratio_max'])} AND NOT {r1}")
    a3 = "(CASE WHEN e2_gh_in >= gh_in THEN e2_gh_in ELSE gh_in END)"
    c3 = "(CASE WHEN e2_gh_in >= gh_in THEN e2_gh_conf ELSE gh_conf END)"
    parts["R3"] = (f"SELECT 'R3', pnu, emd_cd, {a3}, {c3}, "
                   f"{sc(d['R3']['base_score'], a3, c3, 'CASE WHEN gh_in > 0 AND e2_gh_in > 0 THEN 8 ELSE 0 END')} "
                   f"FROM {src} WHERE jimok = ANY({J['R3']}) AND GREATEST(gh_in, e2_gh_in) >= {_f(th['R3_gh_m2'])}")
    parts["R4"] = (f"SELECT 'R4', pnu, emd_cd, park_in, park_conf, "
                   f"{sc(d['R4']['base_score'], 'park_in', 'park_conf', f'{promo} + {many}')} "
                   f"FROM {src} WHERE jimok = ANY({J['R4']}) AND park_in >= {_f(th['R4_park_m2'])}")
    a5 = "(crop_hit + GREATEST(gh_hit, e2_gh_hit))"
    parts["R5"] = (f"SELECT 'R5', pnu, emd_cd, {a5}, coalesce(crop_conf, 0), "
                   f"{sc(d['R5']['base_score'], a5, 'coalesce(crop_conf, 0)')} "
                   f"FROM {src} WHERE jimok = ANY({J['R5']}) AND {a5} >= {_f(th['R5_crop_m2'])} "
                   f"AND {a5} / GREATEST(area_m2, 1.0) >= {_f(th['R5_crop_ratio'])}")
    parts["R6"] = (f"SELECT 'R6', pnu, emd_cd, bld_in, bld_conf, "
                   f"{sc(d['R6']['base_score'], 'bld_in', 'bld_conf', f'{built} + {many}')} "
                   f"FROM {src} WHERE jimok = ANY({J['R6']}) AND bld_in >= {_f(th['R6_bld_m2'])}")
    # 열 이름은 첫 SELECT(R1)에만 있다 — R1 을 뺀 규칙 묶음(서비스에서 고른 규칙만 · r3-train)도 같은 열 이름이 되게 감싼다
    body = "\nUNION ALL\n".join(parts[r] for r in RULE_IDS if r in rules)
    return f"SELECT * FROM ({body}) u(rule, pnu, emd_cd, a, c, score)"


def eval_sql(th: dict, rules: list[str] | None = None, emd_cd: bool = True) -> str:
    """정본 적재(옛 열) — 읍면동 1칸(%(emd_cd)s) 또는 전역 재평가. 행: rule, pnu, emd_cd, a, c, score(원값 · 반올림은 파이썬 round(x, 1))."""
    where = "WHERE coalesce(src, 'canon') = 'canon'" + (" AND emd_cd = %(emd_cd)s" if emd_cd else "")   # 옛 열은 정본 적재 행에만
    return (f"WITH p AS MATERIALIZED ({legacy_src(where)})\n"
            f"SELECT rule, pnu, emd_cd, a, c, score FROM ({rule_selects(th, rules)}) q")


def eval_sql_ai(th: dict, rules: list[str] | None = None, emd_cd: bool = False) -> str:
    """전국 경로 — 시군구 %(sgg)s · AI 작업 %(job)s(· 읍면동 %(emd_cd)s). 같은 규칙 SQL 을 survey_parcel_ai 피연산자로 평가."""
    where = ("WHERE sp.sgg_cd = %(sgg)s" + (" AND sp.emd_cd = %(emd_cd)s" if emd_cd else "")
             # 분석 범위 안 필지만(survey_sgg.coverage · NULL = 전역) — AI 가 보지 않은 필지에 '부재' 규칙이 켜지지 않게
             + " AND ((SELECT coverage FROM survey_sgg WHERE sgg_cd = %(sgg)s) IS NULL"
               " OR ST_Intersects((SELECT coverage FROM survey_sgg WHERE sgg_cd = %(sgg)s), ST_PointOnSurface(sp.geom)))")
    return (f"WITH p AS MATERIALIZED ({ai_src(where)})\n"
            f"SELECT rule, pnu, emd_cd, a, c, score FROM ({rule_selects(th, rules)}) q")


def priority_of(score: float, cut: dict) -> str:
    if score >= cut["A"]:
        return "A"
    if score >= cut["B"]:
        return "B"
    return "C"
