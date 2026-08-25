#!/usr/bin/env node
/**
 * 1장 Leg 1 — 모형 지구본(위성 지나감). **스틸 단계만.**
 *
 *   node tools/kie/leg-01-globe.mjs credits
 *   node tools/kie/leg-01-globe.mjs prompts
 *   node tools/kie/leg-01-globe.mjs still 1      # 1차 시도 -> ...still-1.png
 *   node tools/kie/leg-01-globe.mjs still 2      # 프롬프트 보정 후 2차 -> ...still-2.png
 *   node tools/kie/leg-01-globe.mjs sheet        # 뽑힌 스틸들로 콘택트 시트
 *
 * 비용 게이트(클라이언트 지시 2026-08-26): 스틸만, 최대 2회, 누적 28 크레딧.
 * 영상(kling)은 스틸 승인 뒤 별도 단계. 이 스크립트에는 video 분기가 없다.
 *
 * 스펙: docs/superpowers/proto/2026-08-26-film-shotlist-v2.md leg 1
 * 프롬프트 팩: docs/superpowers/proto/prompts/ch1-leg-01-globe.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { credits, still } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (...a) => path.join(ROOT, ...a);

// ---------------------------------------------------------------- 비용 게이트 --
const CAP = 28;                       // 이 leg 스틸 단계에 허용된 누적 크레딧
const EST_STILL = 14.5;               // seedream 5-pro i2i 실측(1차 과금) 14.5
const LEDGER = p('shots/kie/leg01-credits.json');

function ledger() {
  return fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { start: null, calls: [] };
}
function saveLedger(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

/** 이번 호출이 캡을 넘길 것 같으면 과금 전에 던진다. */
async function gate(label) {
  const l = ledger();
  const before = await credits();
  if (l.start == null) { l.start = before; saveLedger(l); }
  const spent = l.start - before;
  if (spent + EST_STILL > CAP) {
    throw new Error(`비용 게이트: ${label} 실행 시 누적 ${spent}+${EST_STILL} > 캡 ${CAP}. 중단.`);
  }
  console.error(`크레딧 before=${before} (누적 사용 ${spent} / 캡 ${CAP})`);
  return { l, before };
}

// ------------------------------------------------------------------- 참조 --
// 구도 참조: 우리 three-globe 렌더 orbit-0.png 를 크림 배경 위로 옮기고 지름을
// 프레임 높이의 55%로 맞춘 판. 원본은 검은 우주 + 별 + 사각 크롭 경계라
// 그대로 i2i 레퍼런스로 넣으면 체크리스트가 금지한 '검은 우주/별/보드 가장자리'를
// 그대로 끌고 들어온다. 원형 알파로 페더링해 경계도 지웠다.
const REF_COMP = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.ref-comp.jpg');
// 재질 참조: 통과한 남원 비닐하우스 테스트 leg 의 프레임(석고·이끼·황동·레진).
const REF_MAT = p('shots/kie/namwon-greenhouse-test-03.jpg');

// 2차용. 1차에서 재질(석고 릴리프·이끼·솜구름·황동 링/위성)은 완전히 통과했고
// 구도만(한반도 비중앙 + 지구본 73%) 떨어졌다. 그래서 2차는
//  - 틀: 지구본을 50%까지 더 줄인 구도 참조
//  - 재질/그레이드: 1차 스틸에서 바다 채도만 내린 판(= 남원 재질 참조의 후손)
// 두 장으로 잠그고, 회전·스케일만 프롬프트로 다시 지시한다.
// 남원 프레임을 세 번째로 더 넣지 않는 이유: REF_STYLE 이 이미 그 그레이드를
// 물려받았고, 레퍼런스가 셋이면 구도 지시가 묽어진다.
const REF_COMP2 = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.ref-comp2.jpg');
const REF_STYLE = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.ref-style.jpg');

const outPng = (n) => p(`landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.still-${n}.png`);

