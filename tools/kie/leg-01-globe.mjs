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
const CAP = 30;                       // 라운드당 허용 크레딧 (2회 x 14.5 = 29)
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
  // 캡은 '라운드' 단위다. 라운드 1(팩 프롬프트)은 28 캡에서 still-1 만 돌고 끝났고,
  // 클라이언트가 ORRERY 스타일로 방향을 바꾸며 캡 30 짜리 라운드 2를 새로 열었다.
  if (l.roundStart == null) { l.roundStart = l.start; saveLedger(l); }
  const spent = l.roundStart - before;
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

// 라운드 2 스타일 참조 — 클라이언트 지시: 유튜브 ORRERY 지구본과 같은 테마/재질/조명,
// 단 배경만 흰색·크림. shots/yt/QUI6-seg/f_008.png 에서 지구본만 크롭했다.
// f_008 을 고른 이유: f_005/f_007 은 반투명 자막이 지구본 위를 지나가고,
// f_009 이후는 지구본이 프레임에 잘린다. 크롭으로 좌상단 웹캠 PiP,
// 좌하단 ORRERY 로고 카드, 우측 마우스 커서를 전부 잘라냈다(텍스트·로고 유입 차단).
const REF_ORRERY = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.ref-orrery.jpg');

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

// ---------------------------------------------------------- 라운드 2 (ORRERY) --
// 클라이언트 승인 방향: 지구본이 유튜브 ORRERY 지구본처럼 보여야 한다
// (같은 테마·재질·조명) — 단 배경은 어두운 곳이 아니라 흰색/크림.
// 팩의 프레이밍 규칙은 유지: 한반도 정면 중앙·형태 식별, 지구본 작게 + 여백 크게,
// 황동 링과 작은 위성은 위쪽, 보드/테이블/가장자리/별/텍스트 없음.
//
// 라운드 1 실측에서 가져온 교훈 둘을 그대로 적용한다.
//   - 스케일을 "55%"처럼 %로 주면 무시된다(73% 나왔다) -> "여백이 크다"로 서술.
//   - 한반도를 알아서 조형해주지 않는다 -> 반도 형태 + 황해 + 일본 열도 호를 명시.
const SCENE_2 = [
  'A handmade miniature model globe floating in a bright matte cream-white field — no table, no stand, no base, no board, no edges; the world simply continues beyond the frame.',
  '',
  'The globe is built exactly like the model in the second reference image: continents sculpted in relief from painted plaster and sifted sand, real moss packed into the mountain ranges and forests, oceans of deep muted cobalt-blue poured resin, polar caps of matte white plaster. Fine handmade texture everywhere — visible grain, dust and tiny imperfections.',
  '',
  'A single thin milled brass meridian ring encircles the globe and crosses the upper third of the frame, with one tiny brass satellite model mounted on the ring near the top.',
  '',
  'The globe is rotated so the Korean peninsula faces the camera dead-on at the centre of the visible disc: the peninsula is sculpted as a clear thumb-shaped landmass hanging south from the mainland, the Yellow Sea on its left, the curving Japanese island arc on its right, and a few small cotton-wool clouds resting over its southern coast.',
  '',
  'Framing: the globe is small in the frame, with a large margin of empty white space all around it — generous empty cream above, below, to the left and to the right. The whole sphere sits inside the frame, slightly below centre, and is never cropped.',
  '',
  'Lighting: one warm directional key from the upper left with a big soft white bounce filling the shadows — the same warm sculptural light as the reference — but lifted so the surrounding field reads as bright matte cream, not darkness.',
  '',
  'Macro photographic realism, medium-format sharpness, shallow depth of field falling off at the limb of the globe. A real physical object photographed in a studio.',
].join('\n');

