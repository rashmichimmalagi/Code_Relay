import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { insforge } from "../lib/insforge";

type TeamStatus = "PENDING" | "APPROVED" | "REJECTED";

type Team = {
  id: string;
  team_number: number;
  team_name: string;
  created_by: string;
  student_1_name: string;
  student_2_name: string;
  student_3_name: string;
  status: TeamStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<TeamStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function AdminTeamManagementPage() {
  const { profile } = useAuth();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTeamId, setActionTeamId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | TeamStatus>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const role = String(profile?.role ?? "").trim().toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";

  const loadTeams = useCallback(async () => {
    try {
      setError(null);

      const result = await insforge.database
        .from("teams")
        .select("*")
        .order("team_number", { ascending: true });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setTeams((result.data ?? []) as Team[]);
    } catch (err) {
      console.error("Unable to load teams:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load teams.",
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialLoad = async () => {
      setLoading(true);

      try {
        await loadTeams();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initialLoad();

    return () => {
      mounted = false;
    };
  }, [loadTeams]);

  const refreshTeams = async () => {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadTeams();
    } finally {
      setRefreshing(false);
    }
  };

  const updateTeamStatus = async (
    team: Team,
    newStatus: TeamStatus,
    rejectionReason: string | null = null,
  ) => {
    setActionTeamId(team.id);
    setError(null);
    setMessage(null);

    try {
      const result = await insforge.database
        .from("teams")
        .update({
          status: newStatus,
          rejection_reason: rejectionReason,
        })
        .eq("id", team.id);

      if (result.error) {
        throw new Error(result.error.message);
      }

      await loadTeams();

      setMessage(
        `Team #${team.team_number} is now ${STATUS_LABELS[newStatus].toLowerCase()}.`,
      );
    } catch (err) {
      console.error(
        `Unable to update Team #${team.team_number}:`,
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : `Unable to update Team #${team.team_number}.`,
      );
    } finally {
      setActionTeamId(null);
    }
  };

  const handleApprove = async (team: Team) => {
    if (team.status !== "PENDING") {
      return;
    }

    const confirmed = window.confirm(
      `Approve Team #${team.team_number} — ${team.team_name}?`,
    );

    if (!confirmed) {
      return;
    }

    await updateTeamStatus(team, "APPROVED", null);
  };

  const handleReject = async (team: Team) => {
    if (team.status !== "PENDING") {
      return;
    }

    const reason = window.prompt(
      `Enter the rejection reason for Team #${team.team_number}:`,
      team.rejection_reason ?? "",
    );

    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setError("A rejection reason is required.");
      return;
    }

    await updateTeamStatus(
      team,
      "REJECTED",
      trimmedReason,
    );
  };

  const handleDeapprove = async (team: Team) => {
    if (team.status !== "APPROVED") {
      return;
    }

    const confirmed = window.confirm(
      `Deapprove Team #${team.team_number} — ${team.team_name}?\n\n` +
        "The team will return to Pending and can be reviewed again.",
    );

    if (!confirmed) {
      return;
    }

    await updateTeamStatus(team, "PENDING", null);
  };

  const handleReturnToPending = async (team: Team) => {
    if (team.status !== "REJECTED") {
      return;
    }

    const confirmed = window.confirm(
      `Return Team #${team.team_number} — ${team.team_name} to Pending?\n\n` +
        "The rejection reason will be cleared and the team can be reviewed again.",
    );

    if (!confirmed) {
      return;
    }

    await updateTeamStatus(team, "PENDING", null);
  };

  const filteredTeams = useMemo(() => {
    if (filter === "ALL") {
      return teams;
    }

    return teams.filter((team) => team.status === filter);
  }, [teams, filter]);

  const counts = useMemo(
    () => ({
      all: teams.length,
      pending: teams.filter(
        (team) => team.status === "PENDING",
      ).length,
      approved: teams.filter(
        (team) => team.status === "APPROVED",
      ).length,
      rejected: teams.filter(
        (team) => team.status === "REJECTED",
      ).length,
    }),
    [teams],
  );

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-red-400" />

          <h1 className="mt-4 text-2xl font-bold">
            Access Denied
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            You do not have permission to manage teams.
          </p>

          <Link
            to="/admin/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Return to Admin Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

            <div>
              <p className="text-sm font-medium text-cyan-400">
                CodeRelay Administration
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Team Management
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Review, approve, reject and deapprove team registrations.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshTeams}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              Refresh
            </button>
          </div>
        </header>

        {/* Messages */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
            <p className="text-sm font-medium text-red-300">
              {error}
            </p>
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-sm font-medium text-emerald-300">
              {message}
            </p>
          </div>
        )}

        {/* Statistics */}
        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-xl border p-5 text-left transition ${
              filter === "ALL"
                ? "border-cyan-400/50 bg-cyan-400/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              All Teams
            </p>

            <p className="mt-2 text-2xl font-bold">
              {counts.all}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setFilter("PENDING")}
            className={`rounded-xl border p-5 text-left transition ${
              filter === "PENDING"
                ? "border-amber-400/50 bg-amber-400/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pending
            </p>

            <p className="mt-2 text-2xl font-bold text-amber-300">
              {counts.pending}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setFilter("APPROVED")}
            className={`rounded-xl border p-5 text-left transition ${
              filter === "APPROVED"
                ? "border-emerald-400/50 bg-emerald-400/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Approved
            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-300">
              {counts.approved}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setFilter("REJECTED")}
            className={`rounded-xl border p-5 text-left transition ${
              filter === "REJECTED"
                ? "border-red-400/50 bg-red-400/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Rejected
            </p>

            <p className="mt-2 text-2xl font-bold text-red-300">
              {counts.rejected}
            </p>
          </button>
        </section>

        {/* Teams */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <div className="text-center">
              <RefreshCw className="mx-auto h-7 w-7 animate-spin text-cyan-400" />

              <p className="mt-3 text-sm text-slate-500">
                Loading teams...
              </p>
            </div>
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <p className="font-semibold">
              No teams found
            </p>

            <p className="mt-2 text-sm text-slate-500">
              There are no teams in the selected category.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredTeams.map((team) => {
              const isProcessing =
                actionTeamId === team.id;

              return (
                <section
                  key={team.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                >
                  <div className="p-5">

                    {/* Team header */}
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Team #{team.team_number}
                          </span>

                          <StatusBadge status={team.status} />
                        </div>

                        <h2 className="mt-3 text-xl font-bold">
                          {team.team_name}
                        </h2>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">

                        {team.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handleApprove(team)
                              }
                              disabled={isProcessing}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />

                              {isProcessing
                                ? "Updating..."
                                : "Approve"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleReject(team)
                              }
                              disabled={isProcessing}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle className="h-4 w-4" />

                              Reject
                            </button>
                          </>
                        )}

                        {team.status === "APPROVED" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeapprove(team)
                            }
                            disabled={isProcessing}
                            className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Clock3 className="h-4 w-4" />

                            {isProcessing
                              ? "Updating..."
                              : "Deapprove"}
                          </button>
                        )}

                        {team.status === "REJECTED" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleReturnToPending(team)
                            }
                            disabled={isProcessing}
                            className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Clock3 className="h-4 w-4" />

                            {isProcessing
                              ? "Updating..."
                              : "Return to Pending"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Students */}
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <StudentCard
                        label="Student 1"
                        name={team.student_1_name}
                      />

                      <StudentCard
                        label="Student 2"
                        name={team.student_2_name}
                      />

                      <StudentCard
                        label="Student 3"
                        name={team.student_3_name}
                      />
                    </div>

                    {/* Rejection reason */}
                    {team.status === "REJECTED" &&
                      team.rejection_reason && (
                        <div className="mt-5 rounded-xl border border-red-400/10 bg-red-400/5 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
                            Rejection Reason
                          </p>

                          <p className="mt-2 text-sm text-red-200">
                            {team.rejection_reason}
                          </p>
                        </div>
                      )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: TeamStatus;
}) {
  const styles: Record<TeamStatus, string> = {
    PENDING:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    APPROVED:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    REJECTED:
      "border-red-400/20 bg-red-400/10 text-red-300",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {STATUS_LABELS[status].toUpperCase()}
    </span>
  );
}

function StudentCard({
  label,
  name,
}: {
  label: string;
  name: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 font-semibold text-white">
        {name || "—"}
      </p>
    </div>
  );
}

export default AdminTeamManagementPage;