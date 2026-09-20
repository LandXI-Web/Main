import { test, expect } from '@playwright/test';
import path from 'node:path';

// 마이 페이지 — landxi/proto/mypage.{html,js} · account.css · account-data.js · account-brand.js
//  마스터  design-canvas/v2/B6-My-*.dc.html (선택 1 — 좌 신원 원장 372 / 우 디스크 판) · 기록 design-canvas/v2/notes/B6-account.md
//  원본    landxi7/mypage.html 1:1 (문구 · 검증 · ?mode=edit 딥링크 · localStorage lx_custom_symbol)
const URL = 'proto/mypage.html';
const ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50/i;
const SYMBOL = path.resolve('design-canvas/v2/img/b6-account-symbol-lx.svg');

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url = URL) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready' && window.__my?.ready);
}
const toast = (page) => page.locator('#say');

test.describe('관문 · 셸', () => {
  test('로그인 전이면 login.html?next=mypage.html 로 보낸다', async ({ page }) => {
    await page.goto(URL + '?mode=edit');
    await page.waitForURL(/login\.html/);
    expect(new globalThis.URL(page.url()).searchParams.get('next')).toBe('mypage.html?mode=edit');
  });
  test('한 단계 위의 landxi/mypage.html 은 proto/mypage.html 로 넘긴다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
    await page.goto('mypage.html?open=password');
    await page.waitForURL(/proto\/mypage\.html\?open=password/);
  });
  test('레일 활성 = MY · 제목 · 콘솔 오류 0', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveText('MY');
    await expect(page.locator('#page-title')).toHaveText('마이 페이지');
    await expect(page.locator('#page-sub')).toHaveText('회원 정보 및 내 디스크 사용 현황을 확인하세요');
    expect(errs).toEqual([]);
  });
});

test.describe('열람 뷰', () => {
  test('회원 정보 6행 — 원본 시드', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#profile-name')).toHaveText('관리자');
    const rows = await page.locator('#my-ledger > div').evaluateAll((r) => r.map((e) => [e.querySelector('dt').textContent, e.querySelector('dd').textContent]));
    expect(rows).toEqual([['이름', '관리자'], ['아이디 (이메일)', 'admin@namwon.go.kr'], ['전화번호', '063-620-6102'], ['부서', '공간정보사업처'], ['직위', '주무관'], ['가입 일시', '2025.04.10 11:18']]);
  });
  test('디스크 — 30 % · 612.4 / 1,435.6 / 2,048 GB · 칸 판 1칸 = 16 GB(128칸 + 고스트 3칸)', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#disk-pct')).toHaveText('30');
    await expect(page.locator('#disk-used')).toHaveText('612.4');
    await expect(page.locator('#disk-free')).toHaveText('1,435.6');
    await expect(page.locator('#disk-total')).toHaveText('2,048');
    await expect(page.locator('#plate i.u')).toHaveCount(38);             // 612.4 / 16 = 38.275 → 가득 38 + 부분 1
    await expect(page.locator('#plate i.p')).toHaveCount(1);
    await expect(page.locator('#plate i:not(.g):not(.x)')).toHaveCount(128);
    await expect(page.locator('#plate i.g')).toHaveCount(3);              // 검토 중 50 GB ≈ 3칸 — 점선 고스트
    expect(await page.locator('#plate i.g').first().evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
    await expect(page.locator('#plate-pend')).toContainText('+50 GB');
    const plate = await page.locator('#plate').evaluate((e) => [e.scrollWidth <= e.parentElement.clientWidth, e.getAttribute('aria-label')]);
    expect(plate[0]).toBe(true);
    expect(plate[1]).toContain('612.4 GB 사용');
  });
  test('신청 이력 — 5열 · 신청 일시 내림차순 · 상태어', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#history-count')).toHaveText('총 2건');
    expect(await page.locator('#history-table thead th').allTextContents()).toEqual(['신청 용량 (GB)', '신청 사유', '신청 일시', '처리 여부', '처리 내용']);
    const rows = await page.locator('#history-tbody tr').evaluateAll((t) => t.map((r) => [...r.cells].map((c) => c.textContent.trim())));
    expect(rows[0]).toEqual(['+50GB', '카메라 분석 추론 결과 백업', '2026.04.12 14:42', '검토 중', '검토 중']);
    expect(rows[1][0]).toBe('+100GB'); expect(rows[1][3]).toBe('승인'); expect(rows[1][4]).toBe('승인 완료 · 2026.04.08 반영');
  });
  test('?history=empty — 빈 상태 · 총 0건 · 고스트 0', async ({ page }) => {
    await boot(page, URL + '?history=empty');
    await expect(page.locator('#history-count')).toHaveText('총 0건');
    await expect(page.locator('#history-empty')).toBeVisible();
    await expect(page.locator('#history-empty')).toContainText('조회된 데이터가 없습니다.');
    await expect(page.locator('#plate i.g')).toHaveCount(0);
    await expect(page.locator('#plate-pend')).toBeHidden();
  });
  test('1280 · 1920 에서 가로로 넘치지 않는다', async ({ page }) => {
    for (const w of [1280, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const over = await page.evaluate(() => [document.documentElement.scrollWidth > innerWidth, [...document.querySelectorAll('.my-l,.my-r')].some((e) => e.scrollWidth > e.clientWidth + 1)]);
      expect(over).toEqual([false, false]);
    }
  });
});

