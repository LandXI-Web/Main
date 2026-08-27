#!/usr/bin/env node
/**
 * v3 leg 러너 — anchors-v3.json 의 motion_prompt 를 토씨 그대로 써서
 * A0n.png(head) → A0(n+1).png(tail) 5초 클립을 kling/v2-1-pro 로 뽑는다.
 *
 *   node tools/kie/legs-v3.mjs run 1 2 3        # leg 번호
 *   node tools/kie/legs-v3.mjs post 1 2 3       # 스크럽 인코딩 + 검수 프레임 + 씸 프레임
 *   node tools/kie/legs-v3.mjs sheet 1 2 3      # 3행 × (6 프레임 + 다음 앵커) 콘택트 시트
 *   LEGS_V3_REV=3 LEGS_V3_BATCH=4-6 node tools/kie/legs-v3.mjs run 4 5 6   # leg 4–6 (2026-08-27)
 *   LEGS_V3_REV=3 LEGS_V3_BATCH=4-6b LEGS_V3_PREV=rev1 LEGS_V3_CAP=220 node tools/kie/legs-v3.mjs run 4 5 6 6b
 *       # leg 4·5·6·6b (2026-08-27 "D1 그대로, D2 go") — 13앵커 체인(A06→A06b→A07), 이전 4-6 산출물은 *.rev1.mp4
 *   LEGS_V3_REV=3 LEGS_V3_BATCH=7 LEGS_V3_CAP=60 node tools/kie/legs-v3.mjs run 7
 *   LEGS_V3_REV=3 LEGS_V3_BATCH=7 node tools/kie/legs-v3.mjs fetch 7 [taskId]
 *       # 회선 끊김 등으로 폴링이 죽었을 때: 이미 과금된 taskId 의 결과만 recordInfo 로 가져온다 (새 createTask 없음, 과금 0)
 *       # taskId 를 생략하면 원장의 그 leg(같은 rev/batch) 최신 pending 줄을 쓴다.
 *       # run 은 createTask 직후(폴링 전) 원장에 state:"pending" 줄을 먼저 적고, 완료 시 같은 줄을 갱신한다.
 *       # leg 7 (2026-08-27 "D7 GO") — A07(rev.3e)→A08, 캡 60, 정확히 1회. 시트는 v3-leg-7-sheet.jpg (1행 × 7)
 *
 * 규칙(2026-08-26 클라이언트): leg 당 생성 정확히 1회, 자동 재시도 없음, 캡 160.
 * 매 호출 전후 잔액을 shots/kie/legs-v3-credits.json 에 기록.
 * 오류가 났고 잔액이 그대로일 때만(과금 0) 그 호출을 1회 다시 시도한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { video, credits, waitTask, download, promptHash, ledgerLatestPending } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/kie/anchors-v3.json'), 'utf8'));
const ANCH = path.join(ROOT, 'landxi/assets/proto/film/legs/anchors-v3');
const GEN = path.join(ROOT, 'landxi/assets/proto/film/legs/gen');
const SRC = path.join(ROOT, 'landxi/assets/proto/film/legs/src');
const SHOTS = path.join(ROOT, 'shots/kie');
const LEDGER = path.join(SHOTS, 'legs-v3-credits.json');
const CAP = Number(process.env.LEGS_V3_CAP || 160);
const PER = 50;
// rev.3 (2026-08-26, 클라이언트 "go"): 앵커 A02 v3b / A03 v3c / A04 v3b 확정 후 leg 1–3 재생성.
// LEGS_V3_REV=3 으로 실행하면 이전 rev 산출물을 *.rev2.mp4 로 백업하고, 1회/캡 규칙은 rev 별로 센다.
const REV = Number(process.env.LEGS_V3_REV || 2);
// LEGS_V3_PREV 로 백업 접미사를 지정할 수 있다(batch 4-6b 는 4-6 산출물을 .rev1 로 보관).
const PREV = process.env.LEGS_V3_PREV || `rev${REV - 1}`;
// 배치(2026-08-27, 클라이언트 "go"): leg 4–6 은 같은 rev.3 앵커지만 별도 캡(160)으로 센다.
// LEGS_V3_BATCH=4-6 으로 실행. 1회/캡 규칙과 시트 이름은 (rev, batch) 별.
const BATCH = process.env.LEGS_V3_BATCH || '1-3';
const runsOfRev = (l) => l.runs.filter((r) => (r.rev || 2) === REV && (r.batch || '1-3') === BATCH);
const spentOfRev = (l) => Number(runsOfRev(l).reduce((s, x) => s + (x.credits_charged || 0), 0).toFixed(2));
const TS = [0, 1, 2, 3, 4, 4.85];
// kling/v2-1-pro 는 negative_prompt 500자 상한 (createTask "Input exceeds maximum length", 무과금).
// anchors-v3.json 의 negative 는 677~830자라 마지막 쉼표 경계에서 500자로 자른다. motion_prompt 는 손대지 않는다.
const NEG_MAX = 500;
// 자르는 방식: 앵커 고유 항목(negative_base 뒤에 붙은 것)을 앞으로 보내 전부 살리고, 공통 negative_base 는
// 남는 자리만큼 쉼표 경계에서 채운다. 단어를 추가하거나 바꾸지 않는다 — 생략만 한다.
function trimNeg(s) {
  if (s.length <= NEG_MAX) return s;
  const base = SPEC.negative_base;
  const specific = s.startsWith(base) ? s.slice(base.length).replace(/^\s*,\s*/, '') : '';
  const head = specific ? specific + ', ' : '';
  const room = NEG_MAX - head.length;
  const cut = base.slice(0, room);
  return (head + cut.slice(0, cut.lastIndexOf(','))).trim();
}

