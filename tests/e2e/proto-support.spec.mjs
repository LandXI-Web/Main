import { test, expect } from '@playwright/test';

// 서비스 지원 — landxi/proto/{notice,faq,contact,usecase,manual}.html (B6 구현 · 채택안 = 선택 2 "분할 열람")
//  원판   design-canvas/v2/B6-Support-*.dc.html · 기록 design-canvas/v2/notes/B6-support.md
//  실행   PORT=4192 npx playwright test tests/e2e/proto-support.spec.mjs --workers=1
const ACCENT = 'rgb(0, 109, 247)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50/i;
const PAGES = [['notice', '공지사항'], ['faq', '자주 묻는 질문'], ['contact', '문의하기'], ['usecase', '활용사례'], ['manual', '매뉴얼']];

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
const q = (page) => Object.fromEntries(new URL(page.url()).searchParams);

test.describe('관문 · 셸', () => {
  test('로그인 전이면 login.html?next=<파일+쿼리> 로 보낸다', async ({ page }) => {
    await page.goto('proto/notice.html?notice=7');
    await page.waitForURL(/login\.html/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('notice.html?notice=7');
  });
  test('한 단계 위 landxi/notice.html 은 쿼리를 지닌 채 proto/notice.html 로 넘긴다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
    await page.goto('notice.html?notice=7');
    await page.waitForURL(/proto\/notice\.html\?notice=7/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#n-title')).toHaveText('정사영상 AI 모델 v2.1 배포 완료');
  });
  for (const [key, label] of PAGES) {
    test(`${key}: 레일 활성 = 서비스 지원 · 탭 5 · 활성 탭 · 경로 · 시연 · 콘솔 오류 0`, async ({ page }) => {
      const errs = watch(page);
      await boot(page, `proto/${key}.html`);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveAttribute('data-menu', 'support');
      const tabs = await page.locator('.ptabs a').evaluateAll((a) => a.map((e) => [e.textContent.trim(), e.getAttribute('href')]));
      expect(tabs).toEqual(PAGES.map(([k, l]) => [l, `${k}.html`]));
      await expect(page.locator('.ptabs a[aria-current="page"]')).toHaveText(label);
      await expect(page.locator('#mast .crumbs li[aria-current]')).toHaveText(label);
      await expect(page.locator('#mast-asof')).toHaveText('2026.04.22');
      await expect(page.locator('#mast .tag')).toHaveText('시연');
      await expect(page.locator('#page-title')).toHaveText('서비스 지원');
      await expect(page.locator('[data-stub]')).toHaveCount(0);
      expect(errs).toEqual([]);
    });
  }
  test('탭으로 다섯 화면을 오간다', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    for (const [key, label] of PAGES.slice(1)) {
      await page.locator('.ptabs a', { hasText: label }).click();
      await page.waitForURL(new RegExp(`${key}\\.html`));
      await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    }
  });
});

