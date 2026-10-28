/* ChatGEO run 산출 파일 내려받기(GET /agent/runs/{id}/files/{name}) — kec-land */
import fs from 'node:fs';
import { open, APP } from './cap.mjs';
const OUT = 'E:/도로공사/deck_part3b/chatgeo/files/'; fs.mkdirSync(OUT, { recursive: true });
const items = JSON.parse(process.argv[2]);   // [[href, 저장 이름]]
const { browser, page } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
await page.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
for (const [href, name] of items) {
  const r = await page.evaluate(async (href) => { const m = await import('/landxi/shared/api-v1.js');
    const r = await fetch(m.API.base + href, { headers: { authorization: 'Bearer ' + m.session.get().token } });
    if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 300) };
    const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return { status: 200, b64: btoa(s) }; }, href);
  if (r.b64) { fs.writeFileSync(OUT + name, Buffer.from(r.b64, 'base64')); console.log('ok', name, Buffer.from(r.b64, 'base64').length); } else console.log('fail', name, r.status, r.text);
}
await browser.close();
