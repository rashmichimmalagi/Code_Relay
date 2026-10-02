import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { BackButton } from "./BackButton";

type AdminProtectedRouteProps = {
  children: ReactNode;
};

export default function AdminProtectedRoute({
  children,
}: AdminProtectedRouteProps) {
  const {
    user,
    profile,
    loading,
  } = useAuth();

  const location = useLocation();

  /*
   * Wait until authentication and profile restoration
   * has completed.
   */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />

          <p className="text-sm text-slate-400">
            Loading admin dashboard...
          </p>
        </div>
      </div>
    );
  }

  /*
   * No authenticated user.
   */
  if (!user) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  /*
   * User is authenticated but profile is unavailable.
   */
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <BackButton fallback="/" className="mb-6" />
          <h1 className="text-xl font-semibold">
            Admin profile not found
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Your account is authenticated, but no CodeRelay
            administrator profile is available.
          </p>

          <p className="mt-4 break-all text-xs text-slate-500">
            User ID: {user.id}
          </p>

        </div>
      </div>
    );
  }

  /*
   * IMPORTANT:
   * The database currently stores admin roles as lowercase:
   *
   *   admin
   *   super_admin
   *
   * Normalize the value so both lowercase and uppercase
   * representations are accepted.
   */
  const normalizedRole = String(
    profile.role ?? ""
  ).trim().toLowerCase();

  const isAdmin =
    normalizedRole === "admin" ||
    normalizedRole === "super_admin";

  /*
   * Students cannot access administrator pages.
   */
  if (!isAdmin) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  /*
   * ADMIN / SUPER_ADMIN allowed.
   */
  return <>{children}</>;
}