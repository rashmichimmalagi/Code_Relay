import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getMyTeam } from "../lib/db";
import type { Team } from "../types";
import { StatusBadge } from "../components/StatusBadge";

export function TeamStatusPage() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  useEffect(() => { if (user) getMyTeam(user.id).then(({ team }) => setTeam(team)); }, [user?.id]);

  if (!team) return <div className="mx-auto max-w-2xl px-5 py-16 text-center"><p className="text-slate-500">No team registration found.</p></div>;

  const icon = team.status === "PENDING" ? <Clock3/> : team.status === "APPROVED" ? <CheckCircle2/> : <XCircle/>;
  return <div className="mx-auto max-w-2xl px-5 py-12 lg:px-8">
    <div className="mt-8 rounded-3xl border border-white/8 bg-white/[0.035] p-7 sm:p-9">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[0.18em] text-slate-600">Team #{team.team_number}</p><h1 className="mt-1 text-3xl font-semibold">{team.team_name}</h1></div>
        <StatusBadge status={team.status}/>
      </div>
      <div className="mt-8 grid size-16 place-items-center rounded-2xl bg-white/6 text-cyan-300">{icon}</div>
      <h2 className="mt-6 text-xl font-semibold">{team.status === "PENDING" ? "Awaiting administrator review" : team.status === "APPROVED" ? "Team approved" : "Team registration rejected"}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{team.status === "PENDING" ? "Your registration is safely stored. An administrator will approve or reject it later." : team.status === "APPROVED" ? "Your team number is now locked. Keep it available for the event." : team.rejection_reason || "Please contact the event organizers for next steps."}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[team.student_1_name, team.student_2_name, team.student_3_name].map((name, i) => <div key={i} className="rounded-2xl border border-white/8 p-4"><p className="text-xs text-slate-600">Student {i + 1}</p><p className="mt-1 font-medium">{name}</p></div>)}
      </div>
    </div>
  </div>;
}
