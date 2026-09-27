// F2-E 장면 2 — 보고서 서랍 '초안 작성'(종이 SPLIT-5050) · 토큰 즉시 타이핑 · 서술 문장 전부 [n] · [3] → 지도 flyTo + 필지 카드 · .docx 3클릭
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const AB = process.env.LX_AGENT_BASE || null;          // 개발 :8703(훅 전) · 없으면 게이트웨이
async function login(realm = 'lx', role = 'staff', tenant = null) {
  const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
  return r.json();
}
async function bootXI(page, { realm = 'lx', role = 'staff', tenant = null, q = '' } = {}) {
  const s = API ? await login(realm, role, tenant) : null;
  await page.addInitScript(([s, api, ab, realm, role, tenant]) => {
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (ab) localStorage.setItem('lx_agent_base', ab); else localStorage.removeItem('lx_agent_base');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-27T09:00:00+09:00' })); }
  }, [s, API, AB, realm, role, tenant]);
  const url = '/landxi/xi/index.html' + q;
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  // 서비스 워커가 제어한 두 번째 로드부터 XI 가 에이전트를 마운트한다(F2-A 규칙)
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 20000 });
  return s;
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const CONTRACT = new Set(['catalog_layers', 'results_stats', 'results_features', 'parcel_at', 'results_parcels_join', 'survey_findings', 'survey_stats', 'survey_parcel',
  'jobs_quote', 'jobs_submit', 'survey_state', 'map_on', 'map_arrive', 'map_flyto', 'map_frame', 'drawer_open', 'parcel_card', 'llm_write', 'survey_reports_draft']);


test.skip(!API, 'on 모드 전용');

test('초안 작성 → 타이핑 → [3] flyTo + 필지 카드 → .docx', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  await bootXI(page, { q: '?mode=survey' });
  // 1클릭: 보고서 서랍 초안 작성 탭(카드·서랍의 '보고서 초안 ›'과 같은 경로)
  await page.evaluate(() => window.XI.openDrawer('report', { tab: 'draft', emd_cd: '52190450', rule: 'R1' }));
  const paper = page.locator('.ag-paper');
  await expect(paper).toBeVisible();
  // 토큰 즉시 타이핑 — 서로 다른 길이 3번 이상 관측(합성 40ms 타자 아님 · agent.token)
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const v = await page.evaluate(() => document.documentElement.dataset.agentDraftTyping || '');
    if (v) seen.add(v);
    if (await page.evaluate(() => document.documentElement.dataset.agentDraftDone === '1')) break;
    await page.waitForTimeout(150);
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  await page.waitForFunction(() => document.documentElement.dataset.agentDraftDone === '1', null, { timeout: 60000 });
  // 서술 문장 전부 인용(고정 문구 제외) · 계획 4행 · 법령 2차 결손
  await expect(paper.locator('.ag-pstate')).toContainText('인용 없는 문장 0');
  await expect(paper.locator('.ag-pstate')).toContainText('검증 안 된 숫자 0');
  expect(await paper.locator('.ag-body .ag-n').count()).toBeGreaterThan(2);
  expect(await paper.locator('.ag-paper-plan li').count()).toBe(5);        // survey_stats · survey_findings · llm_write · llm_review · survey_reports_draft
  // 봉투 뜻 단언(2차 판정): 필지 문장(필지 인용 [n] 또는 리 이름)에 읍면동 집계 봉투(연속지적 필지 수)·다른 규칙 건수 자리표가
  // 표기(봉투 뜻 확인 필요) 없이 들어가면 실패 · .docx 는 F2-S 정본 서식 경로
  const misuse = await page.evaluate(() => {
    const d = window.LXAgentDraft.done, rule = d.report?.rule || 'R1';
    const parcelN = new Set((d.citations || []).filter((c) => c.kind === 'parcel').map((c) => c.n));
    const flagged = new Set((d.meaning_flags || []).map((f) => f.sentence.trim()));
    const bad = [];
    for (const para of d.answer_md.split(String.fromCharCode(10))) {
      if (!para.trim() || para.trim().startsWith('#')) continue;
      const sents = para.match(/[^.!?。]*(?:[.!?。](?:[ 	]*\[\d{1,2}(?:\s*[,·]\s*\d{1,2})*\])*|$)/g) || [];
      for (const raw of sents) {
        const s = raw.trim(); if (!s) continue;
        const cites = [...s.matchAll(/\[(\d{1,2}(?:\s*[,·]\s*\d{1,2})*)\]/g)].flatMap((m) => m[1].split(/\s*[,·]\s*/).map(Number));
        const parcelSentence = cites.some((n) => parcelN.has(n)) || /[가-힣]{1,4}리(?![가-힣])/.test(s);
        if (!parcelSentence || flagged.has(s)) continue;
        for (const m of s.matchAll(/\{\{env:([A-Za-z0-9_]+)\}\}/g)) {
          const meaning = d.env_meta[m[1]] || '';
          const other = /(R[1-6])/.exec(meaning);
          if (/연속지적 필지 수/.test(meaning) && /[가-힣]{1,4}리(?![가-힣])\s*\S{0,4}\s*$/.test(s.slice(0, m.index))) bad.push(`${m[1]} ${meaning} ← ${s}`);
          if (other && other[1] !== rule && !s.replace(m[0], '').includes(other[1])) bad.push(`${m[1]} ${meaning} ← ${s}`);
        }
      }
    }
    return { bad, docx: d.artifact?.docx?.path, source: d.artifact?.source };
  });
  expect(misuse.bad, JSON.stringify(misuse.bad)).toEqual([]);
  expect(misuse.docx, misuse.source).toBe('f2s');
  expect(misuse.source).toContain('F2-S 정본 서식');
  await expect(paper.locator('.ag-void2')).toContainText('법령 인용 · 2차');
  const addr = await paper.locator('.ag-evt').evaluateAll((els) => els.flatMap((e) => e.textContent.match(/\d+(-\d+)?/g) || []));
  const naked = await paper.locator('.ag-body').evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('.ag-n,.ag-unv,.ag-cite').forEach((x) => x.remove()); return (c.textContent.replace(/\d+(?:-\d+)+/g, ' ').replace(/\d+\s?(?:위|번째|차례|단계)/g, ' ').match(/(?<![A-Za-z\d])\d[\d,.]*/g) || []).filter((n) => n.length !== 8); });
  expect(naked.filter((n) => !addr.includes(n))).toEqual([]);
  // [3] → flyTo + 필지 카드(서랍 유지)
  await paper.locator('.ag-evi[data-cite="3"]').click();
  const tCite = Date.now();
  await page.waitForFunction(() => document.documentElement.dataset.agentCite === '3', null, { timeout: 8000 });
  // F2 통합(F2-E must_fix ⑤): 카드 자체가 보인다(대장 vs 현황) — 카메라와 병렬로 2 s 안
  await expect(page.locator('#pcard2')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#pcard2')).toContainText(/대장/);
  console.log('cite → #pcard2 ms', Date.now() - tCite);
  await page.waitForTimeout(600);
  await expect(paper).toBeVisible();
  await page.screenshot({ path: 'shots/f2/E/e2e-report-cite.png' });
  // .docx
  const [dl] = await Promise.all([page.waitForEvent('download'), paper.locator('.ag-docx').click()]);
  expect(dl.suggestedFilename()).toMatch(/^실태조사_초안_아영면_\d{8}\.docx$/);
  const p = await dl.path();
  const fs = await import('node:fs');
  expect(fs.statSync(p).size).toBeGreaterThan(20000);
  expect(errs).toEqual([]);
});
