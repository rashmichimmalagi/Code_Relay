import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { BackButton } from "../components/BackButton";
import { PasswordField } from "../components/PasswordField";
import { insforge } from "../lib/insforge";
import { getErrorMessage } from "../lib/errors";

type RecoveryStep = "email" | "link-sent" | "code" | "password" | "success";
type Audience = "admin" | "student";
type ResetMethod = "code" | "link";

const RESEND_COOLDOWN_SECONDS = 30;

export function PasswordRecoveryPage() {
  const [searchParams] = useSearchParams();
  const audience: Audience = searchParams.get("audience") === "admin" ? "admin" : "student";
  const loginPath = audience === "admin" ? "/admin/login" : "/login";

  const [step, setStep] = useState<RecoveryStep>("email");
  const [method, setMethod] = useState<ResetMethod>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const redirectTo = useMemo(() => {
    const url = new URL("/reset-password", window.location.origin);
    url.searchParams.set("audience", audience);
    return url.toString();
  }, [audience]);

  useEffect(() => {
    void insforge.auth.getPublicAuthConfig().then(({ data, error: configError }) => {
      if (configError || !data) {
        console.warn("Using configured password recovery mode after auth config lookup failed.");
        return;
      }

      const resetMethod = data.resetPasswordMethod;
      setMethod(resetMethod);

      const returnedType = searchParams.get("insforge_type");
      const returnedStatus = searchParams.get("insforge_status");
      const token = searchParams.get("token");

      if (returnedType === "reset_password" && returnedStatus === "ready" && token) {
        setResetToken(token);
        setStep("password");
        setMessage("Create a new password for your account.");
      } else if (returnedType === "reset_password" && returnedStatus === "error") {
        setError("This recovery link is invalid or expired. Request a new one.");
      } else if (resetMethod === "link" && token) {
        setResetToken(token);
        setStep("password");
        setMessage("Create a new password for your account.");
      }
    }).catch(() => {
      console.warn("Using configured password recovery mode after auth config lookup failed.");
    });
  }, [searchParams]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (cooldown > 0) {
      setError(`Please wait ${cooldown} seconds before requesting another recovery email.`);
      return;
    }
    setLoading(true);
    try {
      const result = await insforge.auth.sendResetPasswordEmail({
        email: cleanEmail,
        ...(method === "link" ? { redirectTo } : {}),
      });
      if (result.error) {
        const genericMessage = "If an account exists for this email, we have sent instructions to reset its password.";
        setMessage(genericMessage);
        if (result.error.statusCode === 429) {
          setError("Please wait before requesting another recovery email.");
        }
      } else {
        setMessage("If an account exists for this email, we have sent instructions to reset its password.");
      }
      setEmail(cleanEmail);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep(method === "code" ? "code" : "link-sent");
    } catch {
      setMessage("If an account exists for this email, we have sent instructions to reset its password.");
      setEmail(cleanEmail);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep(method === "code" ? "code" : "link-sent");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    try {
      const result = await insforge.auth.exchangeResetPasswordToken({
        email: cleanEmail,
        code: cleanCode,
      });
      if (result.error || !result.data?.token) {
        setError("That code is invalid or expired. Request a new recovery email and try again.");
        return;
      }

      const expiresAt = Date.parse(result.data.expiresAt);
      if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
        setError("That code is invalid or expired. Request a new recovery email and try again.");
        return;
      }
      setResetToken(result.data.token);
      setTokenExpiresAt(expiresAt);
      setStep("password");
    } catch {
      setError("That code is invalid or expired. Request a new recovery email and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!resetToken || (tokenExpiresAt !== null && Date.now() >= tokenExpiresAt)) {
      setError("This recovery code or link has expired. Request a new one.");
      setStep("email");
      setResetToken("");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await insforge.auth.resetPassword({
        newPassword,
        otp: resetToken,
      });
      if (result.error) {
        setError("Unable to reset the password. The recovery code or link may be expired; request a new one.");
        return;
      }

      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("success");
      setMessage("Your password has been updated successfully.");
    } catch {
      setError("Unable to reset the password. The recovery code or link may be expired; request a new one.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || loading) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await insforge.auth.sendResetPasswordEmail({
        email: email.trim().toLowerCase(),
        ...(method === "link" ? { redirectTo } : {}),
      });
      if (result.error?.statusCode === 429) {
        setError("Please wait before requesting another recovery email.");
      }
      setMessage(method === "code"
        ? "If an account exists for this email, we have sent a new recovery code."
        : "If an account exists for this email, we have sent a new recovery link.");
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setMessage(method === "code"
        ? "If an account exists for this email, we have sent a new recovery code."
        : "If an account exists for this email, we have sent a new recovery link.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setLoading(false);
    }
  }

  const title = step === "success"
    ? "Password Reset Successfully"
    : step === "email"
      ? "Reset Your Password"
        : step === "link-sent"
          ? "Check Your Email"
      : step === "code"
        ? "Verify Your Email"
        : "Create New Password";

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
          <BackButton fallback={loginPath} className="mb-6" />
          <p className="text-sm font-medium text-cyan-400">CodeRelay Authentication</p>
          <h1 className="mt-2 text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {step === "email" && "Enter the email associated with your CodeRelay account. If an account exists, recovery instructions will be sent."}
            {step === "link-sent" && `If an account exists for ${email}, we sent a secure password reset link. Open it on this device to choose a new password.`}
            {step === "code" && `Enter the verification code sent to ${email}.`}
            {step === "password" && "Choose a new password for your account."}
            {step === "success" && "Your password has been updated successfully."}
          </p>

          {error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}
          {message && <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{message}</div>}

          {step === "email" && (
            <form onSubmit={requestReset} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={loading} placeholder="Enter your email" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              </label>
              <button type="submit" disabled={loading || cooldown > 0} className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                {loading
                  ? "Sending..."
                  : cooldown > 0
                    ? `Try again in ${cooldown}s`
                    : method === "code"
                      ? "Send Verification Code"
                      : "Send Recovery Link"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Verification Code</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={loading} maxLength={6} placeholder="6-digit code" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm outline-none focus:border-cyan-400/50" />
              </label>
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{loading ? "Verifying..." : "Verify Code"}</button>
              <button type="button" onClick={() => void resendCode()} disabled={loading || cooldown > 0} className="w-full text-sm text-cyan-400 hover:text-cyan-300 disabled:text-slate-600">
                {cooldown > 0 ? `Resend Code in ${cooldown}s` : "Resend Code"}
              </button>
              <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="w-full text-sm text-slate-400 hover:text-white">Use a different email</button>
            </form>
          )}

          {step === "link-sent" && (
            <div className="mt-6 space-y-4">
              <button type="button" onClick={() => void resendCode()} disabled={loading || cooldown > 0} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50">
                {loading ? "Sending..." : cooldown > 0 ? `Resend Link in ${cooldown}s` : "Resend Reset Link"}
              </button>
              <button type="button" onClick={() => { setStep("email"); setError(""); setMessage(""); }} className="w-full text-sm text-slate-400 hover:text-white">Use a different email</button>
            </div>
          )}

          {step === "password" && (
            <form onSubmit={updatePassword} className="mt-6 space-y-4">
              <PasswordField id="reset-password" label="New Password" value={newPassword} onChange={setNewPassword} placeholder="At least 6 characters" required autoComplete="new-password" minLength={6} disabled={loading} />
              <PasswordField id="confirm-reset-password" label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm new password" required autoComplete="new-password" minLength={6} disabled={loading} />
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{loading ? "Updating..." : "Reset Password"}</button>
            </form>
          )}

          {step === "success" && (
            <Link to={loginPath} replace className="mt-6 inline-flex w-full justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300">
              Go to {audience === "admin" ? "Admin" : "Student"} Login
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