const REF_ROLES_ORRERY = [
  'Use the first reference image ONLY for framing: how small the sphere is inside the frame and how much empty cream surrounds it. Ignore its colours and materials entirely.',
  'Use the second reference image ONLY for material, sculpting and light: the plaster-and-sand relief continents, the moss, the resin ocean, the milled brass ring, the macro realism. Ignore its dark background, its glowing pins and its stand completely.',
].join('\n');

const REALISM_2 = 'NOT a 3D render, NOT CGI, NOT illustration, NOT clay, no digital glow, no plastic sheen, no toy-town cuteness.';

// ORRERY 프레임이 끌고 들어올 수 있는 것들을 앞쪽에 못박는다:
// 어두운 배경, 주황·빨강 발광 핀, 검은 지도 핀/바늘, 황동 받침대.
const AVOID_2 = 'Avoid: dark background, black space, night, stars, board, table, plinth, base plate, '
  + 'stand, frame edge, glowing orange or red pin lights, illuminated city dots, black map pins, '
  + 'needles, blue sky, purple, neon, text, letters, logo, watermark, people, vehicles, cartoon, '
  + 'CGI look, glossy plastic, lens flare.';

const STILL_2 = [SCENE_2, REF_ROLES_ORRERY, REALISM_2, AVOID_2].join('\n\n');

// 3차는 2차 검수 결과를 보고 확정한다. 기본값은 2차와 동일.
const STILL_3 = STILL_2;

const PROMPTS = { 1: STILL_1, 2: STILL_2, 3: STILL_3 };
const REFS = { 1: [REF_COMP, REF_MAT], 2: [REF_COMP2, REF_ORRERY], 3: [REF_COMP2, REF_ORRERY] };

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
 * 검수 시트: (1) 납품본(리프레이밍 완료), (2) 한반도 부근 확대(형태·중심 판정),
 * (3) ORRERY 스타일 참조 — 를 세로로 붙인다.
 */
function sheet() {
  const raw = [1, 2, 3].map(outPng).filter(fs.existsSync).pop();
  if (!raw) throw new Error('스틸이 아직 없다');
  const framed = raw.replace(/\.png$/, '.framed.png');
  const hero = fs.existsSync(framed) ? framed : raw;
  const out = p('shots/kie/leg01-stills.jpg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fit = 'scale=1280:720:force_original_aspect_ratio=decrease,'
    + 'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xEAE1D0';
  execFileSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', hero, '-i', raw, '-i', REF_ORRERY,
    '-filter_complex',
    `[0:v]${fit}[a];`
    + `[1:v]crop=iw*0.30:ih*0.34:iw*0.36:ih*0.30,${fit}[b];`
    + `[2:v]${fit}[c];[a][b][c]vstack=inputs=3[o]`,
    '-map', '[o]', '-frames:v', '1', '-q:v', '3', out]);
  return {
    out: path.relative(ROOT, out).split(path.sep).join('/'),
    rows: [path.basename(hero), path.basename(raw) + ' — Korea 3.3x', path.basename(REF_ORRERY)],
  };
}

// --------------------------------------------------------------------- cli --
const cmd = process.argv[2];
const n = Number(process.argv[3] || 1);

if (cmd === 'credits') {
  console.log(await credits());
} else if (cmd === 'prompts') {
  for (const k of [1, 2, 3]) console.log(`--- STILL ${k} ---\n${PROMPTS[k]}\n`);
} else if (cmd === 'newround') {
  const l = ledger();
  l.roundStart = await credits();
  saveLedger(l);
  console.log(JSON.stringify({ roundStart: l.roundStart, cap: CAP }, null, 2));
} else if (cmd === 'sheet') {
  console.log(JSON.stringify(sheet(), null, 2));
} else if (cmd === 'still') {
  if (!PROMPTS[n]) throw new Error('시도 번호는 1, 2, 3 중 하나');
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
  console.error('usage: node tools/kie/leg-01-globe.mjs credits|prompts|newround|still <1|2|3>|sheet');
  process.exit(1);
}
