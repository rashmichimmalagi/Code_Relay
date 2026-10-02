import type { TeamStatus } from "../types";

export function StatusBadge({ status }: { status: TeamStatus }) {
  const classes = {
    PENDING: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    APPROVED: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    REJECTED: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  }[status];
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${classes}`}>{status}</span>;
}
