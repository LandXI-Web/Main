#!/usr/bin/env node
/**
 * v3 leg 러너 — anchors-v3.json 의 motion_prompt 를 토씨 그대로 써서
 * A0n.png(head) → A0(n+1).png(tail) 5초 클립을 kling/v2-1-pro 로 뽑는다.
 *
 *   node tools/kie/legs-v3.mjs run 1 2 3        # leg 번호
 *   node tools/kie/legs-v3.mjs post 1 2 3       # 스크럽 인코딩 + 검수 프레임 + 씸 프레임
 *   node tools/kie/legs-v3.mjs sheet 1 2 3      # 3행 × (6 프레임 + 다음 앵커) 콘택트 시트
 *
 * 규칙(2026-08-26 클라이언트): leg 당 생성 정확히 1회, 자동 재시도 없음, 캡 160.
 * 매 호출 전후 잔액을 shots/kie/legs-v3-credits.json 에 기록.
 * 오류가 났고 잔액이 그대로일 때만(과금 0) 그 호출을 1회 다시 시도한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { video, credits } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/kie/anchors-v3.json'), 'utf8'));
const ANCH = path.join(ROOT, 'landxi/assets/proto/film/legs/anchors-v3');
const GEN = path.join(ROOT, 'landxi/assets/proto/film/legs/gen');
const SRC = path.join(ROOT, 'landxi/assets/proto/film/legs/src');
const SHOTS = path.join(ROOT, 'shots/kie');
const LEDGER = path.join(SHOTS, 'legs-v3-credits.json');
const CAP = Number(process.env.LEGS_V3_CAP || 160);
const PER = 50;
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

const id = (n) => `A${String(n).padStart(2, '0')}`;
const nn = (n) => String(n).padStart(2, '0');
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
  l.remaining_of_cap = Number((l.cap - l.spent).toFixed(2));
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

async function runOne(n, ledger) {
  const a = SPEC.anchors.find((x) => x.id === id(n));
  if (!a) throw new Error('앵커 없음 ' + id(n));
  const tailId = a.tail;
  const head = path.join(ANCH, `${a.id}.png`);
  const tail = path.join(ANCH, `${tailId}.png`);
  if (fs.existsSync(raw(n))) throw new Error(`${rel(raw(n))} 가 이미 있다 — leg 당 1회 규칙. 삭제 후 재실행.`);
  if (ledger.runs.some((r) => r.leg === n && r.ok)) throw new Error(`leg ${n} 은 이미 성공 기록이 있다.`);
  if (ledger.spent + PER > ledger.cap + 1e-9) throw new Error(`예산 정지: ${ledger.spent}+${PER} > ${ledger.cap}`);

  fs.mkdirSync(GEN, { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = await credits();
    process.stderr.write(`\n[leg ${n}] ${a.id} -> ${tailId}  attempt ${attempt}  balance=${before}\n`);
    const rec = {
      leg: n, head: rel(head), tail: rel(tail), attempt, model: 'kling/v2-1-pro', duration: '5', cfg_scale: 0.5,
      prompt: a.motion_prompt, negative_full_chars: a.negative.length, negative: trimNeg(a.negative), credits_balance_before: before, at: new Date().toISOString(),
    };
    try {
      // retries:1 → kie.mjs 내부 무과금 재시도 루프를 끈다. 재시도 판단은 여기서 잔액으로 한다.
      const r = await video(a.motion_prompt, { image: head, tail, seconds: 5, out: raw(n), negative: trimNeg(a.negative), retries: 1 });
      const after = await credits();
      Object.assign(rec, {
        ok: true, taskId: r.taskId, credits_reported: r.credits, credits_balance_after: after,
        credits_charged: Number((before - after).toFixed(2)), gen_ms: r.ms, wall_ms: r.wallMs,
        mp4: rel(raw(n)), mp4_bytes: fs.statSync(raw(n)).size,
      });
      ledger.runs.push(rec); writeLedger(ledger);
      process.stderr.write(`[leg ${n}] ok taskId=${r.taskId} charged=${rec.credits_charged} spent=${ledger.spent}/${ledger.cap}\n`);
      return rec;
    } catch (e) {
      const after = await credits();
      Object.assign(rec, {
        ok: false, error: String(e.message).slice(0, 600), failCode: e.failCode || null,
        credits_balance_after: after, credits_charged: Number((before - after).toFixed(2)),
      });
      ledger.runs.push(rec); writeLedger(ledger);
      process.stderr.write(`[leg ${n}] FAIL charged=${rec.credits_charged}: ${rec.error}\n`);
      if (rec.credits_charged > 0 || attempt === 2) throw e;
      process.stderr.write(`[leg ${n}] 무과금 오류 — 1회만 재시도\n`);
    }
  }
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
  const out = path.join(SHOTS, 'v3-legs-1-3-sheet.jpg');
  const rows = ns.map((n) => ({
    label: `leg ${n}  ${id(n)} -> ${id(n + 1)}`,
    next: id(n + 1),
    frames: TS.map((t) => ({ t, f: slash(frame(n, t)) })),
    nextFile: slash(path.join(ANCH, `${id(n + 1)}.jpg`)),
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
const ns = rest.map(Number).filter(Boolean);
try {
  if (cmd === 'credits') console.log(await credits());
  else if (cmd === 'run') {
    const ledger = readLedger(); ledger.cap = CAP; writeLedger(ledger);
    const done = [];
    for (const n of ns) done.push(await runOne(n, ledger));
    console.log(JSON.stringify({ spent: ledger.spent, cap: ledger.cap, done: done.map((d) => ({ leg: d.leg, taskId: d.taskId, charged: d.credits_charged })) }, null, 2));
  } else if (cmd === 'post') { for (const n of ns) console.log(JSON.stringify(post(n))); }
  else if (cmd === 'sheet') console.log(sheet(ns));
  else { console.error('usage: legs-v3.mjs credits|run n..|post n..|sheet n..'); process.exit(1); }
} catch (e) { console.error('ERROR:', e.message); process.exit(1); }
