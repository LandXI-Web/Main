/* 같은 이름 숫자 자동 대조(now 페이지 제안 2 채택 · 사용자 규칙 3 '숫자 한 출처') — 배포(커밋 · 게이트웨이 재시작) 때 돌린다.
   바깥 주소(app · admin · namwon.land-xi.dev)를 로그인 폼으로 열어(세션 주입 없음) 화면에 보이는 숫자를 읽고,
   같은 이름의 숫자가 화면마다 같은지 표로 낸다. 읽는 숫자:
     정확도         · 서비스(지금 판)  — 분석하기 카드 'AI 모델 정확도' · 분석하기 자세히 · 배포 신청서 '지난 판' · 관리자 배포 신청(승인된 신청 '이번 판')
                    · 프로젝트 신청서(이번 판) — 직원 배포 신청서 '이번 판' · 관리자 배포 신청(검토 중 신청 '이번 판')
     AI 분석 결과   · 서비스 · 지역  — 분석하기 자세히 큰 숫자 · 기관 '내 서비스' 카드
     서비스 수      — 메인 'n가지 서비스 결과' · XI맵 전국 결과 '서비스 n가지'(GPT5-1)
     분석한 면적    · 기관            — 관리자 '기관' 화면(이번 달) · (사용 현황은 서비스별 칸이라 따로 적기만)
     결과 확인 기록 — 숫자 대조가 아니라 남지 않았는지만(원칙 203 · 10-12): 프로젝트 목록 · 프로젝트 화면 · 배포 신청서 · 관리자 신청서 · 관리자 배포(운영 탭)에
                    '지도에서 봤음 · 아직 보지 않음 · 확인했음 · 공개 뒤 결과 확인 남음' 같은 말이 보이면 실패
   그리고 모든 요청을 지켜 이 PC 주소(localhost · 127.0.0.1 · 사설 IP · :4173 · :8700 등) 호출이 0인지 본다.
   못 읽은 칸은 '—'(경고 · 실패 아님). 같은 이름인데 값이 다르거나 이 PC 주소 호출이 있으면 종료 코드 1.
   사용: node tools/check/numbers.mjs [--app https://app.land-xi.dev] [--admin https://admin.land-xi.dev] [--gov https://namwon.land-xi.dev] [--json 파일]
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD && !process.env.LX_PW) {
  try { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; } catch { /* 없음 */ }
}
process.env.LX_PW ||= process.env.DEV_PASSWORD || '';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const HOST = { app: arg('--app', 'https://app.land-xi.dev'), admin: arg('--admin', 'https://admin.land-xi.dev'), gov: arg('--gov', 'https://namwon.land-xi.dev') };
const GOV_TENANT = arg('--tenant', 'namwon');
const PW = process.env.LX_PW;

/* 이 PC 주소 */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i;
const LOCAL_PORTS = new Set(['4173', '4180', '8700', '8701', '8702', '5433', '6379']);
const localCalls = [];
function watch(page, screen) {
  page.on('request', (r) => {
    let u; try { u = new URL(r.url()); } catch { return; }
    if (!/^https?:|^wss?:/.test(u.protocol)) return;
    if (LOCAL.test(u.hostname) || LOCAL_PORTS.has(u.port)) localCalls.push({ screen, url: u.origin + u.pathname });
  });
}

/* 값 모음: key → [{screen, value, note}] */
const V = new Map();
const put = (key, screen, value, note = '') => { if (!V.has(key)) V.set(key, []); V.get(key).push({ screen, value: value == null || value === '' ? null : String(value).replace(/\s+/g, ''), note }); };
const warns = [];
const left203 = [];   // 결과 확인 '봤음' 기록 말이 남은 화면(원칙 203)
const RV203 = /지도에서 봤음|아직 보지 않음|이 결과 확인했음|확인했음|공개 뒤 (결과 확인 )?남|공개 뒤 남은 일/;
let seen203 = 0;
const chk203 = (screen, t) => { seen203++; const m = RV203.exec(t || ''); if (m) left203.push(`${screen} — '${m[0]}'`); };

