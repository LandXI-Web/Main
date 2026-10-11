-- 0031_ext_api.sql — 외부 연동 API 1차(결과 가져오기만 · 원칙 54 · 69 · 174 · 178 · 179 · 확인 대장 API-형식3 ⓐ · API-공유끔 ⓐ) · 멱등
--   api_keys   (기관 × 공유된 분석 서비스)마다 키. LX 관리자가 만들고 · 멈추고 · 폐기하고 · 끝나는 날 · 범위(형식) · 한도를 정한다(원칙 178).
--              키 값은 만들 때 한 번만 보이고, 여기에는 한 방향 암호(HMAC-SHA256 · 서버 비밀)와 끝 네 자리만 남는다.
--              공유를 거두면 키는 멈춤(호출 때 공유 판정 brand._services 로 확인) · 다시 공유하면 그대로 이어진다(API-공유끔 ⓐ).
--              폐기 · 멈춤 · 시험 키도 지우지 않는다(기록은 자산 · 원칙 173).
--   api_calls  모든 호출 한 줄(감사) — 시각 · 키 · 기관 · 서비스 · 무엇을 · 형식 · 몇 건 · 크기 · 결과 코드 · 접속 주소. 키 값 · 비밀번호는 적지 않는다.
-- 분석 맡기기 · 외부 영상 올리기는 1차에 만들지 않는다(원칙 179 — 보안 검토 review-r16 기록만).
-- 되돌리기: migrations/down/0031_ext_api.down.sql. RLS: LX 영역만(외부 창구는 서버가 lx 영역 연결로 읽고 기관 · 서비스를 키로 자른다).

CREATE TABLE IF NOT EXISTS api_keys(
  id text PRIMARY KEY,                               -- 'key_' + 12 hex(화면 · 기록용 번호 — 키 값과 무관)
  tenant_id text NOT NULL,                           -- tenants.id(서비스를 받는 기관)
  card_id text NOT NULL,                             -- cards.id(공유된 분석 서비스)
  label text NOT NULL,                               -- 쓰는 시스템 이름(예: 남원 영농관리 시스템)
  key_hash text NOT NULL UNIQUE,                     -- 한 방향 암호(키 값은 저장하지 않는다)
  last4 text NOT NULL,                               -- 화면에 보이는 끝 네 자리
  formats text[] NOT NULL DEFAULT ARRAY['geojson', 'shp', 'parcels'],   -- 범위 — 내줄 형식
  per_min int NOT NULL DEFAULT 60,                   -- 한도 — 1분 호출 수
  per_day int NOT NULL DEFAULT 20000,                -- 한도 — 하루 호출 수
  expires_at timestamptz NOT NULL,                   -- 끝나는 날
  paused boolean NOT NULL DEFAULT false,             -- LX 관리자가 멈춤(다시 켜면 이어짐)
  revoked_at timestamptz,                            -- 폐기(되살리지 않는다 — 새 키를 만든다)
  revoked_by text,
  revoke_reason text,
  test boolean NOT NULL DEFAULT false,               -- 시험 키(사용 현황 합계에서 뺀다)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz);
CREATE INDEX IF NOT EXISTS api_keys_pair ON api_keys (tenant_id, card_id);

CREATE TABLE IF NOT EXISTS api_calls(
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  key_id text,                                       -- 알 수 없는 키 · 키 없음 = NULL
  tenant_id text,
  card_id text,
  method text,
  path text,                                         -- 외부 주소 경로(물음표 뒤 값은 적지 않는다)
  what text,                                         -- me | timepoints | results | summary | export
  fmt text,                                          -- geojson | shp | parcels | summary
  edition int,                                       -- 결과 시점(결과 설명서 판)
  rows int,                                          -- 내준 결과 수
  bytes bigint,                                      -- 내준 크기
  status int NOT NULL,
  code text,                                         -- 오류 코드(성공 = NULL)
  ip text,
  ms int,
  test boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS api_calls_key ON api_calls (key_id, at DESC);
CREATE INDEX IF NOT EXISTS api_calls_pair ON api_calls (tenant_id, card_id, at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'api_calls'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format('CREATE POLICY lx_only ON %I USING (current_setting(''app.realm'', true) = ''lx'') WITH CHECK (current_setting(''app.realm'', true) = ''lx'')', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON api_keys TO landxi_app;
GRANT SELECT, INSERT ON api_calls TO landxi_app;
GRANT USAGE, SELECT ON SEQUENCE api_calls_id_seq TO landxi_app;
