// XI ChatGEO 시나리오 질문 탐침 (원칙 305 · 10-21). 묻고 기록만 한다 — 판정 · 코드 수정 · 개선 후보 변경 없음.
// 사용: node probe.mjs   (OUT_DIR · MAX · SMOKE 환경변수로 조절)
// 보내는 방식: 로그인 폼 세션으로 XI맵(xi-clean) 화면을 열고 채팅 입력칸에 쳐서 보낸다(화면이 보내는 context 그대로).
//   시험 표시: sessionStorage 'lx.chat.test'=1 → context.test → 서버가 답 번호를 run_test… 로 매겨 개선 대기열이 모으지 않는다(agent.py · improve.RUN_ID).
// 비밀번호는 frontDoor 가 server/.env 에서 읽는다(출력 안 함). 토큰 · 쿼리 문자열은 기록하지 않는다.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';
import { rng, genOf, fam10, longLoad, F6, F7, F8, F9, CHAINS, KGZ } from './bank.mjs';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || HERE; fs.mkdirSync(OUT, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const MAX = +(process.env.MAX || 400), HOURS = 3, T0 = Date.now(), WAIT_MS = 150000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = rng(20261021);
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const PERS = {
  staff: { base: 'https://app.land-xi.dev', login: 'test@lx.or.kr', url: '/landxi/v3/xi-clean/?region=52190' },
  namwon: { base: 'https://namwon.land-xi.dev', login: 'lxadmin@lx.or.kr#namwon', url: '/landxi/v3/xi-clean/?region=52190' },
  gj: { base: 'https://gwangju-jeonnam.land-xi.dev', login: 'lxadmin@lx.or.kr#gwangju-jeonnam', url: '/landxi/v3/xi-clean/' },
  kgz: { base: 'https://kgz-agri.land-xi.dev', login: 'lxadmin@lx.or.kr#kgz-agri', url: '/landxi/v3/xi-clean/' },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const S = {};   // persona 상태 {ctx,page,asked,dead}
async function openPage(p) {
  const C = PERS[p];
  await S[p].page.goto(C.base + C.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await S[p].page.waitForFunction(() => document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 });
  await sleep(2500); S[p].sinceReload = 0;
}
async function boot(p) {
  if (S[p]?.dead) return false;
  if (S[p]?.page) return true;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('lx.chat.test', '1'); } catch { /* */ } });
    const page = await ctx.newPage(); S[p] = { ctx, page, asked: 0, sinceReload: 0, lastRun: null, dead: false };
    await frontDoor(page, PERS[p].base, PERS[p].login); await sleep(800);
    await openPage(p); return true;
  } catch (e) { console.log('persona boot fail', p, String(e).slice(0, 120)); if (S[p]) S[p].dead = true; else S[p] = { dead: true }; return false; }
}

