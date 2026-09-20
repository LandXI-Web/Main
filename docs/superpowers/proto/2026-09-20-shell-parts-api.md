# 공용 셸 + 부품 — API · 클래스 참조 (2026-09-20, 전수 검토 A4 선택 1)

파일: `landxi/proto/shell.js` · `shell-gate.js` · `shell.css` · `parts.css` — 살아있는 견본 `landxi/proto/shell-demo.html`(모든 부품이 실제로 동작) · 테스트 `tests/e2e/proto-shell.spec.mjs`.
법전: `design/system.md`. 라운드 0 · 그림자 0 · 그라디언트 0 · backdrop 0 · **글자 바닥 14px** · 채운 파란 버튼 없음 · 호버는 물리(이동·브래킷 성장·밑줄 스윕) · 포커스 링 파랑 2px(셸이 전역으로 건다 — `outline` 을 지우지 말 것).

## 0. 페이지 뼈대 (복사해서 시작)

```html
<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>공지사항 — Land-XI</title>
<link rel="icon" href="../assets/images/favicon_landxi.png">
<script src="shell-gate.js"></script>               <!-- 로그인 관문. 클래식 · 블로킹 · 스타일시트보다 앞 -->
<link rel="stylesheet" href="fonts-system.css">
<link rel="stylesheet" href="shell.css">
<link rel="stylesheet" href="parts.css">
<link rel="stylesheet" href="notice.css">           <!-- 화면 전용(부품에 없는 것만) -->
</head><body class="lx">
<main id="main"> … 화면 내용 … </main>
<script type="module" src="notice.js"></script>
</body></html>
```
```js
import { mountShell, TABS, say, confirmDialog, openModal, mountPager, bindRows, bindCounters, icon, esc, $, $$ } from './shell.js';
mountShell({ active: 'support', title: '서비스 지원', subtitle: '주요 운영 공지 및 업데이트 소식을 확인하세요',
  tabs: TABS.support, tab: 'notice', crumbs: [{ label: '서비스 지원', href: 'notice.html' }, { label: '공지사항' }], asOf: '2026-04-22', demo: true });
```
- `<main id="main">` 만 쓴다. 레일 · 마스트헤드 · 제목 행(`#page-head`, main 의 첫 자식) · 푸터 · 토스트 · 건너뛰기 링크는 셸이 넣는다. **직접 쓰지 말 것.**
- 셸이 서면 `<html data-shell="ready">`. 그 전까지 `#main` 은 `visibility:hidden`. e2e: `await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready')`, 로그인 플래그는 `page.addInitScript(() => localStorage.setItem('lx_logged_in','1'))`.
- 로그인 전 화면(가입 · 찾기)은 `shell-gate.js` 를 빼고 `mountShell({ rail: false, … })`.
- 경로는 전부 상대. proto/ 밖의 페이지는 `mountShell({ base: '../proto/' })` + `<script src="../proto/shell-gate.js" data-base="../proto/">`.

## 1. `mountShell(options)` → `{ main, rail, mast, head, foot }`

| 옵션 | 뜻 |
|---|---|
| `active` | 레일 활성 키 `dashboard · media · project · analysis · map · support · publish · admin · my` |
| `title` / `titleRule` | H1(Paperlogy 34). `titleRule: n` = 파랑 4px 룰을 앞 n단어에만(기본 전체) |
| `subtitle` | H1 옆 회색 한 줄. **HTML 허용 → 직접 `esc()`** |
| `crumbs` | `[{ label, href? }]` — 주면 마스트헤드 왼쪽 = 경로, 안 주면 공지 띠. `crumbIcon` = `icon()` 이름 |
| `notice` | `false` = 공지 띠 없음 · `{ title, date, href }` = 덮어쓰기 |
| `mastHtml` | 마스트헤드 왼쪽을 통째로 바꾸는 HTML |
| `asOf` / `asOfLabel` / `demo` | `'YYYY-MM-DD'`(기본 `2026-06-08`) · `false` = 숨김 / 기본 `기준일 현재` / `true` = `시연` 꼬리표 |
| `tabs` / `tab` / `tabStyle` | `[{ key, label, href, count? }]` / 활성 키 / `'box'`(서비스 지원 — 틴트 상자, 기본) · `'line'`(서비스 관리 — 잉크 밑줄 3px, `count` = 빨간 조치 건수). 준비된 목록: `TABS.support` `TABS.admin` |
| `headRight` | 제목 행 오른쪽 HTML(탭 대신 — 카드 발행 관리의 건수 타일 등) |
| `fit` | `true` = 100vh 앱형(본문 안에서 스크롤 — `.split` 이 남은 높이를 다 쓴다). 기본 = 문서형(페이지 스크롤, 푸터 바닥) |
| `rail` / `gate` / `base` | `false` = 레일·관문 없음 / `false` = 관문만 끔 / proto/ 까지의 상대 경로 |
| `keepDocTitle` | `true` = `document.title` 을 건드리지 않음(기본은 `제목 · 탭 — Land-XI`) |

