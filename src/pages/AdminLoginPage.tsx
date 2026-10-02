import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { insforge } from "../lib/insforge";
import { getErrorMessage } from "../lib/errors";
import { BackButton } from "../components/BackButton";
import { PasswordField } from "../components/PasswordField";

type PendingAdminRegistration = {
  full_name: string;
  email: string;
  admin_id: string;
  registration_code: string;
};

export function AdminLoginPage() {
  const navigate = useNavigate();

  const {
    user,
    profile,
    loading: authLoading,
    refreshUser,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [adminId, setAdminId] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");

//   const [needsAdminSetup, setNeedsAdminSetup] = useState(false);

//   const [submitting, setSubmitting] = useState(false);
const [needsAdminSetup, setNeedsAdminSetup] = useState(false);

const [setupUser, setSetupUser] = useState<typeof user>(null);

const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user || !profile) {
      return;
    }

    const normalizedRole = String(profile.role ?? "")
      .trim()
      .toLowerCase();

    const isAdmin =
      normalizedRole === "admin" ||
      normalizedRole === "super_admin";

    if (isAdmin) {
      navigate("/admin/dashboard", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, profile, navigate]);

//   async function completeAdminRegistration(
//     currentUser: { id: string; email?: string | null; name?: string | null }
//   )
async function completeAdminRegistration(
  currentUser: {
    id: string;
    email?: string | null;
    profile?: {
      name?: string;
    } | null;
  }
) {
    // const cleanName =
    //   fullName.trim() ||
    //   currentUser.name?.trim() ||
    //   currentUser.email?.split("@")[0] ||
    //   "Administrator";
    const cleanName =
  fullName.trim() ||
  currentUser.profile?.name?.trim() ||
  currentUser.email?.split("@")[0] ||
  "Administrator";

    const cleanAdminId = adminId.trim();
    const cleanCode = registrationCode.trim();

    if (!cleanAdminId) {
      setError("Please enter your Admin ID.");
      return false;
    }

    if (!cleanCode) {
      setError("Please enter the Admin Registration Code.");
      return false;
    }

    const registrationResult =
      await insforge.functions.invoke("create-admin", {
        body: {
          user_id: currentUser.id,
          full_name: cleanName,
          email: currentUser.email ?? email.trim().toLowerCase(),
          admin_id: cleanAdminId,
          registration_code: cleanCode,
        },
      });

    if (registrationResult.error) {
      console.error(
        "Admin registration completion failed:",
        registrationResult.error
      );

      const functionError = registrationResult.error as {
        message?: string;
      };

      setError(
        functionError.message ??
          "Unable to complete administrator registration."
      );

      return false;
    }

    await refreshUser();

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const result = await insforge.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (result.error) {
        setError(getErrorMessage(result.error));
        return;
      }

      if (!result.data?.user) {
        setError("Unable to establish the administrator session.");
        return;
      }

      const currentUser = result.data.user;

      /*
       * First check whether this account already has an admin profile.
       */
      const profileResult = await insforge.database
        .from("profiles")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (profileResult.error) {
        console.error(
          "Unable to check administrator profile:",
          profileResult.error
        );

        await insforge.auth.signOut();

        setError("Unable to verify administrator permissions.");
        return;
      }

      /*
       * Existing admin profile.
       */
      if (profileResult.data) {
        const normalizedRole = String(
          profileResult.data.role ?? ""
        )
          .trim()
          .toLowerCase();

        const isAdmin =
          normalizedRole === "admin" ||
          normalizedRole === "super_admin";

        if (!isAdmin) {
          await insforge.auth.signOut();

          setError(
            "This account is not authorized to access the administrator area."
          );

          return;
        }

        await refreshUser();

        navigate("/admin/dashboard", {
          replace: true,
          state: {
            notification: {
              type: "success",
              message: `Welcome back, ${
                profileResult.data.full_name || "Administrator"
              }! 👋`,
            },
          },
        });

        return;
      }

      /*
       * No profile exists.
       *
       * First try the pending registration saved during
       * Admin Signup.
       */
      const pendingStorageKey = "coderelay_pending_admin_registration";
      const pendingRaw =
        sessionStorage.getItem(pendingStorageKey) ??
        localStorage.getItem(pendingStorageKey);

      if (pendingRaw) {
        try {
          const pending =
            JSON.parse(pendingRaw) as PendingAdminRegistration;

          const pendingEmail =
            pending.email?.trim().toLowerCase();

          if (pendingEmail === cleanEmail) {
            setFullName(pending.full_name ?? "");
            setAdminId(pending.admin_id ?? "");
            setRegistrationCode(
              pending.registration_code ?? ""
            );

            const registrationResult =
              await insforge.functions.invoke(
                "create-admin",
                {
                  body: {
                    user_id: currentUser.id,
                    full_name: pending.full_name,
                    email: cleanEmail,
                    admin_id: pending.admin_id,
                    registration_code:
                      pending.registration_code,
                  },
                }
              );

            if (registrationResult.error) {
              console.error(
                "Pending admin registration failed:",
                registrationResult.error
              );

              const functionError =
                registrationResult.error as {
                  message?: string;
                };

              setError(
                functionError.message ??
                  "Your account is verified, but administrator registration could not be completed."
              );

              await insforge.auth.signOut();

              return;
            }

            sessionStorage.removeItem(pendingStorageKey);
            localStorage.removeItem(pendingStorageKey);

            await refreshUser();

            navigate("/admin/dashboard", {
              replace: true,
              state: {
                notification: {
                  type: "success",
                  message:
                    "Administrator registration completed successfully! 👋",
                },
              },
            });

            return;
          }
        } catch (pendingError) {
          console.error(
            "Invalid pending admin registration:",
            pendingError
          );
        }
      }

      /*
       * No profile + no usable pending registration.
       *
       * Instead of logging the user out immediately,
       * show the one-time administrator setup form.
       */
//       setNeedsAdminSetup(true);

//     //   setFullName(
//     //     currentUser.name?.trim() ||
//     //       currentUser.email?.split("@")[0] ||
//     //       ""
//     //   );
// setFullName(
//   currentUser.profile?.name?.trim() ||
//     currentUser.email?.split("@")[0] ||
//     ""
// );
//       setError(
//         "Your Auth account exists, but administrator registration is not completed. Complete the setup below."
//       );
setSetupUser(currentUser);

setFullName(
  currentUser.profile?.name?.trim() ||
    currentUser.email?.split("@")[0] ||
    ""
);

setNeedsAdminSetup(true);

setError(
  "Your Auth account exists, but administrator registration is not completed. Complete the setup below."
);
    } catch (err) {
      console.error("Admin login failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteSetup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      const currentUser = setupUser;

      if (!currentUser) {
        setError(
          "Your administrator session expired. Please sign in again."
        );
        return;
      }

      const success =
        await completeAdminRegistration(currentUser);

      if (!success) {
        return;
      }

      sessionStorage.removeItem("coderelay_pending_admin_registration");
      localStorage.removeItem("coderelay_pending_admin_registration");

      navigate("/admin/dashboard", {
        replace: true,
        state: {
          notification: {
            type: "success",
            message:
              "Administrator registration completed successfully! 👋",
          },
        },
      });
    } catch (err) {
      console.error(
        "Admin setup failed:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * One-time administrator setup screen.
   */
  if (needsAdminSetup && setupUser) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-950 px-4 py-12">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/" className="mb-6" />
          <BackButton fallback="/" className="mb-6" />
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400">
              <ShieldCheck size={28} />
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">
              CodeRelay Administration
            </p>

            <h1 className="text-3xl font-bold tracking-tight text-white">
              Complete Admin Setup
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              Your email account is already verified. Complete
              administrator registration to continue.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 sm:p-8">
            {error && (
              <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-300">
                {error}
              </div>
            )}

            <form
              onSubmit={handleCompleteSetup}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="setup-full-name"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Full Name
                </label>

                <input
                  id="setup-full-name"
                  type="text"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(event.target.value)
                  }
                  required
                  disabled={submitting}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label
                  htmlFor="setup-admin-id"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Admin ID
                </label>

                <input
                  id="setup-admin-id"
                  type="text"
                  value={adminId}
                  onChange={(event) =>
                    setAdminId(event.target.value)
                  }
                  required
                  disabled={submitting}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50"
                  placeholder="Enter Admin ID"
                />
              </div>

              <div>
                <label
                  htmlFor="setup-registration-code"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Admin Registration Code
                </label>

                <input
                  id="setup-registration-code"
                  type="text"
                  value={registrationCode}
                  onChange={(event) =>
                    setRegistrationCode(event.target.value)
                  }
                  required
                  disabled={submitting}
                  className="w-full rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400/60"
                  placeholder="Enter registration code"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Completing Registration..."
                  : "Complete Admin Registration"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            Email: {setupUser.email}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-md">
        <BackButton fallback="/" className="mb-6" />

        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400">
            <ShieldCheck size={28} />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">
            CodeRelay Administration
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-white">
            Administrator Login
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Sign in with your authorized CodeRelay administrator account.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 sm:p-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Admin Email
              </label>

              <input
                id="admin-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="admin@gmail.com"
                autoComplete="email"
                required
                disabled={submitting}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
              />
            </div>

            <div>
              <PasswordField
                id="admin-password"
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={submitting}
              />
            </div>

            <div className="-mt-3 text-right">
              <Link
                to="/reset-password?audience=admin"
                className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Signing in..."
                : "Sign in to Admin Portal"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <Link
            to="/admin/signup"
            className="text-sm text-cyan-400 transition hover:text-cyan-300"
          >
            Create Admin Account
          </Link>
        </div>

        <p className="mt-8 text-center text-xs leading-5 text-slate-600">
          Administrator access is restricted to accounts provisioned by CodeRelay.
        </p>
      </div>
    </div>
  );
}