const gpuNote = [];
function gpuCheck(label) {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    try { samples.push(execFileSync('nvidia-smi', ['--query-gpu=index,utilization.gpu,power.draw', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim().split('\n').map((l) => l.split(',').map((x) => +x.trim()))); } catch { break; }
    if (i < 5) execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 5']);
  }
  if (!samples.length) return { label, ok: true, note: 'nvidia-smi 없음' };
  const cards = {}; for (const s of samples) for (const [i, u, w] of s) { (cards[i] ||= { u: [], w: [] }); cards[i].u.push(u); cards[i].w.push(w); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sum = Object.entries(cards).map(([i, c]) => ({ gpu: +i, util_avg: +avg(c.u).toFixed(0), watt_avg: +avg(c.w).toFixed(0), watt_max: Math.max(...c.w) }));
  const ok = sum.every((c) => c.util_avg <= 70 && c.watt_avg <= 140 && c.watt_max <= 200);
  return { label, ok, sum };
}

/** 한 질문 보내고 끝까지 받기 */
async function ask(p, meta) {
  const st = S[p]; const page = st.page; const q = meta.q;
  const rec = { n: ++N, persona: p, family: meta.f, intent_tag: meta.tag, question: q, sent_at: null, ms_to_first: null, ms_total: null, answer_text: '', map_actions: [], buttons: [], error: null, run_id: null, test_marked: false };
  try {
    const inp = page.locator('.k-ck-i').first(); await inp.click({ timeout: 15000 }); await inp.fill(q);
    const wr = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/agent/runs'), { timeout: 7000 }).catch(() => null);
    rec.sent_at = new Date().toISOString(); const ts = Date.now(); await inp.press('Enter');
    const resp = await wr; const tPost = Date.now() - ts;
    if (!resp) {                                   // 장소 · 지번 질문은 화면이 모델을 거치지 않고 바로 움직인다(원칙 276)
      await sleep(2500);
      const ui = await page.evaluate(() => ({ t: (document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || document.querySelector('.k-chat-a')?.innerText || '').trim(), picks: [...document.querySelectorAll('.k-chat-pick')].map((b) => b.innerText.trim().slice(0, 40)).slice(0, 5) }));
      rec.answer_text = ui.t.slice(0, 600); rec.buttons = ui.picks; rec.ms_total = Date.now() - ts; rec.map_actions = ['(화면이 직접 처리 — 모델 안 거침)']; rec.error = null; rec.screen_only = true;
      return rec;
    }
    const body = await resp.json().catch(() => null);
    if (!resp.ok()) { rec.error = `POST ${resp.status()} ${body?.error?.code || ''} ${String(body?.error?.message || '').slice(0, 120)}`; rec.answer_text = String(body?.error?.message || '').slice(0, 600); rec.ms_total = Date.now() - ts; return rec; }
    const id = body?.run?.id; rec.run_id = id || null; rec.test_marked = !!id && id.startsWith('run_test');
    const res = await page.evaluate(async ({ id, max }) => {
      const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const h = s ? { authorization: 'Bearer ' + s.token } : {};
      const t0 = performance.now(); let last = null, first = null, fin = null, done = false; const ops = [], tools = [], o = { text: '', next: [], blocks: [], events: [] };
      while (performance.now() - t0 < max) {
        try {
          const r = await fetch('/api/v1/agent/runs/' + encodeURIComponent(id) + '/events' + (last ? '?after=' + encodeURIComponent(last) : ''), { headers: h });
          if (r.status >= 500) { o.http = r.status; }
          else if (r.ok) {
            const j = await r.json();
            for (const it of j.items || []) {
              last = it.id; const d = it.data || {}; o.events.push(it.event);
              if (first === null && (it.event === 'agent.token' || /done|rejected|failed/.test(it.event))) first = performance.now() - t0;
              if (it.event === 'agent.tool.call' && d.tool) tools.push(d.tool);
              if (it.event === 'agent.tool.result') for (const a of d.ui_actions || []) ops.push(a.op);
              if (it.event === 'agent.done') { o.text = d.answer_md || ''; o.next = (d.next || []).map((b) => b.label); if (d.alt?.label) o.alt = d.alt.label; o.blocks = (d.blocks || []).map((b) => b.type + (b.label ? ':' + String(b.label).slice(0, 30) : '')); fin = performance.now() - t0; }
              if (it.event === 'agent.rejected') { o.text = d.message || ''; o.next = (d.next || []).map((b) => b.label); o.rej = true; fin = performance.now() - t0; }
              if (it.event === 'agent.failed') { o.fail = d.message || d.reason || 'failed'; fin = performance.now() - t0; }
            }
            if (j.done) { done = true; break; }
          }
        } catch { /* 다시 */ }
        await new Promise((ok) => setTimeout(ok, 300));
      }
      return { ...o, ops, tools, first, fin, done, total: performance.now() - t0 };
    }, { id, max: WAIT_MS });
    rec.ms_to_first = res.first == null ? null : Math.round(tPost + res.first); rec.ms_total = Math.round(tPost + (res.fin ?? res.total));
    rec.answer_text = String(res.text || res.fail || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    rec.map_actions = [...new Set(res.ops)]; rec.tools = [...new Set(res.tools)];
    rec.buttons = [...(res.next || []), ...(res.alt ? ['(대신) ' + res.alt] : []), ...(res.blocks || [])];
    rec.rejected = !!res.rej;
    if (res.fail) rec.error = 'failed: ' + String(res.fail).slice(0, 100);
    else if (!res.done) rec.error = 'timeout';
    else if (res.http) rec.error = 'http ' + res.http + ' (조회 중)';
    st.lastRun = id; await sleep(1500);
  } catch (e) { rec.error = 'script: ' + String(e).slice(0, 120); rec.ms_total = rec.ms_total ?? 0; }
  return rec;
}

/* ── 중복 방지 ─────────────────────────────────────────────── */
const normT = (s) => s.toLowerCase().replace(/[\s?.,!~'"]/g, '').replace(/[은는이가을를에의도만로과와]/g, '');
const bigrams = (s) => { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; };
const asked = [];     // {norm,bg}
const tags = new Set(), keys = new Set();
const similar = (n) => { const bg = bigrams(n); for (const a of asked) { if (a.norm === n) return true; let i = 0; for (const x of bg) if (a.bg.has(x)) i++; const u = bg.size + a.bg.size - i; if (u && i / u > 0.85) return true; } return false; };
function accept(meta) {
  const n = normT(meta.q); const tag = meta.tag; const key = meta.key || n;
  if (tags.has(tag) || keys.has(key) || similar(n)) return false;
  tags.add(tag); keys.add(key); asked.push({ norm: n, bg: bigrams(n) }); return true;
}

/* ── 질문 고르기 ───────────────────────────────────────────── */
const CYC = ['staff', 'namwon', 'staff', 'namwon', 'gj', 'staff', 'namwon', 'gj'];
let cyc = 0; const nextP = () => { for (let k = 0; k < 8; k++) { const p = CYC[cyc++ % CYC.length]; if (!S[p]?.dead) return p; } return 'staff'; };
const pools = { 6: shuffle(F6), 7: shuffle(F7), 8: shuffle(F8), 9: shuffle(F9) }; let chainIx = 0; const kgzQ = KGZ.slice(); let nF9 = 0;
const tagOf = (f, m, p) => `${f}|${m.target}/${m.kind || ''}|${m.rgType || 'none'}|${p}|${m.style || 'easy'}`;
function candidate(f) {
  for (let tries = 0; tries < 60; tries++) {
    const p = nextP(); let m;
    if (f <= 5) { m = genOf(f, R, p); }
    else if (f === 10) { m = tries % 9 === 8 ? longLoad(R) : fam10(R, p); }
    else if (f === 9 && nF9 % 3 === 2 && chainIx < CHAINS.length) { return { chain: CHAINS[chainIx++], p: nextP(), f: 9 }; }
    else { const q = pools[f].shift(); if (!q) return null; m = { target: q, kind: '', region: '', rgType: 'none', style: /[a-z]{4}/i.test(q) && !/[가-힣]/.test(q) ? 'en' : q.length < 8 ? 'short' : 'easy', q, key: normT(q) }; }
    if (f === 9) nF9++;
    if (!m) continue; m.f = f; m.tag = tagOf(f, m, p);
    if (accept(m)) return { m, p, f };
  }
  return null;
}

/* ── 기록 · 갈래 ──────────────────────────────────────────── */
const JL = path.join(OUT, 'questions.jsonl'); fs.writeFileSync(JL, '');
let N = 0, lastNewN = 0; const seen = new Set(), famN = {}, famNew = {}, famSince = {}, famDone = new Set(), curve = [], outcomes = {}, consecErr = { c: 0 };
function outcome(r) {
  if (r.error === 'timeout') return 'timeout'; if (r.error) return 'error'; if (r.screen_only) return 'screen';
  const t = r.answer_text, f = [];
  if (r.rejected) f.push('rej');
  if (r.map_actions.length) f.push('map');
  if (/\d/.test(t) && /(곳|건|필지|㏊|ha|㎡|개|%|위|동)/.test(t)) f.push('num');
  if (/(없습니다|수 없|못 |볼 수 없|어렵|지원하지|드릴 수 없|확인되지|않습니다|cannot|can't)/i.test(t)) f.push('refuse');
  return f.sort().join('+') || (t ? 'text' : 'empty');
}
function record(r) {
  const o = outcome(r); r.outcome = o; const key = `${r.family}|${r.persona}|${o}`; const isNew = !seen.has(key); seen.add(key); r.new_branch = isNew;
  outcomes[o] = (outcomes[o] || 0) + 1; famN[r.family] = (famN[r.family] || 0) + 1;
  if (isNew) { lastNewN = r.n; famNew[r.family] = (famNew[r.family] || 0) + 1; famSince[r.family] = 0; } else famSince[r.family] = (famSince[r.family] || 0) + 1;
  fs.appendFileSync(JL, JSON.stringify(r) + '\n');
  if (r.error) consecErr.c++; else consecErr.c = 0;
  console.log(r.n, r.persona, 'F' + r.family, o, isNew ? 'NEW' : '', (r.ms_total / 1000).toFixed(1) + 's', r.question.slice(0, 40));
}
function progress(status) {
  curve.push([N, seen.size]);
  const md = `# 진행 (${new Date().toISOString().slice(0, 16)})\n\n- 질문 수: ${N} / ${MAX} · 경과 ${((Date.now() - T0) / 60000).toFixed(0)}분\n- 가족별: ${Object.keys(famN).sort((a, b) => a - b).map((f) => `F${f}=${famN[f]}${famDone.has(+f) ? '(멈춤)' : ''}`).join(' · ')}\n- 결과 갈래(가족·페르소나·결과 짝) 누적: ${seen.size} · 마지막으로 새 갈래가 나온 질문 번호: ${lastNewN}\n- 새 갈래 곡선(질문 수 → 누적 갈래): ${curve.map(([a, b]) => `${a}→${b}`).join(', ')}\n- 결과 분포: ${Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(' · ')}\n- GPU: ${gpuNote.map((g) => `[${g.label}] ${g.ok ? '이상 없음' : '초과'} ${JSON.stringify(g.sum || g.note)}`).slice(-2).join(' / ')}\n- 멈춤 상태: ${status}\n`;
  fs.writeFileSync(path.join(OUT, 'progress.md'), md);
}

/* ── 본 순서 ──────────────────────────────────────────────── */
let stopWhy = null; const fams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; let fi = 0, askedCount = 0;
async function run1(p, m) {
  if (!(await boot(p))) return null;
  if (S[p].sinceReload >= 12 && !m.chainMid) { try { await openPage(p); } catch { /* 아래 질문이 실패로 남는다 */ } }
  const r = await ask(p, m); S[p].sinceReload++;
  if (r.error && /script|timeout/.test(r.error)) { try { await openPage(p); } catch { /* */ } }
  record(r); return r;
}
while (!stopWhy) {
  if (N >= MAX) { stopWhy = `(b) 질문 ${MAX}개에 도달`; break; }
  if ((Date.now() - T0) / 3600000 >= HOURS) { stopWhy = '(c) 3시간 경과'; break; }
  if (N - lastNewN >= 40 && N > 0) { stopWhy = `(a) 최근 40개 질문에서 새 결과 갈래 없음 (마지막 새 갈래 = ${lastNewN}번)`; break; }
  if (consecErr.c >= 5) { stopWhy = '공개 사이트 오류/시간초과 5회 연속 — 중단'; break; }
  const live = fams.filter((f) => !famDone.has(f)); if (!live.length) { stopWhy = '모든 가족이 멈춤(가족별 15개 무신규 또는 은행 소진)'; break; }
  const f = live[fi++ % live.length];
  if (N % 30 === 29 && kgzQ.length && !S.kgz?.dead) {            // 해외 기관은 드물게 — 영어 · 단순 질문
    const [kf, q] = kgzQ.shift(); const m = { f: kf, q, target: q, kind: '', rgType: 'none', style: 'en', key: normT(q) }; m.tag = tagOf(kf, m, 'kgz');
    if (accept(m)) { await run1('kgz', m); await sleep(2000 + R() * 2000); }
    continue;
  }
  const c = candidate(f);
  if (!c) { famDone.add(f); continue; }
  if (c.chain) {
    const [base, fol] = c.chain; const seq = [base, ...fol];
    for (let i = 0; i < seq.length; i++) {
      const m = { f: 9, q: seq[i], target: seq[i], kind: i ? 'followup' : 'chainbase', rgType: 'none', style: 'chain', key: normT(seq[i]), chainMid: i < seq.length - 1 }; m.tag = tagOf(9, m, c.p);
      if (!accept(m)) continue; await run1(c.p, m); await sleep(2000 + R() * 2000);
    }
  } else { await run1(c.p, { ...c.m, f: c.f }); await sleep(2000 + R() * 2000); }
  if ((famSince[f] || 0) >= 15) { famDone.add(f); }
  if (N - askedCount >= 20) {
    askedCount = N; const g = gpuCheck('q' + N); gpuNote.push(g);
    if (!g.ok) { console.log('GPU 초과 — 60초 쉼'); await sleep(60000); }
    progress('진행 중');
  }
}
progress('멈춤: ' + stopWhy);
fs.writeFileSync(path.join(OUT, 'STOP.md'), `# 멈춘 이유\n\n- ${stopWhy}\n- 질문 ${N}개 · 경과 ${((Date.now() - T0) / 60000).toFixed(0)}분 · 결과 갈래 ${seen.size}개 · 마지막 새 갈래 ${lastNewN}번\n- 가족별: ${Object.keys(famN).sort((a, b) => a - b).map((f) => `F${f}=${famN[f]}`).join(' · ')}\n- 가족별 멈춤: ${[...famDone].join(', ') || '없음'}\n- 페르소나 중 로그인 못 한 곳: ${Object.entries(S).filter(([, v]) => v.dead).map(([k]) => k).join(', ') || '없음'}\n`);
await browser.close();
console.log('STOP', stopWhy);
