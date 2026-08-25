#!/usr/bin/env node
/**
 * kie.ai 미니어처 다이어라마 leg 파이프라인 클라이언트 (Node 24, fetch 전용, 의존성 0).
 *
 * 엔드포인트 (2026-08-26 docs.kie.ai 확인):
 *   POST https://api.kie.ai/api/v1/jobs/createTask       { model, input }
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *        -> data.state ∈ waiting|queuing|generating|success|fail
 *           data.resultJson  (JSON 문자열) -> { resultUrls: [...] }
 *           data.creditsConsumed, data.costTime
 *   GET  https://api.kie.ai/api/v1/chat/credit           -> { code:200, data: <잔액> }
 *   POST https://kieai.redpandaai.co/api/file-base64-upload  (로컬 파일 -> 호스팅 URL)
 *
 * API:
 *   await credits()                              -> number
 *   await still(prompt, { ref, ar, out })        -> { file, credits, ms, taskId }
 *   await video(prompt, { image, seconds, out }) -> { file, credits, ms, taskId }
 *
 * 키: .env.local 의 KIE_AI_API_KEY (또는 이미 설정된 process.env). 절대 출력하지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.kie.ai';
const UPLOAD = 'https://kieai.redpandaai.co/api/file-base64-upload';

export const MODELS = {
  stillText: 'seedream/5-pro-text-to-image',
  stillRef: 'seedream/5-pro-image-to-image',
  video: 'kling/v2-1-pro',
};

// seedream 이 실측으로 받아주는 값. 4:5 는 거부된다 (createTask 단계, 과금 없음).
export const AR_OK = new Set(['16:9', '9:16', '3:4']);

// ------------------------------------------------------------------ key --
function loadKey() {
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY.trim();
  let dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  for (let i = 0; i < 8; i++) {
    for (const name of ['.env.local', '.env']) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*KIE_AI_API_KEY\s*=\s*(.+?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, '');
      }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('KIE_AI_API_KEY 를 .env.local 에서 찾지 못했다');
}

let _H = null;
function headers() {
  if (!_H) _H = { 'Content-Type': 'application/json', Authorization: `Bearer ${loadKey()}` };
  return _H;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stderr.write(s + '\n');

// -------------------------------------------------------------- credits --
export async function credits() {
  const r = await fetch(`${API}/api/v1/chat/credit`, { headers: headers() });
  const j = await r.json();
  if (j.code !== 200) throw new Error('credit: ' + JSON.stringify(j));
  return typeof j.data === 'number' ? j.data : (j.data?.credit ?? j.data);
}

// --------------------------------------------------------------- upload --
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function uploadLocal(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error('입력 파일 없음: ' + abs);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const dataUrl = `data:${MIME[ext] || 'application/octet-stream'};base64,${fs.readFileSync(abs).toString('base64')}`;
  const res = await fetch(UPLOAD, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'landxi', fileName: path.basename(abs) }),
  });
  const j = await res.json().catch(() => ({}));
  const url = j?.data?.downloadUrl || j?.data?.fileUrl || j?.data?.url;
  if (!url) throw new Error('업로드 실패: ' + JSON.stringify(j).slice(0, 400));
  return url;
}

const asUrl = (v) => (/^https?:\/\//i.test(v) ? Promise.resolve(v) : uploadLocal(v));

// ----------------------------------------------------------------- task --
async function createTask(model, input) {
  const res = await fetch(`${API}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, input }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== 200 || !j?.data?.taskId) throw new Error(`createTask ${model}: ${JSON.stringify(j).slice(0, 500)}`);
  return j.data.taskId;
}

async function waitTask(taskId, { label = 'job', timeoutMs = 20 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  let delay = 4000;
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label}: ${Math.round((Date.now() - t0) / 1000)}s 후 타임아웃`);
    const res = await fetch(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: headers() });
    const j = await res.json().catch(() => ({}));
    const d = j?.data || {};
    const state = d.state || d.status;
    if (state === 'success') {
      let out = d.resultJson;
      if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* noop */ } }
      const urls = out?.resultUrls || out?.result_urls || out?.urls || [];
      if (!urls.length) throw new Error(`${label}: success 인데 결과 URL 없음: ${JSON.stringify(d).slice(0, 400)}`);
      return { urls, credits: d.creditsConsumed ?? null, ms: d.costTime ?? Date.now() - t0 };
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(`${label} 실패: ${d.failMsg || d.failCode || JSON.stringify(d).slice(0, 400)}`);
    }
    log(`  ${label}: ${state || 'queued'} ${d.progress != null ? d.progress + '% ' : ''}(${Math.round((Date.now() - t0) / 1000)}s)`);
    await sleep(delay);
    delay = Math.min(delay * 1.25, 15000);
  }
}