// --------------------------------------------------------------- 프롬프트 --
// 프롬프트 팩 `## 1) 스틸` 본문 그대로.
const PACK = [
  'A handmade miniature orrery-style model globe seen from space, floating in soft cream-colored haze, no table, no stand, no base, no edges — the world continues beyond the frame.',
  'Continents are painted plaster with fine moss texture; oceans are glossy cobalt-blue resin; polar caps are matte white plaster.',
  'A single thin brass orbit ring encircles the globe with one tiny brass satellite model on it.',
  'The globe fills about 55% of the frame height, slightly below center; East Asia faces the camera, the Korean peninsula near the center with a few small cotton clouds over its southern coast.',
  'One soft studio top-light from upper-left, gentle reflections on the resin ocean, no hard shadows, shallow depth of field on the far edge.',
  'Muted palette: cream, moss green, sand, one cobalt-blue accent. Matte cream sky, no stars, no black space.',
  'Photographed like a product still, 35mm, f/4, 16:9.',
].join('\n');

// seedream 5-pro 에는 negative_prompt 필드가 없다(kling 에만 있다).
// 팩의 네거티브 목록을 프롬프트 안 'Avoid:' 절로 접어 넣는다.
const AVOID = 'Avoid: board, table, plinth, base plate, stand, frame edge, studio backdrop seam, '
  + 'black space, stars, blue sky, purple, neon, text, letters, logo, watermark, people, vehicles, '
  + 'cartoon, CGI look, glossy plastic, lens flare.';

const REF_ROLES = [
  'Use the first reference image ONLY for camera framing: how large the sphere is in the frame, where it sits, and which side of the world faces the camera. Ignore its colours and its materials entirely.',
  'Use the second reference image ONLY for material and light: painted plaster, real moss, poured resin, milled brass, sifted sand, soft near-shadowless studio light, low-saturation cream-and-moss colour grade.',
].join('\n');

const REALISM = 'Photographic realism — a real handmade object photographed on a seamless cream backdrop. '
  + 'NOT a 3D render, NOT CGI, NOT illustration, NOT clay, no digital glow, no plastic sheen, no toy-town cuteness.';

// 1차: 팩 그대로 + 참조 역할 + 리얼리즘 + Avoid.
const STILL_1 = [PACK, REF_ROLES, REALISM, AVOID].join('\n\n');

// 2차 — 1차 실측 결과 반영. 떨어진 항목만 겨냥한다.
//   실패 1: 한반도가 원반 중앙이 아니라 좌상단, 형태도 중국 해안에 뭉개짐
//           -> 회전을 못박고 "호주·적도는 안 보인다"로 남반구를 잘라낸다.
//   실패 2: 지구본이 프레임 높이의 ~73% (팩 목표 55%). 영상이 55%->75%로
//           달리인 하는데 시작이 이미 73%면 무브가 죽는다 -> 여백을 수치로 지시.
//   경계:   바다 채도가 높아 "코발트 액센트 하나"라기보다 파란 지구본으로 읽혔다.
// 통과한 항목(석고 릴리프·이끼·솜구름·황동 링/위성·크림 배경·텍스트 없음)은
// 문장을 건드리지 않고 REF_STYLE 로 잠근다.
const ROTATION = 'Rotate the model globe so the Korean peninsula sits exactly at the centre of the '
  + 'visible disc, facing the camera head-on. The peninsula is sculpted as a clear thumb-shaped '
  + 'landmass roughly one eighth of the disc width, with the Japanese island arc curving away to its '
  + 'right, the Yellow Sea and the Chinese coast to its left, and Siberia above it. '
  + 'Australia, Indonesia and the equator are NOT visible — the southern hemisphere is below the '
  + 'horizon of the visible disc. A few small cotton-wool clouds sit over the peninsula\'s southern coast.';

const FRAMING = 'Framing: the sphere occupies only the middle 55% of the frame height and sits '
  + 'slightly below centre. Leave a wide empty band of plain cream haze above the globe, at least a '
  + 'quarter of the frame height, and empty cream to the left and to the right. The whole sphere is '
  + 'inside the frame with generous margin — do not crop it, do not let it fill the frame.';

const OCEAN = 'The resin ocean is a deep, muted, desaturated cobalt, dark and restrained, closer to '
  + 'slate blue than to bright sky blue. It is the only saturated colour in the picture; everything '
  + 'else is cream, sand, moss green and matte white.';