내보내는 데이터: `NAV`(레일의 유일한 출처 — 복제 금지) · `TABS` · `FOOT_LINKS` · `FOOT_ADDR`(정본 `고객센터 063-713-1213, 1216`) · `NOTICE` · `AS_OF`.
레일: 9항목 전부 `<a href>`. MY 는 `mypage.html` 링크이면서 호버/포커스에 플라이아웃(마이 페이지 · 로그아웃)을 연다 — `↓`/`→` 진입 · `↑↓` 이동 · `Esc`/`←` 닫고 MY 로. 로그아웃 = `localStorage.lx_logged_in` 삭제 → `scrub/index.html`. 아무 요소에나 `data-action="logout"` 을 달면 같은 동작.

## 2. 함수

```js
say('저장했습니다 · 시연');                       // 토스트(#say, role=status aria-live=polite). say(msg, ms=4200) · ms 0 = 남김
if (await confirmDialog({ title: '삭제', body: '삭제하시겠습니까?', okLabel: '삭제', danger: true })) …   // Promise<boolean>. Esc·바깥·취소 = false. danger 면 기본 포커스가 취소
const m = openModal({ title: '내 디스크 증량 신청', tag: '시연', width: 660, content: htmlOrNode,
  actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: (ctx) => { if (!valid()) return false; save(); } }] });
m.close(value); await m.closed;                    // onClick 이 false 를 돌려주면 닫지 않는다. 없으면 action.value 로 닫힘
closeModal();                                      // 맨 위 모달 닫기
```
`openModal` 옵션: `title · content(HTML|Node) · actions[{label, kind:'primary'|'bracket'|'danger', value, onClick, autofocus}] · tag · width(480) · dismissible(true) · onClose · role`. 포커스 가둠(Tab/Shift+Tab) · Esc · 스크림 클릭 · 닫히면 부른 요소로 포커스 · 바깥은 `inert`. 모달 본문에도 `.form/.field/.inp` 를 그대로 쓴다.

| 함수 | 용도 |
|---|---|
| `mountPager(el, { total, page, size, sizes:[10,20,50], onChange({page,size}) })` → `{ set({total,page,size}), state }` | 처음/이전/1…5/다음/마지막 + 페이지 크기 + `총 n건 중 a~b행`. 필터로 건수가 바뀌면 `pager.set({ total, page: 1 })` |
| `bindRows(tbodyOrList, (row) => …)` → `{ pick(row) }` | `[data-row]` 행: 클릭 · `↑↓` · Enter/Space → `aria-selected` 를 하나만 true 로 하고 콜백 |
| `bindCounters(root?)` | `<span class="cnt" data-for="입력id">` → `35자/200자`(입력의 `maxlength`). 모달을 연 뒤에는 `bindCounters(m.el)` |
| `icon(name, size=16)` | 원판의 각진 1.5 stroke 아이콘 SVG 문자열: `notice search reset x check plus clip pin down list edit lock user mail layers clock image grid chevD chevR` |
| `esc(s)` · `ymd('2026-04-15')`→`2026.04.15` · `nf.format(n)` · `$` · `$$` · `REDUCED()` · `gate(base)` · `isLoggedIn()` · `logout(base)` | 도우미 |

## 3. 부품 클래스 (`parts.css`, 전부 `body.lx` 안에서만 동작)

글자 도우미(`shell.css`): `.d` Paperlogy 700 · `.n` Inter tabular(표 숫자 · 날짜) · `.big` 큰 숫자 · `.lb` 14 회색 라벨 · `.mic` 14 회색 · `.dim` · `.sp`(flex:1) · `.sr`(화면 밖) · `hr.hr` / `hr.hr--ink`. 토큰: `--ink --grey --grey-3 --line --accent --warn --teal --t1 --t2 --m(56) --rail(72) --mast(64) --hov --hove --ease --d1…--d4`.

