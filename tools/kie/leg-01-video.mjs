#!/usr/bin/env node
/**
 * 1장 Leg 1 — 모형 지구본. **영상 단계.**
 *
 *   node tools/kie/leg-01-video.mjs credits
 *   node tools/kie/leg-01-video.mjs prompt
 *   node tools/kie/leg-01-video.mjs go        # 과금 1회 (kling/v2-1-pro 5s ≈ 50)
 *
 * 비용 게이트(클라이언트 지시 2026-08-26): 캡 55 = **과금 시도 정확히 1회**.
 * HTTP 500 무과금 실패만 재시도한다(kie.mjs 의 retryable 판정). 과금된 실패가
 * 나오면 그대로 던지고 두 번째 시도는 하지 않는다.
 *
 * 시작 프레임: still-2 순백 납품본(1920x1080). tail 은 비운다 —
 * Leg 2 가 이 leg 의 마지막 프레임을 상속받는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credits, video } from './kie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (...a) => path.join(ROOT, ...a);

const CAP = 55;                 // 이 작업 전체 크레딧 상한
const EST = 50;                 // kling/v2-1-pro 5s 실측 과금(남원 테스트 leg)
const HEAD = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.still-2.white.png');
const OUT = p('landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.mp4');
const RUN = p('shots/kie/leg01-video-run.json');

// --- 클라이언트 승인 프롬프트. 토씨 하나 바꾸지 않는다. ---------------------
const MOVE = 'Slow cinematic shot. The miniature model globe rotates gently (about 35 degrees over the clip) so the Korean peninsula arrives at the exact center, while the camera dollies in very slowly (about 8%). The brass orbit ring and the tiny satellite drift upward out of the top of the frame. Background stays seamless pure white, no haze, no gradient. Small cotton clouds over the southern coast drift slightly. Constant studio top-light, no flicker. No cuts, no camera shake, no zoom bursts. Ends with the globe filling about 75% of the frame height, Korea centered.';

const NEG = 'board, table, base, edge, black space, stars, blue sky, cream tint, vignette, text, logo, people, vehicles, flicker, camera shake, fast zoom, morphing continents, extra globes';

const cmd = process.argv[2];

if (cmd === 'credits') {
  console.log(await credits());
} else if (cmd === 'prompt') {
  console.log('--- MOVE ---\n' + MOVE + '\n\n--- NEGATIVE ---\n' + NEG);
} else if (cmd === 'go') {
  if (!fs.existsSync(HEAD)) throw new Error('시작 프레임 없음: ' + HEAD);
  if (fs.existsSync(OUT)) throw new Error('이미 mp4 가 있다. 재과금 방지를 위해 중단: ' + OUT);
  const before = await credits();
  if (before < EST) throw new Error(`잔액 ${before} < 예상 과금 ${EST}. 중단.`);
  console.error(`크레딧 before=${before} / 캡 ${CAP} / 과금 시도 1회`);
  const t0 = Date.now();
  const r = await video(MOVE, { image: HEAD, seconds: 5, out: OUT, negative: NEG });
  const after = await credits();
  const rec = {
    step: 'leg-01-video', model: r.model, taskId: r.taskId,
    file: path.relative(ROOT, r.file).split(path.sep).join('/'),
    head: path.relative(ROOT, HEAD).split(path.sep).join('/'),
    tail: null,
    creditsBefore: before, creditsAfter: after, creditsDelta: before - after,
    creditsConsumedField: r.credits, cap: CAP,
    apiCostMs: r.ms, wallMs: Date.now() - t0, tries: r.tries,
    at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(RUN), { recursive: true });
  fs.writeFileSync(RUN, JSON.stringify(rec, null, 2));
  console.log(JSON.stringify(rec, null, 2));
  if (rec.creditsDelta > CAP) console.error(`!! 캡 초과: ${rec.creditsDelta} > ${CAP}`);
} else {
  console.error('usage: node tools/kie/leg-01-video.mjs credits|prompt|go');
  process.exit(1);
}