const RING = 'The thin brass orbit ring crosses the upper third of the globe, with the tiny brass '
  + 'satellite model near the top right of the ring.';

const REF_ROLES_2 = [
  'Use the first reference image ONLY for framing: how small the sphere is inside the frame and how much empty cream surrounds it. Ignore its colours and materials entirely.',
  'Use the second reference image for the model itself — its painted plaster relief continents, moss texture, cotton-wool clouds, brass ring and brass satellite, matte cream background and low-saturation colour grade. Keep those materials exactly, but re-pose the globe and re-frame it as described above.',
].join('\n');

const STILL_2 = [PACK, ROTATION, FRAMING, OCEAN, RING, REF_ROLES_2, REALISM, AVOID].join('\n\n');

const PROMPTS = { 1: STILL_1, 2: STILL_2 };
const REFS = { 1: [REF_COMP, REF_MAT], 2: [REF_COMP2, REF_STYLE] };

// ------------------------------------------------------------------ ffmpeg --
function ffmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const base = path.join(process.env.USERPROFILE || process.env.HOME,
    'AppData/Local/Microsoft/WinGet/Packages');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    for (const b of fs.readdirSync(path.join(base, d))) {
      const c = path.join(base, d, b, 'bin/ffmpeg.exe');
      if (fs.existsSync(c)) return c;
    }
  }
  return 'ffmpeg';
}

/**
 * 검수 시트: (1) 후보 스틸 전체, (2) 한반도 부근 확대(식별 여부 판정용),
 * (3) 목표 프레이밍 참조 — 를 세로로 붙인다.
 */
function sheet() {
  const cand = [1, 2].map(outPng).filter(fs.existsSync).pop();
  if (!cand) throw new Error('스틸이 아직 없다');
  const out = p('shots/kie/leg01-stills.jpg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fit = (i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,`
    + `pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xEFE7D8`;
  execFileSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', cand, '-i', cand, '-i', REF_COMP2,
    '-filter_complex',
    `${fit(0)}[a];`
    + `[1:v]crop=iw*0.42:ih*0.42:iw*0.22:ih*0.12,${''}scale=1280:720:force_original_aspect_ratio=decrease,`
    + `pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xEFE7D8[b];`
    + `${fit(2)}[c];[a][b][c]vstack=inputs=3[o]`,
    '-map', '[o]', '-frames:v', '1', '-q:v', '3', out]);
  return { out: path.relative(ROOT, out).split(path.sep).join('/'),
    rows: ['candidate still', 'Korea region 2.4x', 'target framing ref'] };
}

// --------------------------------------------------------------------- cli --
const cmd = process.argv[2];
const n = Number(process.argv[3] || 1);

if (cmd === 'credits') {
  console.log(await credits());
} else if (cmd === 'prompts') {
  for (const k of [1, 2]) console.log(`--- STILL ${k} ---\n${PROMPTS[k]}\n`);
} else if (cmd === 'sheet') {
  console.log(JSON.stringify(sheet(), null, 2));
} else if (cmd === 'still') {
  if (!PROMPTS[n]) throw new Error('시도 번호는 1 또는 2');
  const { l, before } = await gate(`still-${n}`);
  const t0 = Date.now();
  const r = await still(PROMPTS[n], { ref: REFS[n], ar: '16:9', out: outPng(n) });
  const after = await credits();
  const rec = {
    step: `still-${n}`, model: r.model, taskId: r.taskId,
    file: path.relative(ROOT, r.file).replace(/\\/g, '/'),
    creditsBefore: before, creditsAfter: after, creditsDelta: before - after,
    creditsConsumedField: r.credits, apiCostMs: r.ms, wallMs: Date.now() - t0,
    cumulativeSpent: l.start - after, cap: CAP, at: new Date().toISOString(),
  };
  l.calls.push(rec);
  saveLedger(l);
  console.log(JSON.stringify(rec, null, 2));
} else {
  console.error('usage: node tools/kie/leg-01-globe.mjs credits|prompts|still <1|2>|sheet');
  process.exit(1);
}
