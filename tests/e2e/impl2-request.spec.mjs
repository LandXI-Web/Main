// impl-2 기관 영상 분석 의뢰(확인 대장 6차 GF-2 · 2차 D1-ⓑ · 5차 역할-4 ⓑ · 1차 FR-1) — 로그인 폼만(세션 주입 0).
// 기관 입구 lxadmin@namwon → 서비스(?service=) → ① 영상 넣기(작은 TIF 한 장) → ② 분석 카드 고르기(카드 한 벌) → ③ 요청하기(구현 확인 2차 J-9 쉬운 판) →
// 구현 5차 기관-5 ⓐ — 이름 '분석 요청' · 시안 모양(왼쪽 세 단계 · 오른쪽 '어디를 분석하나' · 내가 보낸 요청 — 탭 없음).
// 관리자 입구 lxadmin → 결재함 '분석 요청' 한 건(판단 근거 · 미리 보기) → 승인 → 기존 분석 대기열(GPU 한 장 · 작은 영상 한 건) → 결과 도착 · 새 시점.
// 반려 → 사유가 기관 '내 의뢰'에. 공유 영상 불러오기 · 관리자 기관 서랍 '공유 영상' 칸.
// LX_EVIDENCE=1 이면 증거 캡처(docs/superpowers/final/process/impl-2/request/img/after-*.png · 1440×900).
// 끝에서 이 시험이 만든 의뢰 · 결재 · 작업 · 올린 파일을 지운다(scratch 정리 스크립트와 같은 규칙 — server 쪽 pytest 픽스처 참고).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = process.env.LX_BASE || 'http://127.0.0.1:4173';
const SERVICE = 'dp-52190-5e85a9-26';                    // 남원시 비닐하우스 서비스(25cm 모델)
const OUT = path.resolve('docs/superpowers/final/process/impl-2/request/img');
const SHOT = !!process.env.LX_EVIDENCE;
const TMP = path.resolve('test-results/impl2-request');
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: path.join(OUT, name) }); };

