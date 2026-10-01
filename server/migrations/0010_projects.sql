-- 0010_projects.sql — 구현 2차 T1 '프로젝트 백본' · 멱등
--   확인 대장: 3차 R-D3(프로젝트 = 무엇 · 어디 · 담당 · 단계 6 · 첫 화면 '내 프로젝트') · R-D3 갈림길 ⓐ(직원이 바로 만든다 · 관리자 승인 없음)
--             4차 P1(프로젝트 → 서비스 카드 발행 요청) · 5차 역할-3 ⓑ(공개된 서비스의 재학습 = 프로젝트장이 시작 · 배포만 승인) · 6차 흐름-1(13단계)
--   projects         LX 직원의 일 단위. 입력은 이름 · 무엇을 · 어디(여러 곳) 세 칸뿐 — 나머지는 시스템이 판정한다.
--   project_members  구성원(프로젝트장은 projects.lead_id — 만든 직원 · 바꾸기는 LX 관리자)
--   project_links    프로젝트가 만든 것(학습 표본 · 서비스 카드 · 카드 판) — 다른 표를 고치지 않고 잇는다. round = 몇 차(보완 회차)에 더해졌나
CREATE TABLE IF NOT EXISTS projects(
  id text PRIMARY KEY,                               -- prj_…
  name text NOT NULL,
  task text NOT NULL,                                -- 무엇을(업무 · 탐지 대상 — 사람 말 그대로)
  task_id text,                                      -- 업무 목록 가운데 하나를 골랐으면 그 id(직접 입력이면 없음)
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,        -- 대상 지역 [{code, name, full, abroad}] — 직원이 고른다(화면이 고르지 않음)
  lead_id text NOT NULL,                             -- 프로젝트장
  round int NOT NULL DEFAULT 1,                      -- 보완 회차(재학습이면 +1 — 새 프로젝트를 만들지 않는다)
  round_at timestamptz NOT NULL DEFAULT now(),       -- 이번 회차 시작 — 학습 · 결과 확인 · 발행 요청 판정은 이 뒤의 것만 센다
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,         -- 회차 이력 [{round, at, by}]
  state text NOT NULL DEFAULT 'active',              -- active | archived
  created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS projects_lead ON projects (lead_id);

CREATE TABLE IF NOT EXISTS project_members(
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  added_by text, added_at timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, user_id));
CREATE INDEX IF NOT EXISTS project_members_user ON project_members (user_id);

CREATE TABLE IF NOT EXISTS project_links(
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL,                                -- sample(train_samples) | card(cards) | card_version(card_versions)
  ref text NOT NULL,
  round int NOT NULL DEFAULT 1,
  by text, at timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, kind, ref));
-- 자원(사용자 7차 답 데이터-1 — 할당 · 요청 · 승인은 설계 확인 대기): 프로젝트가 쓴 저장 공간을 셀 수 있게 이은 것마다 크기를 적어 둔다.
-- 나중에 '프로젝트장 개인 할당 안에서 쓴다'를 붙일 때 SUM(bytes) GROUP BY projects.lead_id 로 센다.
ALTER TABLE project_links ADD COLUMN IF NOT EXISTS bytes bigint;
CREATE INDEX IF NOT EXISTS project_links_ref ON project_links (kind, ref);
CREATE UNIQUE INDEX IF NOT EXISTS project_links_card_one ON project_links (ref) WHERE kind IN ('card', 'card_version');   -- 한 카드 = 한 프로젝트(담당 = 그 프로젝트장)

GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, project_links TO landxi_app, landxi_worker;
