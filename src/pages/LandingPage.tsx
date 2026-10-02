import {
  ArrowRight,
  CheckCircle2,
  Code2,
  LockKeyhole,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function LandingPage() {
  const { user, profile } = useAuth();
  const role = String(profile?.role ?? "").trim().toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <>
      {/* HERO */}

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_45%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-20 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-28 lg:pt-28">
          {/* HERO CONTENT */}

          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-300">
              <span className="size-1.5 rounded-full bg-cyan-300" />
              College Technical Event
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Think fast.{" "}
              <span className="text-cyan-400">
                Code together.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              CodeRelay is a structured technical
              competition platform built for
              team-based coding challenges, secure
              student registration, and event
              workflows.
            </p>

            {/* ACTIONS */}

            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <Link
                  to={isAdmin ? "/admin/dashboard" : "/dashboard"}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-400/10 transition hover:bg-cyan-300"
                >
                  {isAdmin
                    ? "Go to Admin Dashboard"
                    : "Go to Dashboard"}
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-400/10 transition hover:bg-cyan-300"
                >
                  Student Sign Up
                  <ArrowRight size={18} />
                </Link>
              )}

              <a
                href="#rounds"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                Explore the format
              </a>
            </div>

            {/* SMALL INFO */}

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2
                  size={14}
                  className="text-cyan-400"
                />
                Verified student accounts
              </span>

              <span className="inline-flex items-center gap-2">
                <CheckCircle2
                  size={14}
                  className="text-cyan-400"
                />
                Exactly 3 students per team
              </span>
            </div>
          </div>

          {/* HERO CARDS */}

          <div className="grid gap-4 self-center">
            {[
              [
                Code2,
                "Three students",
                "One team, one coordinated technical challenge.",
              ],
              [
                Users,
                "One shared laptop",
                "A relay format designed around communication and handoff.",
              ],
              [
                LockKeyhole,
                "Secure foundation",
                "Authenticated registration with database-enforced ownership and access control.",
              ],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Code2;

              return (
                <div
                  key={title as string}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="mb-4 grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <I size={20} />
                  </div>

                  <h2 className="font-semibold text-white">
                    {title as string}
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {body as string}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ABOUT */}

      <section
        id="about"
        className="border-y border-white/10 bg-white/[0.02]"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-3 lg:px-8">
          {[
            "Team registration",
            "Verified accounts",
            "Event-ready foundation",
          ].map((title, i) => (
            <div key={title}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                0{i + 1}
              </div>

              <h2 className="text-xl font-semibold text-white">
                {title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {
                  [
                    "A single authenticated student registers exactly three participants under the volunteer-issued team number.",
                    "Email/password authentication with verification and persistent InsForge sessions protects the student dashboard.",
                    "The current milestone focuses only on reliable identity and team-registration infrastructure.",
                  ][i]
                }
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ROUNDS */}

      <section
        id="rounds"
        className="mx-auto max-w-7xl px-5 py-16 lg:px-8"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-cyan-400">
            Event structure
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Built for the full competition journey.
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            The platform will be expanded in stages.
            The current release focuses on secure
            student registration and team management.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [
              "01",
              "Quiz round",
              "Conducted separately using Quizizz. Not part of this application milestone.",
            ],
            [
              "02",
              "Code Relay",
              "A future milestone will add the three-student relay coding workflow.",
            ],
            [
              "03",
              "Future rounds",
              "Scoring, judging, leaderboards and administration will be added separately.",
            ],
          ].map(([num, title, body]) => (
            <div
              key={num}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/15 hover:bg-white/[0.035]"
            >
              <div className="font-mono text-sm text-slate-600">
                {num}
              </div>

              <h3 className="mt-10 font-semibold text-white">
                {title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER / ADMIN ACCESS */}

      <footer className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold text-white">
              CodeRelay
            </p>

            <p className="mt-1 text-xs text-slate-500">
              College Technical Event Platform
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
              Admin Access
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/admin/login"
                className="inline-flex items-center rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                Admin Sign In
              </Link>

              <Link
                to="/admin/signup"
                className="inline-flex items-center rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                Admin Sign Up
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5">
          <div className="mx-auto max-w-7xl px-5 py-5 text-xs text-slate-600 lg:px-8">
            © 2026 CodeRelay. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}