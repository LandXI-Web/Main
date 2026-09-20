// 서비스 지원 — 구현 화면(1440×900)과 원판 PNG 를 좌우로 붙인 비교 그림을 만든다.
// usage: PORT=4192 node tools/proto/support-vs-master.mjs   (서버: PORT=4192 node tools/serve.mjs)
// 출력: shots/proto/support-vs-master-<상태>.png  (왼쪽 = 구현, 오른쪽 = 원판)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4192;
const root = process.cwd();
const outDir = path.join(root, 'shots/proto'); fs.mkdirSync(outDir, { recursive: true });
const only = process.argv[2];

const STATES = [
  { name: 'notice', master: 'B6-Support-Notice-Opt2', url: 'proto/notice.html' },
  { name: 'notice-detail', master: 'B6-Support-Notice-Detail', url: 'proto/notice.html?notice=7' },
  { name: 'notice-empty', master: 'B6-Support-Notice-Empty', url: 'proto/notice.html?q=' + encodeURIComponent('드론 배터리') },
  { name: 'faq', master: 'B6-Support-FAQ', url: 'proto/faq.html?faq=5' },
  { name: 'faq-empty', master: 'B6-Support-FAQ-Empty', url: 'proto/faq.html?cat=02&field=title&q=' + encodeURIComponent('보고서') },
  { name: 'contact', master: 'B6-Support-Contact', url: 'proto/contact.html', act: async (p) => { await p.fill('#inq-title', '정사영상 업로드 용량 한도 문의'); await p.fill('#inq-content', '드론 정사영상 1개 파일이 약 70GB인데 업로드 가능한가요?'); await p.setInputFiles('#inq-files', { name: '회색표시_캡처.png', mimeType: 'image/png', buffer: Buffer.alloc(1782580) }); await p.locator('#inq-title').blur(); } },
  { name: 'contact-error', master: 'B6-Support-Contact-Error', url: 'proto/contact.html', act: async (p) => { await p.click('#inq-save'); } },
  { name: 'contact-cancel', master: 'B6-Support-Contact-Cancel', url: 'proto/contact.html', act: async (p) => { await p.fill('#inq-title', '정사영상 업로드 용량 한도 문의'); await p.fill('#inq-content', '드론 정사영상 1개 파일이 약 70GB인데 업로드 가능한가요?'); await p.click('#inq-cancel'); } },
  { name: 'contact-view', master: 'B6-Support-Contact-View', url: 'proto/contact.html?inq=110' },
  { name: 'contact-view-pending', master: 'B6-Support-Contact-View-Pending', url: 'proto/contact.html?inq=115' },
  { name: 'contact-empty', master: 'B6-Support-Contact-Empty', url: 'proto/contact.html?q=' + encodeURIComponent('없는 제목') },
  { name: 'usecase', master: 'B6-Support-Usecase', url: 'proto/usecase.html' },
  { name: 'usecase-modal', master: 'B6-Support-Usecase-Modal', url: 'proto/usecase.html?uc=2' },
  { name: 'usecase-empty', master: 'B6-Support-Usecase-Empty', url: 'proto/usecase.html?field=title&q=' + encodeURIComponent('해양 쓰레기') },
  { name: 'manual', master: 'B6-Support-Manual', url: 'proto/manual.html' },
];

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
for (const s of STATES) {
  if (only && !s.name.startsWith(only)) continue;
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/landxi/${s.url}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await p.evaluate(() => document.fonts.ready);
  if (s.act) await s.act(p);
  await p.waitForTimeout(400);
  const mine = await p.screenshot({ type: 'png' });
  const master = fs.readFileSync(path.join(root, 'design-canvas/v2/renders', `${s.master}.png`));
  await p.setViewportSize({ width: 2896, height: 900 });
  await p.setContent(`<body style="margin:0;display:flex;gap:16px;background:#f0f"><img src="data:image/png;base64,${mine.toString('base64')}" width="1440" height="900"><img src="data:image/png;base64,${master.toString('base64')}" width="1440" height="900"></body>`);
  await p.waitForTimeout(150);
  const out = path.join(outDir, `support-vs-master-${s.name}.png`);
  await p.screenshot({ path: out });
  fs.writeFileSync(path.join(outDir, `support-${s.name}.png`), mine);
  console.log('saved', path.relative(root, out));
  await p.close();
}
await b.close();