test.describe('본인 확인 → 회원정보 수정', () => {
  test('빈 값 = 원본 오류 문구 · 아무 값이나 통과 → 수정 뷰(?mode=edit) · 뒤로 가기', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-edit-profile').click();
    const modal = page.locator('.modal');
    await expect(modal.locator('h2')).toHaveText('본인 확인');
    await expect(page.locator('#pwdc-input')).toBeFocused();
    await modal.getByRole('button', { name: '확인' }).click();
    await expect(page.locator('#pwdc-input-e')).toHaveText('비밀번호를 입력해 주세요.');
    expect(await page.locator('#pwdc-input-e').evaluate((e) => getComputedStyle(e).color)).toBe(WARN);
    await expect(page.locator('#pwdc-input')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#pwdc-input').fill('x');
    await expect(page.locator('#pwdc-input-e')).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(modal).toHaveCount(0);
    await expect(page.locator('#view-edit')).toBeVisible();
    await expect(page.locator('#page-title')).toHaveText('회원정보 수정');
    await expect(page.locator('#page-sub')).toHaveText('회원 정보와 정보 이용 동의 설정을 변경합니다.');
    expect(page.url()).toContain('mode=edit');
    await page.goBack();
    await expect(page.locator('#view-main')).toBeVisible();
    await expect(page.locator('#page-title')).toHaveText('마이 페이지');
  });
  test('?mode=edit 딥링크 = 본인 확인을 거친다 · 취소하면 열람 뷰', async ({ page }) => {
    await boot(page, URL + '?mode=edit');
    await expect(page.locator('.modal h2')).toHaveText('본인 확인');
    await page.keyboard.press('Escape');
    await expect(page.locator('#view-main')).toBeVisible();
    expect(page.url()).not.toContain('mode=edit');
  });
  test('5필드 · 읽기 전용 2 · 전화번호 빈 값 = 입력 오류 · 저장 → 원장 반영 + 토스트', async ({ page }) => {
    await boot(page, URL + '?mode=edit');
    await page.locator('#pwdc-input').fill('pw'); await page.keyboard.press('Enter');
    await expect(page.locator('#ef-name')).toHaveAttribute('readonly', '');
    await expect(page.locator('#ef-email')).toHaveAttribute('readonly', '');
    await expect(page.locator('#ef-email')).toHaveValue('admin@namwon.go.kr');
    expect(await page.locator('#ef-dept option').allTextContents()).toEqual(['공간정보사업처', '공간사업기획처', '디지털국토정보처', '지적측량처', '미래사업처']);
    await page.locator('#ef-phone').fill('');
    await page.locator('#btn-edit-save').click();
    await expect(page.locator('#ef-phone-e')).toHaveText('전화번호를 입력해 주세요.');
    await expect(toast(page)).toHaveText('입력 오류 — 전화번호를 입력해 주세요.');
    await expect(page.locator('#view-edit')).toBeVisible();
    await page.locator('#ef-phone').fill('063-713-1000');
    await page.locator('#ef-dept').selectOption('디지털국토정보처');
    await page.locator('#btn-edit-save').click();
    await expect(page.locator('#view-main')).toBeVisible();
    await expect(page.locator('#pt-dept')).toHaveText('디지털국토정보처');
    await expect(page.locator('#pt-phone')).toHaveText('063-713-1000');
    await expect(toast(page)).toHaveText('변경 완료 — 회원정보가 저장되었습니다.');
    await page.reload();                                                     // 같은 탭 = sessionStorage 에 남는다
    await page.waitForFunction(() => window.__my?.ready);
    await expect(page.locator('#pt-dept')).toHaveText('디지털국토정보처');
  });
  test('홍보 동의를 해제하면 SMS · Email 도 함께 해제 · 취소는 저장하지 않는다', async ({ page }) => {
    await boot(page, URL + '?mode=edit');
    await page.locator('#pwdc-input').fill('pw'); await page.keyboard.press('Enter');
    for (const id of ['#consent-marketing', '#consent-sms', '#consent-email']) await page.locator(id).check();
    await page.locator('#consent-marketing').uncheck();
    await expect(page.locator('#consent-sms')).not.toBeChecked();
    await expect(page.locator('#consent-email')).not.toBeChecked();
    await page.locator('#ef-rank').fill('팀장');
    await page.locator('#btn-edit-cancel').click();
    await expect(page.locator('#pt-rank')).toHaveText('주무관');
  });
});

