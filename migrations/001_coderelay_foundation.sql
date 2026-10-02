-- CodeRelay Milestone 1
-- Auth identities are managed by InsForge in auth.users.
-- This migration creates only application-owned tables/policies.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_number INTEGER NOT NULL UNIQUE CHECK (team_number > 0),
  team_name TEXT NOT NULL CHECK (length(btrim(team_name)) BETWEEN 2 AND 100),
  created_by UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  student_1_name TEXT NOT NULL CHECK (length(btrim(student_1_name)) BETWEEN 2 AND 120),
  student_2_name TEXT NOT NULL CHECK (length(btrim(student_2_name)) BETWEEN 2 AND 120),
  student_3_name TEXT NOT NULL CHECK (length(btrim(student_3_name)) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON public.teams(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_status ON public.teams(status);

-- Prevent authenticated users from changing ownership, team number, or review status.
-- Project administrators can still perform future review operations.
CREATE OR REPLACE FUNCTION public.protect_team_registration_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claims.role', true) = 'authenticated' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Team ownership cannot be changed';
    END IF;
    IF OLD.status = 'APPROVED' AND NEW.team_number IS DISTINCT FROM OLD.team_number THEN
      RAISE EXCEPTION 'Team number is locked after administrator approval';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Team status is controlled by administrators';
    END IF;
    IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      RAISE EXCEPTION 'Rejection reason is controlled by administrators';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_team_registration_fields ON public.teams;
CREATE TRIGGER trg_protect_team_registration_fields
BEFORE UPDATE ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.protect_team_registration_fields();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()) AND id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "teams_select_own" ON public.teams;
CREATE POLICY "teams_select_own"
ON public.teams
FOR SELECT TO authenticated
USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "teams_insert_own" ON public.teams;
CREATE POLICY "teams_insert_own"
ON public.teams
FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND status = 'PENDING'
);

DROP POLICY IF EXISTS "teams_update_own" ON public.teams;
CREATE POLICY "teams_update_own"
ON public.teams
FOR UPDATE TO authenticated
USING (created_by = (SELECT auth.uid()))
WITH CHECK (
  created_by = (SELECT auth.uid())
);

-- No student DELETE policy: registrations are not client-deletable.
-- No anon access to either table.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teams TO authenticated;

REVOKE DELETE ON public.profiles FROM anon, authenticated;
REVOKE DELETE ON public.teams FROM anon, authenticated;
