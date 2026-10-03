-- CodeRelay: Fix 8-question modulo assignment for all teams (Team 1-8, then repeating for Team 9+)
-- This ensures teams with team_number > 8 (e.g. 9, 13, 21, 30) map to ((team_number - 1) % 8)
-- using the 8 approved questions ordered by created_at ASC.

CREATE OR REPLACE FUNCTION public.get_round2_question_for_team(p_team_id uuid)
RETURNS TABLE(
  question_id uuid,
  title text,
  question_text text,
  function_signature_c text,
  function_signature_python text,
  function_signature_java text,
  interface_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team_number integer;
  v_offset integer;
BEGIN
  IF NOT public.coderelay_user_is_team_member(p_team_id) THEN
    RETURN;
  END IF;

  SELECT t.team_number
  INTO v_team_number
  FROM public.teams t
  WHERE t.id = p_team_id
    AND t.status = 'APPROVED'
    AND t.created_by = auth.uid();

  IF v_team_number IS NULL OR v_team_number <= 0 THEN
    RETURN;
  END IF;

  v_offset := (v_team_number - 1) % 8;

  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.title,
    q.question_text,
    q.function_signature_c,
    q.function_signature_python,
    q.function_signature_java,
    q.interface_status
  FROM public.round2_questions q
  WHERE q.interface_status = 'APPROVED'
  ORDER BY q.created_at ASC
  OFFSET v_offset
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_round2_code_run(
  p_session_id uuid,
  p_team_id uuid,
  p_question_id uuid,
  p_language text,
  p_source_code text,
  p_status text,
  p_passed_tests integer,
  p_total_tests integer,
  p_execution_time_ms integer,
  p_memory_kb integer,
  p_compiler_output text,
  p_runtime_output text,
  p_error_message text
)
RETURNS SETOF public.round2_code_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_team_number integer;
  v_expected_question_id uuid;
  v_run_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_language NOT IN ('c', 'python', 'java') THEN
    RAISE EXCEPTION 'Unsupported programming language';
  END IF;

  SELECT t.team_number
  INTO v_team_number
  FROM public.teams AS t
  WHERE t.id = p_team_id
    AND t.created_by = v_user_id
    AND t.status = 'APPROVED';

  IF v_team_number IS NULL THEN
    RAISE EXCEPTION 'You are not authorized for this team';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.round2_sessions AS s
    WHERE s.id = p_session_id
      AND s.phase = 'CODING'
      AND s.coding_stage = 'STUDENT_3'
      AND s.phase_started_at IS NOT NULL
      AND clock_timestamp() < s.phase_started_at + (
        (
          s.student3_duration_seconds
          + COALESCE(s.coding_extension_seconds, s.phase_extension_seconds, 0)
        ) * INTERVAL '1 second'
      )
  ) THEN
    RAISE EXCEPTION 'Round 2 coding time has expired or is not active for Student 3';
  END IF;

  SELECT q.id
  INTO v_expected_question_id
  FROM public.round2_questions AS q
  WHERE q.interface_status = 'APPROVED'
  ORDER BY q.created_at ASC
  OFFSET ((v_team_number - 1) % 8)
  LIMIT 1;

  IF v_expected_question_id IS NULL THEN
    RAISE EXCEPTION 'No approved question is assigned to this team';
  END IF;

  IF v_expected_question_id <> p_question_id THEN
    RAISE EXCEPTION 'Question does not belong to this team';
  END IF;

  INSERT INTO public.round2_code_runs (
    session_id,
    team_id,
    question_id,
    language,
    source_code,
    status,
    passed_tests,
    total_tests,
    execution_time_ms,
    memory_kb,
    compiler_output,
    runtime_output,
    error_message,
    created_by,
    completed_at
  )
  VALUES (
    p_session_id,
    p_team_id,
    p_question_id,
    p_language,
    p_source_code,
    p_status,
    p_passed_tests,
    p_total_tests,
    p_execution_time_ms,
    p_memory_kb,
    p_compiler_output,
    p_runtime_output,
    p_error_message,
    v_user_id,
    now()
  )
  RETURNING id INTO v_run_id;

  RETURN QUERY
  SELECT r.*
  FROM public.round2_code_runs AS r
  WHERE r.id = v_run_id;
END;
$$;