test.describe('비밀번호 변경', () => {
  test('오류 문구 3종 → 통과하면 토스트', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-change-pwd').click();
    await expect(page.locator('.modal h2')).toHaveText('비밀번호 변경');
    await page.locator('#pwd-new').fill('abcdef'); await page.locator('#pwd-confirm').fill('abcdefgh');
    await page.locator('.modal-f .btn').click();
    await expect(page.locator('#pwd-current-e')).toHaveText('현재 비밀번호를 입력해 주세요.');
    await expect(page.locator('#pwd-new-e')).toHaveText('영문·숫자·특수문자를 조합해 8자 이상 입력해 주세요.');
    await expect(page.locator('#pwd-confirm-e')).toHaveText('새 비밀번호가 일치하지 않습니다.');
    await expect(page.locator('#pwd-current')).toBeFocused();
    await page.locator('#pwd-current').fill('old'); await page.locator('#pwd-new').fill('abcd1234!'); await page.locator('#pwd-confirm').fill('abcd1234!');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(toast(page)).toHaveText('변경 완료 — 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
    await expect(page.locator('#btn-change-pwd')).toBeFocused();
  });
  test('?open=password 딥링크 · 포커스 가둠 · Esc', async ({ page }) => {
    await boot(page, URL + '?open=password');
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    expect(page.url()).not.toContain('open=');
  });
});

test.describe('내 디스크 증량 신청', () => {
  test('프리셋 32–1024 + 직접 입력 · 오류 2종', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-request-storage').click();
    expect(await page.locator('.sr-chips .chip-b').allTextContents()).toEqual(['32', '64', '128', '256', '512', '1024', '직접 입력']);
    await page.locator('.modal-f .btn').click();
    await expect(page.locator('#sr-capacity-e')).toHaveText('10GB 이상 10240GB 이하의 용량을 입력해 주세요.');
    await expect(page.locator('#sr-reason-e')).toHaveText('신청 사유를 입력해 주세요.');
    for (const bad of ['9', '10241']) { await page.locator('#sr-capacity').fill(bad); await page.locator('.modal-f .btn').click(); await expect(page.locator('#sr-capacity-e')).toBeVisible(); }
    await page.locator('.chip-b[data-gb="256"]').click();
    await expect(page.locator('#sr-capacity')).toHaveValue('256');
    await expect(page.locator('#sr-capacity-e')).toBeHidden();
    await expect(page.locator('#sr-after')).toHaveText('2,304 GB');
    await page.locator('#sr-capacity').fill('300');
    await expect(page.locator('.chip-b[data-gb="custom"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sr-capacity').fill('64');
    await expect(page.locator('.chip-b[data-gb="64"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.chip-b[data-gb="custom"]').click();
    await expect(page.locator('#sr-capacity')).toHaveValue('');
    await expect(page.locator('#sr-capacity')).toBeFocused();
  });
  test('저장 → 이력 맨 위 새 행(검토 중) + 고스트 칸 증가 + 토스트 · 직접 입력 경계 10 / 10240', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-request-storage-2').click();
    await page.locator('.chip-b[data-gb="128"]').click();
    await page.locator('#sr-reason').fill('2026년 하반기 정사영상 원본 추가 적재');
    await page.locator('.modal-f .btn').click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(toast(page)).toHaveText('신청 완료 — 128GB 증량 신청이 접수되었습니다.');
    await expect(page.locator('#history-count')).toHaveText('총 3건');
    const first = page.locator('#history-tbody tr').first();
    await expect(first).toHaveClass(/is-fresh/);
    await expect(first.locator('td').nth(0)).toHaveText('+128GB');
    await expect(first.locator('td').nth(1)).toHaveText('2026년 하반기 정사영상 원본 추가 적재');
    await expect(first.locator('td').nth(3)).toHaveText('검토 중');
    await expect(page.locator('#plate i.g')).toHaveCount(11);             // (50 + 128) / 16 ≈ 11칸
    await expect(page.locator('#plate-pend')).toContainText('+178 GB');
    for (const v of ['10', '10240']) {
      await page.locator('#btn-request-storage').click();
      await page.locator('#sr-capacity').fill(v); await page.locator('#sr-reason').fill('경계값');
      await page.locator('.modal-f .btn').click();
      await expect(page.locator('.modal')).toHaveCount(0);
    }
    await expect(page.locator('#history-count')).toHaveText('총 5건');
    expect(await page.locator('#plate').evaluate((e) => e.scrollWidth <= e.parentElement.clientWidth)).toBe(true);   // 고스트는 8열까지만 — 판이 넘치지 않는다
  });
});