test.describe('공지사항', () => {
  test('기본 = 고정 글이 위 · 첫 행이 열람 판에 열려 있다 · 타일 8/1/2/5', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await expect(page.locator('#n-rows tr')).toHaveCount(8);
    await expect(page.locator('#n-rows tr').first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#n-title')).toHaveText('고위험 탐지 건 긴급 처리 안내');
    expect(await page.locator('#n-tiles .tile b').allTextContents()).toEqual(['8', '1', '2', '5']);
    await expect(page.locator('#n-tiles .tile').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#n-pane .sp-file')).toHaveCount(1);
    await expect(page.locator('#n-pager .pager-sum')).toHaveText('총 8건 중 1~8행');
    // 긴급 숫자만 빨강(글자), 나머지는 파랑
    expect(await page.locator('#n-tiles .tile b').nth(1).evaluate((e) => getComputedStyle(e).color)).toBe('rgb(209, 53, 43)');
  });
  test('구분 타일 = 거르기 · URL 에 남고 뒤로 가기로 돌아온다', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.locator('#n-tiles [data-cat="work"]').click();
    await expect(page.locator('#n-rows tr')).toHaveCount(5);
    expect(q(page).cat).toBe('work');
    await expect(page.locator('#n-title')).toHaveText('정사영상 AI 모델 v2.1 배포 완료');
    await page.locator('#n-tiles [data-cat="urgent"]').click();
    await expect(page.locator('#n-rows tr')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('#n-rows tr')).toHaveCount(5);
    await expect(page.locator('#n-tiles [data-cat="work"]')).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page.locator('#n-rows tr')).toHaveCount(8);
  });
  test('검색(제목+내용 · Enter) · 빈 상태 원문 · 초기화', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.locator('#n-q').fill('mAP');                       // 내용에만 있는 낱말
    await page.keyboard.press('Enter');
    await expect(page.locator('#n-rows tr')).toHaveCount(1);
    await expect(page.locator('#n-rows tr .sp-ttl-t')).toHaveText('정사영상 AI 모델 v2.1 배포 완료');
    await page.locator('#n-q').fill('드론 배터리');
    await page.locator('#n-search button[type="submit"]').click();
    await expect(page.locator('#n-empty .empty-t')).toHaveText('검색 조건에 맞는 공지사항이 없습니다.');
    await expect(page.locator('#n-pane .empty')).toContainText('목록에 행이 없어 비어 있다');
    await expect(page.locator('#n-pager .pager-sum')).toHaveText('총 0건 중 0~0행');
    expect(q(page).q).toBe('드론 배터리');
    await page.locator('#n-search button[type="reset"]').click();
    await expect(page.locator('#n-rows tr')).toHaveCount(8);
    await expect(page.locator('#n-q')).toHaveValue('');
    expect(page.url()).not.toContain('q=');
  });
  test('딥링크 ?notice=7 → 그 글이 열리고 경로가 `공지사항 열람` · 첨부 2 · 첨부 = 다운로드 토스트', async ({ page }) => {
    // 2026-09-21 — 열람 판 오른쪽 끝의 `?notice=7` 표기를 걷었다(주소는 상태로 쓰되
    // 화면 글자로는 적지 않는다). 그 자리에는 몇 번째 공지인지가 들어간다.
    await boot(page, 'proto/notice.html?notice=7');
    await expect(page.locator('#n-title')).toHaveText('정사영상 AI 모델 v2.1 배포 완료');
    await expect(page.locator('#n-rows tr[data-id="7"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#mast .crumbs li[aria-current]')).toHaveText('공지사항 열람');
    await expect(page.locator('.sp-meta-q')).toHaveText('02 / 08');
    await expect(page.locator('#main')).not.toContainText('?notice=');
    await expect(page.locator('#n-pane .sp-file')).toHaveCount(2);
    await page.locator('#n-pane .sp-file').first().click();
    /* 첨부는 **실제로 떨어진다**(2026-09-21). 전에는 `다운로드를 시작합니다 · 시연` 토스트만 띄웠다 —
       눌렀는데 아무것도 안 받아지는 버튼이었다. 검사도 파일이 떨어지는지를 본다. */
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-dl="v2.1_release_notes.pdf"]').click(),
    ]);
    expect(dl.suggestedFilename()).toContain('v2.1_release_notes.pdf');
    await expect(page.locator('#say')).toContainText('내려받았습니다');
  });
  test('행 선택 → 열람 판 교체 + URL · 목록/Esc 로 닫고 포커스가 행으로 · 뒤로 가기', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.locator('#n-rows tr[data-id="5"]').click();
    await expect(page.locator('#n-title')).toContainText('시스템 정기점검 안내');
    expect(q(page).notice).toBe('5');
    await page.locator('#n-back').click();
    await expect(page.locator('#n-pane .empty')).toContainText('목록에서 공지를 고르면');
    expect(q(page).notice).toBe('0');
    await expect(page.locator('#n-rows tr[data-id="5"]')).toBeFocused();
    await page.goBack();
    await expect(page.locator('#n-title')).toContainText('시스템 정기점검 안내');
    await page.keyboard.press('Escape');
    await expect(page.locator('#n-title')).toHaveCount(0);
    await expect(page.locator('#n-rows tr[aria-selected="true"]')).toHaveCount(0);
  });
  test('키보드만으로: 목록 ↓ ↓ Enter → 셋째 글 열람 → Esc', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.locator('#n-rows tr').first().focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page.locator('#n-title')).toHaveText('카메라 AI 추론 신규 클래스 2종 추가');
    await expect(page.locator('#n-rows tr[data-id="6"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#n-rows tr[data-id="6"]')).toBeFocused();
  });
  test('페이저 — 크기 10/20/50 · URL', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.locator('#n-pager select').selectOption('20');
    expect(q(page).size).toBe('20');
    await expect(page.locator('#n-pager button[data-p="1"][aria-current]')).toHaveCount(1);
    await expect(page.locator('#n-pager button', { hasText: '다음' })).toBeDisabled();
  });
});

