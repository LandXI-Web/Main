#!/usr/bin/env node
/**
 * 앵커 v3 러너 — tools/kie/anchors-v3.json 의 12장 스틸을 A01→A12 순서로 뽑는다.
 *
 *   node tools/kie/anchors-v3.mjs credits
 *   node tools/kie/anchors-v3.mjs plan                 # 호출 없이 ref 체인만 출력 (0 크레딧)
 *   node tools/kie/anchors-v3.mjs run                  # A01..A12
 *   node tools/kie/anchors-v3.mjs run A05 A06          # 지정 앵커만 (리롤용)
 *   node tools/kie/anchors-v3.mjs sheet                # 12업 콘택트 시트 + 씸 스트립
 *
 * 레퍼런스 체인. A01 은 JSON 의 ref 하나. A02~A12 는 **직전 앵커를 1순위**로 두고
 * JSON 의 크롭 ref 를 2순위로 함께 넘긴다(seedream image-to-image 는 image_urls 배열을
 * 받는다). 직전 앵커가 먼저 와야 재질·조명 연속성이 잡힌다.
 *
 * 예산. 상한은 CAP(기본 190). 매 호출 전후로 잔액을 재고 shots/kie/anchors-v3-credits.json
 * 에 적는다. 다음 한 장을 뽑았을 때 상한을 넘을 것 같으면 호출하지 않고 멈춘다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { still, credits } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = path.join(ROOT, 'tools/kie/anchors-v3.json');
const OUT = path.join(ROOT, 'landxi/assets/proto/film/legs/anchors-v3');
const LEDGER = path.join(ROOT, 'shots/kie/anchors-v3-credits.json');
const SHEET = path.join(ROOT, 'shots/kie/anchors-v3-sheet.jpg');
const SEAMS = path.join(ROOT, 'shots/kie/anchors-v3-seams.jpg');

const CAP = Number(process.env.ANCHORS_V3_CAP || 190);
const PER = 14.5; // 실측 단가

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const ANCHORS = spec.anchors;
const byId = Object.fromEntries(ANCHORS.map((a) => [a.id, a]));

const png = (id) => path.join(OUT, `${id}.png`);
const jpg = (id) => path.join(OUT, `${id}.jpg`);

// ------------------------------------------------------------------ ledger --
function readLedger() {
  if (!fs.existsSync(LEDGER)) {
    return { cap: CAP, per_still_expected: PER, started: null, runs: [], spent: 0, rerolls: [] };
  }
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}
function writeLedger(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

// ------------------------------------------------------------------ ffmpeg --
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

function makeJpeg(id) {
  ff(['-i', png(id), '-vf', 'scale=1920:-2:flags=lanczos', '-q:v', '3', jpg(id)]);
  return jpg(id);
}

// -------------------------------------------------------------------- refs --
/** 직전 앵커(있으면) 1순위 + JSON 크롭 ref 2순위. */
export function refsFor(id, extra = []) {
  const a = byId[id];
  const i = ANCHORS.findIndex((x) => x.id === id);
  const out = [];
  if (i > 0) {
    const prev = png(ANCHORS[i - 1].id);
    if (fs.existsSync(prev)) out.push(prev);
  }
  if (a.ref) out.push(path.join(ROOT, a.ref));
  // 리롤에서만 쓰는 보강 ref. 승인된 프롬프트는 손대지 않고 레퍼런스만 더한다.
  for (const e of extra) out.push(path.isAbsolute(e) ? e : path.join(ROOT, e));
  return out;
}

// --------------------------------------------------------------------- run --
async function runOne(id, ledger, { reroll = false, extra = [] } = {}) {
  const a = byId[id];
  const before = await credits();
  if (ledger.spent + PER > ledger.cap + 1e-9) {
    throw new Error(`예산 정지: 지금까지 ${ledger.spent} + ${PER} > 상한 ${ledger.cap}. ${id} 는 호출하지 않았다.`);
  }
  const ref = refsFor(id, extra);
  process.stderr.write(`\n[${id}] refs = ${ref.map((r) => path.relative(ROOT, r).replace(/\\/g, '/')).join(' , ') || '(none, text-to-image)'}\n`);
  fs.mkdirSync(OUT, { recursive: true });
  const r = await still(a.still_prompt, { ref: ref.length ? ref : undefined, ar: a.ar || '16:9', quality: 'high', out: png(id) });
  const after = await credits();
  const charged = before - after;
  const rec = {
    id, reroll, model: r.model, taskId: r.taskId,
    refs: ref.map((x) => path.relative(ROOT, x).replace(/\\/g, '/')),
    credits_reported: r.credits, credits_balance_before: before, credits_balance_after: after,
    credits_charged: Number(charged.toFixed(2)),
    gen_ms: r.ms, wall_ms: r.wallMs,
    png: path.relative(ROOT, png(id)).replace(/\\/g, '/'),
    png_bytes: fs.statSync(png(id)).size,
    at: new Date().toISOString(),
  };
  makeJpeg(id);
  rec.jpg = path.relative(ROOT, jpg(id)).replace(/\\/g, '/');
  rec.jpg_bytes = fs.statSync(jpg(id)).size;
  ledger.runs.push(rec);
  if (reroll) ledger.rerolls.push(id);
  ledger.spent = Number(ledger.runs.reduce((s, x) => s + (x.credits_charged || 0), 0).toFixed(2));
  ledger.remaining_of_cap = Number((ledger.cap - ledger.spent).toFixed(2));
  writeLedger(ledger);
  process.stderr.write(`[${id}] ok  charged=${rec.credits_charged}  spent=${ledger.spent}/${ledger.cap}  ${(rec.png_bytes / 1e6).toFixed(2)}MB\n`);
  return rec;
}

