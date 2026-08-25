#!/usr/bin/env node
// Kling AI API 클라이언트 (Node 24, 의존성 없음 — fetch만 사용)
//
// 인증: 신형 "API Key" 방식. Authorization: Bearer <api-key-kling-...>
//       (구형 Access Key + Secret Key → JWT(HS256) 서명 방식이 아님. 서명 불필요.)
// 문서: https://kling.ai/document-api  (2026-08-26 확인)
//
// 주의: image()/video() 는 크레딧(Unit)을 소모합니다.
//       balance()/poll()/waitFor() 는 무과금 조회입니다.

import { readFileSync, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// 국제(싱가포르) 리전. api.klingai.com 도 동일하게 응답. 중국 리전은 api-beijing.klingai.com.
export const BASE = process.env.KLING_BASE_URL || 'https://api-singapore.klingai.com';

const ENV_FILE = resolve(process.cwd(), '.env.local');

/** .env.local 에서 KLING_API_KEY 를 읽는다. 값은 절대 로그로 출력하지 않는다. */
export function auth() {
  let key = process.env.KLING_API_KEY;
  if (!key) {
    try {
      const txt = readFileSync(ENV_FILE, 'utf8');
      const m = txt.match(/^\s*KLING_API_KEY\s*=\s*(.+?)\s*$/m);
      if (m) key = m[1].replace(/^["']|["']$/g, '');
    } catch { /* .env.local 없음 */ }
  }
  if (!key) throw new Error('KLING_API_KEY 없음 (.env.local 또는 환경변수에 설정하세요)');
  if (!key.startsWith('api-key-')) {
    throw new Error(
      'KLING_API_KEY 형식이 신형 API Key(api-key-...)가 아닙니다. ' +
      'Access Key/Secret Key 쌍이라면 JWT 서명 방식이 필요하며 신규 모델은 지원되지 않습니다.',
    );
  }
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** 키가 어떤 경로로든 문자열에 섞이면 밖으로 새지 않도록 마스킹 */
function redact(s) {
  return String(s).replace(/api-key-[A-Za-z0-9._-]+/g, 'api-key-<REDACTED>');
}

async function call(method, path, { body, query } = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: auth(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || (json && json.code !== undefined && json.code !== 0)) {
    const err = new Error(
      `Kling ${method} ${url.pathname} → HTTP ${res.status} `
      + `code=${json?.code ?? '?'} ${redact(json?.message ?? text).slice(0, 300)}`,
    );
    err.status = res.status;
    err.code = json?.code;
    err.body = json;
    throw err;
  }
  return json;
}

// ─────────────────────────────────────────────────────────────
// 잔액 / 리소스팩
// ─────────────────────────────────────────────────────────────

/**
 * 계정의 리소스팩 목록과 잔여 수량.
 * GET /account/costs?start_time=&end_time=   (둘 다 ms Unix timestamp, 필수)
 * - 잔여 수량 통계는 최대 12시간 지연될 수 있음(문서 명시).
 * - 리소스팩이 하나도 없으면 data.resource_pack_subscribe_infos 키 자체가 없다.
 */
export async function balance({ days = 30 } = {}) {
  const end = Date.now();
  const start = end - days * 86400_000;
  const json = await call('GET', '/account/costs', { query: { start_time: start, end_time: end } });
  const packs = json?.data?.resource_pack_subscribe_infos ?? [];
  const active = packs.filter((p) => p.status === 'online');
  return {
    raw: json,
    packs,
    activePacks: active,
    remaining: active.reduce((a, p) => a + (p.remaining_quantity || 0), 0),
  };
}

// ─────────────────────────────────────────────────────────────
// 이미지 생성 (스틸 / 첫 프레임 제작용)
// ─────────────────────────────────────────────────────────────

/**
 * POST /v1/images/generations   → GET /v1/images/generations/{id}
 * @param {object} o
 * @param {string}  o.prompt            긍정 프롬프트 (≤2500자)
 * @param {string} [o.negative]         네거티브 (참조 이미지와 병용 불가)
 * @param {string} [o.ref]              참조 이미지 URL 또는 raw Base64 (data: 접두어 금지)
 * @param {'subject'|'face'} [o.refType='subject']
 * @param {number} [o.fidelity=0.5]     참조 충실도 [0,1]
 * @param {string} [o.ar='16:9']        16:9 9:16 1:1 4:3 3:4 3:2 2:3 21:9
 * @param {'1k'|'2k'} [o.resolution='1k']
 * @param {number} [o.n=1]              1~9 (동시성을 n만큼 소모)
 * @param {string} [o.model='kling-v3'] kling-v1 | kling-v1-5 | kling-v2 | kling-v2-new | kling-v2-1 | kling-v3
 */
export async function image({
  prompt, negative, ref, refType = 'subject', fidelity = 0.5,
  ar = '16:9', resolution = '1k', n = 1, model = 'kling-v3',
  externalId, callbackUrl,
} = {}) {
  if (!prompt) throw new Error('image(): prompt 필수');
  const body = { model_name: model, prompt, n, aspect_ratio: ar, resolution };
  if (negative && !ref) body.negative_prompt = negative;
  if (ref) { body.image = ref; body.image_reference = refType; body.image_fidelity = fidelity; }
  if (externalId) body.external_task_id = externalId;
  if (callbackUrl) body.callback_url = callbackUrl;
  const json = await call('POST', '/v1/images/generations', { body });
  return { id: json.data.task_id, kind: 'v1-image', raw: json };
}

// ─────────────────────────────────────────────────────────────
// 이미지 → 비디오
// ─────────────────────────────────────────────────────────────

// 신형 통합 스키마(contents/settings/options)를 쓰는 모델 → 엔드포인트
const NEW_STYLE = {
  'kling-v2-5-turbo': '/image-to-video/kling-2.5-turbo',
  'kling-2.5-turbo': '/image-to-video/kling-2.5-turbo',
  'kling-v2-6': '/image-to-video/kling-2.6',
  'kling-2.6': '/image-to-video/kling-2.6',
  'kling-v3': '/image-to-video/kling-3.0',
  'kling-3.0': '/image-to-video/kling-3.0',
  'kling-3.0-turbo': '/image-to-video/kling-3.0-turbo',
  'kling-v3-omni': '/image-to-video/kling-3.0-omni',
};

/**
 * @param {object} o
 * @param {string}  o.prompt          모션 프롬프트 (≤2500자)
 * @param {string} [o.negative]       네거티브. 신형 스키마엔 별도 필드가 없어 prompt에 병합된다.
 * @param {string}  o.image           시작 프레임: URL 또는 raw Base64
 * @param {string} [o.imageTail]      끝 프레임(선택). 신형 스키마에서는 1080p 강제.
 * @param {string} [o.model='kling-v2-5-turbo']
 * @param {'std'|'pro'|'4k'} [o.mode] 구형 스키마 전용. 신형은 resolution 사용.
 * @param {'720p'|'1080p'} [o.resolution]
 * @param {number} [o.seconds=5]      신형: 5|10, 구형 v2-1: 5|10
 * @param {string} [o.ar='16:9']      구형 스키마 전용 (image 제공 시 무시됨)
 * @param {number} [o.cfgScale]       구형 스키마 전용. kling-v2.x 는 미지원.
 */
export async function video({
  prompt, negative, image: img, imageTail, model = 'kling-v2-5-turbo',
  mode, resolution, seconds = 5, ar = '16:9', cfgScale,
  externalId, callbackUrl, watermark = false,
} = {}) {
  if (!img && !imageTail) throw new Error('video(): image 또는 imageTail 중 하나는 필수');

  const newPath = NEW_STYLE[model];
  if (newPath) {
    // 신형 통합 스키마
    let res = resolution || (mode === 'std' ? '720p' : '1080p');
    // 첫+끝 프레임은 1080p만 지원 (문서 명시)
    if (imageTail && res !== '1080p') res = '1080p';
    const text = negative ? `${prompt}\nAvoid: ${negative}` : prompt;
    const contents = [{ type: 'prompt', text }];
    if (img) contents.push({ type: 'first_frame', url: img });
    if (imageTail) contents.push({ type: 'last_frame', url: imageTail });
    const body = {
      contents,
      settings: { resolution: res, duration: seconds },
      options: { watermark_info: { enabled: watermark } },
    };
    if (externalId) body.options.external_task_id = externalId;
    if (callbackUrl) body.options.callback_url = callbackUrl;
    const json = await call('POST', newPath, { body });
    return { id: json.data.id, kind: 'tasks', raw: json };
  }

  // 구형 스키마 (kling-v1 ~ kling-v2-1-master). v2-1 계열은 2026-09-15 폐지 예정.
  const body = { model_name: model, prompt, duration: String(seconds), mode: mode || 'pro' };
  if (img) body.image = img;
  if (imageTail) body.image_tail = imageTail;
  if (negative) body.negative_prompt = negative;
  if (!img) body.aspect_ratio = ar;
  if (cfgScale !== undefined && !/^kling-v2/.test(model)) body.cfg_scale = cfgScale;
  if (externalId) body.external_task_id = externalId;
  if (callbackUrl) body.callback_url = callbackUrl;
  const json = await call('POST', '/v1/videos/image2video', { body });
  return { id: json.data.task_id, kind: 'v1-video', raw: json };
}

// ─────────────────────────────────────────────────────────────
// 폴링 (무과금, 동시성도 소모하지 않음)
// ─────────────────────────────────────────────────────────────

const DONE = new Set(['succeed', 'succeeded', 'failed']);

/**
 * 태스크 1건 조회.
 * @param {string|{id:string,kind:string}} ref
 * @param {'tasks'|'v1-video'|'v1-image'} [kind='tasks']
 */
export async function poll(ref, kind) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const k = kind || (typeof ref === 'object' && ref.kind) || 'tasks';

  if (k === 'v1-video' || k === 'v1-image') {
    const path = k === 'v1-video'
      ? `/v1/videos/image2video/${id}`
      : `/v1/images/generations/${id}`;
    const json = await call('GET', path);
    const d = json.data || {};
    const r = d.task_result || {};
    return {
      id: d.task_id || id,
      status: d.task_status,
      done: DONE.has(d.task_status),
      message: d.task_status_msg,
      urls: [...(r.videos || []), ...(r.images || [])].map((x) => x.url).filter(Boolean),
      raw: json,
    };
  }

  // 신형: GET /tasks?task_ids=<id>  (커스텀 ID로 조회하려면 external_task_ids 사용)
  const json = await call('GET', '/tasks', { query: { task_ids: id } });
  const t = (json.data || [])[0];
  if (!t) return { id, status: 'unknown', done: false, urls: [], raw: json };
  return {
    id: t.id,
    status: t.status,
    done: DONE.has(t.status),
    message: t.message,
    urls: (t.outputs || []).map((o) => o.url || o.mp3_url).filter(Boolean),
    raw: json,
  };
}

/** done 될 때까지 폴링 */
export async function waitFor(ref, { intervalMs = 5000, timeoutMs = 15 * 60_000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await poll(ref);
    if (s.done) return s;
    if (Date.now() - t0 > timeoutMs) throw new Error(`폴링 타임아웃: ${s.id} (${s.status})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ─────────────────────────────────────────────────────────────
// 다운로드
// ─────────────────────────────────────────────────────────────

/** 결과 URL을 파일로 저장. 결과물은 생성 30일 후 삭제되므로 즉시 받아둘 것. */
export async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download 실패 HTTP ${res.status}: ${String(url).slice(0, 120)}`);
  await mkdir(dirname(path), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  return path;
}

// ─────────────────────────────────────────────────────────────
// CLI — 조회 전용. 생성은 모듈 import 로만 노출한다.
// ─────────────────────────────────────────────────────────────

if (import.meta.filename === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'balance') {
      const b = await balance();
      console.log(JSON.stringify(b.raw, null, 2));
      console.log(`리소스팩 ${b.packs.length}개 / 활성 ${b.activePacks.length}개 / 잔여 합계 ${b.remaining} Unit`);
    } else if (cmd === 'poll') {
      console.log(JSON.stringify(await poll(rest[0], rest[1]), null, 2));
    } else if (cmd === 'download') {
      console.log(await download(rest[0], rest[1]));
    } else {
      console.log('사용법: node tools/kling/kling.mjs <balance | poll <id> [tasks|v1-video|v1-image] | download <url> <path>>');
      console.log('생성(image/video)은 크레딧을 소모하므로 CLI로 노출하지 않습니다. 모듈로 import 하세요.');
    }
  } catch (e) {
    console.error(redact(e.message));
    process.exitCode = 1;
  }
}
