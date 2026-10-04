-- Enforce clean student code storage in public.round2_team_code
-- Strips __CODERELAY_EDITOR_V1__ and editor JSON wrappers on all write paths

CREATE OR REPLACE FUNCTION public.clean_coderelay_code(p_code text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_trimmed text;
  v_json jsonb;
  v_body text;
  v_before text;
  v_after text;
BEGIN
  IF p_code IS NULL THEN
    RETURN '';
  END IF;

  v_trimmed := trim(p_code);
  IF v_trimmed = '' THEN
    RETURN '';
  END IF;

  IF v_trimmed LIKE '__CODERELAY_EDITOR_V1__%' THEN
    BEGIN
      v_json := substring(v_trimmed from 24)::jsonb;
      IF v_json ? 'body' THEN
        v_body := coalesce(v_json->>'body', '');
        v_before := coalesce(trim(v_json->>'before'), '');
        v_after := coalesce(trim(v_json->>'after'), '');

        IF v_before <> '' OR v_after <> '' THEN
          RETURN concat_ws(E'\n\n', nullif(v_before, ''), nullif(v_body, ''), nullif(v_after, ''));
        END IF;

        RETURN v_body;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN p_code;
    END;
  END IF;

  IF v_trimmed LIKE '{%}' THEN
    BEGIN
      v_json := v_trimmed::jsonb;
      IF v_json ? 'body' THEN
        v_body := coalesce(v_json->>'body', '');
        v_before := coalesce(trim(v_json->>'before'), '');
        v_after := coalesce(trim(v_json->>'after'), '');

        IF v_before <> '' OR v_after <> '' THEN
          RETURN concat_ws(E'\n\n', nullif(v_before, ''), nullif(v_body, ''), nullif(v_after, ''));
        END IF;

        RETURN v_body;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN p_code;
    END;
  END IF;

  RETURN p_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_clean_round2_team_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.code := public.clean_coderelay_code(NEW.code);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clean_round2_team_code ON public.round2_team_code;
CREATE TRIGGER trg_clean_round2_team_code
BEFORE INSERT OR UPDATE ON public.round2_team_code
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_clean_round2_team_code();

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
DECLARE
  v_cleaned_code text;
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

  v_cleaned_code := public.clean_coderelay_code(p_code);

  UPDATE public.round2_team_code
  SET language = p_language,
      code = v_cleaned_code,
      question_id = p_question_id,
      updated_at = now()
  WHERE session_id = p_session_id
    AND team_id = p_team_id;

  IF NOT FOUND THEN
    INSERT INTO public.round2_team_code (
      session_id, team_id, question_id, language, code, created_by
    )
    VALUES (
      p_session_id, p_team_id, p_question_id, p_language, v_cleaned_code, auth.uid()
    );
  END IF;
END;
$function$;