// leg 키는 4·5·6 같은 숫자 또는 '6b' 같은 문자열. A06b 는 A06→A07 사이의 중간 앵커(rev.3d).
const nn = (n) => { const m = /^(\d+)([a-z]?)$/.exec(String(n)); if (!m) throw new Error('leg 키 형식: ' + n); return m[1].padStart(2, '0') + m[2]; };
const id = (n) => `A${nn(n)}`;
const anchorOf = (n) => { const a = SPEC.anchors.find((x) => x.id === id(n)); if (!a) throw new Error('앵커 없음 ' + id(n)); return a; };
const raw = (n) => path.join(GEN, `v3-leg-${nn(n)}.mp4`);
const scrub = (n) => path.join(SRC, `v3-leg-${nn(n)}.mp4`);
const frame = (n, t) => path.join(SHOTS, `v3-leg-${nn(n)}-t${t.toFixed(2)}.jpg`);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const slash = (p) => p.replace(/\\/g, '/');

function ffmpeg() {
  const base = 'C:/Users/oem/AppData/Local/Microsoft/WinGet/Packages';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!/ffmpeg/i.test(d)) continue;
      for (const b of fs.readdirSync(path.join(base, d))) {
        const c = path.join(base, d, b, 'bin/ffmpeg.exe');
        if (fs.existsSync(c)) return c;
      }
    }
  } catch { /* noop */ }
  return 'ffmpeg';
}
const ff = (args) => execFileSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