test.describe('자주 묻는 질문', () => {
  /* 2026-09-21 — 아코디언(여러 개 동시 펼침)에서 **분할 열람**으로 바꿨다.
     발주자: "분할 열람으로 가자." 답을 펼칠수록 화면이 길어져 1280·1366 은 하나만
     펼쳐도 넘쳤고, 질문을 2열로 세우면 이번에는 질문이 `…` 로 잘렸다.
     그래서 아래 세 건은 **검사 범위를 줄이지 않고** 분할 열람 기준으로 다시 썼다.
       · `aria-expanded` 토글 → 왼쪽 행 `aria-selected` + 오른쪽 판 교체
       · `?faq=1,3`(여럿)    → `?faq=<id>`(하나). 옛 주소는 첫 번호를 연다.
       · 구분 레일(세로)     → 구분 칩(위 띠). 건수는 그대로 칩 안에 있다. */
  test('구분 칩(건수) = 거르기 · 첫 질문이 답변 판에 열려 있다 · URL · 뒤로 가기', async ({ page }) => {
    await boot(page, 'proto/faq.html');
    await expect(page.locator('#fq-rows tr')).toHaveCount(13);
    expect(await page.locator('.fq-cat .n').allTextContents()).toEqual(['13', '5', '1', '2', '2', '2', '1']);
    // 공지사항과 같다 — 들어오면 첫 행이 열려 있다
    await expect(page.locator('#fq-rows tr').first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#fq-title')).toHaveText('Land-XI 플랫폼은 어떤 서비스인가요?');
    await expect(page.locator('.fq-ans')).toContainText('AI 기반 도로 안전관리 플랫폼');
    // 다른 질문을 고르면 판이 바뀌고 URL 에 남는다
    await page.locator('#fq-rows tr[data-id="3"]').click();
    await expect(page.locator('#fq-title')).toHaveText('정사영상과 카메라 분석은 어떻게 다른가요?');
    await expect(page.locator('#fq-rows tr[data-id="1"]')).toHaveAttribute('aria-selected', 'false');
    expect(q(page).faq).toBe('3');
    // 구분 칩으로 거르기
    await page.locator('.fq-cat[data-cat="03"]').click();
    await expect(page.locator('#fq-rows tr')).toHaveCount(2);
    expect(q(page).cat).toBe('03');
    await page.goBack();
    await expect(page.locator('#fq-rows tr')).toHaveCount(13);
    await expect(page.locator('#fq-title')).toHaveText('정사영상과 카메라 분석은 어떻게 다른가요?');
    await page.goBack();
    await expect(page.locator('#fq-title')).toHaveText('Land-XI 플랫폼은 어떤 서비스인가요?');
  });
  test('?faq=5 → 그 질문이 답변 판에 열려 있다 · 옛 주소 ?faq=1,3 은 첫 번호를 연다', async ({ page }) => {
    await boot(page, 'proto/faq.html?faq=5');
    await expect(page.locator('#fq-rows tr[data-id="5"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#fq-title')).toHaveText('드론 정사영상은 어떤 형식으로 업로드하나요?');
    await expect(page.locator('.fq-ans')).toContainText('ECW 또는 GeoTIFF');
    await expect(page.locator('#mast .crumbs li[aria-current]')).toHaveText('자주 묻는 질문 열람');
    await expect(page.locator('#fq-rows tr[data-id="5"]')).toBeFocused();
    // 개발용 URL 표기가 화면 글자로 새면 안 된다
    await expect(page.locator('#main')).not.toContainText('?faq=');
    await boot(page, 'proto/faq.html?faq=1,3');
    await expect(page.locator('#fq-rows tr[data-id="1"]')).toHaveAttribute('aria-selected', 'true');
  });
  test('목록/Esc 로 판을 닫으면 포커스가 행으로 · 다시 고르면 열린다', async ({ page }) => {
    await boot(page, 'proto/faq.html');
    await page.locator('#fq-rows tr[data-id="6"]').click();
    expect(q(page).faq).toBe('6');
    await page.locator('#fq-back').click();
    await expect(page.locator('#fq-pane .empty')).toContainText('왼쪽에서 질문을 고르면');
    expect(q(page).faq).toBe('0');
    await expect(page.locator('#fq-rows tr[data-id="6"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fq-title')).toHaveText('지도에서 처리 상태를 변경하고 싶습니다.');
    await page.keyboard.press('Escape');
    await expect(page.locator('#fq-title')).toHaveCount(0);
    await expect(page.locator('#fq-rows tr[aria-selected="true"]')).toHaveCount(0);
  });
  test('검색 필드(질문/답변) · 빈 상태 원문 · 초기화 · 문의하기 링크', async ({ page }) => {
    await boot(page, 'proto/faq.html');
    await page.locator('#fq-field').selectOption('content');
    await page.locator('#fq-q').fill('GeoTIFF'); await page.keyboard.press('Enter');
    await expect(page.locator('#fq-rows tr')).toHaveCount(1);
    await page.locator('#fq-field').selectOption('title');
    await page.locator('#fq-form button[type="submit"]').click();
    await expect(page.locator('#fq-empty .empty-t')).toHaveText('검색 조건에 맞는 질문이 없습니다.');
    await expect(page.locator('#fq-pane .empty')).toContainText('목록에 질문이 없어 비어 있다');
    await page.locator('#fq-form button[type="reset"]').click();
    await expect(page.locator('#fq-rows tr')).toHaveCount(13);
    await expect(page.locator('#fq-field')).toHaveValue('all');
    // 빈 상태에서도 열람 중에도 `찾는 답이 없으면 문의하기` 는 사라지지 않는다
    await expect(page.locator('.fq-more a')).toHaveAttribute('href', 'contact.html');
  });
  test('키보드만으로: 목록 ↓ ↓ Enter → 셋째 질문 열람', async ({ page }) => {
    await boot(page, 'proto/faq.html');
    await page.locator('#fq-rows tr').first().focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page.locator('#fq-title')).toHaveText('정사영상과 카메라 분석은 어떻게 다른가요?');
    await expect(page.locator('#fq-rows tr[data-id="3"]')).toHaveAttribute('aria-selected', 'true');
  });
});


