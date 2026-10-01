-- 0017_imagery_std.sql — 영상 표준 변환 기록 · 원본 지울 날짜(원칙 94 · 확인 대장 15차 영상-1 · 영상-2 ⓐ · 영상-3 ⓑ) · 멱등
--   imagery_std  들어온 영상 원본 하나 → 표준본(COG · JPEG 90 · 축소판 · 마스크) 한 벌의 기록. 숫자 한 출처(원본 크기 · 표준본 크기 · 원본 지울 날짜).
--                source_kind 'upload' = 기관 분석 의뢰로 올린 파일(request_uploads.id) · 'imagery' = LX 영상 등록(imagery.id)
--                orig_owned = 플랫폼이 받은 원본(02. 데이터/tenants · cog/uploads)인가 — 아니면(서버 경로로 등록한 보관 영상) 지우지 않는다
--                orig_delete_on = 표준본 확인 날 + 보관 날 수(config/imagery.yaml original.keep_days · 90) — 지나면 CPU 작업기가 지우고 audit_log 에 남긴다
CREATE TABLE IF NOT EXISTS imagery_std(
  id text PRIMARY KEY,                        -- std_…
  source_kind text NOT NULL,                  -- upload | imagery
  source_id text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'lx',
  orig_path text NOT NULL,                    -- 원본(02. 데이터 기준 상대 경로 · 밖이면 절대 경로) — 화면 · 응답에 내지 않는다
  orig_size bigint,
  orig_format text,                           -- ECW · TIF · JP2 …
  orig_owned boolean NOT NULL DEFAULT false,
  std_path text,                              -- 표준본(같은 규칙의 경로) · as_is 면 원본과 같다
  std_size bigint,
  rule text,                                  -- jpeg(8비트 색 · JPEG 90) | lossless(값이 중요한 영상 · ZSTD) | as_is(이미 표준)
  state text NOT NULL DEFAULT 'queued',       -- queued | converting | ready | failed | deferred | removed
  checks jsonb,                               -- 확인 값(크기 · 범위 · 좌표 일치 · 화질 PSNR · SSIM 표본 · 테두리 빈 칸 비율)
  tool text,                                  -- 어느 GDAL 로 바꿨나(화면에 내지 않는다)
  seconds numeric,
  job_id text,                                -- 큰 파일은 CPU 작업기 작업(kind tile)
  error text,                                 -- 사람 말(LX 쪽에만)
  confirmed_at timestamptz,                   -- 표준본 확인 시각
  orig_delete_on date,                        -- 원본 지울 날짜(NULL = 지우지 않음)
  orig_deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (source_kind, source_id));
CREATE INDEX IF NOT EXISTS imagery_std_due ON imagery_std (orig_delete_on) WHERE orig_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS imagery_std_tenant ON imagery_std (tenant_id, created_at DESC);

-- 계정 범위 밖 0(원칙 39) — 기관 세션은 자기 기관 행만(게이트웨이 · 작업기는 realm lx)
ALTER TABLE imagery_std ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'imagery_std'::regclass AND polname = 'lx_tenant_isolation') THEN
    CREATE POLICY lx_tenant_isolation ON imagery_std USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON imagery_std TO landxi_app, landxi_worker;