test.describe('브랜드 심볼', () => {
  test('빈 상태 · 형식 오류 · 업로드 → 미리보기 → 저장하면 실제 레일 머리가 바뀐다 → 새로고침 유지 → 초기화', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    await expect(page.locator('#rail-mark img')).toHaveCount(0);
    await page.locator('#btn-brand-edit').click();
    await expect(page.locator('.modal h2')).toHaveText('브랜드 심볼 수정');
    await expect(page.locator('#bm-file-name')).toHaveText('선택된 파일 없음');
    await page.locator('#bm-save').click();                                  // 파일 없이 저장 → 안내가 오류로
    await expect(page.locator('#bm-file-e')).toHaveText('PNG 또는 SVG 파일을 업로드해 주세요.');
    await page.locator('#bm-file').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    await expect(page.locator('#bm-file-e')).toHaveText('PNG 또는 SVG 파일만 업로드할 수 있습니다.');
    await expect(page.locator('#bm-file-name')).toHaveText('선택된 파일 없음');
    await page.locator('#bm-file').setInputFiles(SYMBOL);
    await expect(page.locator('#bm-file-name')).toHaveText('b6-account-symbol-lx.svg');
    await expect(page.locator('#bm-file-e')).toBeHidden();
    await expect(page.locator('#bm-new img')).toBeVisible();
    expect(await page.locator('#bm-width').evaluate((e) => [e.min, e.max])).toEqual(['16', '50']);
    await page.locator('#bm-width').fill('44');
    await expect(page.locator('#bm-width-val')).toHaveText('44');
    expect(await page.locator('#bm-new img').evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(66);   // 1.5배 미리보기
    await expect(page.locator('#rail-mark img')).toHaveCount(0);             // 저장 전에는 레일에 반영하지 않는다
    await page.locator('#bm-save').click();
    await expect(toast(page)).toHaveText('저장 완료 — 브랜드 심볼이 적용되었습니다.');
    expect(await page.locator('#rail-mark img').evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(44);
    await expect(page.locator('#bs-current-w')).toHaveText('44');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lx_custom_symbol')).w)).toBe(44);
    expect(await page.locator('#rail-mark').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);

    await page.reload();
    await page.waitForFunction(() => window.__my?.ready);
    await expect(page.locator('#rail-mark img')).toHaveCount(1);

    await page.locator('#btn-brand-edit').click();
    await page.locator('#bm-reset').click();
    await expect(toast(page)).toHaveText('초기화 완료 — 기본 심볼로 초기화되었습니다.');
    await expect(page.locator('.modal')).toBeVisible();                      // 초기화해도 모달은 열려 있다(원본)
    await expect(page.locator('#rail-mark img')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('lx_custom_symbol'))).toBeNull();
    await page.locator('#bm-cancel').click();
    await expect(page.locator('#bs-current-w')).toHaveText('기본');
    expect(errs).toEqual([]);
  });
  test('저장된 값이 이미지 dataURL 이 아니면 레일에 얹지 않는다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lx_custom_symbol', JSON.stringify({ src: 'javascript:alert(1)', w: 40 })));
    await boot(page);
    await expect(page.locator('#rail-mark img')).toHaveCount(0);
  });
});