/** 시험 영상 — 남원 덕과면 25cm 항공 정사영상에서 잘라 낸 작은 GeoTIFF(없으면 같은 자리 무작위 화소). 파일 이름의 연도 = 촬영 연도 */
function makeTif(name, px, dx) {
  fs.mkdirSync(TMP, { recursive: true });
  const out = path.join(TMP, name);
  const py = `
import sys, numpy as np, rasterio
from rasterio.windows import Window
from rasterio.transform import from_origin
from rasterio.warp import transform
out, px, dx = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
src_p = r"E:/Land-XI 플랫폼/02. 데이터/_work/namwon_ap25_2023.vrt"
xs, ys = transform("EPSG:4326", "EPSG:5186", [127.36654 + dx], [35.52301])
try:
    s = rasterio.open(src_p); r, c = s.index(xs[0], ys[0]); w = Window(c - px // 2, r - px // 2, px, px)
    arr, t = s.read([1, 2, 3], window=w), s.window_transform(w)
except Exception:
    arr = np.random.default_rng(7).integers(0, 255, (3, px, px), dtype="uint8"); t = from_origin(xs[0] - px * 0.125, ys[0] + px * 0.125, 0.25, 0.25)
with rasterio.open(out, "w", driver="GTiff", width=px, height=px, count=3, dtype="uint8", crs="EPSG:5186", transform=t, compress="deflate", tiled=True) as d:
    d.write(arr)
`;
  const r = spawnSync('python', ['-c', py, out, String(px), String(dx)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('시험 영상 만들기 실패: ' + r.stderr);
  return out;
}
/** 이 시험이 만든 의뢰 정리(메모에 'e2e') — 작업 · 결과 · 결재 · 올린 파일 · 의뢰 영상 */
function cleanup() {
  const py = `
import sys, shutil
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
import psycopg, redis
from landxi_api import config
c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)
rd = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
for rid, tid, aid, jid, iid, src, did in c.execute("SELECT id, tenant_id, approval_id, job_id, imagery_id, source, draft_id FROM analysis_requests WHERE memo LIKE 'e2e%'").fetchall():
    if jid:
        for t in [x[0] for x in c.execute("SELECT conrelid::regclass::text FROM pg_constraint WHERE confrelid='jobs'::regclass AND contype='f'").fetchall()]:
            c.execute(f"DELETE FROM {t} WHERE job_id=%s", (jid,))
        for t in ("detections", "index_results", "usage_events"): c.execute(f"DELETE FROM {t} WHERE job_id=%s", (jid,))
        c.execute("DELETE FROM jobs WHERE id=%s", (jid,))
        for k in rd.scan_iter(match=f"job:{jid}*"): rd.delete(k)
        rd.delete(f"events:{jid}")
        shutil.rmtree(config.DATA_ROOT / "results" / tid / jid, ignore_errors=True)
        for ext in (".geojson", ".pmtiles"): (config.DATA_ROOT / "results" / tid / (jid + ext)).unlink(missing_ok=True)
        c.execute("DELETE FROM published_sets WHERE job_id=%s", (jid,))
    c.execute("DELETE FROM approvals WHERE id=%s OR (subject_type='request' AND subject_id=%s)", (aid, rid))
    for (rel,) in c.execute("SELECT rel_path FROM request_uploads WHERE request_id=%s OR draft_id=%s", (rid, did)).fetchall():
        shutil.rmtree((config.DATA_ROOT / rel).parent, ignore_errors=True)
    c.execute("DELETE FROM imagery_std WHERE source_kind='upload' AND source_id IN (SELECT id FROM request_uploads WHERE request_id=%s OR draft_id=%s)", (rid, did))
    c.execute("DELETE FROM request_uploads WHERE request_id=%s OR draft_id=%s", (rid, did))
    c.execute("DELETE FROM analysis_requests WHERE id=%s", (rid,))
    if src == "upload" and iid: c.execute("DELETE FROM imagery WHERE id=%s AND layer->>'role'='request'", (iid,))
    print("정리", rid)
`;
  return spawnSync('python', ['-c', py], { encoding: 'utf8' }).stdout;
}

async function gov(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await frontDoor(page, BASE, 'lxadmin@namwon', 'gov');
  await page.goto(BASE + `/landxi/v3/gov-request/?service=${SERVICE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gq-grid', { timeout: 30000 });
  await page.waitForSelector('.gq-cards .k-sc', { timeout: 30000 });
  return page;
}
async function admin(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'admin');
  return page;
}
async function send(page, file, memo) {
  await page.locator('#drop input[type=file]').setInputFiles([file]);
  await page.waitForFunction(() => /분석할 수 있습니다|분석할 수 없습니다/.test(document.querySelector('#picked')?.textContent || ''), null, { timeout: 90000 });
  await expect(page.locator('#picked')).toContainText('항공영상');
  await expect(page.locator('#picked')).toContainText('분석할 수 있습니다');
  /* J-9 — 형식 · 해상도 · 좌표 같은 전문 글이 없다(서버가 파일에서 읽어 처리) */
  const txt = await page.locator('.gq-grid > .gq-col').first().innerText();
  expect(txt).not.toMatch(/25cm|좌표|해상도|이렇게 읽었습니다|TIF|JP2|ECW/);
  await expect(page.locator('.gq-cards .k-sc.is-on')).toHaveCount(1);                 // ?service= 의 카드가 골라져 있다
  await page.fill('#memo', memo);
  await expect(page.locator('#go')).toBeEnabled();
}
async function openInbox(page, memo) {
  await page.goto(BASE + '/landxi/v3/ops-core/#/approvals', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.oc-tbl tbody tr', { timeout: 60000 });
  const rows = page.locator('.oc-tbl tbody tr', { hasText: '분석 요청' });
  await expect(rows.first()).toBeVisible();
  for (let i = 0; i < await rows.count(); i++) {          // 이 시험의 의뢰(메모 = 요청 사유)
    await rows.nth(i).click();
    await page.waitForSelector('.oc-sheet', { timeout: 10000 });
    if ((await page.locator('.oc-sheet').innerText()).includes(memo)) return;
  }
  throw new Error('결재함에 의뢰가 없습니다');
}

test.describe('impl-2 기관 영상 분석 의뢰 · LX 영상 공유', () => {
  test.describe.configure({ mode: 'serial', timeout: 360000 });
  test.beforeAll(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); cleanup(); });
  test.afterAll(() => { if (!process.env.LX_KEEP) cleanup(); });

  test('공유 영상 불러오기 — 공유된 LX 영상만 · 분석 카드 고르기', async ({ browser }) => {
    const page = await gov(browser);
    const sr = page.locator('.gq-sr').first();
    await expect(sr).toBeVisible();
    await sr.locator('button').click();
    await expect(page.locator('#picked')).toContainText('LX가 공유한 영상');
    const card = page.locator('.gq-cards .k-sc[data-card="card-5e85a9"]');
    await expect(card.locator('.k-sc-why')).toContainText('이미 분석했습니다');           // 같은 영상 × 같은 서비스는 다시 의뢰하지 않게
    await expect(card).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#go')).toBeDisabled();
    await page.waitForTimeout(3200);
    await shot(page, 'after-shared-pick.png');
    // 공유된 영상은 지도에서도 보인다(기관 영상 층 = 공유된 것만) — 가까이 가면 LX 영상 타일
    await page.evaluate(() => { const st = document.querySelector('#map').__stage; st.map.jumpTo({ center: [127.3665, 35.5230], zoom: 15.5 }); });
    await page.waitForTimeout(4000);
    await shot(page, 'after-shared-map.png');
  });

  test('우리 영상 → 의뢰 → 결재함 한 건 → 승인 → 결과 도착(새 시점)', async ({ browser }) => {
    const tif = makeTif('남원_덕과면_항공_2023.tif', 2048, 0);
    const g = await gov(browser);
    await send(g, tif, 'e2e 승인 확인');
    await g.locator('#picked').scrollIntoViewIfNeeded();
    await g.waitForTimeout(3200);
    await shot(g, 'after-request-read.png');
    await g.click('#go');
    await expect(g.locator('#det')).toContainText('확인 대기', { timeout: 20000 });
    await g.waitForTimeout(3000);
    await shot(g, 'after-request-sent.png');

    const a = await admin(browser);
    await openInbox(a, 'e2e 승인 확인');
    const sheet = a.locator('.oc-sheet');
    await expect(sheet).toContainText('판단 근거', { timeout: 15000 });
    await expect(sheet).toContainText('범위');
    await expect(sheet).toContainText('대기열');
    await expect(sheet.locator('.oc-rq-img')).toBeVisible();
    await a.waitForTimeout(600);
    await shot(a, 'after-inbox-request.png');
    if (process.env.LX_NO_GPU) return;                                                   // 캡처만 다시(분석 대기열 0 — GPU 시험은 한 번만)
    await sheet.locator('.oc-reason').fill('승인');
    await sheet.locator('.oc-acts button', { hasText: '승인' }).click();
    await expect(a.locator('.k-toast')).toContainText('승인했습니다');

    // 기관 화면 — 분석 중 → 결과 도착(대기열 순서 · 작은 영상 한 건)
    await expect.poll(async () => { await g.reload(); await g.waitForSelector('.gq-grid');
      return g.locator('.gq-row').first().innerText(); }, { timeout: 300000, intervals: [5000] }).toContain('결과 도착');
    await g.locator('.gq-row').first().click();
    await expect(g.locator('#det')).toContainText('AI 탐지');
    await expect(g.locator('#det')).toContainText('새 시점');
    await g.locator('#det-map').click();
    await g.waitForTimeout(3000);
    await shot(g, 'after-result.png');
  });

  test('반려 — 사유가 기관 내가 보낸 요청에 보인다', async ({ browser }) => {
    const tif = makeTif('남원_덕과면_항공_2023_b.tif', 512, 0.004);
    const g = await gov(browser);
    await send(g, tif, 'e2e 반려 확인');
    await g.click('#go');
    await expect(g.locator('#det')).toContainText('확인 대기', { timeout: 20000 });
    const a = await admin(browser);
    await openInbox(a, 'e2e 반려 확인');
    const sheet = a.locator('.oc-sheet');
    await sheet.locator('.oc-acts button', { hasText: '반려' }).click();
    await expect(sheet.locator('.oc-need')).toContainText('반려 사유를 적어 주세요');      // 사유 없이는 보내지 않는다
    await sheet.locator('.oc-reason').fill('영상 범위가 서비스 대상과 맞지 않습니다');
    await sheet.locator('.oc-acts button', { hasText: '반려' }).click();
    await expect(a.locator('.k-toast')).toContainText('반려했습니다');
    await g.reload();
    await g.waitForSelector('.gq-grid');
    await g.locator('.gq-row', { hasText: '반려' }).first().click();
    await expect(g.locator('#det')).toContainText('반려 · 사유: 영상 범위가 서비스 대상과 맞지 않습니다');
    await g.waitForTimeout(3200);
    await shot(g, 'after-reject-reason.png');
  });

  test('관리자 기관 서랍 — 공유 영상 칸(관할 안 LX 영상 켜고 끄기)', async ({ browser }) => {
    const a = await admin(browser);
    await a.goto(BASE + '/landxi/v3/ops-infra/?view=tenants#/tenants', { waitUntil: 'domcontentloaded' });
    await a.waitForSelector('.org', { timeout: 60000 });
    await a.locator('.org', { hasText: '남원' }).locator('.adj').click();
    await expect(a.locator('.sh-l li').first()).toBeVisible({ timeout: 20000 });
    await expect(a.locator('.sh')).toContainText('공유 영상');
    await a.locator('.k-drawer .k-dr-b').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await a.waitForTimeout(600);
    await shot(a, 'after-admin-shares.png');
  });
});
