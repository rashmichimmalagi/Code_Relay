-- Migration: Add submitted_code and session_id to round2_final_results
-- Ensures official results retain an immutable snapshot of the exact code
-- submitted by Student 3 for that specific final submission.

ALTER TABLE public.round2_final_results
  ADD COLUMN IF NOT EXISTS submitted_code text;

ALTER TABLE public.round2_final_results
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.round2_sessions(id) ON DELETE SET NULL;

-- Backfill historical official results from the corresponding final code run
UPDATE public.round2_final_results r
SET 
  submitted_code = cr.source_code,
  session_id = COALESCE(r.session_id, cr.session_id)
FROM (
  SELECT DISTINCT ON (team_id, question_id)
    team_id,
    question_id,
    session_id,
    source_code,
    completed_at
  FROM public.round2_code_runs
  ORDER BY team_id, question_id, completed_at DESC
) cr
WHERE r.submitted_code IS NULL
  AND r.team_id = cr.team_id
  AND r.question_id = cr.question_id;