// ------------------------------------------------------------------- sheet --
/** 3x4 콘택트 시트, A01~A12 라벨. */
function sheet() {
  const ids = ANCHORS.map((a) => a.id).filter((id) => fs.existsSync(png(id)));
  if (!ids.length) throw new Error('앵커 PNG 가 하나도 없다');
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
ids = json.loads(sys.argv[1]); src = json.loads(sys.argv[2]); out = sys.argv[3]
CW, CH, PAD, LAB = 640, 360, 10, 26
cols, rows = 3, 4
W = cols*CW + PAD*(cols+1); H = rows*(CH+LAB) + PAD*(rows+1)
sheet = Image.new('RGB', (W, H), (17,17,19)); d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 20)
except Exception: font = ImageFont.load_default()
for k, i in enumerate(ids):
    r, c = divmod(k, cols)
    x = PAD + c*(CW+PAD); y = PAD + r*(CH+LAB+PAD)
    im = Image.open(src[k]).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x + (CW-im.width)//2, y + (CH-im.height)//2))
    d.text((x+4, y+CH+3), i, fill=(230,200,150), font=font)
sheet.save(out, quality=88, subsampling=1)
print(out, sheet.size)
`;
  const srcs = ids.map((id) => png(id));
  const o = execFileSync('python', ['-c', py, JSON.stringify(ids), JSON.stringify(srcs), SHEET], { encoding: 'utf8' });
  process.stderr.write(o);

  // 인접 쌍 연속성 스트립: 11 조인트 + 루프 1 = 12 쌍, 좌/우 나란히 2행씩
  const pairs = ids.map((id, i) => [id, ids[(i + 1) % ids.length]]);
  const py2 = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
pairs = json.loads(sys.argv[1]); root = sys.argv[2]; out = sys.argv[3]
CW, CH, PAD, LAB, GAP = 560, 315, 12, 26, 6
cols = 2
rows = (len(pairs)+cols-1)//cols
PW = CW*2 + GAP
W = cols*PW + PAD*(cols+1); H = rows*(CH+LAB) + PAD*(rows+1)
sh = Image.new('RGB', (W, H), (17,17,19)); d = ImageDraw.Draw(sh)
try: font = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 20)
except Exception: font = ImageFont.load_default()
for k, (a, b) in enumerate(pairs):
    r, c = divmod(k, cols)
    x = PAD + c*(PW+PAD); y = PAD + r*(CH+LAB+PAD)
    for j, i in enumerate((a, b)):
        im = Image.open(root + '/' + i + '.png').convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
        sh.paste(im, (x + j*(CW+GAP) + (CW-im.width)//2, y + (CH-im.height)//2))
    d.text((x+4, y+CH+3), a + '  \\u2192  ' + b + ('   (loop)' if k == len(pairs)-1 else '   seam %d' % (k+1)), fill=(230,200,150), font=font)
sh.save(out, quality=88, subsampling=1)
print(out, sh.size)
`;
  const o2 = execFileSync('python', ['-c', py2, JSON.stringify(pairs), OUT.replace(/\\/g, '/'), SEAMS], { encoding: 'utf8' });
  process.stderr.write(o2);
  return { sheet: SHEET, seams: SEAMS, count: ids.length };
}

// --------------------------------------------------------------------- cli --
const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'credits') {
    console.log(await credits());
  } else if (cmd === 'plan') {
    for (const a of ANCHORS) {
      console.log(`${a.id}  ar=${a.ar}  refs=${refsFor(a.id).map((r) => path.relative(ROOT, r).replace(/\\/g, '/')).join(' , ') || '(text-to-image)'}`);
    }
  } else if (cmd === 'run') {
    const ei0 = rest.indexOf('--extra-ref');
    // ei0 === -1 이면 ei0+1 === 0 이라 첫 positional 이 통째로 날아간다 (2026-08-26 실측 버그).
    const ids = rest.filter((x, k) => !x.startsWith('--') && !(ei0 > -1 && k === ei0 + 1));
    const hasPositional = rest.some((x) => !x.startsWith('--'));
    if (hasPositional && !ids.length) throw new Error('앵커 인자 파싱 실패 — 전체 실행으로 떨어지는 것을 막았다.');
    const list = ids.length ? ids : ANCHORS.map((a) => a.id);
    const reroll = rest.includes('--reroll');
    const ei = rest.indexOf('--extra-ref');
    const extra = ei > -1 && rest[ei + 1] ? [rest[ei + 1]] : [];
    const ledger = readLedger();
    ledger.cap = CAP;
    ledger.started ||= new Date().toISOString();
    writeLedger(ledger);
    const done = [];
    for (const id of list) {
      if (!byId[id]) throw new Error('알 수 없는 앵커: ' + id);
      done.push(await runOne(id, ledger, { reroll, extra }));
    }
    console.log(JSON.stringify({ spent: ledger.spent, cap: ledger.cap, remaining_of_cap: ledger.remaining_of_cap, done: done.map((d) => ({ id: d.id, credits: d.credits_charged, mb: +(d.png_bytes / 1e6).toFixed(2) })) }, null, 2));
  } else if (cmd === 'sheet') {
    console.log(JSON.stringify(sheet(), null, 2));
  } else {
    console.error('usage: node tools/kie/anchors-v3.mjs credits|plan|run [A01 ...] [--reroll]|sheet');
    process.exit(1);
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