async function settle(page, sel, ms = 25000) {
  if (sel) await page.waitForSelector(sel, { timeout: ms }).catch(() => warns.push(`기다린 칸이 안 보임: ${sel} · ${page.url()}`));
  await page.waitForTimeout(800);
}
const text = (page, sel = 'main, body') => page.evaluate((s) => (document.querySelector(s) || document.body).innerText, sel);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

async function session(base, login, tenant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('lx-analyze.per', '8'); } catch { /* */ } });
  const page = await ctx.newPage();
  watch(page, new URL(base).hostname);
  for (let i = 0; i < 3; i++) {                 // 게이트웨이를 다시 켜는 중이면 잠시 뒤 다시
    await frontDoor(page, base, login, tenant ? { tenant, password: PW } : { password: PW });
    if (!/\/login\/?$/.test(new URL(page.url()).pathname)) break;
    if (/시도가 너무 많습니다/.test(await page.innerText('body').catch(() => ''))) throw new Error('로그인 시도가 너무 많습니다(서버가 잠시 막음) — 10분 뒤 다시 돌려 주세요');
    await page.waitForTimeout(8000);
  }
  if (/\/login\/?$/.test(new URL(page.url()).pathname)) throw new Error(`로그인하지 못했습니다(${new URL(base).hostname})`);
  page._who = { base, login, tenant };
  return { ctx, page };
}
/** 화면 열기 — 세션이 끊겨 로그인으로 돌아가면 로그인 폼으로 다시 들어가 한 번 더 */
async function go(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  if (/\/login\/?$/.test(new URL(page.url()).pathname)) {
    const w = page._who;
    warns.push(`세션이 끊겨 다시 로그인: ${new URL(url).pathname}`);
    await frontDoor(page, w.base, w.login, w.tenant ? { tenant: w.tenant, password: PW } : { password: PW });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const started = new Date();
try {
  /* ── LX 직원(app) ─────────────────────────────── */
  {
    const { ctx, page } = await session(HOST.app, 'test@lx.or.kr');
    // 분석하기 카드 — 서비스 이름 · AI 모델 정확도
    await go(page, HOST.app + '/landxi/v3/lx-analyze/');
    await settle(page, '.la-ac');
    const cards = await page.evaluate(() => {
      const out = [];
      const per = () => document.querySelectorAll('.la-ac').forEach((a) => {
        const name = a.querySelector('h3')?.innerText.trim();
        const hero = [...a.querySelectorAll('.la-ac-hero > div')].find((d) => /AI 모델 정확도/.test(d.innerText));
        const b = hero?.querySelector('b')?.innerText.replace(/\s+/g, '');
        const more = a.querySelector('a.k-sc-more')?.getAttribute('href');
        out.push({ name, acc: b && b !== '—' ? b : null, href: more });
      });
      per();
      return out;
    });
    // 페이지가 여럿이면 넘기며 읽는다
    for (let i = 0; i < 6; i++) {
      const next = page.locator('.la-pager button.ar').last();
      if (!(await next.count()) || await next.isDisabled()) break;
      await next.click(); await page.waitForTimeout(500);
      const more = await page.evaluate(() => [...document.querySelectorAll('.la-ac')].map((a) => {
        const hero = [...a.querySelectorAll('.la-ac-hero > div')].find((d) => /AI 모델 정확도/.test(d.innerText));
        const b = hero?.querySelector('b')?.innerText.replace(/\s+/g, '');
        return { name: a.querySelector('h3')?.innerText.trim(), acc: b && b !== '—' ? b : null, href: a.querySelector('a.k-sc-more')?.getAttribute('href') };
      }));
      for (const c of more) if (!cards.some((x) => x.name === c.name)) cards.push(c);
    }
    for (const c of cards) put(`정확도 · ${c.name} (지금 판)`, '분석하기 카드', c.acc);
    // 분석하기 자세히 — AI 분석 결과 큰 숫자 · (있으면) 정확도
    for (const c of cards) {
      if (!c.href) continue;
      await go(page, new URL(c.href, HOST.app + '/landxi/v3/lx-analyze/').href);
      await settle(page, '.la-dt-body');
      const d = await page.evaluate(() => {
        const big = document.querySelector('.la-big[data-v]');
        const lab = document.querySelector('.la-ex-l')?.innerText || '';
        const all = document.querySelector('.la-dt')?.innerText || '';
        const m = all.match(/AI 모델 정확도[^\d\n]{0,12}(\d{1,3})\s*%/) || all.match(/(\d{1,3})\s*%\s*\n?\s*AI 모델 정확도/);
        return { v: big?.dataset.v ?? null, shown: big?.querySelector('b')?.innerText ?? null, unit: big?.querySelector('.u')?.innerText ?? '', lab, acc: m ? m[1] + '%' : null };
      });
      const reg = (d.lab.split(' · ')[1] || '').trim();
      if (d.v !== null) put(`AI 분석 결과 · ${c.name} · ${reg}`, '분석하기 자세히', `${d.shown}${d.unit}`);
      if (d.acc) put(`정확도 · ${c.name} (지금 판)`, '분석하기 자세히', d.acc);
      else put(`정확도 · ${c.name} (지금 판)`, '분석하기 자세히', null, '자세히에 정확도 칸 없음');
    }
    // 프로젝트 목록 — 결과 확인 '봤음' 기록 말이 남았는지(원칙 203)
    await go(page, HOST.app + '/landxi/v3/lx-project/');
    await settle(page, 'table tbody tr');
    const projs = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll('table tbody tr')].map((tr) => ({ name: tr.cells[0]?.innerText.trim(), todo: tr.innerText,
        st: null }));
      let ids = [];
      try { const m = await import('/landxi/shared/api-v1.js'); ids = ((await m.api('/projects')).items || []).map((p) => ({ id: p.id, name: p.name })); } catch { /* 없음 */ }
      return { rows, ids };
    });
    for (const r of projs.rows) chk203(`프로젝트 목록 · ${r.name}`, r.todo);
    // 서비스 수 — 메인 '시군구 n곳에 분석 결과 제공'의 'n가지 서비스' = XI맵 전국 결과 '서비스 n가지'(GPT5-1 · 같은 이름 = 같은 값 · 토지피복 같은 전역 분석은 이름만 따로)
    await go(page, HOST.app + '/landxi/v3/main/');
    await page.waitForFunction(() => /\d+가지 서비스/.test(document.querySelector('#ch5-p')?.textContent || ''), null, { timeout: 25000 }).catch(() => warns.push('메인 서비스 수 칸이 안 보임'));
    const mainSvc = await page.evaluate(() => (document.querySelector('#ch5-p')?.textContent || '').match(/(\d+)가지 서비스/)?.[1] || null);
    put('서비스 수(결과를 낸 서비스)', '메인 · 분석 결과 제공', mainSvc ? mainSvc + '가지' : null);
    await go(page, HOST.app + '/landxi/v3/xi-clean/');
    await page.waitForFunction(() => /서비스 \d+가지/.test(document.querySelector('.xb-p')?.textContent || ''), null, { timeout: 40000 }).catch(() => warns.push('XI맵 전국 결과 칸이 안 보임'));
    const xiSvc = await page.evaluate(() => (document.querySelector('.xb-p')?.textContent || '').match(/서비스 (\d+)가지/)?.[1] || null);
    put('서비스 수(결과를 낸 서비스)', 'XI맵 전국 결과', xiSvc ? xiSvc + '가지' : null);
    // 전국 분석 진행 % — 10-14 XI맵 3차 구조(구현 29)로 XI맵에서 진행 %를 뺐다(관리자 대시보드에만 · GET /national/progress 한 출처).
    const svcOfProject = {};
    for (const p of projs.ids) {
      const q = encodeURIComponent(p.id);
      // 프로젝트 화면
      await go(page, `${HOST.app}/landxi/v3/lx-project/?project=${q}`);
      await settle(page, '.k-main, main');
      await page.waitForTimeout(2500);
      const t = await text(page);
      chk203(`프로젝트 화면 · ${p.name}`, t);   // 결과 확인 = 지도에서 결과 보기 길만(원칙 203)
      // 배포 신청서
      await go(page, `${HOST.app}/landxi/v3/lx-release/?project=${q}&stage=publish`);
      await settle(page, '.rl-dl');
      const f = await page.evaluate(() => {
        const row = (k) => [...document.querySelectorAll('.rl-dl > div')].find((d) => d.querySelector('dt')?.innerText.trim() === k)?.querySelector('dd');
        const svc = row('서비스');
        const name = svc?.querySelector('b')?.innerText.trim() || svc?.querySelector('input')?.value || '';
        const cmp = [...(row('정확도')?.querySelectorAll('.rl-cmp > span') || [])].map((s) => ({ k: s.querySelector('em')?.innerText.trim(), v: s.querySelector('b')?.innerText.trim() }));
        return { name, cmp, all: document.querySelector('.rl-dl')?.innerText || '', rv: row('결과 확인') ? '결과 확인 줄' : '' };
      });
      svcOfProject[p.name] = f.name;
      const now = f.cmp.find((x) => /이번 판/.test(x.k || ''));
      const prev = f.cmp.find((x) => /지난 판/.test(x.k || ''));
      if (now) put(`정확도 · ${p.name} 신청서(이번 판)`, '배포 신청서', now.v === '—' ? null : now.v);
      if (prev && prev.v && prev.v !== '—' && f.name) put(`정확도 · ${f.name} (지금 판)`, `배포 신청서 '${prev.k}'`, prev.v);
      chk203(`배포 신청서 · ${p.name}`, f.all + ' ' + (f.rv ? '아직 보지 않음' : ''));   // 결과 확인 줄 자체가 남아도 실패
    }
    await ctx.close();

    /* ── LX 관리자(admin) ─────────────────────────── */
    try {
    const A = await session(HOST.admin, 'lxadmin@lx.or.kr');
    const ap = A.page;
    // 전국 결과 자산 진행 — 관리자 대시보드 할 일 줄 '전국 농지 n% · 하천 n%'
    await go(ap, HOST.admin + '/landxi/v3/ops-core/');
    await ap.waitForFunction(() => /전국 농지 [\d.]+%/.test(document.querySelector('.oc-todo')?.textContent || ''), null, { timeout: 30000 }).catch(() => warns.push('관리자 대시보드 전국 결과 줄이 안 보임'));
    const opsNat = await ap.evaluate(() => (document.querySelector('.oc-todo')?.textContent || '').match(/전국 농지 ([\d.]+)%/)?.[1] || null);
    put('전국 농지 분석 진행', '관리자 대시보드', opsNat ? opsNat + '%' : null);
    // 기관 — 분석한 면적(이번 달)
    await go(ap, HOST.admin + '/landxi/v3/ops-infra/#/tenants');
    await settle(ap, 'figure.stat[data-metric]');
    const area = await ap.evaluate(() => [...document.querySelectorAll('figure.stat[data-metric]')].filter((f) => /분석(한)? 면적/.test(f.dataset.metric)).map((f) => {
      let card = f.parentElement; while (card && !card.querySelector('h2, h3, h4, b.name, .qs-name')) card = card.parentElement;
      const head = card?.querySelector('h2, h3, h4, b.name, .qs-name');
      return { org: head?.innerText.trim() || '?', label: f.dataset.metric, v: f.dataset.v, shown: f.querySelector('.stat-n')?.innerText.trim() };
    }));
    for (const a of area) put(`분석한 면적 · ${a.org} · 이번 달`, `관리자 기관('${a.label}')`, a.shown);
    // 사용 현황 — 서비스별 면적(같은 이름 칸이 다른 화면에 없으면 적기만)
    await go(ap, HOST.admin + '/landxi/v3/ops-infra/#/deploys/usage');
    await settle(ap, '.rv-tbl--usage tbody tr, .rv-empty');
    const usage = await ap.evaluate(() => {
      const heads = [...document.querySelectorAll('.rv-tbl--usage thead th')].map((t) => t.innerText.trim());
      const ai = heads.findIndex((t) => /면적/.test(t));
      return [...document.querySelectorAll('.rv-tbl--usage tbody tr')].map((tr) => {
        const c = [...tr.cells].map((x) => x.innerText);
        const pick = ai >= 0 ? c[ai] : c.join(' ');
        const m = pick.match(/([\d,.]+)\s*(?:km²|㎢)/);
        return { org: c[0]?.trim(), svc: tr.cells[1]?.querySelector('b')?.innerText.trim(), v: m ? m[1] + '㎢' : null, col: ai >= 0 ? heads[ai] : '' };
      });
    });
    for (const u of usage) if (u.v) put(`분석한 면적 · ${u.org} · ${u.svc}`, `관리자 사용 현황${u.col ? `('${u.col}')` : ''}`, u.v);
    // 배포 신청 — 신청서(승인 = 지금 판 · 검토 중 = 이번 신청)
    await go(ap, HOST.admin + '/landxi/v3/ops-infra/#/deploys');
    await settle(ap, '.rv-tbl tbody tr, .rv-empty');
    const n = await ap.locator('.rv-grid--req .rv-tbl tbody tr').count();
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const tr = ap.locator('.rv-grid--req .rv-tbl tbody tr').nth(i);
      await tr.click().catch(() => {}); await ap.waitForTimeout(500);
      const r = await ap.evaluate((ix) => {
        const tr = document.querySelectorAll('.rv-grid--req .rv-tbl tbody tr')[ix];
        const svc = tr?.cells[0]?.querySelector('b')?.innerText.trim() || tr?.cells[0]?.innerText.split('\n')[0].trim();
        const proj = tr?.cells[0]?.innerText.split('\n')[1]?.trim() || '';
        const st = tr?.cells[tr.cells.length - 1]?.innerText.trim();
        const det = document.querySelector('.rv-detail');
        const row = (k) => [...(det?.querySelectorAll('.rv-dl > div') || [])].find((d) => d.querySelector('dt')?.innerText.trim() === k)?.querySelector('dd');
        const cmp = [...(row('정확도')?.querySelectorAll('.rv-cmp > span') || [])].map((s) => ({ k: s.querySelector('em')?.innerText.trim(), v: s.querySelector('b')?.innerText.trim() }));
        return { svc, proj, st, cmp, rv: det?.innerText || '', rvRow: !!row('결과 확인'), form: !!row('정확도') };
      }, i);
      chk203(`관리자 배포 신청 · ${r.svc}`, r.rv + (r.rvRow ? ' 아직 보지 않음' : ''));
      const key = `${r.svc}|${r.st}`;
      if (seen.has(key)) continue;                  // 같은 서비스 · 같은 상태는 맨 위(최근) 하나만
      seen.add(key);
      const now = r.cmp.find((x) => /이번 판/.test(x.k || ''));
      if (r.st === '승인') put(`정확도 · ${r.svc} (지금 판)`, '관리자 배포 신청(최근 승인)', now && now.v !== '—' ? now.v : null, r.form ? '' : '신청서 전 기록 — 값 없음');
      if (r.st === '검토 중') {
        if (r.proj) put(`정확도 · ${r.proj} 신청서(이번 판)`, '관리자 배포 신청(검토 중)', now?.v || null);
      }
    }
    // 배포(운영 탭 · lx-deploy) — '결과 확인' 칸이 없어야 한다(원칙 203 · 10-12)
    await go(ap, HOST.admin + '/landxi/v3/lx-deploy/?tab=ops');
    await settle(ap, '.dp-ops tbody tr, .dp-empty');
    const dps = await ap.evaluate(() => ({ heads: [...document.querySelectorAll('.dp-ops thead th')].map((t) => t.innerText.trim()),
      all: document.querySelector('.dp-ops')?.innerText || '' }));
    if (dps.heads.includes('결과 확인')) left203.push("관리자 배포(운영) — '결과 확인' 칸");
    chk203('관리자 배포(운영)', dps.all);
    await A.ctx.close();
    } catch (e) { warns.push(`관리자 화면을 읽지 못함: ${e.message}`); }

    /* ── 기관(namwon) ─────────────────────────────── */
    try {
      const G = await session(HOST.gov, 'lxadmin@lx.or.kr', GOV_TENANT);
      await G.page.goto(HOST.gov + '/landxi/v3/gov-select/', { waitUntil: 'domcontentloaded' });
      await G.page.waitForFunction(() => /AI 분석 결과 ·|첫 결과/.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
      await G.page.waitForTimeout(1000);
      const g = await G.page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.children.length) continue;
          const m = /^AI 분석 결과 · (.+)$/.exec(el.innerText?.trim() || '');
          if (!m) continue;
          let card = el.parentElement; while (card && !card.querySelector('h2, h3, h4')) card = card.parentElement;
          const name = card?.querySelector('h2, h3, h4')?.innerText.trim();
          const box = el.parentElement;
          const num = [...box.querySelectorAll('b, strong, .num, span')].map((x) => x.innerText.trim()).find((s) => /^[\d,]+$/.test(s))
            || (box.innerText.match(/([\d,]+)\s*\n?\s*(필지|동|건)?/) || [])[0];
          const unit = (box.innerText.match(/[\d,]+\s*(필지|동|건)/) || [])[1] || '';
          out.push({ name, region: m[1].trim(), v: num ? num.replace(/\s+/g, '') + (num.match(/필지|동|건/) ? '' : unit) : null });
        }
        return out;
      });
      for (const x of g) put(`AI 분석 결과 · ${x.name} · ${x.region}`, `기관 내 서비스(${GOV_TENANT})`, x.v);
      await G.ctx.close();
    } catch (e) { warns.push(`기관 화면을 읽지 못함: ${e.message}`); }
  }
} finally { await browser.close(); }

