#!/usr/bin/env node
/**
 * 테스트 leg 1개: 남원 금지면 비닐하우스 군락 — 미니어처 다이어라마.
 *
 *   node tools/kie/leg-namwon-greenhouse.mjs still   # seedream 5-pro image-to-image (≈14 크레딧)
 *   node tools/kie/leg-namwon-greenhouse.mjs video   # kling v2-1-pro 5s (≈50 크레딧)
 *   node tools/kie/leg-namwon-greenhouse.mjs credits
 *
 * 앵커: landxi/assets/proto/crops/namwon-greenhouse-2025/6-clean.jpg
 *   127.303756E, 35.352504N — 남원 금지면. 로컬 정사영상 namwon_city_2510 (gsd 0.6m),
 *   탐지 conf 0.9139, 비닐하우스_단동 5481.8㎡. hairline 오버레이 없는 clean 판을 쓴다
 *   (@2x 는 파란 탐지 폴리곤이 구워져 있어 레퍼런스로 넣으면 그 선이 다이어라마에 새어든다).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credits, still, video } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (...a) => path.join(ROOT, ...a);

const ANCHOR = p('landxi/assets/proto/crops/namwon-greenhouse-2025/6-clean.jpg');
const OUT_PNG = p('landxi/assets/proto/film/legs/gen/namwon-greenhouse-test.png');
const OUT_MP4 = p('landxi/assets/proto/film/legs/gen/namwon-greenhouse-test.mp4');

/**
 * ORRERY 프리앰블. 재질 목록은 EXAMPLES.md `orrery` 행 그대로
 * ("Handmade physical scale model, macro tilt-shift. Milled brass, painted plaster,
 *   real moss, poured resin, sifted sand, fibre-optic practicals.")
 * 거기에 worlds.md 가 요구하는 5요소(매체·렌즈 / 광원 / 그레이드 / 텍스처 / 네거티브)를
 * 채워 넣고, 우리 스펙에 맞춰 low-key → high-key 로 광원과 그레이드만 바꿨다.
 * 이 문단은 모든 스틸·비디오 프롬프트 맨 위에 토씨 하나 안 바꾸고 붙인다.
 */
export const PREAMBLE = [
  'Handmade physical scale model, macro tilt-shift, 100mm on a medium-format body.',
  'Milled brass, painted plaster, real moss, poured resin, sifted sand, fibre-optic practicals,',
  'with visible glue seams and dust on the baseboard.',
  'One large soft overhead studio source with a huge white bounce, near-shadowless,',
  'a single soft contact shadow under the model.',
  'Low-saturation colour grade of warm white, pale neutral and dusty green,',
  'with one cobalt-blue accent and nothing else saturated.',
  'Medium-format sharpness, fine grain, real depth-of-field falloff at the edges of the board.',
  'Photographic realism. NOT a 3D render, NOT clay, NOT illustration, NOT CGI,',
  'no digital glow, no plastic sheen, no toy-town cuteness, no isometric game look.',
].join(' ');

export const SCENE = [
  'Handmade architectural model diorama of a Korean rural plain in Namwon:',
  'rows of tiny arched white vinyl greenhouses running in parallel across the board,',
  'rice paddies, a small river, low hills behind;',
  'overhead-oblique view looking down at about 55 degrees;',
  'white paper sky; soft studio light;',
  'muted palette with a single cobalt-blue accent;',
  'the model sits on a seamless bone-white paper ground and the upper third of the frame is empty white;',
  'no text, no people, no road labels.',
].join(' ');

export const MOVE = [
  'The camera descends slowly and steadily toward the rows of white greenhouses,',
  'one smooth continuous dolly-down with a very slight forward drift.',
  'Soft cloud shadows drift across the paddies from left to right.',
  'The greenhouse rows stay in frame from the first frame to the last;',
  'nothing enters and nothing leaves.',
  'One single continuous take, no cuts, no camera shake, no zoom snap.',
  'Slow, controlled, no text.',
].join(' ');

export const STILL_PROMPT = `${PREAMBLE}\n\n${SCENE}`;
export const VIDEO_PROMPT = `${PREAMBLE}\n\n${MOVE}`;

const cmd = process.argv[2];

if (cmd === 'credits') {
  console.log(await credits());
} else if (cmd === 'still') {
  const before = await credits();
  console.error(`크레딧 before: ${before}`);
  const t0 = Date.now();
  const r = await still(STILL_PROMPT, { ref: ANCHOR, ar: '16:9', out: OUT_PNG });
  const after = await credits();
  console.log(JSON.stringify({
    step: 'still', model: r.model, taskId: r.taskId, file: r.file,
    creditsBefore: before, creditsAfter: after, creditsDelta: before - after,
    creditsConsumedField: r.credits, apiCostMs: r.ms, wallMs: Date.now() - t0,
  }, null, 2));
} else if (cmd === 'video') {
  const before = await credits();
  console.error(`크레딧 before: ${before}`);
  const t0 = Date.now();
  const r = await video(VIDEO_PROMPT, { image: OUT_PNG, seconds: 5, out: OUT_MP4 });
  const after = await credits();
  console.log(JSON.stringify({
    step: 'video', model: r.model, taskId: r.taskId, file: r.file,
    creditsBefore: before, creditsAfter: after, creditsDelta: before - after,
    creditsConsumedField: r.credits, apiCostMs: r.ms, wallMs: Date.now() - t0,
  }, null, 2));
} else if (cmd === 'prompts') {
  console.log('--- STILL ---\n' + STILL_PROMPT + '\n\n--- VIDEO ---\n' + VIDEO_PROMPT);
} else {
  console.error('usage: node tools/kie/leg-namwon-greenhouse.mjs credits|prompts|still|video');
  process.exit(1);
}