### 버튼 · 링크
```html
<button class="btn">저장</button>  <button class="btn-br">취소</button>  <a class="link" href="…">전체 보기</a>
```
`.btn` 1차 = 잉크 채움(38px) · `.btn--l` 44px · `.btn--block` 전폭 · `.btn--s` 28px. `.btn-br` 2차 = 코너 브래킷 4(호버에 테두리로 자란다) · `.btn-br--s` · `.btn-br--warn`(반려·거부 등 조치 글자색). 폭 고정은 `style="width:96px"`. 아이콘은 `icon('search',14) + '검색'`. `.link`(파랑 밑줄, 호버 4px) · `.link--ink`. 버튼 줄 `.acts`. 아무 상자에나 브래킷: `.brackets`(+ `.brackets--acc` 파랑, 크기 `--b`).

### 칩 · 꼬리표 · 상태어
`<span class="chip">공지</span>` · `.chip--on`(선택) · `.chip--teal`(AI 결과 클래스). **정직 꼬리표** `<em class="tag">시연</em>` `<em class="tag">추정</em>`(점선). 상태어는 글자색만: `.st`(잉크) `.st--acc`(승인·완료) `.st--warn`(대기·조치 필요) `.st--dim`(탈퇴·거부) `.st--teal`.

### 건수 타일 띠
```html
<div class="band" role="group" aria-label="구분으로 거르기">
  <button type="button" class="tile" aria-pressed="true"><span class="tile-l">전체</span><span class="tile-v"><b>8</b><span>건</span></span><span class="tile-s n">고정 2</span></button>
  <button type="button" class="tile tile--warn" aria-pressed="false">…<span class="tile-s"><em>승인 필요</em></span></button>
  <p class="band-note">숫자를 누르면 그 상태로 거른다</p>
</div>
```
숫자 색: 기본 파랑 · `.tile--ink` · `.tile--warn`(조치 필요에만) · `.tile--zero`(0건 회색). 선택 = `aria-pressed="true"`(또는 `aria-selected` · `.is-on`) → 틴트 + 파랑 3px 룰(기본 아래, `.band--top` = 위). `.band--s` = 42px 숫자(서비스 관리 원판) · `.band--auto` = 내용 폭. 고르지 않는 타일은 `<div class="tile">`. 눌림 상태 전환은 페이지 JS 몫.

### 검색 행
```html
<form class="filters" role="search">
  <input class="inp" placeholder="이름" aria-label="이름">
  <span class="sel"><select aria-label="부서"><option>부서 전체</option></select></span>
  <span class="f-lab">가입일</span><input class="inp" type="date" aria-label="시작"><span class="tilde">~</span><input class="inp" type="date" aria-label="끝">
  <span class="chips" role="group" aria-label="기간"><button type="button" class="chip-b" aria-pressed="true">전체</button><button type="button" class="chip-b" aria-pressed="false">1개월</button></span>
  <span class="filters-acts"><button type="reset" class="btn-br">초기화</button><button class="btn">검색</button></span>
</form>
```
`.filters` 안의 입력은 자동으로 36px. 돋보기 든 입력: `<label class="inp-ic">${icon('search')}<input class="inp" …></label>`. 큰 선택 칩(모달 용량 등) `.chips.chips--l`.

### 폼
```html
<div class="form">                                     <!-- 12열 격자. .field--3/4/6/8/9 = 열 수 -->
  <div class="field field--9"><div class="field-h"><label class="field-l" for="t">제목<em class="req">*</em></label><span class="cnt" data-for="t"></span></div>
    <input id="t" class="inp" maxlength="200"><p class="help">도움말</p><p class="err" id="t-e">오류 문구</p></div>
</div>
<label class="ck"><input type="checkbox">무한 게시</label>   <label class="rd"><input type="radio" name="r">일반</label>
```
`.inp` 44px 헤어라인 → 포커스 잉크(+ 파랑 링) · `textarea.inp` · `.inp--s`/`.sel--s` 36px · `.inp--num`(Inter) · 오류 = `aria-invalid="true"` + `.err`(`aria-describedby`) · `.field-row`(한 줄에 날짜·시각·체크) · `.checks`(체크 묶음) · 체크/라디오는 16px 정사각.

