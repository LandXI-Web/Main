#!/usr/bin/env node
/** 끊긴 태스크 복구: node tools/kie/recover-task.mjs <taskId> <out.mp4>
 *  recordInfo 를 폴링해 success 면 내려받는다. 과금 없음(생성 호출 아님). */
import fs from 'node:fs';
import path from 'node:path';
import { download } from './kie.mjs';
const [taskId, out] = process.argv.slice(2);
if (!taskId || !out) { console.error('usage: recover-task.mjs <taskId> <out.mp4>'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../.env.local'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const H = { Authorization: `Bearer ${env.KIE_AI_API_KEY}` };
for (let i = 0; i < 200; i++) {
  const j = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(taskId), { headers: H }).then(r => r.json());
  const d = j.data || {}; const st = d.state || d.status;
  if (st === 'success') { let o = d.resultJson; if (typeof o === 'string') { try { o = JSON.parse(o); } catch {} } const u = (o?.resultUrls || o?.result_urls || o?.urls || [])[0]; if (!u) throw new Error('no url'); await download(u, out); console.log(JSON.stringify({ ok: true, taskId, credits: d.creditsConsumed, out })); process.exit(0); }
  if (st === 'fail' || st === 'failed') { console.log(JSON.stringify({ ok: false, taskId, failCode: d.failCode, failMsg: d.failMsg, credits: d.creditsConsumed })); process.exit(1); }
  console.error(`  ${st || 'queued'} (${i * 15}s)`); await new Promise(r => setTimeout(r, 15000));
}