function readLedger() {
  if (fs.existsSync(LEDGER)) return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  return { session: 'legs-v3-2026-08-26', cap: CAP, per_video_expected: PER, model: 'kling/v2-1-pro', started: new Date().toISOString(), runs: [], spent: 0 };
}
function writeLedger(l) {
  fs.mkdirSync(SHOTS, { recursive: true });
  l.spent = Number(l.runs.reduce((s, x) => s + (x.credits_charged || 0), 0).toFixed(2));
  l.spent_by_rev = {};
  for (const r of l.runs) { const k = 'rev' + (r.rev || 2) + ((r.batch || '1-3') === '1-3' ? '' : '-legs' + r.batch); l.spent_by_rev[k] = Number(((l.spent_by_rev[k] || 0) + (r.credits_charged || 0)).toFixed(2)); }
  l.remaining_of_cap = Number((l.cap - spentOfRev(l)).toFixed(2));
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

async function runOne(n, ledger) {
  const a = anchorOf(n);
  const tailId = a.tail;   // 다음 앵커는 n+1 이 아니라 anchors-v3.json 의 tail 로 (A06 → A06b → A07)
  const head = path.join(ANCH, `${a.id}.png`);
  const tail = path.join(ANCH, `${tailId}.png`);
  if (runsOfRev(ledger).some((r) => r.leg === n && r.ok)) throw new Error(`leg ${n} 은 rev${REV}/batch ${BATCH} 성공 기록이 이미 있다.`);
  const pend = ledgerLatestPending(runsOfRev(ledger), (r) => r.leg === n);
  if (pend) throw new Error(`leg ${n} 은 pending taskId=${pend.taskId} 가 원장에 있다 — 새로 만들지 말고 \`fetch ${n}\` 으로 회수해라.`);
  if (spentOfRev(ledger) + PER > ledger.cap + 1e-9) throw new Error(`예산 정지(rev${REV} batch ${BATCH}): ${spentOfRev(ledger)}+${PER} > ${ledger.cap}`);
  // 이전 rev 산출물 백업(gen + src). 백업본이 이미 있으면 덮어쓰지 않는다.
  for (const f of [raw(n), scrub(n)]) {
    if (!fs.existsSync(f)) continue;
    const bak = f.replace(/\.mp4$/, `.${PREV}.mp4`);
    if (fs.existsSync(bak)) throw new Error(`${rel(bak)} 가 이미 있다 — rev${REV} 는 이미 한 번 실행됐다.`);
    fs.renameSync(f, bak); process.stderr.write(`[leg ${n}] backup ${rel(f)} -> ${rel(bak)}
`);
  }
  if (fs.existsSync(raw(n))) throw new Error(`${rel(raw(n))} 가 이미 있다 — leg 당 1회 규칙.`);

  fs.mkdirSync(GEN, { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = await credits();
    process.stderr.write(`\n[leg ${n}] ${a.id} -> ${tailId}  attempt ${attempt}  balance=${before}\n`);
    const rec = {
      leg: n, rev: REV, batch: BATCH, head: rel(head), tail: rel(tail), attempt, model: 'kling/v2-1-pro', duration: '5', cfg_scale: 0.5,
      prompt: a.motion_prompt, prompt_sha256: promptHash(a.motion_prompt), negative_full_chars: a.negative.length, negative: trimNeg(a.negative),
      credits_balance_before: before, at: new Date().toISOString(),
    };
    // createTask 가 taskId 를 주는 즉시(폴링 전) pending 줄을 디스크에 남긴다. 회선이 끊겨도 `fetch n` 으로 회수.
    let pushed = false;
    const onTask = (taskId) => {
      rec.taskId = taskId; rec.state = 'pending'; rec.task_created_at = new Date().toISOString();
      if (!pushed) { ledger.runs.push(rec); pushed = true; }
      writeLedger(ledger);
      process.stderr.write(`[leg ${n}] pending taskId=${taskId} (원장 기록)\n`);
    };
    const finalize = (patch) => { delete rec.state; Object.assign(rec, patch, { finished_at: new Date().toISOString() }); if (!pushed) { ledger.runs.push(rec); pushed = true; } writeLedger(ledger); };
    try {
      // retries:1 → kie.mjs 내부 무과금 재시도 루프를 끈다. 재시도 판단은 여기서 잔액으로 한다.
      const r = await video(a.motion_prompt, { image: head, tail, seconds: 5, out: raw(n), negative: trimNeg(a.negative), retries: 1, onTask });
      const after = await credits();
      finalize({
        ok: true, taskId: r.taskId, credits_reported: r.credits, credits_balance_after: after,
        credits_charged: Number((before - after).toFixed(2)), gen_ms: r.ms, wall_ms: r.wallMs,
        mp4: rel(raw(n)), mp4_bytes: fs.statSync(raw(n)).size,
      });
      process.stderr.write(`[leg ${n}] ok taskId=${r.taskId} charged=${rec.credits_charged} spent=${ledger.spent}/${ledger.cap}\n`);
      return rec;
    } catch (e) {
      // 폴링 중 네트워크 오류(failCode 없음)이고 taskId 가 있으면 pending 으로 남긴다 — 과금된 결과를 fetch 로 회수해야 한다.
      if (rec.state === 'pending' && e.failCode === undefined) {
        rec.last_error = String(e.message).slice(0, 600); writeLedger(ledger);
        process.stderr.write(`[leg ${n}] 폴링 끊김, taskId=${rec.taskId} 는 pending 으로 남김 → fetch ${n}\n`);
        throw e;
      }
      const after = await credits();
      finalize({
        ok: false, error: String(e.message).slice(0, 600), failCode: e.failCode || null,
        credits_balance_after: after, credits_charged: Number((before - after).toFixed(2)),
      });
      process.stderr.write(`[leg ${n}] FAIL charged=${rec.credits_charged}: ${rec.error}\n`);
      if (rec.credits_charged > 0 || attempt === 2) throw e;
      process.stderr.write(`[leg ${n}] 무과금 오류 — 1회만 재시도\n`);
    }
  }
}

// 폴링 도중 회선이 끊겨 taskId 만 남았을 때(2026-08-27 leg 7). createTask 를 다시 부르지 않고
// recordInfo 를 success 까지 기다린 뒤 다운로드하고, 원장에 recovered 기록을 남긴다. 과금 0.
// taskId 를 생략하면 원장의 그 leg(같은 rev/batch) 최신 pending 줄을 쓰고, 완료 시 그 줄을 갱신한다.
async function fetchOne(n, taskId, ledger) {
  const a = anchorOf(n);
  if (fs.existsSync(raw(n))) throw new Error(`${rel(raw(n))} 가 이미 있다.`);
  const pending = taskId
    ? ledger.runs.find((r) => r.taskId === taskId && r.state === 'pending')
    : ledgerLatestPending(runsOfRev(ledger), (r) => r.leg === n);
  if (!taskId) {
    if (!pending) throw new Error(`leg ${n} (rev${REV} batch ${BATCH}) 의 pending 줄이 원장에 없다 — taskId 를 직접 넘겨라.`);
    taskId = pending.taskId;
    process.stderr.write(`[leg ${n}] 원장 pending taskId=${taskId} (${pending.task_created_at || pending.at})\n`);
  }
  const before = await credits();
  const t0 = Date.now();
  const r = await waitTask(taskId, { label: `v3-leg-${nn(n)}.mp4 (fetch)`, timeoutMs: 25 * 60 * 1000 });
  fs.mkdirSync(GEN, { recursive: true });
  await download(r.urls[0], raw(n));
  const after = await credits();
  const done = {
    recovered: true, recovery_note: 'createTask 는 run 에서 이미 과금됐고 폴링 중 회선 끊김. taskId 로 결과만 회수 (새 createTask 없음).',
    fetch_balance_before: before, fetched_at: new Date().toISOString(), ok: true, taskId, credits_reported: r.credits,
    credits_balance_after: after, credits_charged_at_fetch: Number((before - after).toFixed(2)), gen_ms: r.ms, fetch_wall_ms: Date.now() - t0,
    mp4: rel(raw(n)), mp4_bytes: fs.statSync(raw(n)).size,
  };
  let rec;
  if (pending) {
    // pending 줄을 그 자리에서 완료로 바꾼다. 과금은 run 시점 잔액 기준(credits_balance_before 는 pending 줄에 있다).
    rec = pending; delete rec.state;
    Object.assign(rec, done, { credits_charged: Number((rec.credits_balance_before - after).toFixed(2)), finished_at: done.fetched_at });
  } else {
    rec = {
      leg: n, rev: REV, batch: BATCH, head: rel(path.join(ANCH, `${a.id}.png`)), tail: rel(path.join(ANCH, `${a.tail}.png`)), attempt: 1,
      model: 'kling/v2-1-pro', duration: '5', cfg_scale: 0.5, prompt: a.motion_prompt, prompt_sha256: promptHash(a.motion_prompt),
      negative_full_chars: a.negative.length, negative: trimNeg(a.negative),
      credits_balance_before: before, at: done.fetched_at, ...done,
      credits_charged: done.credits_charged_at_fetch, credits_charged_at_run: PER, wall_ms: done.fetch_wall_ms,
    };
    ledger.runs.push(rec);
  }
  writeLedger(ledger);
  process.stderr.write(`[leg ${n}] fetched taskId=${taskId} charged_now=${done.credits_charged_at_fetch} charged_total=${rec.credits_charged}
`);
  return rec;
}

function post(n) {
  fs.mkdirSync(SRC, { recursive: true });
  ff(['-i', raw(n), '-an', '-vf', 'scale=-2:1080:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20',
    '-g', '8', '-keyint_min', '8', '-sc_threshold', '0', '-movflags', '+faststart', scrub(n)]);
  const outs = [];
  for (const t of TS) {
    ff(['-ss', String(t), '-i', scrub(n), '-frames:v', '1', '-q:v', '2', frame(n, t)]);
    outs.push(rel(frame(n, t)));
  }
  // 씸 프레임은 반드시 인코딩된 mp4 에서 (howto §B 12).
  const seam = path.join(GEN, `v3-leg-${nn(n)}.seam.png`);
  ff(['-sseof', '-0.15', '-i', scrub(n), '-frames:v', '1', seam]);
  return { scrub: rel(scrub(n)), bytes: fs.statSync(scrub(n)).size, frames: outs, seam: rel(seam) };
}

function sheet(ns) {
  const out = path.join(SHOTS, ns.length === 1 && BATCH !== '1-3' ? `v3-leg-${BATCH}-sheet.jpg` : BATCH !== '1-3' ? `v3-legs-${BATCH}-sheet.jpg` : REV > 2 ? `v3-legs-1-3-rev${REV}-sheet.jpg` : 'v3-legs-1-3-sheet.jpg');
  const rows = ns.map((n) => ({
    label: `leg ${n}  ${id(n)} -> ${anchorOf(n).tail}`,
    next: anchorOf(n).tail,
    frames: TS.map((t) => ({ t, f: slash(frame(n, t)) })),
    nextFile: slash(path.join(ANCH, `${anchorOf(n).tail}.jpg`)),
  }));
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
rows = json.loads(sys.argv[1]); out = sys.argv[2]
CW, CH, PAD, LAB = 480, 270, 8, 24
cols = 7
W = cols*CW + PAD*(cols+1); H = len(rows)*(CH+LAB*2) + PAD*(len(rows)+1)
sh = Image.new('RGB', (W, H), (17,17,19)); d = ImageDraw.Draw(sh)
try: font = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 18)
except Exception: font = ImageFont.load_default()
for r, row in enumerate(rows):
    y = PAD + r*(CH+LAB*2+PAD)
    d.text((PAD+4, y), row['label'], fill=(230,200,150), font=font)
    cells = [(f['f'], 't=%.2f' % f['t']) for f in row['frames']] + [(row['nextFile'], 'NEXT ANCHOR ' + row['next'])]
    for c, (p, lab) in enumerate(cells):
        x = PAD + c*(CW+PAD)
        im = Image.open(p).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
        sh.paste(im, (x, y+LAB))
        d.text((x+4, y+LAB+CH+2), lab, fill=(150,220,230) if c==6 else (200,200,200), font=font)
sh.save(out, quality=88, subsampling=1)
print(out, sh.size)
`;
  const o = execFileSync('python', ['-c', py, JSON.stringify(rows), slash(out)], { encoding: 'utf8' });
  process.stderr.write(o);
  return rel(out);
}

const [cmd, ...rest] = process.argv.slice(2);
const ns = rest.map((x) => (/^\d+$/.test(x) ? Number(x) : x)).filter((x) => x !== '' && x != null);
try {
  if (cmd === 'credits') console.log(await credits());
  else if (cmd === 'run') {
    const ledger = readLedger(); ledger.cap = CAP; writeLedger(ledger);
    const done = [];
    for (const n of ns) done.push(await runOne(n, ledger));
    console.log(JSON.stringify({ rev: REV, batch: BATCH, spent_rev: spentOfRev(ledger), spent_total: ledger.spent, cap: ledger.cap, done: done.map((d) => ({ leg: d.leg, taskId: d.taskId, charged: d.credits_charged })) }, null, 2));
  } else if (cmd === 'fetch') {
    const [n, taskId] = ns;
    if (n == null) throw new Error('fetch <leg> [taskId]');
    const ledger = readLedger(); ledger.cap = CAP;
    const rec = await fetchOne(n, taskId ? String(taskId) : undefined, ledger);
    console.log(JSON.stringify({ rev: REV, batch: BATCH, leg: rec.leg, taskId: rec.taskId, charged: rec.credits_charged, mp4: rec.mp4, spent_rev: spentOfRev(ledger), cap: ledger.cap }, null, 2));
  } else if (cmd === 'post') { for (const n of ns) console.log(JSON.stringify(post(n))); }
  else if (cmd === 'sheet') console.log(sheet(ns));
  else { console.error('usage: legs-v3.mjs credits|run n..|fetch n [taskId]|post n..|sheet n..'); process.exit(1); }
} catch (e) { console.error('ERROR:', e.message); process.exit(1); }