### 표 · 페이저
```html
<div class="tbl-wrap"><table class="tbl"><colgroup><col style="width:74px"><col>…</colgroup>
  <thead><tr><th>이름</th>…</tr></thead>
  <tbody><tr data-row tabindex="0" aria-selected="false"><td>신○○</td><td class="num">2026.04.22 09:15</td><td><span class="st st--warn">대기</span></td></tr></tbody></table></div>
<nav id="pager"></nav>
```
`table-layout:fixed` — **열 폭은 `<colgroup>` 으로**. 머리띠 틴트 32px · 행 45px(`.tbl--l` 52 · `.tbl--s` 42) · `td.num` Inter · `.r` `.c` 정렬 · `tr.is-dim`. 고르는 행만 `data-row tabindex="0"` → 호버 4px 이동, 선택 = 틴트 + 파랑 3px 표식. 목록이 카드면 `.lcard`(썸네일 100 + 3줄, `aria-current="true"`/`aria-selected="true"`).

### 분할 작업공간 · 열람 판
```html
<div class="split" style="--l:740fr;--r:476fr">          <!-- .split--5050 · .split--form(560/656) -->
  <section class="split-l"> 표 + 페이저 </section>
  <aside class="split-r panel" aria-label="열람">
    <header class="panel-h"><h2>사용자 정보 열람</h2><span class="sp"></span><a class="link link--ink">로그인 이력 0 ›</a></header>
    <div class="panel-b"> … </div>
    <footer class="panel-f"><span class="mic">저장 시 반영</span><button class="btn-br">삭제</button><button class="btn">저장</button></footer>
  </aside></div>
```
판 안: `.panel-t`(Paperlogy 26 제목) · `.panel-meta`(세로줄로 나뉜 메타) · `.prose`(본문 16/27, 줄바꿈 유지) · `.sec-h`(섹션 제목 + 잉크 룰) · 키–값 `<dl class="kv"><div><dt>상태</dt><dd>…</dd></div></dl>`(라벨 폭 `--kw`, `.kv--l` 40px 행) · 묶음 행 `.sec > .sec-k + .sec-v.flds > .fld(.fld-l + .fld-v)` · 첨부 `.file`. `fit:true` 가 아니면 `.split` 의 부모에 높이를 줘야 안에서 스크롤한다.

### 판 안의 탭 · 빈 상태 · 그림 · 막대
- `.tabs > [role=tab][aria-selected]` — 밑줄 2px 잉크(스윕). 건수는 `<span class="n">2</span>`. 선택 전환 · `tabindex` 로빙은 페이지 JS 몫.
- 빈 상태: `<div class="empty">${icon('notice',30)}<p class="empty-t">검색 조건에 맞는 공지사항이 없습니다.</p><p class="empty-w">이유 한 줄</p></div>` · 한 줄짜리 `.empty.empty--s`. 점선 무채 — 색을 넣지 말 것.
- 그림 카드: `<figure class="imgcard" style="--ar:16/9"><img src="../assets/proto/crops/…/1.jpg" alt="…"><figcaption><span>카드 썸네일</span><span class="sp"></span><span>출처</span></figcaption></figure>` · `.imgcard--below`(캡션 아래) · `.imgcard--none`(그림 없음 = 점선). 실제 정사영상 크롭은 `landxi/assets/proto/crops/`.
- `.meter`(`style="--v:28%;--g:6%"` + `<i></i><span class="ghost"></span>` — 예측은 점선 고스트, `.meter--warn`) · `.steps > [aria-current=step]`.

## 4. 하지 말 것
- 레일/푸터/마스트헤드/토스트/모달을 페이지에서 다시 만들지 말 것. 전화번호·푸터 문구를 페이지에 쓰지 말 것(C3).
- `border-radius` · `box-shadow` · `gradient` · `backdrop-filter` · 14px 미만 글자 · 채운 파란 버튼 · 색만 바뀌는 호버 · `#8A8A8A` 같은 팔레트 밖 회색 — `proto-shell.spec.mjs` 의 전 요소 검사를 자기 화면 스펙에 복사해 쓰면 된다.
- `--warn` 은 조치 필요(대기 · 미답변 · 실패)의 **글자**에만. 채움 · 테두리 · 배지 금지.
- 지어낸 운영 서사 금지. 원본 시드는 마스킹(성 + ○○ · 앞 2자 + `***`) + `시연`, 추정치는 `추정`.
- `dashboard.*` · `dataset.*` 는 아직 셸로 옮기지 않았다(나중 과제). 그 둘의 레일과 눈으로는 같다.