test.describe('문의하기', () => {
  test('목록 12(6/6) · 1/2쪽 · 상태 타일 · 제목 검색 · 등록일 · 기간 칩 · 초기화', async ({ page }) => {
    await boot(page, 'proto/contact.html');
    expect(await page.locator('#ct-tiles .tile b').allTextContents()).toEqual(['12', '6', '6']);
    await expect(page.locator('#ct-n')).toHaveText('(12)');
    await expect(page.locator('#ct-rows tr')).toHaveCount(10);
    await expect(page.locator('#ct-pager .pager-sum')).toHaveText('총 12건 중 1~10행');
    await page.locator('#ct-pager button[data-p="2"]').first().click();
    await expect(page.locator('#ct-rows tr')).toHaveCount(2);
    expect(q(page).page).toBe('2');
    await page.locator('#ct-tiles [data-status="replied"]').click();
    await expect(page.locator('#ct-rows tr')).toHaveCount(6);
    await expect(page.locator('#ct-rows .ct-st--pending')).toHaveCount(0);
    await page.locator('#ct-filter button[type="reset"]').click();
    await expect(page.locator('#ct-rows tr')).toHaveCount(10);
    await page.locator('#ct-q').fill('지도'); await page.keyboard.press('Enter');
    await expect(page.locator('#ct-rows tr')).toHaveCount(5);
    await page.locator('#ct-filter button[type="reset"]').click();
    await page.locator('#ct-from').fill('2026-04-10');
    await page.locator('#ct-filter button[type="submit"]').click();
    await expect(page.locator('#ct-rows tr')).toHaveCount(7);
    expect(q(page).from).toBe('2026-04-10');
    await page.locator('#ct-quick [data-m="1"]').click();
    await expect(page.locator('#ct-from')).toHaveValue('2026-03-22');
    await expect(page.locator('#ct-to')).toHaveValue('2026-04-22');
    await expect(page.locator('#ct-quick [data-m="1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#ct-q').fill('없는 제목'); await page.keyboard.press('Enter');
    await expect(page.locator('#ct-empty .empty-t')).toHaveText('등록된 문의가 없습니다.');
  });
  test('열람: 답변 완료(110 · 첨부 2 · 답변) / 답변 대기(115 · 원문 안내) · 목록으로', async ({ page }) => {
    await boot(page, 'proto/contact.html');
    await page.locator('#ct-rows tr[data-id="110"]').click();
    expect(q(page).inq).toBe('110');
    await expect(page.locator('#mast .crumbs li[aria-current]')).toHaveText('문의 열람');
    await expect(page.locator('#ct-tab-view')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.ct-vmeta')).toContainText('답변 완료');
    await expect(page.locator('.ct-vmeta')).toContainText('2026.04.14 14:22');
    await expect(page.locator('#ct-view .sp-file')).toHaveCount(2);
    await expect(page.locator('#ct-view .sp-file').first()).toContainText('(4.6 MB)');
    await expect(page.locator('.ct-ans--replied')).toContainText('v2.3');
    await page.locator('#ct-rows tr[data-id="115"]').click();
    await expect(page.locator('.ct-ans')).toContainText('담당자가 확인 후 답변 드릴 예정입니다. 답변까지 영업일 기준 1-2일 소요됩니다.');
    await expect(page.locator('.ct-ans--replied')).toHaveCount(0);
    await page.locator('#ct-back').click();
    await expect(page.locator('#ct-form')).toBeVisible();
    await expect(page.locator('#ct-rows tr[data-id="115"]')).toBeFocused();
    await page.goBack();
    await expect(page.locator('#ct-vt')).toContainText('사용자 매뉴얼 PDF');
  });
  test('마스킹 — 계정 메일은 앞 2자 + ***', async ({ page }) => {
    await boot(page, 'proto/contact.html?inq=113');
    await expect(page.locator('.ct-vprose')).toContainText('pa***@namwon.go.kr');
    await expect(page.locator('body')).not.toContainText('parkjs');
  });
  test('폼 검증(원본 문구 · 첫 오류 칸 포커스) · 글자 수 · 첨부 추가/삭제/제한', async ({ page }) => {
    await boot(page, 'proto/contact.html');
    await expect(page.locator('#inq-att')).toContainText('첨부된 파일이 없습니다.');
    await page.locator('#inq-save').click();
    await expect(page.locator('#inq-title-e')).toHaveText('제목을 입력해 주세요.');
    await expect(page.locator('#inq-content-e')).toHaveText('문의 내용을 입력해 주세요.');
    await expect(page.locator('#inq-title')).toBeFocused();
    await expect(page.locator('#inq-title')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#inq-title').fill('정사영상 업로드 용량 한도 문의');
    await expect(page.locator('#inq-title-e')).toBeHidden();
    await expect(page.locator('.cnt[data-for="inq-title"]')).toHaveText('17자/60자');
    await page.locator('#inq-save').click();
    await expect(page.locator('#inq-content')).toBeFocused();
    await page.setInputFiles('#inq-files', [{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(2048) }, { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024) }]);
    await expect(page.locator('.ct-att-row')).toHaveCount(1);
    await expect(page.locator('.ct-att-row')).toContainText('(2.0 KB)');
    await expect(page.locator('#say')).toContainText('big.pdf 파일이 10MB 를 초과합니다.');
    await page.setInputFiles('#inq-files', ['b', 'c', 'd', 'e', 'f'].map((n) => ({ name: `${n}.txt`, mimeType: 'text/plain', buffer: Buffer.from('x') })));
    await expect(page.locator('.ct-att-row')).toHaveCount(5);
    await expect(page.locator('#say')).toContainText('최대 5개까지');
    await page.locator('.ct-att-row [data-rm="0"]').click();
    await expect(page.locator('.ct-att-row')).toHaveCount(4);
    await expect(page.locator('.ct-att-row').first()).toContainText('b.txt');
  });
  test('취소 확인 대화상자 — 원문 · 포커스 가둠 · Esc = 유지 · 확인 = 비움', async ({ page }) => {
    await boot(page, 'proto/contact.html');
    await page.locator('#inq-title').fill('작성 중');
    await page.locator('#inq-cancel').click();
    const dlg = page.locator('.modal[role="alertdialog"]');
    await expect(dlg).toContainText('작성 중인 내용이 모두 삭제됩니다. 계속하시겠습니까?');
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('#inq-cancel')).toBeFocused();
    await expect(page.locator('#inq-title')).toHaveValue('작성 중');
    await page.locator('#inq-cancel').click();
    await dlg.locator('button', { hasText: '확인' }).click();
    await expect(page.locator('#inq-title')).toHaveValue('');
    await expect(page.locator('.cnt[data-for="inq-title"]')).toHaveText('0자/60자');
  });
  test('키보드만으로 문의 등록 완주 → 목록 맨 위 답변 대기 · 13/7/6 · 토스트 · 다른 화면에 다녀와도 남고 새로고침하면 시드', async ({ page }) => {
    await boot(page, 'proto/contact.html');
    await page.locator('#ct-tab-form').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#inq-title')).toBeFocused();
    await page.keyboard.type('키보드로 남기는 문의');
    await page.keyboard.press('Tab');
    await page.keyboard.type('본문입니다.');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');   // 파일 추가 → 취소 → 저장
    await expect(page.locator('#inq-save')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#say')).toContainText('문의가 등록되었습니다. 답변은 영업일 기준 1-2일 내 제공됩니다.');
    expect(await page.locator('#ct-tiles .tile b').allTextContents()).toEqual(['13', '7', '6']);
    const first = page.locator('#ct-rows tr').first();
    await expect(first).toContainText('키보드로 남기는 문의');
    await expect(first).toContainText('답변 대기');
    await expect(first).toBeFocused();
    await expect(page.locator('#inq-title')).toHaveValue('');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ct-vt')).toHaveText('키보드로 남기는 문의');
    await page.goto('proto/faq.html'); await page.goto('proto/contact.html');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#ct-n')).toHaveText('(13)');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#ct-n')).toHaveText('(12)');
  });
});

test.describe('활용사례', () => {
  test('카드 2(실 정사영상 크롭이 실제로 그려진다) · 발췌 · 첨부 표식 · 페이저', async ({ page }) => {
    await boot(page, 'proto/usecase.html');
    await expect(page.locator('.uc-card')).toHaveCount(2);
    await expect(page.locator('.uc-card').first()).toContainText('도로안전');
    await expect(page.locator('.uc-card').first()).toContainText('첨부 3');
    await expect(page.locator('#uc-pager .pager-sum')).toHaveText('총 2건 중 1~2행');
    await page.waitForFunction(() => [...document.querySelectorAll('.uc-card img')].every((i) => i.complete && i.naturalWidth > 600));
  });
  test('상세 모달 — ?uc · 포커스 가둠 · 첨부 토스트 · Esc → 카드로 복귀 · 뒤로 가기', async ({ page }) => {
    await boot(page, 'proto/usecase.html');
    const card = page.locator('.uc-card[data-uc="2"]');
    await card.focus(); await page.keyboard.press('Enter');
    const modal = page.locator('.modal.uc-modal');
    await expect(modal).toBeVisible();
    expect(q(page).uc).toBe('2');
    await expect(modal.locator('.uc-m-t')).toContainText('AI 도로결함 자동 탐지 실증');
    await expect(modal.locator('.uc-m-date')).toHaveText('2026.04.15');
    await expect(modal.locator('.sp-file')).toHaveCount(3);
    await expect(modal.locator('.uc-m-r')).toContainText('4. 향후 계획');
    for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await modal.locator('.sp-file').first().click();
    await expect(page.locator('#say')).toContainText('내려받았습니다');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(card).toBeFocused();
    expect(page.url()).not.toContain('uc=');
    await page.goBack();
    await expect(page.locator('.modal.uc-modal')).toBeVisible();
    await page.locator('.modal-f button', { hasText: '닫기' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  });
  test('딥링크 ?uc=1 · 검색 필드 · 빈 상태 원문 · 초기화', async ({ page }) => {
    await boot(page, 'proto/usecase.html?uc=1');
    await expect(page.locator('.modal .uc-m-t')).toContainText('영농문제까지 해결');
    await expect(page.locator('.modal .sp-file')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#uc-field').selectOption('content');
    await page.locator('#uc-q').fill('직불금'); await page.keyboard.press('Enter');
    await expect(page.locator('.uc-card')).toHaveCount(1);
    await page.locator('#uc-field').selectOption('title');
    await page.locator('#uc-q').fill('해양 쓰레기');
    await page.locator('#uc-form button[type="submit"]').click();
    await expect(page.locator('#uc-list .empty-t')).toHaveText('검색 조건에 맞는 활용 사례가 없습니다.');
    await expect(page.locator('#uc-pager .pager-sum')).toHaveText('총 0건 중 0~0행');
    await page.locator('#uc-form button[type="reset"]').click();
    await expect(page.locator('.uc-card')).toHaveCount(2);
  });
});

test.describe('매뉴얼', () => {
  test('카테고리 5(시연) · 기본 02 · 고르면 우 판 교체 + ?m · 05 = 화면 없음 · 점선 결손 "본문 미구성"', async ({ page }) => {
    await boot(page, 'proto/manual.html');
    await expect(page.locator('.mn-item')).toHaveCount(5);
    await expect(page.locator('.mn-h .tag')).toHaveText('시연');
    await expect(page.locator('.mn-item[aria-current="true"]')).toContainText('지도 서비스 이용 안내');
    await expect(page.locator('.mn-dt h2')).toHaveText('지도 서비스 이용 안내');
    await expect(page.locator('.mn-gap-t')).toHaveText('본문 미구성');
    expect(await page.locator('.mn-gap').evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
    await page.locator('.mn-item[data-m="2"]').focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page.locator('.mn-dt h2')).toHaveText('보고서 생성 가이드');
    await expect(page.locator('.mn-fig--none')).toContainText('화면 없음');
    expect(q(page).m).toBe('5');
    await page.locator('.mn-file').click();
    await expect(page.locator('#say')).toContainText('보고서_생성_가이드.pdf');
    await page.goBack();
    await expect(page.locator('.mn-dt h2')).toHaveText('지도 서비스 이용 안내');
  });
});

test.describe('법전 · 반응', () => {
  const STATES = [
    ['notice', 'proto/notice.html', null],
    ['notice-empty', 'proto/notice.html?q=zzz', null],
    ['faq-open', 'proto/faq.html?faq=5,13', null],
    ['contact-error', 'proto/contact.html', async (p) => { await p.locator('#inq-save').click(); }],
    ['contact-view', 'proto/contact.html?inq=110', null],
    ['contact-cancel', 'proto/contact.html', async (p) => { await p.locator('#inq-title').fill('x'); await p.locator('#inq-cancel').click(); }],
    ['usecase-modal', 'proto/usecase.html?uc=2', null],
    ['manual', 'proto/manual.html?m=5', null],
  ];
  for (const [name, url, act] of STATES) {
    test(`${name}: 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 바닥 14px · 채운 파란 버튼 0 · 빨강은 글자만`, async ({ page }) => {
      await boot(page, url);
      if (act) await act(page);
      const bad = await page.evaluate((ACC) => {
        const out = [];
        const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
        for (const e of document.body.querySelectorAll('*')) {
          if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
          for (const pseudo of [null, '::before', '::after']) {
            const s = getComputedStyle(e, pseudo);
            if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
            const who = name(e) + (pseudo || '');
            if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(s[k]) > 0)) out.push(`radius ${who}`);
            if (s.boxShadow !== 'none') out.push(`shadow ${who}`);
            if (/gradient/.test(s.backgroundImage)) out.push(`gradient ${who}`);
            if (s.backdropFilter && s.backdropFilter !== 'none') out.push(`backdrop ${who}`);
            if (s.textShadow !== 'none') out.push(`text-shadow ${who}`);
            if (!pseudo && s.backgroundColor === 'rgb(209, 53, 43)') out.push(`warn-fill ${who}`);
            if (!pseudo && ['borderTopColor', 'borderLeftColor'].some((k) => s[k] === 'rgb(209, 53, 43)') && parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth) > 0) out.push(`warn-border ${who}`);
          }
          if (/^(button|a)$/i.test(e.tagName) && getComputedStyle(e).backgroundColor === ACC) out.push(`blue-fill ${name(e)}`);
          const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const field = /^(input|select|textarea)$/i.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'file';
          if ((hasText || field) && parseFloat(getComputedStyle(e).fontSize) < 14) out.push(`font<14 ${name(e)} ${getComputedStyle(e).fontSize}`);
        }
        return out;
      }, ACCENT);
      expect(bad).toEqual([]);
    });
  }
  for (const w of [1280, 1920]) {
    test(`${w}px 에서 가로로 넘치지 않는다 — 다섯 화면`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const [key] of PAGES) {
        await boot(page, `proto/${key}.html`);
        const over = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth, out = [];
          if (document.documentElement.scrollWidth > vw) out.push(`doc ${document.documentElement.scrollWidth}`);
          for (const e of document.querySelectorAll('#main *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > vw - 55) out.push(`${e.tagName}.${e.className} ${Math.round(r.right)}`); }
          return out;
        });
        expect(over, `${key} @${w}`).toEqual([]);
      }
    });
  }
  test('포커스 링 = 파랑 2px(행 · 타일 · 카드) · 유휴 운동 0', async ({ page }) => {
    await boot(page, 'proto/notice.html');
    await page.keyboard.press('Tab');
    await page.locator('#n-rows tr').nth(1).focus();
    await page.keyboard.press('ArrowDown');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; });
    expect(ring).toEqual(['solid', '2px', ACCENT]);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await page.waitForTimeout(1600);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });
});
