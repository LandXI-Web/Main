-- 0030_card_groups.sql — 분야(카테고리) 관리(now 질문 5 '이대로 구현' 10-11 · 원칙 165) · 멱등
--   card_groups          분야 목록(이름 · 설명 · 순서) — 지금까지 코드 상수(cards.py GROUPS)였던 다섯 분야를 그대로 옮긴다(이름 · 순서 그대로).
--                        만들기 · 이름 바꾸기 · 순서는 LX 관리자만(배포 메뉴 '분야' 탭). 분석하기 거르기 칩 · 서비스 카드 · 기관 공유가 이 순서를 따른다.
--   card_group_of        서비스(카드) × 분야 — 한 서비스가 여러 분야에 들 수 있다(배포 신청서에서 고른다 · 승인되면 반영).
--                        지금 card_info.grp(한 분야)는 그대로 둔다(첫 분야를 같이 적어 옛 화면 · 옛 값이 깨지지 않게) — 정본은 이 표.
--   card_group_requests  직원이 배포 신청서에서 요청한 새 분야(만드는 것은 LX 관리자) — 열림 · 만듦 · 닫음.
--   card_group_log       분야 바뀐 기록(만들기 · 이름 · 설명 · 순서 · 요청 처리).
--   card_info.imagery_kinds  쓸 수 있는 영상(드론 · 항공 · 위성 — 분석하기 영상별 거르기). 비면 영상 조건 글에서 읽는다(cards.py).
-- 데이터: 지금 card_info.grp 값을 card_group_of 로 옮긴다(이미 분야 줄이 있는 카드는 건드리지 않는다 — 관리자가 바꾼 것을 다시 덮지 않게).
--         분류가 비어 있던 해외 카드(scope global)는 지금처럼 '해외'로(화면이 그렇게 보여 주던 값).
-- 되돌리기: migrations/down/0030_card_groups.down.sql. RLS: LX 영역만(기관 덱은 서버가 lx 영역 연결로 읽는다 — cards._load).

CREATE TABLE IF NOT EXISTS card_groups(
  id text PRIMARY KEY,                               -- grp-… (화면 글자에 없음)
  name text NOT NULL,
  descr text,
  ord int NOT NULL DEFAULT 0,                        -- 작을수록 앞
  by text,
  at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS card_groups_name ON card_groups (lower(name));

CREATE TABLE IF NOT EXISTS card_group_of(
  card_id text NOT NULL,                             -- cards.id
  group_id text NOT NULL REFERENCES card_groups(id) ON DELETE CASCADE,
  by text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, group_id));

CREATE TABLE IF NOT EXISTS card_group_requests(
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  project_id text,
  card_id text,
  by text,                                           -- 요청한 직원(lx_users.id)
  at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'made', 'closed')),
  group_id text,                                     -- 만든 분야(state made)
  decided_by text,
  decided_at timestamptz);

CREATE TABLE IF NOT EXISTS card_group_log(
  id bigserial PRIMARY KEY,
  group_id text,
  action text NOT NULL,                              -- create · rename · descr · order · request.made · request.closed · card.groups
  before jsonb,
  after jsonb,
  by text,
  at timestamptz NOT NULL DEFAULT now());

ALTER TABLE card_info ADD COLUMN IF NOT EXISTS imagery_kinds text[];

-- 지금 다섯 분야(코드 상수 GROUPS 그대로 · 순서 그대로)
INSERT INTO card_groups(id, name, descr, ord, by) VALUES
  ('grp-farm', '농지·시설', '농지 이용 · 농업 시설', 10, 'system:0030'),
  ('grp-env', '환경', '환경 실태조사', 20, 'system:0030'),
  ('grp-build', '건축·변화', '건물 · 지목과 다른 이용 · 두 시점 변화', 30, 'system:0030'),
  ('grp-safety', '안전', '안전 점검', 40, 'system:0030'),
  ('grp-global', '해외', '해외 기관 서비스', 50, 'system:0030')
ON CONFLICT (id) DO NOTHING;

-- 지금 분야 값 옮기기 — 분야 줄이 하나도 없는 카드만
INSERT INTO card_group_of(card_id, group_id, by)
SELECT i.card_id, g.id, 'system:0030' FROM card_info i JOIN card_groups g ON g.name = i.grp
WHERE i.grp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM card_group_of o WHERE o.card_id = i.card_id)
ON CONFLICT DO NOTHING;
INSERT INTO card_group_of(card_id, group_id, by)
SELECT c.id, 'grp-global', 'system:0030' FROM cards c LEFT JOIN card_info i ON i.card_id = c.id
WHERE c.scope = 'global' AND i.grp IS NULL AND NOT EXISTS (SELECT 1 FROM card_group_of o WHERE o.card_id = c.id)
  AND EXISTS (SELECT 1 FROM card_groups WHERE id = 'grp-global')
ON CONFLICT DO NOTHING;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['card_groups', 'card_group_of', 'card_group_requests', 'card_group_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format('CREATE POLICY lx_only ON %I USING (current_setting(''app.realm'', true) = ''lx'') WITH CHECK (current_setting(''app.realm'', true) = ''lx'')', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON card_groups, card_group_of, card_group_requests, card_group_log TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE card_group_requests_id_seq, card_group_log_id_seq TO landxi_app, landxi_worker;
