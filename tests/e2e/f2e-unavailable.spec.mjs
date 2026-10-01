// F2-E llm_unavailable — on 모드에서 LLM 사슬(vLLM → Ollama)이 전부 응답 없음 → /agent/alive 로 먼저 알고 실제 run 녹음 재생 · 콘솔 0 · POST 0
// 차단 방법: 게이트웨이 런타임 덮어쓰기(Redis agent:backends → 닫힌 포트). 컨테이너 종료 0 · 테스트 뒤 원상 복구.
// (판정 영상은 같은 효과를 hosts 규칙 server/agent/netblock.ps1 -Block 으로 보인다)
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const redis = (args) => execSync(`docker exec landxi-redis redis-cli ${args}`, { encoding: 'utf8' }).trim();

test.skip(!API, 'on 모드 전용');

test('사슬 전부 죽음 → 리플레이 마스트 · 같은 장면 · 콘솔 0 · POST /agent/runs 0', async ({ page }) => {
  test.setTimeout(150000);
  const saved = redis('HGETALL agent:backends').split('\n').filter(Boolean);
  const errs = [], posts = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/agent\/runs$/.test(r.url())) posts.push(r.url()); });
  const s = await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'test@lx.or.kr', password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) })).json();
  await page.addInitScript(([s, api]) => { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_agent_base'); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); }, [s, API]);
  for (let k = 0; k < 2; k++) { await page.goto('/landxi/xi/index.html'); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 }); }
  await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 20000 });
  try {
    redis('HSET agent:backends vllm_url http://127.0.0.1:8009/v1 ollama_url http://127.0.0.1:8010/v1');
    await page.keyboard.press('Control+k');
    await page.locator('.ag-cmd input').fill('아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘');
    await page.locator('.ag-cmd input').press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.agentReplay === '1', null, { timeout: 20000 });
    await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
    await expect(page.locator('.ag-lane .ag-mast')).toContainText('기록 · 저장 결과 재생');
    await expect(page.locator('.ag-lane .ag-mast')).toContainText('llm_unavailable');
    expect(await page.locator('.ag-lane .ag-step').count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.ag-lane .ag-route .ag-tag')).toContainText('기록');                       // 녹음 ms = 기록(실측 아님)
    for (const t of await page.locator('.ag-lane .ag-step .ms').allInnerTexts()) expect(t).not.toContain('실측');
    await page.screenshot({ path: 'shots/f2/E/e2e-unavailable.png' });
  } finally {
    redis('DEL agent:backends');
    for (let i = 0; i + 1 < saved.length; i += 2) redis(`HSET agent:backends ${saved[i]} ${saved[i + 1]}`);
  }
  expect(posts).toEqual([]);
  expect(errs).toEqual([]);
});
