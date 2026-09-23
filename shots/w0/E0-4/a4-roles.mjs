import { launch, ctx, watch, measure, BASE, OUT } from './lib.mjs';
import fs from 'fs';
// E0-4 복사본 — 원본(shots/audit-0923/analysis/a4-roles.mjs)과 다른 점: 비활성 버튼을 누르지 않는다(누르면 30s 대기 후 예외),
// '할 수 있나' 값은 **존재 + 활성**(:not([disabled]))으로 잰다 — Q4 임시 ①은 숨기지 않고 비활성이다. 관리자 블록은 E0-4 범위 밖이라 뺐다.
const b = await launch(); const log = []; const R = {};
// sales
{ const c = await ctx(b, 'sales'); const p = await c.newPage(); watch(p, log); const shot = (n) => p.screenshot({ path: OUT + n + '.png' });
  await p.goto(BASE + 'analysis-ai.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); await shot('70-sales-shelf'); R.salesUrl = p.url();
  R.salesRail = await p.$$eval('nav a, .rail a', (a) => a.map((x) => x.textContent.trim()).filter(Boolean)).catch(() => []);
  R.salesTabs = await p.$$eval('#atabs a', (a) => a.map((x) => x.textContent.trim()));
  R.salesRunBtn = await p.$eval('#cd-run', (e) => ({ t: e.textContent, d: e.disabled })); R.salesHint = await p.$$eval('.dp-hint', (a) => a.map((x) => x.textContent));
  R.salesTpShown = !!(await p.$('#tp-open')); R.salesTp = !!(await p.$('#tp-open:not([disabled])'));
  const proj = await p.$('#to-project'); if (proj) { await proj.click(); await p.waitForTimeout(1500); R.salesProjClick = p.url(); await shot('71-sales-project-denied'); await p.goBack(); await p.waitForTimeout(800); }
  await p.goto(BASE + 'analysis-ai.html?tab=run&card=card-farm', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const bx = await p.$$('[data-img] input'); await bx[0].check(); await p.waitForTimeout(500); R.salesGo = await p.$eval('#go-run', (e) => e.disabled); await shot('72-sales-run');
  if (!R.salesGo) await p.click('#go-run'); await p.waitForTimeout(1500); await shot('73-sales-run-progress'); R.salesRunStarted = !!(await p.$('#prog'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  R.salesUploadBtn = !!(await p.$('#from-up')) || !!(await p.$('.up-box')); if (R.salesUploadBtn) { await p.click('#from-up'); await p.waitForTimeout(1500); } R.salesUpload = p.url(); await shot('74-sales-upload-redirect');
  await p.goto(BASE + 'analysis-ai.html?tab=done', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await shot('75-sales-done');
  R.salesEditShown = !!(await p.$('#ed-open')); R.salesEditBtn = !!(await p.$('#ed-open:not([disabled])')); R.salesShare = !!(await p.$('#dp-share:not([disabled])')); R.salesDel = !!(await p.$('#dp-del:not([disabled])')); R.salesDown = !!(await p.$('#dp-down:not([disabled])'));
  R.salesEditing = false;
  if (R.salesEditBtn) { await p.click('#ed-open'); await p.waitForTimeout(1500); await shot('76-sales-edit-open'); R.salesEditing = !!(await p.$('#ed-save')); }
  await p.goto(BASE + 'analysis-ai.html?tab=running', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); R.salesCancelShown = !!(await p.$('#rp-cancel')); R.salesCancel = !!(await p.$('#rp-cancel:not([disabled])')); await shot('77-sales-running');
  await p.goto(BASE + 'ai-card.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); R.salesAiCard = p.url();
}
fs.writeFileSync(OUT + 'a4.json', JSON.stringify({ R, log: log.filter((x) => x.t !== 'reqfail') }, null, 1));
await b.close();
