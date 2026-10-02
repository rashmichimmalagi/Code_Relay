# CodeRelay — Milestone 1

Real college technical-event platform foundation using React + TypeScript + Vite + Tailwind CSS + InsForge.

## Scope

Included:
- Landing page
- Email/password signup
- InsForge email verification flow
- Login/logout
- Persistent InsForge session restoration
- Protected student dashboard
- One-team registration per authenticated student
- Unique database-level team number
- Pending/approved/rejected status model
- Student-only access to their own profile/team data
- PostgreSQL RLS + database trigger protections

Explicitly not included:
- Round 2 Code Relay
- Monaco
- Judge0
- Question allocation
- Hidden tests
- Scoring
- Leaderboard
- Admin dashboard
- Anti-cheating

## Setup

### 1. Create/link an InsForge project

Use the InsForge CLI:

```bash
npx @insforge/cli link --project-id <YOUR_PROJECT_ID>
```

Apply the migration with your InsForge migration workflow:

```bash
npx @insforge/cli db migrations up --all
```

If your CLI version uses a different migration command, use the current InsForge CLI migration help.

### 2. Configure InsForge Auth

Enable:
- Email/password authentication
- Email verification
- Link-based verification (recommended)

Add these redirect URLs to your InsForge Auth configuration:
- `http://localhost:5173/verify-email`
- Your production `https://YOUR_DOMAIN/verify-email`

Do not enable Google/GitHub OAuth for this milestone.

### 3. Frontend environment

```bash
cp .env.example .env.local
```

Set:

```env
VITE_INSFORGE_URL=https://YOUR_PROJECT.insforge.app
VITE_INSFORGE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Only public browser credentials belong in `VITE_*`. Never put a project-admin/API secret in Vite environment variables.

### 4. Install and run

```bash
npm install
npm run dev
```

Open the Vite URL shown by the terminal (normally `http://localhost:5173`).

### 5. Production build

```bash
npm run build
npm run preview
```

## Security model

`profiles.user_id` and `teams.created_by` are tied to `auth.users(id)`.

RLS uses `auth.uid()` and authenticated-role policies:
- students can read only their own profile/team;
- students can insert only rows owned by themselves;
- students cannot delete registrations;
- status must start as `PENDING`;
- the database trigger prevents authenticated clients from changing `created_by`, `team_number`, or `status`;
- `teams.team_number` has a PostgreSQL `UNIQUE` constraint;
- `teams.created_by` has a PostgreSQL `UNIQUE` constraint, preventing one account from registering multiple teams.

The frontend checks are convenience only. The database is the security boundary.

## Verification checklist

Run these against the real InsForge project:

1. Sign up with a new email.
2. Confirm the verification email arrives.
3. Follow the link and confirm `/verify-email` shows success.
4. Log in.
5. Refresh the browser on `/dashboard` and confirm the session remains available.
6. Create a team.
7. Confirm the team appears as `PENDING`.
8. Attempt to register another team while signed in; confirm the dashboard/status route is shown instead.
9. Attempt to create the same team number from a second account; confirm PostgreSQL unique constraint rejection.
10. Using the second account, attempt direct API reads for the first team's ID; confirm RLS denies/filters the row.
11. Attempt direct API update of another team's row; confirm RLS denies it.
12. Attempt direct API update of `status`, `created_by`, or `team_number` on your own team; confirm trigger/RLS prevents it.
13. Log out and confirm protected routes redirect to login.
14. Run `npm run build` and confirm it succeeds.

## GitHub

Initialize and commit:

```bash
git init
git add .
git commit -m "feat: add CodeRelay milestone 1 foundation"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Never commit `.env.local`.

## Important note about live verification

This source bundle is wired to the real `@insforge/sdk` and PostgreSQL/RLS migration. A live signup/login/database test requires your actual InsForge project URL/public key and an environment where the project can be run. Those credentials and a connected GitHub/InsForge workspace were not available in this chat, so no live test result is claimed here.
