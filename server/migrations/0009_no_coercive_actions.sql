-- 보고서까지(원칙 40 · 확인 대장 FR-15 반려) — 시정명령 · 이행강제금 · 원상복구는 조치 기록 종류에서 뺐다(server/landxi_api/survey.py ACTION_KINDS).
-- 그 기능이 있던 때 남은 기록은 지우지 않고 '취소'로 둔다(기록 보존 · 화면 · 보고서 부속 표에는 취소된 기록이 나오지 않는다). 멱등.
UPDATE survey_actions SET state = 'cancelled'
 WHERE kind IN ('correction', 'penalty', 'restore') AND state <> 'cancelled';
