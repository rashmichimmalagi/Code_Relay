import {
  FormEvent,
  ReactNode,
  useState,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { FormField } from "../components/FormField";
import { BackButton } from "../components/BackButton";
import { insforge } from "../lib/insforge";
import { getMyTeam } from "../lib/db";
import { getErrorMessage } from "../lib/errors";

/* -------------------------------------------------------------------------- */
/* AUTH SHELL                                                                 */
/* -------------------------------------------------------------------------- */

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center px-5 py-12">
      <div className="w-full">
        <BackButton fallback="/" className="mb-6" />
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-400"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-400/10 ring-1 ring-cyan-400/20">
              CR
            </span>

            CodeRelay
          </Link>

          <h1 className="text-3xl font-bold tracking-tight text-white">
            {title}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            {subtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MESSAGE                                                                    */
/* -------------------------------------------------------------------------- */

function AuthMessage({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
        type === "error"
          ? "border-red-400/20 bg-red-400/10 text-red-300"
          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      }`}
    >
      {message}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SIGN UP                                                                    */
/* -------------------------------------------------------------------------- */

export function SignupPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError("Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const {
        data,
        error: signupError,
      } = await insforge.auth.signUp({
        email: cleanEmail,
        password,
        name: cleanName,
      });

      if (signupError) {
        throw signupError;
      }

      /*
       * Keep the name temporarily so it is available
       * after the 6-digit verification step.
       */
      sessionStorage.setItem(
        "coderelay_verification",
        JSON.stringify({
          email: cleanEmail,
          name: cleanName,
        }),
      );

      /*
       * If InsForge returns a user immediately,
       * attempt to create the student profile.
       */
      if (data?.user?.id) {
        try {
          const {
            error: profileError,
          } = await insforge.database
            .from("profiles")
            .insert({
              id: data.user.id,
              user_id: data.user.id,
              full_name: cleanName,
              email: cleanEmail,
            });

          if (profileError) {
            console.warn(
              "Profile will be created after authentication:",
              profileError,
            );
          }
        } catch (profileError) {
          console.warn(
            "Profile creation during signup was not completed:",
            profileError,
          );
        }
      }

      navigate("/verify-email", {
        replace: true,
        state: {
          email: cleanEmail,
          name: cleanName,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Only Student 1 creates a CodeRelay account. Students 2 and 3 do not need separate accounts."
    >
      {error && (
        <AuthMessage
          type="error"
          message={error}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <FormField
          label="Full Name"
          value={fullName}
          onChange={setFullName}
          placeholder="Enter your full name"
          required
          autoComplete="name"
        />

        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          required
          autoComplete="new-password"
        />

        <FormField
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Re-enter your password"
          required
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Creating account..."
            : "Create Student Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-semibold text-cyan-400 hover:text-cyan-300"
        >
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* EMAIL VERIFICATION                                                         */
/* -------------------------------------------------------------------------- */

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const locationState =
    location.state as
      | {
          email?: string;
          name?: string;
          from?: string;
        }
      | undefined;

  let storedVerification: {
    email?: string;
    name?: string;
  } | null = null;

  try {
    const raw =
      sessionStorage.getItem(
        "coderelay_verification",
      );

    storedVerification =
      raw ? JSON.parse(raw) : null;
  } catch {
    storedVerification = null;
  }

  const initialEmail =
    locationState?.email ||
    storedVerification?.email ||
    "";

  const name =
    locationState?.name ||
    storedVerification?.name ||
    "";

  const [email, setEmail] =
    useState(initialEmail);

  const [otp, setOtp] =
    useState("");

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  async function handleVerify(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const cleanEmail =
      email.trim().toLowerCase();

    const cleanOtp =
      otp.trim();

    if (!cleanEmail) {
      setError(
        "Please enter the email address that needs verification.",
      );
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError(
        "Please enter a valid email address.",
      );
      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      setError(
        "Please enter the 6-digit verification code.",
      );
      return;
    }

    setLoading(true);

    try {
      const {
        error: verifyError,
      } = await insforge.auth.verifyEmail({
        email: cleanEmail,
        otp: cleanOtp,
      });

      if (verifyError) {
        throw verifyError;
      }

      /*
       * Student signup stores the student's name.
       *
       * A separately provisioned admin already has
       * a profile, so there is no need to create one here.
       */
      if (name) {
        sessionStorage.setItem(
          "coderelay_verified_profile",
          JSON.stringify({
            email: cleanEmail,
            name,
          }),
        );
      }

      sessionStorage.removeItem(
        "coderelay_verification",
      );

      setSuccess(
        "Email verified successfully! You can now sign in.",
      );

      window.setTimeout(() => {
        navigate(locationState?.from === "admin-signup" ? "/admin/login" : "/login", {
          replace: true,
          state: {
            email: cleanEmail,
          },
        });
      }, 900);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setSuccess("");

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setError(
        "Please enter the email address that needs verification.",
      );
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError(
        "Please enter a valid email address.",
      );
      return;
    }

    setResending(true);

    try {
      const {
        error: resendError,
      } =
        await insforge.auth.resendVerificationEmail({
          email: cleanEmail,
        });

      if (resendError) {
        throw resendError;
      }

      setSuccess(
        "A new verification code has been sent to your email.",
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter your email address and the 6-digit verification code sent to you."
    >
      {error && (
        <AuthMessage
          type="error"
          message={error}
        />
      )}

      {success && (
        <AuthMessage
          type="success"
          message={success}
        />
      )}

      <form
        onSubmit={handleVerify}
        className="space-y-5"
      >
        {/* Email */}
        <div>
          <label
            htmlFor="verification-email"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Email Address
          </label>

          <input
            id="verification-email"
            name="verification-email"
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
          />
        </div>

        {/* Code */}
        <div>
          <label
            htmlFor="verification-code"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            6-Digit Verification Code
          </label>

          <input
            id="verification-code"
            name="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) =>
              setOtp(
                event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 6),
              )
            }
            placeholder="000000"
            required
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-center text-xl font-bold tracking-[0.5em] text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
          />
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            !email.trim() ||
            otp.length !== 6
          }
          className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Verifying..."
            : "Verify Email"}
        </button>
      </form>

      {/* Resend */}
      <div className="mt-6 border-t border-white/10 pt-6 text-center">
        <p className="mb-3 text-sm text-slate-500">
          Didn't receive the code?
        </p>

        <button
          type="button"
          onClick={handleResend}
          disabled={
            resending ||
            !email.trim()
          }
          className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
        >
          {resending
            ? "Sending..."
            : "Resend verification code"}
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-slate-400">
        Already verified?{" "}
        <Link
          to="/login"
          className="font-semibold text-cyan-400 hover:text-cyan-300"
        >
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* LOGIN                                                                      */
/* -------------------------------------------------------------------------- */

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { refreshUser } =
    useAuth();

  const locationState =
    location.state as
      | {
          email?: string;
        }
      | undefined;

  const [email, setEmail] =
    useState(
      locationState?.email || "",
    );

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function createProfileFromSignupData(
    userId: string,
    userEmail: string,
  ) {
    let storedName = "";

    try {
      const raw =
        sessionStorage.getItem(
          "coderelay_verified_profile",
        );

      if (raw) {
        const parsed =
          JSON.parse(raw);

        if (
          typeof parsed?.name ===
            "string" &&
          parsed.name.trim()
        ) {
          storedName =
            parsed.name.trim();
        }
      }
    } catch {
      storedName = "";
    }

    if (!storedName) {
      return;
    }

    try {
      const existing =
        await insforge.database
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

      if (existing.data) {
        sessionStorage.removeItem(
          "coderelay_verified_profile",
        );

        return;
      }

      if (existing.error) {
        console.error(
          "Unable to check profile:",
          existing.error,
        );

        return;
      }

      const {
        error: profileError,
      } =
        await insforge.database
          .from("profiles")
          .insert({
            id: userId,
            user_id: userId,
            full_name: storedName,
            email: userEmail,
          });

      if (profileError) {
        console.error(
          "Unable to create profile after login:",
          profileError,
        );

        return;
      }

      sessionStorage.removeItem(
        "coderelay_verified_profile",
      );
    } catch (error) {
      console.error(
        "Profile creation failed:",
        error,
      );
    }
  }

  async function getProfileName(
    userId: string,
  ) {
    try {
      const {
        data,
        error: profileError,
      } =
        await insforge.database
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();

      if (profileError) {
        console.error(
          "Unable to load profile name:",
          profileError,
        );

        return "";
      }

      if (
        typeof data?.full_name ===
          "string" &&
        data.full_name.trim()
      ) {
        return data.full_name.trim();
      }
    } catch (error) {
      console.error(
        "Profile name lookup failed:",
        error,
      );
    }

    return "";
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setError(
        "Please enter your email address.",
      );
      return;
    }

    if (!password) {
      setError(
        "Please enter your password.",
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data,
        error: loginError,
      } =
        await insforge.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (loginError) {
        throw loginError;
      }

      if (!data?.user) {
        throw new Error(
          "Login succeeded but no authenticated user was returned.",
        );
      }

      /*
       * Make sure the profile exists for
       * accounts created through CodeRelay signup.
       *
       * A manually provisioned Super Admin already
       * has a profile, so this will simply find it.
       */
      await createProfileFromSignupData(
        data.user.id,
        cleanEmail,
      );

      const refreshedUser =
        await refreshUser();

      const profileName =
        await getProfileName(
          data.user.id,
        );

      const welcomeName =
        profileName ||
        refreshedUser?.name ||
        // data.user.name ||
        data.user.profile?.name ||
        "Student";

      /*
       * IMPORTANT:
       *
       * If this is an administrator account,
       * send it to the Admin Dashboard instead
       * of the student team flow.
       */
      const profileResult =
        await insforge.database
          .from("profiles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();

      if (profileResult.error) {
        throw profileResult.error;
      }

      const role = String(profileResult.data?.role ?? "")
        .trim()
        .toLowerCase();

      if (role === "admin" || role === "super_admin") {
        navigate("/admin/dashboard", {
          replace: true,
          state: {
            notification: {
              type: "success",
              message: `Welcome back, ${welcomeName}! 👋`,
            },
          },
        });

        return;
      }

      /*
       * Student flow.
       */
      const {
        team,
        error: teamError,
      } = await getMyTeam(
        data.user.id,
      );

      if (teamError) {
        throw teamError;
      }

      const notification = {
        type: "success" as const,
        message: `Welcome back, ${welcomeName}! 🎉`,
      };

      if (team) {
        navigate("/team/status", {
          replace: true,
          state: {
            notification,
          },
        });

        return;
      }

      navigate("/team/create", {
        replace: true,
        state: {
          notification,
        },
      });
    } catch (err) {
      const message =
        getErrorMessage(err);

      const lower =
        message.toLowerCase();

      /*
       * Unverified email → verification page.
       */
      if (
        lower.includes("verify") ||
        lower.includes("verification") ||
        lower.includes("not verified")
      ) {
        sessionStorage.setItem(
          "coderelay_verification",
          JSON.stringify({
            email: cleanEmail,
          }),
        );

        navigate("/verify-email", {
          replace: true,
          state: {
            email: cleanEmail,
          },
        });

        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to CodeRelay"
      subtitle="Sign in using your Student 1 account or authorized administrator account."
    >
      {error && (
        <AuthMessage
          type="error"
          message={error}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
        />

        <div className="-mt-2 text-right">
          <Link
            to="/reset-password?audience=student"
            className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
          >
            Forgot Password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Signing you in..."
            : "Sign In"}
        </button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm">
        <p className="text-slate-400">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-semibold text-cyan-400 hover:text-cyan-300"
          >
            Create Student Account
          </Link>
        </p>

        <p>
          <Link
            to="/verify-email"
            className="text-slate-500 hover:text-slate-300"
          >
            Need to verify your email?
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}