/* ── 표 ─────────────────────────────────────── */
const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };
let bad = 0;
const order = ['정확도', 'AI 분석 결과', '분석한 면적', '서비스 수'];
const keys = [...V.keys()].sort((a, b) => order.findIndex((o) => a.startsWith(o)) - order.findIndex((o) => b.startsWith(o)) || a.localeCompare(b, 'ko'));
out(`같은 이름 숫자 대조 · ${started.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · ${HOST.app} · ${HOST.admin} · ${HOST.gov}`);
out('');
out('| 판정 | 이름 | 화면 | 값 |');
out('|---|---|---|---|');
const result = [];
for (const k of keys) {
  const rows = V.get(k);
  const num = (v) => String(v).replace(/[^\d./%]/g, '');   // 단위 글자(필지 · ㎢)는 화면마다 붙는 자리가 달라 숫자만 견준다
  const vals = [...new Set(rows.filter((r) => r.value !== null).map((r) => num(r.value)))];
  const verdict = vals.length > 1 ? '어긋남' : rows.filter((r) => r.value !== null).length > 1 ? '같음' : '한 화면';
  if (verdict === '어긋남') bad++;
  rows.forEach((r, i) => out(`| ${i ? '' : verdict} | ${i ? '' : k} | ${r.screen} | ${r.value ?? '— (못 읽음)'}${r.note ? ` · ${r.note}` : ''} |`));
  result.push({ name: k, verdict, rows });
}
out('');
out(`이 PC 주소 호출: ${localCalls.length}건${localCalls.length ? ' — ' + [...new Set(localCalls.map((c) => c.url))].slice(0, 10).join(' · ') : ''}`);
if (warns.length) { out(''); out('경고(실패 아님):'); warns.forEach((w) => out('- ' + w)); }
out('');
out(`결과 확인 '봤음' 기록 말(원칙 203 · 본 화면 ${seen203}): ${left203.length}곳${left203.length ? ' — ' + left203.slice(0, 10).join(' · ') : ''}`);
const fail = bad > 0 || localCalls.length > 0 || left203.length > 0;
out(fail ? `실패 — 어긋남 ${bad}건 · 이 PC 주소 호출 ${localCalls.length}건 · 결과 확인 기록 말 ${left203.length}곳` : '통과 — 같은 이름 숫자 모두 같음 · 이 PC 주소 호출 0 · 결과 확인 기록 말 0');
const j = arg('--json', '');
if (j) fs.writeFileSync(j, JSON.stringify({ at: started.toISOString(), hosts: HOST, result, localCalls, left203, warns, fail }, null, 1));
process.exit(fail ? 1 : 0);
