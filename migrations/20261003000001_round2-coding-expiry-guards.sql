CREATE OR REPLACE FUNCTION public.save_round2_team_code_for_member(
  p_session_id uuid,
  p_team_id uuid,
  p_question_id uuid,
  p_language text,
  p_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.coderelay_user_is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'You are not a member of this approved team';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.round2_sessions s
    WHERE s.id = p_session_id
      AND s.phase = 'CODING'
      AND s.coding_stage IN ('STUDENT_2', 'STUDENT_3')
      AND s.phase_started_at IS NOT NULL
      AND clock_timestamp() < s.phase_started_at + (
        (
          CASE
            WHEN s.coding_stage = 'STUDENT_3'
              THEN s.student3_duration_seconds
            ELSE s.coding_duration_seconds
          END
          + COALESCE(s.coding_extension_seconds, s.phase_extension_seconds, 0)
        ) * INTERVAL '1 second'
      )
  ) THEN
    RAISE EXCEPTION 'Round 2 coding time has expired or is not active';
  END IF;

  UPDATE public.round2_team_code
  SET language = p_language,
      code = p_code,
      question_id = p_question_id,
      updated_at = now()
  WHERE session_id = p_session_id
    AND team_id = p_team_id;

  IF NOT FOUND THEN
    INSERT INTO public.round2_team_code (
      session_id, team_id, question_id, language, code, created_by
    )
    VALUES (
      p_session_id, p_team_id, p_question_id, p_language, p_code, auth.uid()
    );
  END IF;
END;
$function$;

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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams AS t
    WHERE t.id = p_team_id
      AND t.created_by = v_user_id
      AND t.status = 'APPROVED'
  ) THEN
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
  FROM public.teams AS t
  JOIN public.round2_questions AS q
    ON q.interface_status = 'APPROVED'
  WHERE t.id = p_team_id
  ORDER BY q.created_at ASC
  OFFSET (
    SELECT team_number - 1
    FROM public.teams
    WHERE id = p_team_id
  )
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
$function$;