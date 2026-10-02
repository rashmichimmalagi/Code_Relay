ALTER TABLE public.round2_final_results
  DROP CONSTRAINT round2_final_results_team_id_key;

ALTER TABLE public.round2_final_results
  ADD CONSTRAINT round2_final_results_team_question_key
  UNIQUE (team_id, question_id);