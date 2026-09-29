/* summary.js — 대표 수치 한 출처(`GET /api/v1/summary` · 계약 docs/superpowers/final/fix/fix-server-summary.md §계약).
   게스트 메인 · 영업 카탈로그 · 서비스 상세가 같은 모듈을 읽는다 → 같은 카드 · 같은 지역 = 같은 상태 · 같은 수.
   - 상태 칩 = 요약의 `stage`(운영 · 시범 · 첫 결과 전) 그대로(→ 키트 상태 키 ga · pilot · none).
   - 카드 숫자 = `metrics.detected`(AI 탐지) · 큰 숫자 = `metrics.field_check`(현장 확인 필요). value 가 null 이면 숫자를 싣지 않는다(0 을 지어내지 않음).
   - 요약 경로가 아직 없거나 실패하면 null — 화면은 숫자 없이 상태만(배포 기록 값 · 정적 사본 값을 숫자로 대신 쓰지 않는다).
   (공용 위치는 키트가 맞다 — 보고서 '요청': kit 로 옮기기) */
import { api, hasRoute, isEnvelope, session } from '../kit/util.js';

const STAGE = { '운영': 'ga', '시범': 'pilot', '첫 결과 전': 'none' };
/** 요약 stage → 키트 상태 키(ga · pilot · none) · 모르는 값은 null */
export const stageKey = (stage) => STAGE[String(stage || '').trim()] ?? null;

const memo = new Map();
/** 요약 한 벌(세션이면 기관 범위 · 없으면 공개분). 경로가 없거나 실패 → null */
export function loadSummary(q = {}) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const key = (session.get() ? 's:' : 'g:') + qs;
  if (!memo.has(key)) memo.set(key, (async () => {
    if (!(await hasRoute('/summary'))) return null;
    try {
      const j = await api('/summary' + (qs ? '?' + qs : ''));
      return Array.isArray(j?.items) ? j : null;
    } catch { return null; }
  })());
  return memo.get(key);
}

const nz = (s) => String(s || '').replace(/\s+/g, '');
/** 카드(와 배포본)에 맞는 요약 항목 — 같은 카드 중 ① 같은 시군구 ② 같은 기관 ③ 같은 지역 이름 ④ 단계가 앞선 첫 항목 */
export function itemFor(S, cardId, deploy = null, { strict = false } = {}) {
  const mine = (S?.items || []).filter((i) => i.card === cardId);
  if (!mine.length) return null;
  if (deploy) {
    const hit = (deploy.sgg_cd && mine.find((i) => String(i.sgg_cd) === String(deploy.sgg_cd)))
      || (deploy.tenant_id && mine.find((i) => i.tenant === deploy.tenant_id))
      || (deploy.region_name?.ko && mine.find((i) => nz(i.region_name) === nz(deploy.region_name.ko)));
    if (hit || strict) return hit || null;
  }
  const R = { ga: 0, pilot: 1, none: 2 };
  return [...mine].sort((a, b) => (R[stageKey(a.stage)] ?? 3) - (R[stageKey(b.stage)] ?? 3))[0];
}

/** 항목의 지표 봉투(값이 있을 때만) — key: detected · field_check · review_pending · reports */
export function metric(item, key) {
  const m = item?.metrics?.[key];
  if (!m || m.value === null || m.value === undefined || !Number.isFinite(+m.value)) return null;
  const env = { ...m, value: +m.value };
  if (isEnvelope(env)) return env;
  /* 모양이 모자라면 채운다 — 기준(basis)을 모르면 추정치로(확인됨으로 올려 적지 않는다) */
  return { ...env, unit: String(m.unit ?? ''), basis: ['measured', 'estimate', 'inferred', 'recorded', 'history'].includes(m.basis) ? m.basis : 'estimate', as_of: String(m.as_of || item.as_of || ''), source: String(m.source || '') };
}

/** 카드 한 장에 싣는 배포본 모양 — 상태·수는 요약에서만(배포 기록의 scale 은 숫자 자리에 쓰지 않는다) */
export function scaleOf(item) { return metric(item, 'detected'); }

/* ── 화면 이름 · 사용자 말(용어표 E:/Land-XI 플랫폼/CLAUDE.md §2) ──
   카드 이름 · 모듈 이름은 서버 등록부/카드 원천에서 온다 — 원천이 고쳐지기 전까지 화면에 보일 때만 용어표 말로 바꾼다. */
const TERMS = [[/판독/g, 'AI 분석'], [/반입/g, '데이터 올리기'], [/검수/g, '결과 확인'], [/조립/g, '서비스 만들기'], [/이식/g, '다른 지역에 적용'], [/발행/g, '서비스 공개']];
export const userWords = (s) => TERMS.reduce((a, [re, to]) => a.replace(re, to), String(s ?? ''));
