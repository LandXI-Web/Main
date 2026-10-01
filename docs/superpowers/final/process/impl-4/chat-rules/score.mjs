/* 실태 31문 전 / 후 — 같은 기준으로 다시 센다(audit.mjs 결과 json 두 벌). 화면 질문만 다시 돈 결과(results-after-console.json)가 있으면 그 줄로 바꾼다
   (전체 재측정 중 다른 작업이 게이트웨이를 다시 띄운 순간에 걸린 두 질문 — 그 사실도 기록한다).
   사용: node docs/superpowers/final/process/impl-4/chat-rules/score.mjs → scores.json + 표(콘솔) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => (fs.existsSync(path.join(HERE, f)) ? JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')) : null);
const before = load('results-before.json'), after = load('results-after.json'), patch = load('results-after-console.json');
const qs = (j) => (j?.results || []).filter((r) => r.q);
const A = qs(after);
const replaced = [];
if (patch) for (const r of qs(patch)) { const i = A.findIndex((x) => x.n === r.n); if (i >= 0) { if (A[i].state === 'failed' || A[i].verdict?.deadend) replaced.push(r.n); A[i] = r; } }

/* 같은 기준(audit.mjs classify 와 같은 규칙 + '물은 것과 다른 일'은 질문마다 원하는 것) */
const REFUSE = /할\s*수\s*없|없습니다|못했습니다|못\s*했습니다|찾지\s*못|아닙니다|아직/;
const CLAIM = /(옮겼|이동했|확대했|축소했|기울였|바꿨|켰습니다|껐습니다|표시했|칠했|그렸|나눠\s*놓았|나란히\s*놓았|켜\s*두었)/;
const NOCHANGE_OK = /이미|못|없어|없습니다|않/;
const EXPECT = {
  '구례군 확대해 줘': (r) => (r.hasMap ? true : /구례군/.test(r.answer + (r.buttons || []).join(' '))),
  '구례군과 남원시 의심 필지 수 비교해 줘': (r) => !/대장/.test(r.answer.split(/(?<=[.다])\s/)[0] || ''),
  '남원시 운봉읍으로 이동해서 비닐하우스 결과만 보여 줘': (r) => /운봉읍/.test(r.answer),
  '기관별 사용량 차트로 보여 줘': (r) => !/AI 도우미|토큰/.test(r.answer),
  '우리 시 현장 확인 필요 필지 몇 건이야?': (r) => /현장 확인 필요/.test(r.answer) && (r.numChips || 0) > 0,
  '대장에서 논인데 AI가 비닐하우스로 본 필지 보여 줘': (r) => /비닐하우스/.test(r.answer) && !/건물로|AI\s*건물|건물\s*근거/.test(r.answer),
  '전역 분석 실행해 줘': (r) => /의뢰|분석 요청/.test((r.confirm || '') + r.answer + (r.buttons || []).join(' ')),
};
const TONE = /프레임|레이어|폴리곤|해\s*주시기\s*바랍니다|죄송|그\s*지도\s*동작은\s*아직\s*할\s*수\s*없습니다/;
function sentences(a) {
  const body = String(a || '').replace(/“[\s\S]*?”/g, '').replace(/「[^」]*」[^\n]*\n/g, '');
  return body.split(/\n+|(?<=[.?!])\s+/).map((s) => s.trim()).filter((s) => s.length > 3).length;   // 문장 끝 = 마침표('못했습니다 — …'는 한 문장)
}
function judge(r) {
  const clickable = (r.chips || 0) + (r.links || 0) + (r.files || 0) + (r.confirm ? 1 : 0) + (r.alt ? 1 : 0);
  const sent = String(r.answer || '').split(/\n+|(?<=[.다])\s+/).map((s) => s.trim()).filter(Boolean);
  const deadend = (REFUSE.test(r.answer) || r.state === 'failed') && clickable === 0 && !(r.map || []).length;
  const claimNo = sent.some((s) => CLAIM.test(s) && !NOCHANGE_OK.test(s)) && !(r.map || []).length && !r.navigated;
  const saidFailDrawn = /그리지\s*못|켜지\s*못|이동하지\s*못|못\s*그렸/.test(r.answer) && (r.map || []).some((m) => /^층 추가/.test(m));
  const silent = +r.acts?.sent > 0 && +r.acts?.done < +r.acts?.sent && !/못|않|확인되지/.test(r.answer);
  const wrong = EXPECT[r.q] ? !EXPECT[r.q](r) : false;
  const tone = TONE.test(r.answer) || (!/“|「/.test(r.answer) && sentences(r.answer) > 2);   // 두 문장 안(법령 원문 · 표 제외 — 규칙 ⑥)
  return { deadend, mismatch: claimNo || saidFailDrawn || silent, wrong, tone, why: [deadend && '막다른 답', claimNo && '말했는데 지도 변화 0', saidFailDrawn && '못 그렸다는데 그려짐', silent && '끝 신호 없이 말 없음', wrong && '물은 것과 다른 일', tone && '말투(내부 말 · 떠넘김 · 길이)'].filter(Boolean) };
}
const B = qs(before);
const rows = B.map((b) => {
  const a = A.find((x) => x.n === b.n) || {};
  return { n: b.n, screen: b.screen, q: b.q, before: { answer: b.answer, buttons: b.buttons, llm: b.llm, ...judge(b) }, after: { answer: a.answer, buttons: a.buttons, alt: a.alt, llm: a.llm, ...judge(a) } };
});
const tally = (k, side) => rows.filter((r) => r[side][k]).length;
const sum = { questions: rows.length,
  before: { deadend: tally('deadend', 'before'), mismatch: tally('mismatch', 'before'), wrong: tally('wrong', 'before'), tone: tally('tone', 'before'), llm: rows.filter((r) => r.before.llm).length },
  after: { deadend: tally('deadend', 'after'), mismatch: tally('mismatch', 'after'), wrong: tally('wrong', 'after'), tone: tally('tone', 'after'), llm: rows.filter((r) => r.after.llm).length },
  after_console_rerun: patch ? { at: patch.summary?.at, replaced_failed: replaced, llm: qs(patch).filter((r) => r.llm).length } : null,
  design_audit_1001_11h: { deadend: 9, mismatch: 5, wrong: 4, note: '설계 7차 audit.md(손으로 셈 · 같은 31문)' } };
fs.writeFileSync(path.join(HERE, 'scores.json'), JSON.stringify({ summary: sum, rows }, null, 1));
console.log(JSON.stringify(sum, null, 1));
const cut = (s, n = 70) => String(s || '').replace(/\s+/g, ' ').slice(0, n) + (String(s || '').length > n ? '…' : '');
for (const r of rows) console.log(`| ${r.n} | ${r.q} | ${r.before.why.join(' · ') || '—'} | ${r.after.why.join(' · ') || '—'} | ${cut(r.after.answer)} |`);
