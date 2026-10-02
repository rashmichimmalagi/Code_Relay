import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { FormField } from "../components/FormField";
import { insforge } from "../lib/insforge";
import { getErrorMessage } from "../lib/errors";

export function CreateTeamPage() {
  const navigate = useNavigate();

  const {
    user,
    profile,
    loading: authLoading,
  } = useAuth();

  const [teamNumber, setTeamNumber] =
    useState("");

  const [teamName, setTeamName] =
    useState("");

  const [student2Name, setStudent2Name] =
    useState("");

  const [student3Name, setStudent3Name] =
    useState("");

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const student1Name =
    profile?.full_name?.trim() ||
    user?.name?.trim() ||
    "";

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [
    authLoading,
    user,
    navigate,
  ]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!user?.id) {
      setError(
        "Your login session has expired. Please sign in again.",
      );
      return;
    }

    if (!student1Name) {
      setError(
        "Your Student 1 profile could not be loaded. Please sign out and sign in again.",
      );
      return;
    }

    const cleanTeamNumber =
      teamNumber.trim();

    const cleanTeamName =
      teamName.trim();

    const cleanStudent2Name =
      student2Name.trim();

    const cleanStudent3Name =
      student3Name.trim();

    if (!cleanTeamNumber) {
      setError(
        "Please enter your Team Number.",
      );
      return;
    }

    if (!/^\d+$/.test(cleanTeamNumber)) {
      setError(
        "Team Number must contain numbers only.",
      );
      return;
    }

    if (!cleanTeamName) {
      setError(
        "Please enter your Team Name.",
      );
      return;
    }

    if (!cleanStudent2Name) {
      setError(
        "Please enter Student 2's full name.",
      );
      return;
    }

    if (!cleanStudent3Name) {
      setError(
        "Please enter Student 3's full name.",
      );
      return;
    }

    const studentNames = [
      student1Name.toLowerCase(),
      cleanStudent2Name.toLowerCase(),
      cleanStudent3Name.toLowerCase(),
    ];

    if (
      new Set(studentNames).size !== 3
    ) {
      setError(
        "Student 1, Student 2, and Student 3 must be different people.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const {
        data,
        error: insertError,
      } = await insforge.database
        .from("teams")
        .insert({
          team_number:
            Number(cleanTeamNumber),

          team_name:
            cleanTeamName,

          created_by:
            user.id,

          student_1_name:
            student1Name,

          student_2_name:
            cleanStudent2Name,

          student_3_name:
            cleanStudent3Name,

          status: "PENDING",
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        throw insertError;
      }

      if (!data) {
        throw new Error(
          "Team registration could not be completed.",
        );
      }

      setSuccess(
        "Team registration submitted successfully.",
      );

      setTimeout(() => {
        navigate("/team/status", {
          replace: true,
        });
      }, 700);
    } catch (err) {
      console.error(
        "Team registration error:",
        err,
      );

      const message =
        getErrorMessage(err);

      const lower =
        message.toLowerCase();

      if (
        lower.includes("duplicate") ||
        lower.includes("unique") ||
        lower.includes("team_number")
      ) {
        setError(
          "That Team Number is already registered. Please check the unique Team Number assigned by your volunteer.",
        );
      } else if (
        lower.includes("row-level security") ||
        lower.includes("rls") ||
        lower.includes("permission") ||
        lower.includes("forbidden")
      ) {
        setError(
          "The database rejected this registration because of its security rules.",
        );
      } else if (
        lower.includes("404") ||
        lower.includes("not found")
      ) {
        setError(
          "The teams table was not found in InsForge.",
        );
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-center">
          <p className="text-sm text-slate-400">
            Loading your CodeRelay account...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Register Your Team
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Enter the team details assigned by
          the event volunteer. Student 1 is
          automatically taken from your
          authenticated CodeRelay account.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/20"
      >
        {error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-300">
            <span className="font-semibold">
              Registration error:
            </span>{" "}
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-300">
            {success}
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-white">
            Team Information
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Use the unique Team Number assigned
            by your event volunteer.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <FormField
              label="Team Number"
              value={teamNumber}
              onChange={setTeamNumber}
              placeholder="Example: 1"
              required
            />

            <FormField
              label="Team Name"
              value={teamName}
              onChange={setTeamName}
              placeholder="Enter your team name"
              required
            />
          </div>
        </section>

        <section className="mt-8 border-t border-white/10 pt-8">
          <h2 className="text-lg font-semibold text-white">
            Team Members
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Exactly three students are required.
          </p>

          <div className="mt-5 space-y-5">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Student 1 / Team Lead
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Automatically taken from your
                    CodeRelay profile
                  </p>
                </div>

                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                  Account Holder
                </span>
              </div>

              <div className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3">
                <p className="text-sm font-medium text-slate-200">
                  {student1Name || "Loading profile..."}
                </p>

                {user.email && (
                  <p className="mt-1 text-xs text-slate-500">
                    {user.email}
                  </p>
                )}
              </div>
            </div>

            <FormField
              label="Student 2"
              value={student2Name}
              onChange={setStudent2Name}
              placeholder="Enter Student 2's full name"
              required
            />

            <FormField
              label="Student 3"
              value={student3Name}
              onChange={setStudent3Name}
              placeholder="Enter Student 3's full name"
              required
            />
          </div>
        </section>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-slate-200">
            Before submitting
          </p>

          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
            <li>
              • Your team must contain exactly
              3 students.
            </li>
            <li>
              • Student 1 is the authenticated
              account holder.
            </li>
            <li>
              • Students 2 and 3 do not need
              CodeRelay accounts.
            </li>
            <li>
              • The Team Number must be unique.
            </li>
            <li>
              • Your team will initially have
              PENDING status.
            </li>
          </ul>
        </div>

        <div className="mt-8">
          <button
            type="submit"
            disabled={
              submitting || !student1Name
            }
            className="w-full rounded-xl bg-cyan-400 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Submitting Team Registration..."
              : "Submit Team Registration"}
          </button>

          <p className="mt-3 text-center text-xs text-slate-600">
            Your team will be created with
            PENDING status.
          </p>
        </div>
      </form>
    </div>
  );
}