test.describe('계정 탈퇴(추정)', () => {
  test('조용한 글자 링크 + `추정` → 확인 대화 · 빈 비밀번호 오류 · 취소', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.my-quiet .tag')).toHaveText('추정');
    await page.locator('#btn-withdraw').click();
    const modal = page.locator('.modal');
    await expect(modal).toHaveAttribute('role', 'alertdialog');
    await expect(modal.locator('.tag')).toHaveText('추정');
    await expect(modal).toContainText('“admin@namwon.go.kr” 계정을 탈퇴할까요?');
    await modal.getByRole('button', { name: '탈퇴' }).click();
    await expect(page.locator('#wd-input-e')).toHaveText('비밀번호를 입력해 주세요.');
    await modal.getByRole('button', { name: '취소' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('#btn-withdraw')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBe('1');
  });
  test('탈퇴 = 세션을 지우고 메인으로', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('e2e')) { localStorage.setItem('lx_logged_in', '1'); sessionStorage.setItem('e2e', '1'); } });
    await page.goto(URL + '?open=withdraw');
    await page.locator('#wd-input').fill('pw');
    await page.keyboard.press('Enter');
    await page.waitForURL(/scrub\/index\.html/);
    expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  });
});

test.describe('키보드 · 법전', () => {
  test('키보드만으로 증량 신청 완주', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-request-storage').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('.chip-b[data-gb="64"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#sr-capacity')).toHaveValue('64');
    await page.locator('#sr-reason').focus();
    await page.keyboard.type('키보드 신청');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');       // 취소 → 저장
    await expect(page.locator('.modal-f .btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#history-count')).toHaveText('총 3건');
    await expect(page.locator('#btn-request-storage')).toBeFocused();
  });
  test('prefers-reduced-motion — 진입 · 칸 판 모션 0', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    const names = await page.evaluate(() => [...document.querySelectorAll('[data-in], #plate i.u')].map((e) => getComputedStyle(e).animationName));
    expect(names.every((n) => n === 'none')).toBe(true);
  });
  for (const [name, url, prep] of [
    ['열람 뷰 + 증량 모달', URL + '?open=storage', async (page) => { await page.locator('.modal-f .btn').click(); }],
    ['브랜드 모달', URL + '?open=brand', async (page) => { await page.locator('#bm-file').setInputFiles(SYMBOL); await page.locator('#bm-new img').waitFor(); }],
    ['회원정보 수정 뷰', URL + '?mode=edit', async (page) => { await page.locator('#pwdc-input').fill('x'); await page.keyboard.press('Enter'); await page.locator('#ef-phone').fill(''); await page.locator('#btn-edit-save').click(); }],
  ]) test(`라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 바닥 14px · 파란 채움 버튼 0 · 빨강은 글자만 — ${name}`, async ({ page }) => {
    await boot(page, url);
    await prep(page);
    const bad = await page.evaluate(({ ACCENT, WARN }) => {
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
          if (s.backgroundColor === WARN || [s.borderTopColor, s.borderBottomColor, s.borderLeftColor].some((c, i) => c === WARN && parseFloat([s.borderTopWidth, s.borderBottomWidth, s.borderLeftWidth][i]) > 0)) out.push(`warn-fill ${who}`);
        }
        const s = getComputedStyle(e);
        if (/^(button|a)$/i.test(e.tagName) && s.backgroundColor === ACCENT) out.push(`blue-button ${name(e)}`);
        const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const field = /^(input|select|textarea)$/i.test(e.tagName) && !['checkbox', 'radio', 'range', 'file'].includes(e.type);
        if ((hasText || field) && parseFloat(s.fontSize) < 14) out.push(`font<14 ${name(e)} ${s.fontSize}`);
      }
      return out;
    }, { ACCENT, WARN });
    expect(bad).toEqual([]);
  });
});