export async function download(url, out) {
  const abs = path.resolve(out);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
  return abs;
}

// ---------------------------------------------------------------- still --
/**
 * @param {string} prompt  preamble + 빈 줄 + scene (preamble 은 매번 토씨 그대로)
 * @param {{ref?:string|string[], ar?:string, quality?:string, out?:string}} opts
 */
export async function still(prompt, opts = {}) {
  const { ref, ar = '16:9', quality = 'high', out } = opts;
  if (!AR_OK.has(ar)) throw new Error(`aspect_ratio ${ar} 는 seedream 미검증. 허용 실측값: ${[...AR_OK].join(', ')}`);
  const refs = ref ? (Array.isArray(ref) ? ref : [ref]) : [];
  // aspect_ratio / quality / output_format 은 셋 다 필수. 하나라도 빠지면
  // 어느 필드인지 말해주지 않는 "This field is required" 만 돌아온다.
  const input = { prompt, aspect_ratio: ar, quality, output_format: 'png', nsfw_checker: false };
  let model = MODELS.stillText;
  if (refs.length) {
    model = MODELS.stillRef;
    input.image_urls = await Promise.all(refs.map(asUrl));
  }
  const t0 = Date.now();
  const taskId = await createTask(model, input);
  const r = await waitTask(taskId, { label: out ? path.basename(out) : 'still', timeoutMs: 10 * 60 * 1000 });
  const file = out ? await download(r.urls[0], out) : null;
  return { file, url: r.urls[0], credits: r.credits, ms: r.ms, wallMs: Date.now() - t0, taskId, model };
}

// ---------------------------------------------------------------- video --
/**
 * @param {string} prompt  카메라 무브 (무엇이 계속되는가 → 어떻게 움직이는가 → 네거티브)
 * @param {{image:string, seconds?:number|string, tail?:string, out?:string, negative?:string}} opts
 */
export async function video(prompt, opts = {}) {
  const { image, seconds = 5, tail, out, negative } = opts;
  if (!image) throw new Error('video: image (시작 프레임) 필수');
  const input = {
    prompt,
    image_url: await asUrl(image),
    duration: String(seconds),
    // 스크럽에서 깨지는 것만 정확히 겨냥한 네거티브.
    negative_prompt: negative ?? 'blur, distortion, low quality, warping, morphing, jitter, flicker, text, watermark, subtitles, cut, scene change, people, vehicles',
    cfg_scale: 0.5,
  };
  if (tail) input.tail_image_url = await asUrl(tail);
  const t0 = Date.now();
  const taskId = await createTask(MODELS.video, input);
  const r = await waitTask(taskId, { label: out ? path.basename(out) : 'video', timeoutMs: 25 * 60 * 1000 });
  const file = out ? await download(r.urls[0], out) : null;
  return { file, url: r.urls[0], credits: r.credits, ms: r.ms, wallMs: Date.now() - t0, taskId, model: MODELS.video };
}

// ------------------------------------------------------------------ cli --
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('kie.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n, d = null) => { const i = rest.indexOf(n); return i > -1 && rest[i + 1] ? rest[i + 1] : d; };
  try {
    if (cmd === 'credits' || cmd === 'probe') {
      console.log(await credits());
    } else if (cmd === 'still') {
      const [prompt, out] = rest;
      const r = await still(prompt, { out, ar: flag('--ar', '16:9'), ref: flag('--ref') || undefined });
      console.log(JSON.stringify({ file: r.file, credits: r.credits, ms: r.ms, taskId: r.taskId }, null, 2));
    } else if (cmd === 'video') {
      const [prompt, image, out] = rest;
      const r = await video(prompt, { image, out, seconds: flag('--dur', '5'), tail: flag('--tail') || undefined });
      console.log(JSON.stringify({ file: r.file, credits: r.credits, ms: r.ms, taskId: r.taskId }, null, 2));
    } else {
      console.error(`node tools/kie/kie.mjs credits
node tools/kie/kie.mjs still "<prompt>" <out.png> [--ar 16:9] [--ref anchor.jpg]
node tools/kie/kie.mjs video "<move>" <head.png> <out.mp4> [--dur 5] [--tail t.png]`);
      process.exit(1);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
