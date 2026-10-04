-- CodeRelay: Authoritative Round 2 Timer Migration
-- 1. Provides public.get_round2_server_time() RPC to allow clients to synchronize clock skew.
-- 2. Updates validate_round2_phase_transition() trigger so phase_started_at is authoritatively
--    stamped with clock_timestamp() on active phase transitions and on STUDENT_2 -> STUDENT_3 transition.

CREATE OR REPLACE FUNCTION public.get_round2_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT clock_timestamp();
$$;

GRANT EXECUTE ON FUNCTION public.get_round2_server_time() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_round2_phase_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.phase = 'CONFIGURED'
     AND NEW.phase NOT IN ('CONFIGURED', 'QUESTION') THEN
    RAISE EXCEPTION
      'Configured Round 2 sessions can only remain configured or start the question phase';
  END IF;

  IF OLD.phase = 'QUESTION'
     AND NEW.phase NOT IN ('QUESTION', 'TRANSITION') THEN
    RAISE EXCEPTION
      'Question phase can only remain question or move to transition';
  END IF;

  IF OLD.phase = 'TRANSITION'
     AND NEW.phase NOT IN ('TRANSITION', 'CODING') THEN
    RAISE EXCEPTION
      'Transition phase can only remain transition or move to coding';
  END IF;

  IF OLD.phase = 'CODING'
     AND NEW.phase NOT IN ('CODING', 'ENDED') THEN
    RAISE EXCEPTION
      'Coding phase can only remain coding or move to ended';
  END IF;

  IF OLD.phase = 'ENDED'
     AND NEW.phase <> 'ENDED' THEN
    RAISE EXCEPTION
      'Ended Round 2 sessions cannot be restarted';
  END IF;

  -- Authoritative server clock: set phase_started_at to database clock_timestamp()
  -- on phase changes to active phases or when coding stage changes from STUDENT_2 to STUDENT_3.
  IF (OLD.phase IS DISTINCT FROM NEW.phase AND NEW.phase IN ('QUESTION', 'CODING'))
     OR (NEW.phase = 'CODING' AND OLD.coding_stage IS DISTINCT FROM NEW.coding_stage) THEN
    NEW.phase_started_at := clock_timestamp();
  END IF;

  IF NEW.phase IN ('QUESTION', 'CODING')
     AND NEW.phase_started_at IS NULL THEN
    RAISE EXCEPTION
      'Active Round 2 phases require phase_started_at';
  END IF;

  IF NEW.phase = 'TRANSITION'
     AND NEW.phase_started_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Transition phase must not have phase_started_at';
  END IF;

  RETURN NEW;
END;
$$;
