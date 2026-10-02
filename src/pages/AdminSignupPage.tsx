import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { insforge } from "../lib/insforge";
import { useAuth } from "../context/AuthContext";
import { BackButton } from "../components/BackButton";
import { PasswordField } from "../components/PasswordField";

export function AdminSignupPage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!profile) return;

    const role = String(profile.role ?? "").trim().toLowerCase();
    navigate(
      role === "admin" || role === "super_admin"
        ? "/admin/dashboard"
        : "/dashboard",
      { replace: true },
    );
  }, [authLoading, user, profile, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanAdminId = adminId.trim();
    const cleanCode = registrationCode.trim();

    if (
      !cleanName ||
      !cleanEmail ||
      !cleanAdminId ||
      !password ||
      !confirmPassword ||
      !cleanCode
    ) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      /*
       * Create the InsForge authentication account.
       *
       * Email verification may prevent InsForge from
       * returning an authenticated user at this stage.
       */
      const signupResult = await insforge.auth.signUp({
        email: cleanEmail,
        password,
        name: cleanName,
      });

      if (signupResult.error) {
        throw new Error(
          signupResult.error.message ??
            "Unable to create the admin account."
        );
      }

      /*
       * Store the information required to complete
       * admin registration after email verification.
       */
      sessionStorage.setItem(
        "coderelay_pending_admin_registration",
        JSON.stringify({
          full_name: cleanName,
          email: cleanEmail,
          admin_id: cleanAdminId,
          registration_code: cleanCode,
        })
      );

      /*
       * Automatically open the email verification page.
       */
      navigate("/verify-email", {
        replace: true,
        state: {
          email: cleanEmail,
          from: "admin-signup",
        },
      });
    } catch (err) {
      console.error("Admin signup failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the admin account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">

          <BackButton fallback="/" className="mb-6" />

          <div className="mb-7">
            <p className="text-sm font-medium text-cyan-400">
              CodeRelay Administration
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Create Admin Account
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Create your CodeRelay administrator account.
              You must verify your email before accessing
              the administrator portal.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
              <p className="text-sm text-red-300">
                {error}
              </p>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {/* Full Name */}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Full Name
              </span>

              <input
                type="text"
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                autoComplete="name"
                disabled={loading}
                required
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/50"
                placeholder="Enter full name"
              />
            </label>

            {/* Email */}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Email
              </span>

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                disabled={loading}
                required
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/50"
                placeholder="Enter admin email"
              />
            </label>

            {/* Admin ID */}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Admin ID
              </span>

              <input
                type="text"
                value={adminId}
                onChange={(event) =>
                  setAdminId(event.target.value)
                }
                autoComplete="off"
                disabled={loading}
                required
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/50"
                placeholder="Enter Admin ID"
              />
            </label>

            {/* Password */}
            <div className="block">
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={loading}
                required
                minLength={6}
                placeholder="Create password"
              />
            </div>

            {/* Confirm Password */}
            <div className="block">
              <PasswordField
                label="Confirm Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                disabled={loading}
                required
                minLength={6}
                placeholder="Confirm password"
              />
            </div>

            {/* Registration Code */}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Registration Code
              </span>

              <input
                type="text"
                value={registrationCode}
                onChange={(event) =>
                  setRegistrationCode(event.target.value)
                }
                autoComplete="off"
                disabled={loading}
                required
                className="w-full rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 font-mono text-sm outline-none transition focus:border-cyan-400/60"
                placeholder="Enter Registration Code"
              />
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Creating Admin Account..."
                : "Create Admin Account"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              to="/signup"
              className="text-slate-500 transition hover:text-cyan-400"
            >
              Student Signup
            </Link>

            <Link
              to="/admin/login"
              className="text-cyan-400 transition hover:text-cyan-300"
            >
              Admin Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}